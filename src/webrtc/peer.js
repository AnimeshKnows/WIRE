// peer.js
import { sendIceCandidate, updateOffer } from "./signaling";
import { database } from "../firebase";
import {
  MAX_MSG_SIZE,
  createRateLimiter,
  messageByteSize,
  shouldAcceptIncoming,
  validateIceCandidate,
  validateSdp,
} from "./validation";

let peerConnection = null;
let dataChannel = null;
let remoteDataChannel = null;
let currentRoomId = null;
let isCallerGlobal = false;

let messageCallback = null;
let connectionStateCallback = null;
let partnerLeftCallback = null;

let reconnectTimeout = null;
let failTimeout = null;

let presenceRef = null;
let partnerPresenceRef = null;
let connectedInfoRef = null;

let partnerLeftGraceTimeout = null;
let hasSeenPartner = false;

export const PARTNER_GRACE_MS = 8000;

let cachedIceServers = null;
const outgoingRateLimiter = createRateLimiter();
const incomingRateLimiter = createRateLimiter();

function devLog(...args) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}

function handleIncomingData(data) {
  if (!shouldAcceptIncoming(data, incomingRateLimiter)) return;
  if (messageCallback) messageCallback(data);
}

// Two-tier ICE strategy:
//   Tier 1 — STUN (direct P2P, free, no relay)
//   Tier 2 — TURN relay (fetched from /api/turn-credentials serverless function)
async function fetchIceServers() {
  if (cachedIceServers) return cachedIceServers;

  const defaultConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  try {
    const res = await fetch("/api/turn-credentials");
    if (!res.ok) {
      console.warn(`[WIRE] /api/turn-credentials responded with ${res.status} — falling back to STUN only.`);
      cachedIceServers = defaultConfiguration;
      return cachedIceServers;
    }

    const data = await res.json();
    if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedIceServers = { iceServers: data.iceServers };
    } else {
      cachedIceServers = defaultConfiguration;
    }
  } catch (err) {
    console.warn("[WIRE] Failed to fetch TURN credentials from /api/turn-credentials — falling back to STUN only.", err);
    cachedIceServers = defaultConfiguration;
  }

  return cachedIceServers;
}

export function setSignalingInfo(roomId, isCaller) {
  currentRoomId = roomId;
  isCallerGlobal = isCaller;
}
export function onIncomingMessage(callback) {
  messageCallback = callback;
}

// Register callback for connection status: "connecting" | "connected" | "reconnecting" | "failed" | "disconnected"
export function onConnectionStateChange(callback) {
  connectionStateCallback = callback;
}

// Register callback for when the other peer is confirmed gone (after the grace period)
export function onPartnerLeft(callback) {
  partnerLeftCallback = callback;
}

export function getActiveRoomId() {
  return currentRoomId;
}

function notifyState(state) {
  if (connectionStateCallback) connectionStateCallback(state);
}

/* ---------------------------------------------------------- */
/* Presence                                                    */
/* ---------------------------------------------------------- */

// Call after setSignalingInfo, once roomId/isCaller are known.
// Writes "I'm here" (and re-writes it on every Firebase reconnect), and
// watches the other side's presence with a grace period before declaring
// them gone — so brief network blips don't bounce everyone home.
export function setupPresence(roomId, isCaller) {
  const myPath = isCaller ? "presence/caller" : "presence/callee";
  const partnerPath = isCaller ? "presence/callee" : "presence/caller";

  presenceRef = database.ref(`rooms/${roomId}/${myPath}`);
  partnerPresenceRef = database.ref(`rooms/${roomId}/${partnerPath}`);

  hasSeenPartner = false;
  clearTimeout(partnerLeftGraceTimeout);
  partnerLeftGraceTimeout = null;

  // .info/connected fires whenever THIS client's socket to Firebase goes up
  // or down. Every time it comes back up (initial connect AND every
  // reconnect after a drop), re-write our own presence flag and re-arm
  // onDisconnect — otherwise a reconnect after a blip would leave us with
  // no presence flag at all until we manually rejoin.
  connectedInfoRef = database.ref(".info/connected");
  connectedInfoRef.on("value", (snap) => {
    if (snap.val() === true) {
      presenceRef.set(true);
      presenceRef.onDisconnect().remove();
    }
  });

  partnerPresenceRef.on("value", (snap) => {
    if (snap.exists()) {
      hasSeenPartner = true;
      // Partner is back (or never left) - cancel any pending "they left" timer
      if (partnerLeftGraceTimeout) {
        clearTimeout(partnerLeftGraceTimeout);
        partnerLeftGraceTimeout = null;
      }
    } else if (hasSeenPartner && !partnerLeftGraceTimeout) {
      // Only start the grace countdown if they were actually here before -
      // otherwise this fires while simply waiting for them to join.
      partnerLeftGraceTimeout = setTimeout(() => {
        partnerLeftGraceTimeout = null;
        if (partnerLeftCallback) partnerLeftCallback();
      }, PARTNER_GRACE_MS);
    }
  });
}

export function teardownPresence() {
  clearTimeout(partnerLeftGraceTimeout);
  partnerLeftGraceTimeout = null;
  hasSeenPartner = false;

  if (connectedInfoRef) {
    connectedInfoRef.off();
    connectedInfoRef = null;
  }
  if (partnerPresenceRef) {
    partnerPresenceRef.off();
    partnerPresenceRef = null;
  }
  if (presenceRef) {
    presenceRef.onDisconnect().cancel();
    presenceRef.remove();
    presenceRef = null;
  }
}

/* ---------------------------------------------------------- */
/* Create Peer Connection                                     */
/* ---------------------------------------------------------- */

export async function createPeer(isInitiator) {
  const configuration = await fetchIceServers();

  peerConnection = new RTCPeerConnection(configuration);
  notifyState("connecting");

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      sendIceCandidate(currentRoomId, event.candidate.toJSON(), isCallerGlobal);
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    devLog("ICE connection state:", state);

    if (state === "connected" || state === "completed") {
      clearTimeout(reconnectTimeout);
      clearTimeout(failTimeout);
      notifyState("connected");
    } else if (state === "disconnected") {
      notifyState("reconnecting");
      clearTimeout(reconnectTimeout);
      // Give it a grace period to self-heal (temporary network blips are common)
      reconnectTimeout = setTimeout(() => {
        if (peerConnection && peerConnection.iceConnectionState === "disconnected") {
          attemptIceRestart();
        }
      }, 5000);
    } else if (state === "failed") {
      attemptIceRestart();
    } else if (state === "closed") {
      notifyState("disconnected");
    }
  };

  peerConnection.ondatachannel = (event) => {
    remoteDataChannel = event.channel;

    remoteDataChannel.onopen = () => notifyState("connected");
    remoteDataChannel.onmessage = (e) => {
      handleIncomingData(e.data);
    };
  };

  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel("chat");

    dataChannel.onopen = () => notifyState("connected");
    dataChannel.onmessage = (e) => {
      handleIncomingData(e.data);
    };
  }

  return peerConnection;
}

/* ---------------------------------------------------------- */
/* Reconnect logic (transient ICE drops only, not refresh)     */
/* ---------------------------------------------------------- */

async function attemptIceRestart() {
  if (!peerConnection || !currentRoomId) return;
  notifyState("reconnecting");

  if (isCallerGlobal) {
    try {
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);
      await updateOffer(currentRoomId, offer);
    } catch (err) {
      console.error("ICE restart failed:", err);
      notifyState("failed");
      return;
    }
  }
  // Callee doesn't initiate — it picks up the new offer automatically via its offer listener.

  clearTimeout(failTimeout);
  failTimeout = setTimeout(() => {
    if (
      peerConnection &&
      peerConnection.iceConnectionState !== "connected" &&
      peerConnection.iceConnectionState !== "completed"
    ) {
      notifyState("failed");
    }
  }, 10000);
}

/* ---------------------------------------------------------- */
/* Send Message                                                */
/* ---------------------------------------------------------- */

export function sendMessage(message) {
  const size = messageByteSize(message);
  if (size > MAX_MSG_SIZE) {
    console.warn(`[WIRE] Message size (${size} bytes) exceeds limit of ${MAX_MSG_SIZE} bytes. Message skipped.`);
    return { ok: false, reason: "size" };
  }

  const channel =
    dataChannel?.readyState === "open"
      ? dataChannel
      : remoteDataChannel?.readyState === "open"
        ? remoteDataChannel
        : null;

  if (!channel) {
    console.warn("DataChannel is NOT open");
    return { ok: false, reason: "closed" };
  }

  if (!outgoingRateLimiter.tryConsume()) {
    console.warn("[WIRE] Message rate limit exceeded. Message skipped.");
    return { ok: false, reason: "rate" };
  }

  channel.send(message);
  return { ok: true };
}

/* ---------------------------------------------------------- */
/* Offer / Answer / ICE                                        */
/* ---------------------------------------------------------- */

export async function createOffer() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(offer) {
  if (!validateSdp(offer, "offer")) {
    console.warn("[WIRE] Invalid offer SDP rejected");
    return;
  }
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

export async function addAnswer(answer) {
  if (!validateSdp(answer, "answer")) {
    console.warn("[WIRE] Invalid answer SDP rejected");
    return;
  }
  // No "already set" guard anymore — ICE restarts need to re-apply a fresh answer.
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

export function addIceCandidate(candidate) {
  if (!peerConnection) return;
  if (!validateIceCandidate(candidate)) {
    console.warn("[WIRE] Invalid ICE candidate rejected");
    return;
  }
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
    console.warn("Failed to add ICE candidate:", err);
  });
}

/* ---------------------------------------------------------- */
/* Cleanup                                                     */
/* ---------------------------------------------------------- */

export function closePeer() {
  clearTimeout(reconnectTimeout);
  clearTimeout(failTimeout);
  outgoingRateLimiter.reset();
  incomingRateLimiter.reset();

  teardownPresence();

  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (remoteDataChannel) {
    remoteDataChannel.close();
    remoteDataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  currentRoomId = null;
  isCallerGlobal = false;
  messageCallback = null;
  connectionStateCallback = null;
  partnerLeftCallback = null;
}
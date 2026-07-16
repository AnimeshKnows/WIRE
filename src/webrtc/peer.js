// peer.js
import { sendIceCandidate, updateOffer } from "./signaling";
import { database } from "../firebase";

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

const PARTNER_GRACE_MS = 8000; // how long to wait after partner's presence vanishes before treating it as a real departure

const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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

export function createPeer(isInitiator) {
  peerConnection = new RTCPeerConnection(configuration);
  notifyState("connecting");

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      sendIceCandidate(currentRoomId, event.candidate.toJSON(), isCallerGlobal);
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    console.log("ICE connection state:", state);

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
      if (messageCallback) messageCallback(e.data);
    };
  };

  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel("chat");

    dataChannel.onopen = () => notifyState("connected");
    dataChannel.onmessage = (e) => {
      if (messageCallback) messageCallback(e.data);
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
  if (dataChannel?.readyState === "open") {
    dataChannel.send(message);
  } else if (remoteDataChannel?.readyState === "open") {
    remoteDataChannel.send(message);
  } else {
    console.warn("DataChannel is NOT open");
  }
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
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

export async function addAnswer(answer) {
  // No "already set" guard anymore — ICE restarts need to re-apply a fresh answer.
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

export function addIceCandidate(candidate) {
  if (!peerConnection) return;
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
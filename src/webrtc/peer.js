import { sendIceCandidate, updateOffer } from "./signaling";

let peerConnection = null;
let dataChannel = null;
let remoteDataChannel = null;
let currentRoomId = null;
let isCallerGlobal = false;

let messageCallback = null;
let connectionStateCallback = null;

let reconnectTimeout = null;
let failTimeout = null;

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

function notifyState(state) {
  if (connectionStateCallback) connectionStateCallback(state);
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
/* Reconnect logic                                             */
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
}
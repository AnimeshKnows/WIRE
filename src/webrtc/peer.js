import { sendIceCandidate } from "./signaling";

let peerConnection = null;
let dataChannel = null;
let remoteDataChannel = null;
let currentRoomId = null;
let isCallerGlobal = false;

let messageCallback = null;

// Google STUN
const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Set room info
export function setSignalingInfo(roomId, isCaller) {
  currentRoomId = roomId;
  isCallerGlobal = isCaller;
}

// Register callback for ChatRoom
export function onIncomingMessage(callback) {
  messageCallback = callback;
}

/* ---------------------------------------------------------- */
/* Create Peer Connection                                    */
/* ---------------------------------------------------------- */

export function createPeer(isInitiator) {
  peerConnection = new RTCPeerConnection(configuration);

  /* ICE */
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      console.log("New ICE candidate:", event.candidate);
      sendIceCandidate(currentRoomId, event.candidate.toJSON(), isCallerGlobal);
    }
  };

  /* RECEIVER: ondatachannel */
  peerConnection.ondatachannel = (event) => {
    remoteDataChannel = event.channel;
    console.log("Callee received data channel");

    remoteDataChannel.onopen = () => {
      console.log("Remote DataChannel OPEN");
    };

    remoteDataChannel.onmessage = (e) => {
      console.log("Remote MSG:", e.data);
      if (messageCallback) messageCallback(e.data);
    };
  };

  /* CALLER: creates data channel immediately */
  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel("chat");
    console.log("Caller created data channel");

    dataChannel.onopen = () => {
      console.log("Local DataChannel OPEN");
    };

    dataChannel.onmessage = (e) => {
      console.log("Local MSG:", e.data);
      if (messageCallback) messageCallback(e.data);
    };
  }

  return peerConnection;
}

/* ---------------------------------------------------------- */
/* Send Message                                               */
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
/* Utilities                                                  */
/* ---------------------------------------------------------- */
export function getLocalDataChannel() {
  return dataChannel;
}

export function getRemoteDataChannel() {
  return remoteDataChannel;
}

/* ---------------------------------------------------------- */
/* Offer / Answer / ICE                                       */
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
  if (!peerConnection.currentRemoteDescription) {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  }
}

export function addIceCandidate(candidate) {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}
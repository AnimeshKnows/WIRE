// signaling.js
import { database } from "../firebase";
import {
  createPeer,
  createOffer,
  createAnswer,
  addAnswer,
  addIceCandidate,
  setSignalingInfo
} from "./peer";

// Create a room (initiator)
export async function createRoom() {
  const roomRef = database.ref("rooms").push(); // create unique room
  const roomId = roomRef.key;

  console.log("Room created:", roomId);

  // Set signaling info BEFORE creating peer/offer, so ICE candidates aren't dropped
  setSignalingInfo(roomId, true);

  // Create peer connection (initiator = true)
  createPeer(true);

  // Create offer
  const offer = await createOffer();

  // Save offer in Firebase
  await roomRef.set({
    offer: offer
  });

  return roomId;
}

// Join a room (receiver)
export async function joinRoom(roomId) {
  // Set signaling info BEFORE creating peer/answer, so ICE candidates aren't dropped
  setSignalingInfo(roomId, false);

  const roomRef = database.ref(`rooms/${roomId}`);

  // Get offer from room
  const snapshot = await roomRef.get();
  if (!snapshot.exists()) {
    throw new Error("Room does not exist.");
  }

  const roomData = snapshot.val();
  const offer = roomData.offer;

  // Create peer (non-initiator)
  createPeer(false);

  // Create answer
  const answer = await createAnswer(offer);

  // Store answer in Firebase
  await roomRef.update({
    answer: answer
  });
}

// Listen for answer (ONLY initiator)
export function listenForAnswer(roomId) {
  const answerRef = database.ref(`rooms/${roomId}/answer`);

  answerRef.on("value", async (snapshot) => {
    if (snapshot.exists()) {
      const answer = snapshot.val();
      console.log("Answer received:", answer);

      await addAnswer(answer);
    }
  });
}

// Send ICE candidates
export function sendIceCandidate(roomId, candidate, isCaller) {
  const candidateRef = database.ref(
    `rooms/${roomId}/${isCaller ? "callerCandidates" : "calleeCandidates"}`
  );

  candidateRef.push(candidate);
}

// Listen for remote ICE candidates
export function listenForIceCandidates(roomId, isCaller) {
  const candidateRef = database.ref(
    `rooms/${roomId}/${isCaller ? "calleeCandidates" : "callerCandidates"}`
  );

  candidateRef.on("child_added", (snapshot) => {
    const candidate = snapshot.val();
    console.log("Received ICE candidate:", candidate);

    addIceCandidate(candidate);
  });
}
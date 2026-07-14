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

// Tracks every Firebase ref we attach a listener to, so cleanupSignaling()
// can detach them all when a user leaves a room.
let activeRefs = [];

function trackRef(ref) {
  activeRefs.push(ref);
  return ref;
}

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
  const roomRef = database.ref(`rooms/${roomId}`);

  // Confirm the room exists before doing anything else
  const snapshot = await roomRef.get();
  if (!snapshot.exists()) {
    throw new Error("Room does not exist. Double-check the Room ID.");
  }

  // Set signaling info BEFORE creating peer/answer, so ICE candidates aren't dropped
  setSignalingInfo(roomId, false);

  // Create peer (non-initiator)
  createPeer(false);

  // Listen (not one-time get) on the offer so a renegotiated offer sent
  // during an ICE restart is also picked up automatically.
  const offerRef = trackRef(roomRef.child("offer"));
  offerRef.on("value", async (snap) => {
    if (!snap.exists()) return;
    try {
      const answer = await createAnswer(snap.val());
      await roomRef.update({ answer });
    } catch (err) {
      console.error("Failed to answer offer:", err);
    }
  });
}

// Listen for answer (ONLY initiator)
export function listenForAnswer(roomId) {
  const answerRef = trackRef(database.ref(`rooms/${roomId}/answer`));

  answerRef.on("value", async (snapshot) => {
    if (snapshot.exists()) {
      const answer = snapshot.val();
      console.log("Answer received:", answer);

      try {
        await addAnswer(answer);
      } catch (err) {
        console.error("Failed to apply answer:", err);
      }
    }
  });
}

// Push a renegotiated offer to Firebase (used during ICE restart)
export function updateOffer(roomId, offer) {
  return database.ref(`rooms/${roomId}`).update({ offer });
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
  const candidateRef = trackRef(
    database.ref(`rooms/${roomId}/${isCaller ? "calleeCandidates" : "callerCandidates"}`)
  );

  candidateRef.on("child_added", (snapshot) => {
    const candidate = snapshot.val();
    console.log("Received ICE candidate:", candidate);

    addIceCandidate(candidate);
  });
}

// Detaches every Firebase listener registered above. Call on leave/unmount.
export function cleanupSignaling() {
  activeRefs.forEach((ref) => ref.off());
  activeRefs = [];
}
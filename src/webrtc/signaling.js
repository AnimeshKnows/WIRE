// signaling.js
import { database } from "../firebase";
import {
  createPeer,
  createOffer,
  createAnswer,
  addAnswer,
  addIceCandidate,
  setSignalingInfo,
  setupPresence
} from "./peer";
import { CREATE_COOLDOWN_MS, isValidRoomId } from "./validation";

// Tracks every Firebase ref we attach a listener to, so cleanupSignaling()
// can detach them all when a user leaves a room.
let activeRefs = [];

function trackRef(ref) {
  activeRefs.push(ref);
  return ref;
}

let lastCreateAt = 0;

export function generateRoomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function resetCreateCooldown() {
  lastCreateAt = 0;
}

// Create a room (initiator)
export async function createRoom() {
  const now = Date.now();
  if (lastCreateAt && now - lastCreateAt < CREATE_COOLDOWN_MS) {
    throw new Error("Please wait a moment before creating another room.");
  }
  lastCreateAt = now;

  const roomId = generateRoomId();
  const roomRef = database.ref(`rooms/${roomId}`);

  if (process.env.NODE_ENV !== "production") {
    console.log("Room created:", roomId);
  }

  // Set signaling info BEFORE creating peer/offer, so ICE candidates aren't dropped
  setSignalingInfo(roomId, true);

  // Announce presence + watch for the callee leaving
  setupPresence(roomId, true);

  // Create peer connection (initiator = true)
  await createPeer(true);

  // Create offer
  const offer = await createOffer();

  // Save offer in Firebase
  await roomRef.update({
    offer: offer
  });

  return roomId;
}

// Join a room (receiver)
export async function joinRoom(roomId) {
  if (!isValidRoomId(roomId)) {
    throw new Error("Invalid Room ID — use only letters, numbers, hyphens, underscores");
  }

  const roomRef = database.ref(`rooms/${roomId}`);

  // Confirm the room exists before doing anything else
  const snapshot = await roomRef.get();
  if (!snapshot.exists()) {
    throw new Error("Room does not exist. Double-check the Room ID.");
  }

  // Set signaling info BEFORE creating peer/answer, so ICE candidates aren't dropped
  setSignalingInfo(roomId, false);

  // Announce presence + watch for the caller leaving
  setupPresence(roomId, false);

  // Create peer (non-initiator)
  await createPeer(false);

  // Listen (not one-time get) on the offer so a renegotiated offer sent
  // during an ICE restart is also picked up automatically.
  const offerRef = trackRef(roomRef.child("offer"));
  offerRef.on("value", async (snap) => {
    if (!snap.exists()) return;
    try {
      const answer = await createAnswer(snap.val());
      if (answer) {
        await roomRef.update({ answer });
      }
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
      if (process.env.NODE_ENV !== "production") {
        console.log("Answer received:", answer);
      }

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
    if (process.env.NODE_ENV !== "production") {
      console.log("Received ICE candidate:", candidate);
    }

    addIceCandidate(candidate);
  });
}

// Detaches every Firebase listener registered above. Call on leave/unmount.
export function cleanupSignaling() {
  activeRefs.forEach((ref) => ref.off());
  activeRefs = [];
}
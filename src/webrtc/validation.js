export const MAX_SDP_LENGTH = 50000;
export const MAX_ICE_CANDIDATE_LENGTH = 2000;
export const MAX_MSG_SIZE = 64 * 1024; // 64 KB
export const MAX_MESSAGES = 500;
export const MAX_MSG_PER_SECOND = 10;
export const VALID_ROOM_ID = /^[-a-zA-Z0-9_]{1,40}$/;
export const CREATE_COOLDOWN_MS = 3000;

export function isValidRoomId(roomId) {
  return typeof roomId === "string" && VALID_ROOM_ID.test(roomId);
}

export function validateSdp(desc, expectedType) {
  if (!desc || typeof desc !== "object") return false;
  if (desc.type !== expectedType) return false;
  if (typeof desc.sdp !== "string") return false;
  if (!desc.sdp.startsWith("v=0")) return false;
  if (desc.sdp.length === 0 || desc.sdp.length >= MAX_SDP_LENGTH) return false;
  return true;
}

export function validateIceCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (typeof candidate.candidate !== "string") return false;
  if (candidate.candidate.length >= MAX_ICE_CANDIDATE_LENGTH) return false;
  return true;
}

export function messageByteSize(message) {
  if (typeof message === "string") {
    return new Blob([message]).size;
  }
  if (message && typeof message.byteLength === "number") {
    return message.byteLength;
  }
  return Number.POSITIVE_INFINITY;
}

export function createRateLimiter(maxPerWindow = MAX_MSG_PER_SECOND, windowMs = 1000) {
  const timestamps = [];
  return {
    tryConsume() {
      const now = Date.now();
      while (timestamps.length && now - timestamps[0] >= windowMs) {
        timestamps.shift();
      }
      if (timestamps.length >= maxPerWindow) return false;
      timestamps.push(now);
      return true;
    },
    reset() {
      timestamps.length = 0;
    },
  };
}

export function shouldAcceptIncoming(data, rateLimiter) {
  if (typeof data !== "string") return false;
  if (messageByteSize(data) > MAX_MSG_SIZE) return false;
  if (rateLimiter && !rateLimiter.tryConsume()) return false;
  return true;
}

export function capMessages(messages, max = MAX_MESSAGES) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}

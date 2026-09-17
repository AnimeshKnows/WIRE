import {
  CREATE_COOLDOWN_MS,
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_MESSAGES,
  MAX_MSG_PER_SECOND,
  MAX_MSG_SIZE,
  MAX_SDP_LENGTH,
  capMessages,
  createRateLimiter,
  isValidRoomId,
  messageByteSize,
  shouldAcceptIncoming,
  validateIceCandidate,
  validateSdp,
} from "./validation";

describe("isValidRoomId", () => {
  test("accepts a UUID", () => {
    expect(isValidRoomId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  test("accepts hyphens, underscores, and alphanumerics up to 40 chars", () => {
    expect(isValidRoomId("a")).toBe(true);
    expect(isValidRoomId("room_id-1")).toBe(true);
    expect(isValidRoomId("a".repeat(40))).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["whitespace", "  abc"],
    ["path traversal", "foo/bar"],
    ["dot", "room.id"],
    ["dollar", "room$id"],
    ["hash", "room#1"],
    ["brackets", "room[0]"],
    ["too long", "a".repeat(41)],
    ["unicode", "комната"],
    ["space in middle", "room id"],
    ["null", null],
    ["number", 123],
  ])("rejects %s", (_label, value) => {
    expect(isValidRoomId(value)).toBe(false);
  });
});

describe("validateSdp", () => {
  const validOffer = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" };
  const validAnswer = { type: "answer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" };

  test("accepts well-formed offer and answer", () => {
    expect(validateSdp(validOffer, "offer")).toBe(true);
    expect(validateSdp(validAnswer, "answer")).toBe(true);
  });

  test("rejects wrong type", () => {
    expect(validateSdp(validOffer, "answer")).toBe(false);
    expect(validateSdp(validAnswer, "offer")).toBe(false);
  });

  test("rejects missing v=0 prefix", () => {
    expect(validateSdp({ type: "offer", sdp: "o=- 1 1 IN IP4 0.0.0.0" }, "offer")).toBe(false);
  });

  test("rejects empty, missing, or non-string sdp", () => {
    expect(validateSdp({ type: "offer", sdp: "" }, "offer")).toBe(false);
    expect(validateSdp({ type: "offer" }, "offer")).toBe(false);
    expect(validateSdp({ type: "offer", sdp: 12 }, "offer")).toBe(false);
  });

  test("rejects null, arrays, and primitives", () => {
    expect(validateSdp(null, "offer")).toBe(false);
    expect(validateSdp(undefined, "offer")).toBe(false);
    expect(validateSdp("v=0", "offer")).toBe(false);
    expect(validateSdp(["offer"], "offer")).toBe(false);
  });

  test("rejects oversized SDP", () => {
    const sdp = `v=0${"x".repeat(MAX_SDP_LENGTH)}`;
    expect(sdp.length >= MAX_SDP_LENGTH).toBe(true);
    expect(validateSdp({ type: "offer", sdp }, "offer")).toBe(false);
  });

  test("accepts SDP just under the size cap", () => {
    const sdp = `v=0${"x".repeat(MAX_SDP_LENGTH - 4)}`;
    expect(sdp.length).toBe(MAX_SDP_LENGTH - 1);
    expect(validateSdp({ type: "offer", sdp }, "offer")).toBe(true);
  });
});

describe("validateIceCandidate", () => {
  test("accepts a typical candidate", () => {
    expect(
      validateIceCandidate({
        candidate: "candidate:1 1 UDP 2122260223 192.168.1.2 54819 typ host",
        sdpMid: "0",
      })
    ).toBe(true);
  });

  test("accepts empty candidate string (end-of-candidates)", () => {
    expect(validateIceCandidate({ candidate: "" })).toBe(true);
  });

  test("rejects missing or non-string candidate", () => {
    expect(validateIceCandidate(null)).toBe(false);
    expect(validateIceCandidate({})).toBe(false);
    expect(validateIceCandidate({ candidate: 1 })).toBe(false);
  });

  test("rejects oversized candidate", () => {
    expect(
      validateIceCandidate({ candidate: "c".repeat(MAX_ICE_CANDIDATE_LENGTH) })
    ).toBe(false);
  });
});

describe("messageByteSize and incoming accept", () => {
  test("counts UTF-8 bytes not JS string length", () => {
    expect(messageByteSize("é")).toBe(2);
    expect(messageByteSize("hi")).toBe(2);
  });

  test("treats unknown payloads as oversized", () => {
    expect(messageByteSize({ text: "x" })).toBe(Number.POSITIVE_INFINITY);
  });

  test("uses byteLength for buffers", () => {
    expect(messageByteSize(new Uint8Array(4).buffer)).toBe(4);
  });

  test("drops non-string and oversized incoming data", () => {
    expect(shouldAcceptIncoming(new Uint8Array([1]), null)).toBe(false);
    expect(shouldAcceptIncoming("x".repeat(MAX_MSG_SIZE + 1), null)).toBe(false);
    expect(shouldAcceptIncoming("ok", null)).toBe(true);
  });
});

describe("createRateLimiter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("allows MAX_MSG_PER_SECOND then blocks until the window slides", () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < MAX_MSG_PER_SECOND; i += 1) {
      expect(limiter.tryConsume()).toBe(true);
    }
    expect(limiter.tryConsume()).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(limiter.tryConsume()).toBe(true);
  });

  test("reset clears the window", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
    limiter.reset();
    expect(limiter.tryConsume()).toBe(true);
  });

  test("incoming helper honors the limiter", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(shouldAcceptIncoming("a", limiter)).toBe(true);
    expect(shouldAcceptIncoming("b", limiter)).toBe(false);
  });
});

describe("capMessages", () => {
  test("keeps the last MAX_MESSAGES entries", () => {
    const input = Array.from({ length: MAX_MESSAGES + 5 }, (_, i) => i);
    const capped = capMessages(input);
    expect(capped).toHaveLength(MAX_MESSAGES);
    expect(capped[0]).toBe(5);
    expect(capped[capped.length - 1]).toBe(MAX_MESSAGES + 4);
  });

  test("returns empty array for non-arrays", () => {
    expect(capMessages(null)).toEqual([]);
  });
});

describe("constants", () => {
  test("cooldown and size caps match the security audit", () => {
    expect(CREATE_COOLDOWN_MS).toBe(3000);
    expect(MAX_MSG_SIZE).toBe(64 * 1024);
    expect(MAX_SDP_LENGTH).toBe(50000);
  });
});

jest.mock("../firebase");
jest.mock("./peer", () => ({
  createPeer: jest.fn(() => Promise.resolve({})),
  createOffer: jest.fn(() => Promise.resolve({ type: "offer", sdp: "v=0\r\n" })),
  createAnswer: jest.fn(),
  addAnswer: jest.fn(),
  addIceCandidate: jest.fn(),
  setSignalingInfo: jest.fn(),
  setupPresence: jest.fn(),
}));

import { database, mockRoomRef } from "../firebase";
import { CREATE_COOLDOWN_MS, isValidRoomId } from "./validation";
import { createRoom, generateRoomId, joinRoom, resetCreateCooldown } from "./signaling";

beforeEach(() => {
  resetCreateCooldown();
  database.ref.mockImplementation(() => mockRoomRef);
  mockRoomRef.update.mockResolvedValue(undefined);
  mockRoomRef.get.mockResolvedValue({ exists: () => true });
  mockRoomRef.child.mockReturnValue({ on: jest.fn(), off: jest.fn() });
});

describe("generateRoomId", () => {
  test("returns unique IDs that pass room-id validation", () => {
    const ids = new Set(Array.from({ length: 40 }, () => generateRoomId()));
    expect(ids.size).toBe(40);
    ids.forEach((id) => expect(isValidRoomId(id)).toBe(true));
  });
});

describe("createRoom cooldown", () => {
  test("allows a first create and rejects a tight loop", async () => {
    const first = await createRoom();
    expect(typeof first).toBe("string");
    expect(mockRoomRef.update).toHaveBeenCalled();
    await expect(createRoom()).rejects.toThrow(/wait a moment/i);
  });

  test("allows another create after the cooldown", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now);
    await createRoom();
    nowSpy.mockReturnValue(now + CREATE_COOLDOWN_MS);
    await expect(createRoom()).resolves.toEqual(expect.any(String));
    nowSpy.mockRestore();
  });
});

describe("joinRoom path safety", () => {
  test("does not touch Firebase for an invalid room id", async () => {
    database.ref.mockClear();
    await expect(joinRoom("foo/bar")).rejects.toThrow(/Invalid Room ID/);
    expect(database.ref).not.toHaveBeenCalled();
  });

  test("throws when the room does not exist", async () => {
    mockRoomRef.get.mockResolvedValue({ exists: () => false });
    await expect(joinRoom("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).rejects.toThrow(
      /does not exist/i
    );
    expect(database.ref).toHaveBeenCalled();
  });
});

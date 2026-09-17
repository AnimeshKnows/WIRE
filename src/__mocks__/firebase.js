const mockRoomRef = {
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(),
  child: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })),
  push: jest.fn(),
  off: jest.fn(),
};

const database = {
  ref: jest.fn(() => mockRoomRef),
};

export { database, mockRoomRef };

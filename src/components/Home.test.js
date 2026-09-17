import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./Home";
import { createRoom, joinRoom, listenForAnswer, listenForIceCandidates } from "../webrtc";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("../webrtc", () => ({
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  listenForAnswer: jest.fn(),
  listenForIceCandidates: jest.fn(),
  isValidRoomId: jest.requireActual("../webrtc/validation").isValidRoomId,
}));

describe("Home", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders the product title", () => {
    render(<Home />);
    expect(screen.getByText("WIRE")).toBeInTheDocument();
  });

  test("shows an inline error for invalid room IDs and does not join", async () => {
    render(<Home />);
    await userEvent.type(screen.getByPlaceholderText("Enter Room ID"), "test!@#$");
    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(
      screen.getByText(/Invalid Room ID — use only letters, numbers, hyphens, underscores/)
    ).toBeInTheDocument();
    expect(joinRoom).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("does not join on empty input", async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(joinRoom).not.toHaveBeenCalled();
  });

  test("rejects path-like room IDs", async () => {
    render(<Home />);
    await userEvent.type(screen.getByPlaceholderText("Enter Room ID"), "foo/bar");
    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(joinRoom).not.toHaveBeenCalled();
  });

  test("joins a well-formed room id", async () => {
    joinRoom.mockResolvedValue(undefined);
    render(<Home />);
    const id = "550e8400-e29b-41d4-a716-446655440000";
    await userEvent.type(screen.getByPlaceholderText("Enter Room ID"), id);
    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    await waitFor(() => {
      expect(joinRoom).toHaveBeenCalledWith(id);
      expect(listenForIceCandidates).toHaveBeenCalledWith(id, false);
      expect(mockNavigate).toHaveBeenCalledWith(`/room/${id}`);
    });
  });

  test("surfaces missing-room errors from joinRoom", async () => {
    joinRoom.mockRejectedValue(new Error("Room does not exist. Double-check the Room ID."));
    render(<Home />);
    await userEvent.type(
      screen.getByPlaceholderText("Enter Room ID"),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(await screen.findByText(/Room does not exist/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("creates a room and starts caller listeners", async () => {
    createRoom.mockResolvedValue("new-room-id");
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Create Room" }));
    await waitFor(() => {
      expect(createRoom).toHaveBeenCalled();
      expect(listenForAnswer).toHaveBeenCalledWith("new-room-id");
      expect(listenForIceCandidates).toHaveBeenCalledWith("new-room-id", true);
      expect(mockNavigate).toHaveBeenCalledWith("/room/new-room-id");
    });
  });

  test("surfaces create-room cooldown errors", async () => {
    createRoom.mockRejectedValue(new Error("Please wait a moment before creating another room."));
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Create Room" }));
    expect(await screen.findByText(/wait a moment/i)).toBeInTheDocument();
  });
});

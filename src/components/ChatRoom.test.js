import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatRoom from "./ChatRoom";

const mockNavigate = jest.fn();
const mockSendMessage = jest.fn(() => ({ ok: true }));
const mockOnIncomingMessage = jest.fn();
const mockOnConnectionStateChange = jest.fn();
const mockOnPartnerLeft = jest.fn();
const mockGetActiveRoomId = jest.fn();
const mockClosePeer = jest.fn();
const mockCleanupSignaling = jest.fn();
const mockRemove = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ roomId: "room-1" }),
}));

jest.mock("../webrtc", () => ({
  sendMessage: (...args) => mockSendMessage(...args),
  onIncomingMessage: (...args) => mockOnIncomingMessage(...args),
  onConnectionStateChange: (...args) => mockOnConnectionStateChange(...args),
  onPartnerLeft: (...args) => mockOnPartnerLeft(...args),
  getActiveRoomId: (...args) => mockGetActiveRoomId(...args),
  closePeer: (...args) => mockClosePeer(...args),
  cleanupSignaling: (...args) => mockCleanupSignaling(...args),
  capMessages: jest.requireActual("../webrtc/validation").capMessages,
}));

jest.mock("../firebase", () => ({
  database: {
    ref: () => ({ remove: (...args) => mockRemove(...args) }),
  },
}));

describe("ChatRoom", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockReturnValue({ ok: true });
    mockGetActiveRoomId.mockReturnValue("room-1");
  });

  test("redirects home when there is no live peer for this room", () => {
    mockGetActiveRoomId.mockReturnValue(null);
    render(<ChatRoom />);
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  test("renders room id and disables send while connecting", () => {
    render(<ChatRoom />);
    expect(screen.getByText(/Room ID: room-1/)).toBeInTheDocument();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("sends a message only when connected and sendMessage succeeds", async () => {
    mockOnConnectionStateChange.mockImplementation((cb) => cb("connected"));
    render(<ChatRoom />);
    const input = screen.getByPlaceholderText("Type message...");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockSendMessage).toHaveBeenCalledWith("hello");
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("does not append an oversized message and shows an error", async () => {
    mockOnConnectionStateChange.mockImplementation((cb) => cb("connected"));
    mockSendMessage.mockReturnValue({ ok: false, reason: "size" });
    render(<ChatRoom />);
    await userEvent.type(screen.getByPlaceholderText("Type message..."), "too-big");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText(/too large/i)).toBeInTheDocument();
    expect(screen.queryByText("too-big")).not.toBeInTheDocument();
  });

  test("does not send blank messages", async () => {
    mockOnConnectionStateChange.mockImplementation((cb) => cb("connected"));
    render(<ChatRoom />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test("shows partner-left banner instead of bouncing home", () => {
    mockOnPartnerLeft.mockImplementation((cb) => cb());
    render(<ChatRoom />);
    expect(screen.getByText("Partner left the room")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/", { replace: true });
    expect(mockClosePeer).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
  });

  test("Leave navigates home and tears down the room", async () => {
    render(<ChatRoom />);
    await userEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(mockRemove).toHaveBeenCalled();
    expect(mockClosePeer).toHaveBeenCalled();
    expect(mockCleanupSignaling).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  test("appends incoming peer messages via the callback", () => {
    mockOnIncomingMessage.mockImplementation((cb) => cb("from-peer"));
    render(<ChatRoom />);
    expect(screen.getByText("from-peer")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./firebase", () => ({
  database: { ref: jest.fn() },
}));

jest.mock("./webrtc", () => ({
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  listenForAnswer: jest.fn(),
  listenForIceCandidates: jest.fn(),
  isValidRoomId: jest.requireActual("./webrtc/validation").isValidRoomId,
  sendMessage: jest.fn(),
  onIncomingMessage: jest.fn(),
  onConnectionStateChange: jest.fn(),
  onPartnerLeft: jest.fn(),
  getActiveRoomId: jest.fn(() => null),
  closePeer: jest.fn(),
  cleanupSignaling: jest.fn(),
  capMessages: jest.requireActual("./webrtc/validation").capMessages,
}));

jest.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: ({ element }) => element,
  useNavigate: () => jest.fn(),
  useParams: () => ({}),
}));

jest.mock("./components/Home", () => () => <div>WIRE home mock</div>);
jest.mock("./components/ChatRoom", () => () => <div>chat mock</div>);

test("renders routed screens without crashing", () => {
  render(<App />);
  expect(screen.getByText("WIRE home mock")).toBeInTheDocument();
  expect(screen.getByText("chat mock")).toBeInTheDocument();
});

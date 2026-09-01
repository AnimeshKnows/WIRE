// ChatRoom.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { database } from "../firebase";
import {
  sendMessage,
  onIncomingMessage,
  onConnectionStateChange,
  onPartnerLeft,
  getActiveRoomId,
  closePeer,
  cleanupSignaling
} from "../webrtc";

const STATUS_TEXT = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  failed: "Connection failed",
  disconnected: "Peer disconnected",
};

const Avatar = ({ isMe }) => (
  <div className={`avatar ${isMe ? "avatar-me" : "avatar-peer"}`}>{isMe ? "Y" : "P"}</div>
);

const ChatRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting");

  const handleLeave = () => {
    const activeId = getActiveRoomId();
    if (activeId) {
      database.ref(`rooms/${activeId}`).remove();
    }
    closePeer();
    cleanupSignaling();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    // If there's no live peer connection for this room (e.g. this is a raw
    // refresh/direct URL hit), don't sit on "connecting..." forever — bounce home.
    if (getActiveRoomId() !== roomId) {
      navigate("/", { replace: true });
      return;
    }

    onIncomingMessage((msg) => {
      setMessages((prev) => [...prev, { sender: "peer", text: msg }]);
    });

    onConnectionStateChange((state) => {
      setStatus(state);
    });

    // Fires when the other peer's presence disappears (their refresh/close/crash).
    onPartnerLeft(() => {
      const activeId = getActiveRoomId();
      if (activeId) {
        database.ref(`rooms/${activeId}`).remove();
      }
      closePeer();
      cleanupSignaling();
      navigate("/", { replace: true });
    });

    // Runs on unmount (leaving the room / navigating away) — prevents stale
    // connections/listeners from bleeding into the next room.
    return () => {
      closePeer();
      cleanupSignaling();
    };
  }, [roomId, navigate]);

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { sender: "me", text: input }]);
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="chat-room">
      <div className="chat-header">
        <h2>Room ID: {roomId}</h2>
        <button onClick={handleLeave} className="btn btn-secondary">
          Leave
        </button>
      </div>

      <div className={`status-banner status-${status}`}>{STATUS_TEXT[status] || status}</div>

      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-row ${msg.sender === "me" ? "message-row-me" : "message-row-peer"}`}>
            <Avatar isMe={msg.sender === "me"} />
            <div className="message-bubble">{msg.text}</div>
          </div>
        ))}
      </div>

      <div className="input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type message..."
        />
        <button onClick={handleSend} disabled={status !== "connected"}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
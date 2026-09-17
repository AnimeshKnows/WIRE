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
  cleanupSignaling,
  capMessages,
} from "../webrtc";

const STATUS_TEXT = {
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  failed: "Connection failed",
  disconnected: "Peer disconnected",
  "partner-left": "Partner left the room",
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
  const [sendError, setSendError] = useState("");

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
      setMessages((prev) => capMessages([...prev, { sender: "peer", text: msg }]));
    });

    onConnectionStateChange((state) => {
      setStatus((prev) => (prev === "partner-left" ? prev : state));
    });

    // After the presence grace period, keep the transcript and show a banner
    // instead of bouncing home (see Progress Test 9).
    onPartnerLeft(() => {
      setStatus("partner-left");
      const activeId = getActiveRoomId();
      if (activeId) {
        database.ref(`rooms/${activeId}`).remove();
      }
      closePeer();
      cleanupSignaling();
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

    const result = sendMessage(input);
    if (!result?.ok) {
      if (result?.reason === "size") {
        setSendError("Message is too large (max 64 KB).");
      } else if (result?.reason === "rate") {
        setSendError("You're sending too fast. Try again in a moment.");
      } else {
        setSendError("Not connected.");
      }
      return;
    }

    setSendError("");
    setMessages((prev) => capMessages([...prev, { sender: "me", text: input }]));
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
      {sendError && <p className="error-text">{sendError}</p>}
    </div>
  );
};

export default ChatRoom;
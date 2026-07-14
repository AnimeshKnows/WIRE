import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sendMessage, onIncomingMessage, onConnectionStateChange, closePeer, cleanupSignaling } from "../webrtc";

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

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    onIncomingMessage((msg) => {
      setMessages((prev) => [...prev, { sender: "peer", text: msg }]);
    });

    onConnectionStateChange((state) => {
      setStatus(state);
    });

    // Runs on unmount (leaving the room / navigating away) — prevents stale
    // connections/listeners from bleeding into the next room.
    return () => {
      closePeer();
      cleanupSignaling();
    };
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { sender: "me", text: input }]);
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="chat-room">
      <h2>Room ID: {roomId}</h2>

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
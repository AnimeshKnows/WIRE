// src/components/ChatRoom.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sendMessage, onIncomingMessage, onConnectionStateChange, closePeer, cleanupSignaling } from "../webrtc";
import Oscilloscope from "./Oscilloscope";

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
    <div className="device">
      <div className="screw tl"></div>
      <div className="screw tr"></div>
      <div className="screw bl"></div>
      <div className="screw br"></div>

      <div className="room-head">
        <div>
          <div className="eyebrow">Active link</div>
          <div className="rid">{roomId}</div>
        </div>
      </div>

      <Oscilloscope state={status} />

      <div className="log">
        {messages.map((msg, idx) => (
          <div key={idx} className={`log-row ${msg.sender === "me" ? "tx" : "rx"}`}>
            <span className="log-tag">{msg.sender === "me" ? "TX" : "RX"}</span>
            <span className="log-text">{msg.text}</span>
          </div>
        ))}
      </div>

      <div className="send-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type transmission…"
        />
        <button onClick={handleSend} disabled={status !== "connected"}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
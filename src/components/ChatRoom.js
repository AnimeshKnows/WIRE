// ChatRoom.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sendMessage, onIncomingMessage } from "../webrtc";

const ChatRoom = () => {
  const { roomId } = useParams();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // Register message listener ONCE
  useEffect(() => {
    onIncomingMessage((msg) => {
      setMessages((prev) => [...prev, `Peer: ${msg}`]);
    });
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, `You: ${input}`]);
    sendMessage(input);

    setInput("");
  };

  return (
    <div className="chat-room">
      <h2>Room ID: {roomId}</h2>

      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className="message">{msg}</div>
        ))}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Type message..."
      />

      <button onClick={handleSend}>Send</button>
    </div>
  );
};

export default ChatRoom;
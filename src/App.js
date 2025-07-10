// src/App.js
import React, { useState } from 'react';
import ChatRoom from './components/ChatRoom';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState([]);

  const joinRoom = () => {
    if (roomId.trim()) setJoined(true);
  };

  const sendMessage = (msg) => {
    // For now, just simulate sending
    setMessages(prev => [...prev, `You: ${msg}`]);
  };

  return (
    <div className="App">
      {!joined ? (
        <div className="join-screen">
          <h1>Welcome to WIRE</h1>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <ChatRoom
          roomId={roomId}
          sendMessage={sendMessage}
          messages={messages}
        />
      )}
    </div>
  );
}

export default App;

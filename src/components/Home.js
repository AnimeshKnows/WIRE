// Home.js
import React, { useState } from "react";
import {
  createRoom,
  joinRoom,
  listenForAnswer,
  listenForIceCandidates,
  setSignalingInfo,
} from "../webrtc";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const [roomIdInput, setRoomIdInput] = useState("");
  const navigate = useNavigate();

  // Create Room (caller)
  const handleCreateRoom = async () => {
    const roomId = await createRoom();
    
    // Configure peer.js signaling
    setSignalingInfo(roomId, true);

    // Listen for ICE from callee + answer
    listenForAnswer(roomId);
    listenForIceCandidates(roomId, true);

    navigate(`/room/${roomId}`);
  };

  // Join Room (callee)
  const handleJoinRoom = async () => {
    if (!roomIdInput.trim()) return;

    const roomId = roomIdInput.trim();

    await joinRoom(roomId);

    // Configure peer.js signaling
    setSignalingInfo(roomId, false);

    // Listen for ICE from caller
    listenForIceCandidates(roomId, false);

    navigate(`/room/${roomId}`);
  };

  return (
    <div className="home">
      <h2>WIRE</h2>

      {/* Create room */}
      <button onClick={handleCreateRoom}>Create Room</button>

      {/* Join room */}
      <input
        type="text"
        placeholder="Enter Room ID"
        value={roomIdInput}
        onChange={(e) => setRoomIdInput(e.target.value)}
      />
      <button onClick={handleJoinRoom}>Join Room</button>
    </div>
  );
};

export default Home;
import React, { useState } from "react";
import { createRoom, joinRoom, listenForAnswer, listenForIceCandidates } from "../webrtc";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setError("");
    setLoading(true);
    try {
      const roomId = await createRoom();
      listenForAnswer(roomId);
      listenForIceCandidates(roomId, true);
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError("Could not create a room. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomIdInput.trim()) return;
    setError("");
    setLoading(true);
    const roomId = roomIdInput.trim();
    try {
      await joinRoom(roomId);
      listenForIceCandidates(roomId, false);
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(err.message || "Failed to join room.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      <h1 className="app-title">WIRE</h1>
      <p className="app-subtitle">Peer-to-peer chat. No server in the middle.</p>

      <button onClick={handleCreateRoom} disabled={loading} className="btn btn-primary">
        Create Room
      </button>

      <div className="join-row">
        <input
          type="text"
          placeholder="Enter Room ID"
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
        />
        <button onClick={handleJoinRoom} disabled={loading} className="btn btn-secondary">
          Join Room
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

export default Home;
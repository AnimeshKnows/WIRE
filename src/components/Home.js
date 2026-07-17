// src/components/Home.js
import React, { useState } from "react";
import { createRoom, joinRoom, listenForAnswer, listenForIceCandidates } from "../webrtc";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [freqDisplay, setFreqDisplay] = useState("— — . —");
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setError("");
    setLoading(true);
    try {
      const roomId = await createRoom();
      setFreqDisplay(roomId);
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
      setFreqDisplay(roomId);
      listenForIceCandidates(roomId, false);
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(err.message || "Failed to join room.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="device">
      <div className="screw tl"></div>
      <div className="screw tr"></div>
      <div className="screw bl"></div>
      <div className="screw br"></div>

      <p className="wordmark">
        WIRE
        <span>peer signal relay — no server in the middle</span>
      </p>

      <div className="dial-row">
        <svg className="gauge" width="220" height="120" viewBox="0 0 220 120">
          <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#443E30" strokeWidth="2" />
          <path
            d="M20 110 A90 90 0 0 1 200 110"
            fill="none"
            stroke="var(--amber-dim)"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
          <line x1="110" y1="110" x2="60" y2="45" stroke="var(--amber)" strokeWidth="2" />
          <circle cx="110" cy="110" r="5" fill="var(--amber)" />
        </svg>
      </div>

      <div className="readout">
        <div className="readout-value">{freqDisplay}</div>
        <div className="readout-sub">frequency / room reference</div>
      </div>

      <div className="action-row">
        <div className="action-card">
          <div className="eyebrow">Start a link</div>
          <p>Opens a new frequency and waits for a peer to tune in.</p>
          <button onClick={handleCreateRoom} disabled={loading} className="knob-btn primary">
            Broadcast
          </button>
        </div>

        <div className="action-card">
          <div className="eyebrow">Join a link</div>
          <p>Enter the frequency someone shared with you.</p>
          <input
            className="join-input"
            type="text"
            placeholder="Enter Room ID"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
          />
          <button onClick={handleJoinRoom} disabled={loading} className="knob-btn">
            Tune in
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

export default Home;
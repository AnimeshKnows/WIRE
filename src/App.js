// App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";

import Home from "./components/Home";
import ChatRoom from "./components/ChatRoom";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<ChatRoom />} />
      </Routes>
    </Router>
  );
};

export default App;
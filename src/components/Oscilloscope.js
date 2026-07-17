// src/components/Oscilloscope.js
import React, { useRef, useEffect } from "react";

// Verbatim from wire-prototype.html's scopeConfig
const scopeConfig = {
  connecting:   { color: "#F2A83D", label: "searching for signal…", mode: "sweep" },
  connected:    { color: "#8FB39F", label: "signal locked", mode: "pulse" },
  reconnecting: { color: "#F2A83D", label: "signal dropped — retrying…", mode: "static" },
  failed:       { color: "#C4553A", label: "no signal", mode: "flat" },
  disconnected: { color: "#C4553A", label: "peer went off the air", mode: "flat" },
};

const Oscilloscope = ({ state }) => {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const tRef = useRef(0);
  const rafRef = useRef(null);

  // Keep the draw loop's view of `state` current without restarting the effect
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = canvas.clientWidth * 2;
      canvas.height = 140;
      canvas.style.height = "70px";
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      tRef.current += 1;
      const t = tRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      ctx.clearRect(0, 0, w, h);

      const cfg = scopeConfig[stateRef.current] || scopeConfig.connecting;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let x = 0; x < w; x += 4) {
        let y = mid;
        if (cfg.mode === "pulse") {
          y = mid - Math.sin((x + t * 4) * 0.04) * 20 * Math.exp(-((x % 160) / 160));
        } else if (cfg.mode === "sweep") {
          y = mid - Math.sin(x * 0.03 + t * 0.08) * (10 + 8 * Math.sin(t * 0.02));
        } else if (cfg.mode === "static") {
          y = mid + (Math.random() - 0.5) * (Math.sin(t * 0.05) > 0 ? 30 : 4);
        } else {
          y = mid + (Math.random() - 0.5) * 1.5;
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const cfg = scopeConfig[state] || scopeConfig.connecting;

  return (
    <div className="scope-wrap">
      <canvas ref={canvasRef} height="70" />
      <p className="scope-status" style={{ color: cfg.color }}>
        {cfg.label}
      </p>
    </div>
  );
};

export default Oscilloscope;
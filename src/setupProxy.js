const turnCredentials = require("../api/turn-credentials");

module.exports = function setupProxy(app) {
  app.all("/api/turn-credentials", (req, res) => {
    Promise.resolve(turnCredentials(req, res)).catch((err) => {
      console.error("[WIRE] /api/turn-credentials failed", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    });
  });
};

function extraAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const list = [
    "http://localhost:3000",
    "http://localhost:3001",
    ...extraAllowedOrigins(),
  ];
  if (process.env.VERCEL_URL) {
    list.push(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    list.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return list;
}

function isAllowedRequest(req) {
  const allowed = getAllowedOrigins();
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";

  if (origin) {
    return allowed.some((a) => origin === a);
  }
  if (referer) {
    return allowed.some((a) => referer.startsWith(a));
  }

  // On Vercel, require Origin or Referer so anonymous curl cannot harvest TURN creds.
  if (process.env.VERCEL) {
    return false;
  }

  const host = req.headers.host || "";
  return allowed.some((a) => a.includes(host));
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedRequest(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAllowedRequest(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Server-only secrets. Never read REACT_APP_* — CRA embeds those in the client bundle.
  const username = process.env.ORP_USERNAME;
  const credential = process.env.ORP_CREDENTIAL;

  const defaultStun = { urls: "stun:stun.l.google.com:19302" };

  if (!username || !credential) {
    return res.status(200).json({
      iceServers: [defaultStun],
    });
  }

  return res.status(200).json({
    iceServers: [
      defaultStun,
      { urls: "turn:openrelay.metered.ca:80", username, credential },
      { urls: "turn:openrelay.metered.ca:80?transport=tcp", username, credential },
      { urls: "turn:openrelay.metered.ca:443", username, credential },
      { urls: "turns:openrelay.metered.ca:443?transport=tcp", username, credential },
    ],
  });
};

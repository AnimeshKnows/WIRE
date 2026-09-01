// api/turn-credentials.js
module.exports = async function handler(req, res) {
  // Read server-side environment variables
  const username = process.env.ORP_USERNAME || process.env.REACT_APP_ORP_USERNAME;
  const credential = process.env.ORP_CREDENTIAL || process.env.REACT_APP_ORP_CREDENTIAL;

  const defaultStun = { urls: "stun:stun.l.google.com:19302" };

  if (!username || !credential) {
    return res.status(200).json({
      iceServers: [defaultStun]
    });
  }

  return res.status(200).json({
    iceServers: [
      defaultStun,
      { urls: "turn:global.relay.metered.ca:80", username, credential },
      { urls: "turn:global.relay.metered.ca:443", username, credential },
      { urls: "turn:global.relay.metered.ca:443?transport=tcp", username, credential },
      { urls: "turns:global.relay.metered.ca:443", username, credential }
    ]
  });
};

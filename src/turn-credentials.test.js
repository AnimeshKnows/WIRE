const handler = require("../api/turn-credentials");

function mockReq(overrides = {}) {
  return {
    method: "GET",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
    },
    ...overrides,
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...(overrides.headers || {}),
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

describe("/api/turn-credentials", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    delete process.env.ORP_USERNAME;
    delete process.env.ORP_CREDENTIAL;
    delete process.env.REACT_APP_ORP_USERNAME;
    delete process.env.REACT_APP_ORP_CREDENTIAL;
    delete process.env.VERCEL;
    delete process.env.ALLOWED_ORIGINS;
  });

  test("rejects non-GET methods", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "POST" }), res);
    expect(res.statusCode).toBe(405);
  });

  test("allows CORS preflight", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "OPTIONS" }), res);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  test("rejects a foreign Origin", async () => {
    const res = mockRes();
    await handler(mockReq({ headers: { origin: "https://evil.example" } }), res);
    expect(res.statusCode).toBe(403);
  });

  test("on Vercel, rejects requests with no Origin or Referer", async () => {
    process.env.VERCEL = "1";
    const res = mockRes();
    await handler(mockReq({ headers: { origin: "", referer: "", host: "app.vercel.app" } }), res);
    expect(res.statusCode).toBe(403);
  });

  test("returns STUN-only when server secrets are missing", async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.iceServers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  test("does not use REACT_APP_ORP_* fallbacks", async () => {
    process.env.REACT_APP_ORP_USERNAME = "leaked-user";
    process.env.REACT_APP_ORP_CREDENTIAL = "leaked-pass";
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.body.iceServers).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("leaked-user");
  });

  test("returns Open Relay TURN URLs when ORP_* secrets are set", async () => {
    process.env.ORP_USERNAME = "user";
    process.env.ORP_CREDENTIAL = "pass";
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(200);
    const urls = res.body.iceServers.map((s) => s.urls);
    expect(urls).toEqual(
      expect.arrayContaining([
        "stun:stun.l.google.com:19302",
        "turn:openrelay.metered.ca:80",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ])
    );
    expect(urls.join(" ")).not.toContain("standard.relay.metered.ca");
    expect(res.body.iceServers.some((s) => s.username === "user" && s.credential === "pass")).toBe(
      true
    );
  });

  test("allows an extra origin from ALLOWED_ORIGINS", async () => {
    process.env.ALLOWED_ORIGINS = "https://wire.example.com";
    const res = mockRes();
    await handler(mockReq({ headers: { origin: "https://wire.example.com" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://wire.example.com");
  });
});

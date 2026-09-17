---
tags:
  - wire
  - index
status: living
updated: 2026-09-17
---

# WIRE

**WebRTC Instant Relay Engine** — also *What If Relay Existed?* — is a privacy-first, ephemeral 1:1 browser chat. Two people share a Room ID, connect over WebRTC, and send text on an `RTCDataChannel`. Firebase Realtime Database is **signaling only** (SDP offer/answer and ICE candidates). Chat content never touches a server; that is a structural guarantee, not a policy promise. See [[prd]] and [[architecture]].

## Tech stack (overview)

| Layer | Choice |
|---|---|
| UI | React 19, Create React App, plain CSS (`App.css`) |
| Routing | React Router 7 — `/` ([[design]] Home) and `/room/:roomId` (ChatRoom) |
| Signaling | Firebase 11 compat SDK, Realtime Database project `wire-signaling` (`asia-southeast1`) |
| P2P | Raw `RTCPeerConnection` + `RTCDataChannel` (no PeerJS / simple-peer — [[rules]]) |
| NAT traversal | Google STUN, then Metered / Open Relay TURN via Vercel `api/turn-credentials.js` |
| Hosting | Vercel (`vercel.json` SPA rewrites + security headers) |

Full folder map and module graph: [[architecture]]. Constraints: [[rules]].

## Vault contents

| Note | What it holds |
|---|---|
| [[prd]] | Product vision, goals, non-goals, shipped features, limitations |
| [[architecture]] | Structural patterns, folders, dependencies, signaling vs data channel |
| [[design]] | UI/UX, color, typography, user flows |
| [[idea]] | Deferred product ideas (dual-consent leave, idle rooms, scheduled rooms) |
| [[phases.doc]] | Development phases (V1–V2c, TURN, docs, security) |
| [[Progress]] | Current working-tree state, git activity, security hardening log |
| [[memory]] | Next steps, missing pieces, technical debt, session continuity |
| [[rules]] | What to use / avoid; AI and git boundaries |
| [[security-audit]] | 17-finding audit that drove the Sep 2026 hardening pass |

## Project goal (short)

Make connection setup close to zero-friction — no accounts, no installs, just a shared Room ID — while keeping message delivery genuinely peer-to-peer so a sophisticated user can verify the privacy claim by reading the code. Reliability across ordinary network blips is in scope; group chat, persistence, and identity are not. Details: [[prd]].

Current build state and what to do next: [[Progress]] · [[memory]].

---

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

> Vault note: `src/App.test.js` is still the CRA default (“learn react”) and does not cover WIRE UI. Tracked in [[memory]].

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

Per [[rules]]: do not run `npm run eject`.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

WIRE deploys on Vercel. SPA fallback and headers live in `vercel.json` — see [[architecture]] and [[Progress]] Item 8.

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

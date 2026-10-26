# On-Tour Client → Admin Camera Test

This is a **separate minimal test**, not a modification of the main On-Tour app. No npm dependencies are needed. It uses Node.js HTTP + Server-Sent Events for signaling, and WebRTC for video/audio. Supports exactly one Admin page and one Client page connected to one server instance. No authentication: **test only, do not use as a public production service**.

## Run locally

1. Install Node.js 18 or later.
2. Open a terminal in this folder and run `npm start` (or `node server.js`).
3. Open `http://localhost:3000/admin` in one browser tab.
4. Open `http://localhost:3000/client` in a second tab. Click **Start Camera and Broadcast** and allow camera and microphone access.
5. Return to Admin: the real Client video should appear. If browser blocks sound, click **Play Remote / Unmute**.
6. Check the status and connection logs on both pages. Expected: `WebRTC: connected` and `Remote video received` on Admin.

## Testing on two devices

Camera access requires **HTTPS** (or localhost on the same device). Deploy to Render as a temporary Node web service, build command `npm install`, start command `npm start`. Open `https://YOUR-RENDER-URL/admin` on Admin and `https://YOUR-RENDER-URL/client` on Client. Do not expose this unauthenticated test app publicly for long; use only temporary test devices and remove the service afterward.

This test uses a public STUN server and **no TURN server**, so it may fail between restrictive networks. If it fails, inspect both logs and browser WebRTC internals. TURN is required for reliable cross-network operation. A Render service with multiple instances will not work because signaling state is in memory.

## Verification status

Server HTTP and signaling can be tested automatically. Real camera capture, audio, browser SDP negotiation, and different-network connectivity require a manual two-browser/two-device test and are **NOT TESTED** unless explicitly performed.

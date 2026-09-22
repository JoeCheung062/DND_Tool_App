/**
 * Smoke-test Display socket protocol: register screens, play with assignments,
 * process verification challenge/ack.
 */
import { io } from "socket.io-client";

const API = process.env.API_BASE || "http://localhost:3000/api";
const BASE = API.replace(/\/api\/?$/, "");

async function json(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `${method} ${path} failed`);
  }
  return data.data;
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 8000);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

const login = await json("/auth/login", {
  method: "POST",
  body: { email: "dm@example.com", password: "password123" },
});
const token = login.token;

const campaigns = await json("/campaigns", { token });
const campaignId = campaigns[0]?.id;
if (!campaignId) throw new Error("No campaign/script seeded");

const room = await json("/rooms", {
  method: "POST",
  token,
  body: { name: `Display Smoke ${Date.now()}`, campaignId },
});

const materials = await json("/materials", { token });
const materialId = materials[0]?.id;
if (!materialId) throw new Error("No materials seeded");

const display = io(BASE, { path: "/socket.io", auth: { token } });
const control = io(BASE, { path: "/socket.io", auth: { token } });

await Promise.all([
  new Promise((r, j) => {
    display.once("connect", r);
    display.once("connect_error", j);
  }),
  new Promise((r, j) => {
    control.once("connect", r);
    control.once("connect_error", j);
  }),
]);

const joinDisp = await emitAck(display, "room:join", { roomId: room.id });
if (!joinDisp.ok) throw new Error(joinDisp.error);
const joinCtrl = await emitAck(control, "room:join", { roomId: room.id });
if (!joinCtrl.ok) throw new Error(joinCtrl.error);

const clientId = `smoke-${Date.now()}`;
const reg = await emitAck(display, "display:register", {
  roomId: room.id,
  clientId,
  mainPid: process.pid,
  screens: [
    {
      id: 1,
      label: "Smoke Primary",
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      primary: true,
    },
    {
      id: 2,
      label: "Smoke Secondary",
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      primary: false,
    },
  ],
  processes: [
    { screenId: 1, processId: 101, alive: true },
    { screenId: 2, processId: 102, alive: true },
  ],
});
if (!reg.ok) throw new Error(reg.error);

const registryPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("registry timeout")), 5000);
  control.once("display:registry", (payload) => {
    clearTimeout(t);
    resolve(payload);
  });
});
// trigger another register heartbeat-style registry already emitted; wait if needed
const registry = joinCtrl.displays?.length
  ? { displays: joinCtrl.displays }
  : await registryPromise.catch(() => ({ displays: reg.registration ? [reg.registration] : [] }));

console.log(
  "registered screens:",
  registry.displays?.[0]?.screens?.map((s) => s.id) ||
    reg.registration.screens.map((s) => s.id)
);

const ackPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("ack timeout")), 8000);
  control.on("display:ack", (payload) => {
    if (payload.requestId?.startsWith("smoke-")) {
      clearTimeout(t);
      resolve(payload);
    }
  });
});

const play = await emitAck(control, "material:play", {
  roomId: room.id,
  requestId: `smoke-${Date.now()}`,
  assignments: [
    { screenId: 1, materialId },
    { screenId: 2, materialId },
  ],
});
if (!play.ok) throw new Error(play.error);

// Simulate Display App process verification after applying content
display.emit("display:ack", {
  roomId: room.id,
  clientId,
  requestId: play.event.requestId,
  results: [
    { screenId: 1, ok: true, processId: 101 },
    { screenId: 2, ok: true, processId: 102 },
  ],
});

const ack = await ackPromise;
console.log("display:ack", ack.results);

const verifyPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("verify timeout")), 8000);
  display.on("display:verify", (payload) => {
    display.emit("display:verify-result", {
      roomId: room.id,
      clientId,
      challengeId: payload.challengeId,
      ok: true,
      mainPid: process.pid,
      processes: [
        { screenId: 1, processId: 101, alive: true },
        { screenId: 2, processId: 102, alive: true },
      ],
    });
  });
  control.on("display:verify-result", (payload) => {
    clearTimeout(t);
    resolve(payload);
  });
});

const verifyReq = await emitAck(control, "display:verify", {
  roomId: room.id,
  clientId,
});
if (!verifyReq.ok) throw new Error(verifyReq.error);
const verify = await verifyPromise;
console.log("display:verify-result ok=", verify.ok);

await json(`/rooms/${room.id}`, { method: "DELETE", token });

display.disconnect();
control.disconnect();
console.log("display socket smoke: ok");
process.exit(0);

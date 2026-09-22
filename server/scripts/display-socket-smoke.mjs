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
if (!campaignId) throw new Error("No campaign seeded");

const room = await json("/rooms", {
  method: "POST",
  token,
  body: { name: `Display Smoke ${Date.now()}`, campaignId },
});

const materials = await json("/materials", { token });
const materialId = materials[0]?.id;
if (!materialId) throw new Error("No materials seeded");

const general = await json("/materials", {
  method: "POST",
  token,
  body: {
    type: "IMAGE",
    name: `General Smoke ${Date.now()}`,
    assetUrl: "/uploads/general-smoke.png",
    general: true,
    campaignIds: [],
    tagIds: [],
  },
});
const bundled = await json(
  `/materials?campaignId=${encodeURIComponent(campaignId)}&includeGeneral=1`,
  { token }
);
if (!bundled.some((row) => row.id === general.id)) {
  throw new Error("includeGeneral did not return the General material");
}
const campaignOnly = await json(
  `/materials?campaignId=${encodeURIComponent(campaignId)}`,
  { token }
);
if (campaignOnly.some((row) => row.id === general.id)) {
  throw new Error("General material leaked into campaign-only list");
}

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
const processToken1 = `proc-${clientId}-1`;
const processToken2 = `proc-${clientId}-2`;
const registryPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("registry timeout")), 5000);
  control.once("display:registry", (payload) => {
    clearTimeout(t);
    resolve(payload);
  });
});
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
    { screenId: 1, processId: 101, alive: true, processToken: processToken1 },
    { screenId: 2, processId: 102, alive: true, processToken: processToken2 },
  ],
});
if (!reg.ok) throw new Error(reg.error);
if (JSON.stringify(reg.registration).includes(processToken1)) {
  throw new Error("process token leaked on register ack");
}

const registry = await registryPromise;

const registeredScreens =
  registry.displays?.[0]?.screens?.map((s) => s.id) ||
  reg.registration.screens.map((s) => s.id);
console.log("registered screens:", registeredScreens);
if (JSON.stringify(registry).includes(processToken1)) {
  throw new Error("process token leaked on display:registry");
}

const ackPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("ack timeout")), 8000);
  control.on("display:ack", (payload) => {
    if (payload.requestId?.startsWith("smoke-")) {
      clearTimeout(t);
      resolve(payload);
    }
  });
});

const authPromise = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("authenticated timeout")), 8000);
  control.on("display:authenticated", (payload) => {
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
    { screenId: 1, materialIds: [materialId, general.id] },
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
    { screenId: 1, ok: true, processId: 101, processToken: processToken1 },
    { screenId: 2, ok: true, processId: 102, processToken: processToken2 },
  ],
});

const ack = await ackPromise;
const auth = await authPromise;
console.log("display:ack", ack.results);
if (!auth.authenticated) {
  throw new Error(`expected authenticated play, got ${JSON.stringify(auth)}`);
}
if (JSON.stringify(auth).includes(processToken1)) {
  throw new Error("process token leaked on display:authenticated");
}
if (!ack.results?.every((row) => row.authenticated)) {
  throw new Error("expected every screen result to be authenticated");
}

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

await json(`/materials/${general.id}`, { method: "DELETE", token });
await json(`/rooms/${room.id}`, { method: "DELETE", token });

display.disconnect();
control.disconnect();
console.log("display socket smoke: ok");
process.exit(0);

import { io, type Socket } from "socket.io-client";
import { getApiBase, getToken } from "./api";
import { getDisplayApi } from "./displayApi";

export type MaterialPlayEvent = {
  roomId: string;
  requestId: string;
  materialId?: string;
  combinationId?: string;
  screenId?: number;
  assignments: Array<{
    screenId?: number;
    materialId?: string;
    combinationId?: string;
  }>;
  by?: { id: string; username: string };
  at: string;
};

export type SessionState = {
  socket: Socket;
  roomId: string;
  roomName: string;
  clientId: string;
  mainPid: number;
  screens: Array<{
    id: number;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    primary: boolean;
  }>;
  lastAck?: unknown;
  lastVerify?: unknown;
};

function socketUrl() {
  return getApiBase().replace(/\/api\/?$/, "");
}

export async function connectAndEnterRoom(roomId: string): Promise<SessionState> {
  const token = getToken();
  if (!token) throw new Error("Sign in before entering a room");

  const displayApi = getDisplayApi();
  const info = await displayApi.getInfo();

  const socket = io(socketUrl(), {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connection timeout")), 8000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const join = await new Promise<{
    ok: boolean;
    name?: string;
    error?: string;
  }>((resolve) => {
    socket.emit("room:join", { roomId }, resolve);
  });
  if (!join.ok) {
    socket.disconnect();
    throw new Error(join.error || "Failed to join room");
  }

  const opened = await displayApi.openDisplayWindows();

  const registration = await new Promise<{ ok: boolean; error?: string }>(
    (resolve) => {
      socket.emit(
        "display:register",
        {
          roomId,
          clientId: opened.clientId || info.clientId,
          mainPid: opened.mainPid || info.mainPid,
          screens: opened.screens,
          processes: opened.processes,
        },
        resolve
      );
    }
  );
  if (!registration.ok) {
    socket.disconnect();
    throw new Error(registration.error || "Display registration failed");
  }

  const state: SessionState = {
    socket,
    roomId,
    roomName: join.name || roomId,
    clientId: opened.clientId || info.clientId,
    mainPid: opened.mainPid || info.mainPid,
    screens: opened.screens,
  };

  wireSessionHandlers(state);
  startHeartbeat(state);

  return state;
}

function wireSessionHandlers(state: SessionState) {
  const { socket, roomId, clientId } = state;
  const displayApi = getDisplayApi();

  socket.on("material:play", async (event: MaterialPlayEvent) => {
    if (event.roomId !== roomId) return;

    const verification = await displayApi.assignContent({
      requestId: event.requestId,
      assignments: event.assignments ?? [
        {
          screenId: event.screenId,
          materialId: event.materialId,
          combinationId: event.combinationId,
        },
      ],
    });

    state.lastAck = verification;

    socket.emit("display:ack", {
      roomId,
      clientId,
      requestId: event.requestId,
      results: verification.results,
    });
  });

  socket.on(
    "display:verify",
    async (payload: { roomId: string; challengeId: string; clientId: string }) => {
      if (payload.roomId !== roomId) return;
      if (payload.clientId && payload.clientId !== clientId) return;

      const result = await displayApi.verifyProcesses();
      state.lastVerify = { ...result, challengeId: payload.challengeId };

      socket.emit("display:verify-result", {
        roomId,
        clientId,
        challengeId: payload.challengeId,
        ok: result.ok,
        mainPid: result.mainPid,
        processes: result.processes,
      });
    }
  );
}

function startHeartbeat(state: SessionState) {
  const displayApi = getDisplayApi();
  const tick = async () => {
    if (!state.socket.connected) return;
    try {
      const snap = await displayApi.processSnapshot();
      state.screens = snap.screens;
      state.socket.emit("display:heartbeat", {
        roomId: state.roomId,
        clientId: state.clientId,
        mainPid: snap.mainPid,
        processes: snap.processes,
      });
    } catch {
      // ignore transient heartbeat errors
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), 5000);
  state.socket.on("disconnect", () => clearInterval(timer));
}

export async function leaveSession(state: SessionState | null) {
  if (!state) return;
  try {
    const displayApi = getDisplayApi();
    state.socket.emit("room:leave", { roomId: state.roomId });
    state.socket.disconnect();
    await displayApi.closeDisplayWindows();
  } catch {
    try {
      state.socket.disconnect();
    } catch {
      // ignore
    }
  }
}

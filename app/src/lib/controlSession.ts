import { io, type Socket } from "socket.io-client";
import { getApiBase, getToken } from "./api";

export type ControlScreen = {
  id: number;
  label?: string;
  primary?: boolean;
  bounds: { x: number; y: number; width: number; height: number };
};

export type ControlDisplay = {
  clientId: string;
  mainPid: number;
  screens: ControlScreen[];
  processes: Array<{ screenId: number; processId: number; alive: boolean }>;
};

function socketUrl() {
  return getApiBase().replace(/\/api\/?$/, "");
}

function emitAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 8000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export function listRoomDisplays(socket: Socket, roomId: string) {
  return emitAck<{
    ok: boolean;
    displays?: ControlDisplay[];
    error?: string;
  }>(socket, "display:list", { roomId }, 4000);
}

export async function connectControlRoom(roomId: string) {
  const token = getToken();
  if (!token) throw new Error("Sign in before entering a room");

  const socket = io(socketUrl(), {
    path: "/socket.io",
    auth: { token },
    // Polling works from a packaged file:// app. WebSocket is tried as an upgrade.
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    timeout: 20000,
  });

  await new Promise<void>((resolve, reject) => {
    let lastError = "connection failed";
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      reject(
        new Error(
          `Cannot reach the server at ${socketUrl()} (${lastError}). Allow incoming connections for Node on port 3000.`
        )
      );
    }, 8000);
    const onConnect = () => {
      clearTimeout(timer);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      // The first transport can fail before polling connects. That is not fatal.
      lastError = err.message || lastError;
    };
    socket.on("connect_error", onError);
    socket.once("connect", onConnect);
  });

  const join = await emitAck<{
    ok: boolean;
    name?: string;
    displays?: ControlDisplay[];
    error?: string;
  }>(socket, "room:join", { roomId });

  if (!join.ok) {
    socket.disconnect();
    throw new Error(join.error || "Failed to join room");
  }

  return {
    socket,
    roomName: join.name || roomId,
    displays: join.displays ?? [],
  };
}

export type ControlMaterialOffer = {
  roomId: string;
  port: number;
  token: string;
  hosts: string[];
  materials: Array<{ id: string; name: string; type: string }>;
};

export function publishMaterialOffer(socket: Socket, offer: ControlMaterialOffer) {
  return emitAck<{ ok: boolean; error?: string }>(
    socket,
    "control:materials-offer",
    offer
  );
}

export function leaveControlRoom(socket: Socket | null, roomId: string) {
  if (!socket) return;
  try {
    socket.emit("room:leave", { roomId });
    socket.disconnect();
  } catch {
    try {
      socket.disconnect();
    } catch {
      // ignore
    }
  }
}

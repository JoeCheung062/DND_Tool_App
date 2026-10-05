import { io, type Socket } from "socket.io-client";
import { api, getApiBase, getToken } from "./api";
import { getDisplayApi, type DisplayApi } from "./displayApi";
import { expandPlacedMaterials } from "./canvasLayers";
import type { InitiativeBoard } from "./initiative";
import { isServerUnreachable, serverDownloadMissed } from "./materialSource";
import type { SoundAction, SoundChannel } from "./soundDeck";

export type MaterialPlayEvent = {
  roomId: string;
  requestId: string;
  materialId?: string;
  materialIds?: string[];
  combinationId?: string;
  screenId?: number;
  assignments: Array<{
    screenId?: number;
    clientId?: string;
    materialId?: string;
    materialIds?: string[];
    combinationId?: string;
    once?: boolean;
    placements?: Array<{
      materialId: string;
      instanceId?: string;
      useCharacterArt?: boolean;
      x?: number;
      y?: number;
      scale?: number;
      flip?: boolean;
    }>;
    map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
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
  downloaded: Array<{ id: string; name: string; type: string; localUrl: string }>;
  downloadFailed: Array<{ id: string; error: string }>;
  materialSource: "server" | "control";
  release?: () => void;
  lastAck?: unknown;
  lastVerify?: unknown;
  lastAuth?: unknown;
};

type MaterialPack = {
  saved: SessionState["downloaded"];
  failed: SessionState["downloadFailed"];
};

type MaterialOffer = {
  roomId: string;
  port: number;
  token: string;
  hosts: string[];
  materials: Array<{ id: string; name: string; type: string }>;
};

function socketUrl() {
  return getApiBase().replace(/\/api\/?$/, "");
}

function emitAck<T>(socket: Socket, event: string, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 8000);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function waitForConnect(socket: Socket, ms: number) {
  if (socket.connected) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      resolve(false);
    }, ms);
    const onConnect = () => {
      clearTimeout(timer);
      resolve(true);
    };
    socket.once("connect", onConnect);
  });
}

function requestMaterialOffer(socket: Socket, roomId: string) {
  return new Promise<MaterialOffer | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    socket.emit(
      "materials:fetch-source",
      { roomId },
      (response: { ok?: boolean; offer?: MaterialOffer | null }) => {
        clearTimeout(timer);
        resolve(response?.ok && response.offer ? response.offer : null);
      }
    );
  });
}

function waitForMaterialOffer(socket: Socket, roomId: string, ms: number) {
  return new Promise<MaterialOffer | null>((resolve) => {
    const timer = setTimeout(() => {
      socket.off("control:materials", onOffer);
      resolve(null);
    }, ms);
    const onOffer = (payload: MaterialOffer) => {
      if (payload?.roomId !== roomId || !payload.token) return;
      clearTimeout(timer);
      socket.off("control:materials", onOffer);
      resolve(payload);
    };
    socket.on("control:materials", onOffer);
  });
}

type ControlSource =
  | { kind: "offer"; offer: MaterialOffer }
  | { kind: "direct"; baseUrl: string; token: string };

function firstSource(attempts: Array<Promise<ControlSource | null>>) {
  return new Promise<ControlSource | null>((resolve) => {
    let remaining = attempts.length;
    if (remaining === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    for (const attempt of attempts) {
      attempt.then(
        (source) => {
          if (settled) return;
          if (source) {
            settled = true;
            resolve(source);
            return;
          }
          remaining -= 1;
          if (remaining === 0) resolve(null);
        },
        () => {
          if (settled) return;
          remaining -= 1;
          if (remaining === 0) resolve(null);
        }
      );
    }
  });
}

async function pullFromControl(
  displayApi: DisplayApi,
  roomId: string,
  socket: Socket | null
): Promise<MaterialPack> {
  const attempts: Array<Promise<ControlSource | null>> = [
    displayApi.discoverControl({ roomId }).then((found) =>
      found ? { kind: "direct" as const, baseUrl: found.baseUrl, token: found.token } : null
    ),
  ];
  if (socket?.connected) {
    attempts.push(
      requestMaterialOffer(socket, roomId)
        .then((offer) => offer ?? waitForMaterialOffer(socket, roomId, 15000))
        .then((offer) => (offer ? { kind: "offer" as const, offer } : null))
    );
  }

  const source = await firstSource(attempts);
  if (!source) {
    throw new Error(
      "Server not found, and no Control Mode app is sharing materials for this room."
    );
  }
  if (source.kind === "offer") {
    return displayApi.downloadFromControl({
      token: source.offer.token,
      hosts: source.offer.hosts,
      port: source.offer.port,
    });
  }
  return displayApi.downloadFromControl({
    baseUrl: source.baseUrl,
    token: source.token,
  });
}

export async function connectAndEnterRoom(roomId: string): Promise<SessionState> {
  const token = getToken();
  if (!token) throw new Error("Sign in before entering a room");

  const displayApi = getDisplayApi();
  const info = await displayApi.getInfo();

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

  const serverReachable = await waitForConnect(socket, 8000);
  let roomName = roomId;
  let joinedCampaignId: string | null = null;

  if (serverReachable) {
    const join = await emitAck<{
      ok: boolean;
      name?: string;
      campaignId?: string | null;
      error?: string;
    }>(socket, "room:join", { roomId });
    if (!join.ok) {
      socket.disconnect();
      throw new Error(join.error || "Failed to join room");
    }
    roomName = join.name || roomId;
    joinedCampaignId = join.campaignId ?? null;
  }

  const opened = await displayApi.openDisplayWindows();
  const clientId = opened.clientId || info.clientId;
  const mainPid = opened.mainPid || info.mainPid;
  let downloaded: SessionState["downloaded"] = [];
  let downloadFailed: SessionState["downloadFailed"] = [];
  let materialSource: SessionState["materialSource"] = serverReachable ? "server" : "control";

  const state: SessionState = {
    socket,
    roomId,
    roomName,
    clientId,
    mainPid,
    screens: opened.screens,
    downloaded,
    downloadFailed,
    materialSource,
  };

  let registered = false;
  let registering = false;
  const register = async () => {
    if (!socket.connected || registered || registering) return;
    registering = true;
    try {
      const join = await emitAck<{ ok: boolean; name?: string; error?: string }>(
        socket,
        "room:join",
        { roomId }
      );
      if (!join.ok) return;
      if (join.name) state.roomName = join.name;
      const snap = await displayApi.processSnapshot();
      const screens = snap.screens.length > 0 ? snap.screens : opened.screens;
      if (screens.length === 0) return;
      const registration = await emitAck<{ ok: boolean; error?: string }>(
        socket,
        "display:register",
        {
          roomId,
          clientId,
          mainPid: snap.mainPid || mainPid,
          screens,
          processes: snap.processes,
        }
      );
      registered = Boolean(registration.ok);
    } catch {
      registered = false;
    } finally {
      registering = false;
    }
  };

  const loseRegistration = () => {
    registered = false;
    void register();
  };

  await register();
  socket.on("disconnect", () => {
    registered = false;
  });
  socket.on("connect", () => {
    void register();
  });
  const retry = setInterval(() => {
    if (!registered) void register();
  }, 3000);
  state.release = () => clearInterval(retry);

  if (serverReachable) {
    try {
      const room = await api.getRoom(roomId);
      const campaignId = room.campaignId || joinedCampaignId;
      if (campaignId) {
        const materials = await api.listCampaignMaterials(campaignId);
        const pack = await displayApi.downloadMaterials({
          apiBase: getApiBase(),
          token,
          materials,
        });
        if (serverDownloadMissed(pack.saved.length, pack.failed)) {
          const fallback = await pullFromControl(displayApi, roomId, socket);
          downloaded = fallback.saved;
          downloadFailed = fallback.failed;
          materialSource = "control";
        } else {
          downloaded = pack.saved;
          downloadFailed = pack.failed;
        }
      }
    } catch (err) {
      if (!isServerUnreachable(err)) throw err;
      const fallback = await pullFromControl(displayApi, roomId, socket);
      downloaded = fallback.saved;
      downloadFailed = fallback.failed;
      materialSource = "control";
    }
  } else {
    const fallback = await pullFromControl(displayApi, roomId, socket.connected ? socket : null);
    downloaded = fallback.saved;
    downloadFailed = fallback.failed;
    materialSource = "control";
  }

  state.downloaded = downloaded;
  state.downloadFailed = downloadFailed;
  state.materialSource = materialSource;

  wireSessionHandlers(state);
  startHeartbeat(state, loseRegistration);

  return state;
}

function wireSessionHandlers(state: SessionState) {
  const { socket, roomId, clientId } = state;
  const displayApi = getDisplayApi();

  socket.on("material:play", async (event: MaterialPlayEvent) => {
    if (event.roomId !== roomId) return;

    const library = new Map(state.downloaded.map((item) => [item.id, item]));
    const raw =
      event.assignments && event.assignments.length > 0
        ? event.assignments
        : [
            {
              screenId: event.screenId,
              materialId: event.materialId,
              materialIds: event.materialIds,
              combinationId: event.combinationId,
            },
          ];
    const source = raw.filter(
      (assignment) => !assignment.clientId || assignment.clientId === clientId
    );
    if (source.length === 0) return;
    const verification = await displayApi.assignContent({
      requestId: event.requestId,
      assignments: source.map((assignment) => {
        const ids = [
          ...(assignment.materialIds ?? []),
          ...(assignment.materialId ? [assignment.materialId] : []),
        ];
        const materials = expandPlacedMaterials(ids, assignment.placements, library);
        return { ...assignment, materials };
      }),
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
    "sound:play",
    (event: {
      roomId?: string;
      channel?: SoundChannel;
      action?: SoundAction;
      materialId?: string;
      volume?: number;
      gain?: number;
      position?: number;
      targets?: Array<{ clientId?: string; screenId?: number }>;
    }) => {
      if (event.roomId !== roomId) return;
      if (event.channel !== "bgm" && event.channel !== "effect") return;
      if (
        event.action !== "play" &&
        event.action !== "pause" &&
        event.action !== "stop" &&
        event.action !== "seek" &&
        event.action !== "volume"
      ) {
        return;
      }
      const screenIds = (event.targets ?? [])
        .filter((target) => target.clientId === clientId && typeof target.screenId === "number")
        .map((target) => target.screenId as number);
      if (screenIds.length === 0) return;
      const saved = event.materialId
        ? state.downloaded.find((item) => item.id === event.materialId)
        : undefined;
      if (event.action === "play" && !saved) return;
      void displayApi.playSound({
        screenIds,
        channel: event.channel,
        action: event.action,
        volume: typeof event.volume === "number" ? event.volume : 1,
        ...(typeof event.gain === "number" ? { gain: event.gain } : {}),
        position: typeof event.position === "number" ? event.position : undefined,
        material: saved
          ? { id: saved.id, name: saved.name, localUrl: saved.localUrl }
          : undefined,
      });
    }
  );

  socket.on("initiative:update", (event: { roomId?: string; board?: InitiativeBoard }) => {
    if (event.roomId !== roomId || !event.board) return;
    void displayApi.showInitiative(event.board);
  });

  socket.on(
    "map:camera",
    (event: {
      roomId?: string;
      clientId?: string;
      screenId?: number;
      map?: { columns: number; rows: number; focusCol: number; focusRow: number; zoom?: number };
    }) => {
      if (event.roomId !== roomId || event.clientId !== clientId) return;
      if (typeof event.screenId !== "number" || !event.map) return;
      void displayApi.showMapFrame({ screenId: event.screenId, map: event.map });
    }
  );

  socket.on(
    "map:measure",
    (event: {
      roomId?: string;
      clientId?: string;
      screenId?: number;
      measure?: {
        mode: "line" | "circle" | "square";
        startCol: number;
        startRow: number;
        endCol: number;
        endRow: number;
      } | null;
    }) => {
      if (event.roomId !== roomId || event.clientId !== clientId) return;
      if (typeof event.screenId !== "number" || event.measure === undefined) return;
      void displayApi.showMapMeasure({ screenId: event.screenId, measure: event.measure });
    }
  );

  socket.on(
    "display:authenticated",
    async (payload: {
      roomId: string;
      requestId: string;
      clientId?: string;
      authenticated?: boolean;
    }) => {
      if (payload.roomId !== roomId) return;
      if (payload.clientId && payload.clientId !== clientId) return;
      state.lastAuth = payload;
      if (payload.authenticated) {
        await displayApi.paint(payload.requestId);
      }
    }
  );

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

function startHeartbeat(state: SessionState, onUnregistered: () => void) {
  const displayApi = getDisplayApi();
  const tick = async () => {
    if (!state.socket.connected) return;
    try {
      const snap = await displayApi.processSnapshot();
      state.screens = snap.screens;
      state.socket.emit(
        "display:heartbeat",
        {
          roomId: state.roomId,
          clientId: state.clientId,
          mainPid: snap.mainPid,
          processes: snap.processes,
        },
        (response: { ok?: boolean; error?: string }) => {
          if (response?.ok === false && /not registered/i.test(response.error ?? "")) {
            onUnregistered();
          }
        }
      );
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
  state.release?.();
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

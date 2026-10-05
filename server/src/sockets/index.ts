import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { corsOriginOption } from "../config/cors.js";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { rollDice } from "../utils/dice.js";
import type { AuthAdmin } from "../types/auth.js";

type SocketData = {
  user: AuthAdmin;
  displayClientId?: string;
  displayRoomId?: string;
};

export type DisplayScreenInfo = {
  id: number;
  label?: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary?: boolean;
};

export type DisplayRegistration = {
  socketId: string;
  roomId: string;
  clientId: string;
  mainPid: number;
  screens: DisplayScreenInfo[];
  processes: Array<{
    screenId: number;
    processId: number;
    webContentsId?: number;
    alive: boolean;
    /** Secret proving this screen process; never rebroadcast */
    processToken?: string;
  }>;
  updatedAt: string;
};

/** In-memory display client registry per room */
const displayRegistry = new Map<string, Map<string, DisplayRegistration>>();

type MaterialOffer = {
  socketId: string;
  roomId: string;
  port: number;
  token: string;
  hosts: string[];
  materials: Array<{ id: string; name: string; type: string }>;
};

/** Control Mode's LAN material share for a room, used when Display cannot reach this server. */
const materialOffers = new Map<string, MaterialOffer>();
const displayDropTimers = new Map<string, ReturnType<typeof setTimeout>>();
const offerDropTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelDisplayDrop(roomId: string, clientId: string) {
  const key = `${roomId}:${clientId}`;
  const timer = displayDropTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  displayDropTimers.delete(key);
}

function scheduleDisplayDrop(socket: Socket, roomId: string, clientId: string) {
  cancelDisplayDrop(roomId, clientId);
  const socketId = socket.id;
  const key = `${roomId}:${clientId}`;
  displayDropTimers.set(
    key,
    setTimeout(() => {
      displayDropTimers.delete(key);
      const existing = displayRegistry.get(roomId)?.get(clientId);
      if (!existing || existing.socketId !== socketId) return;
      unregisterDisplay(socket, roomId, clientId);
    }, 8000)
  );
}

function scheduleOfferDrop(socketId: string, roomId: string) {
  const pending = offerDropTimers.get(roomId);
  if (pending) clearTimeout(pending);
  offerDropTimers.set(
    roomId,
    setTimeout(() => {
      offerDropTimers.delete(roomId);
      const current = materialOffers.get(roomId);
      if (current && current.socketId === socketId) materialOffers.delete(roomId);
    }, 8000)
  );
}

function publicMaterialOffer(roomId: string) {
  const offer = materialOffers.get(roomId);
  if (!offer) return null;
  return {
    roomId: offer.roomId,
    port: offer.port,
    token: offer.token,
    hosts: offer.hosts,
    materials: offer.materials,
  };
}

function parseMaterialOffer(
  socketId: string,
  payload: {
    roomId?: string;
    port?: number;
    token?: string;
    hosts?: string[];
    materials?: Array<{ id?: string; name?: string; type?: string }>;
  }
): MaterialOffer {
  const roomId = payload.roomId?.trim();
  if (!roomId) throw new Error("roomId is required");
  if (!payload.port || payload.port < 1 || payload.port > 65535) {
    throw new Error("port is required");
  }
  if (!payload.token || payload.token.length < 8) {
    throw new Error("token is required");
  }
  const hosts = (payload.hosts ?? []).filter(
    (host) => typeof host === "string" && /^[A-Za-z0-9.:-]+$/.test(host)
  );
  if (hosts.length === 0) throw new Error("hosts[] is required");
  const materials = (payload.materials ?? []).flatMap((material) => {
    if (!material?.id || !material.name || !material.type) return [];
    return [{ id: material.id, name: material.name, type: material.type }];
  });
  if (materials.length === 0) throw new Error("materials[] is required");
  return {
    socketId,
    roomId,
    port: payload.port,
    token: payload.token,
    hosts,
    materials,
  };
}

function roomDisplays(roomId: string) {
  let map = displayRegistry.get(roomId);
  if (!map) {
    map = new Map();
    displayRegistry.set(roomId, map);
  }
  return map;
}

function listDisplays(roomId: string) {
  return [...roomDisplays(roomId).values()];
}

function withoutProcessTokens(
  processes: DisplayRegistration["processes"]
) {
  return processes.map(({ processToken: _token, ...rest }) => rest);
}

function mergeProcessSecrets(
  previous: DisplayRegistration["processes"],
  incoming: DisplayRegistration["processes"] | undefined
) {
  if (!incoming) return previous;
  return incoming.map((row) => {
    if (row.processToken) return row;
    const known = previous.find((process) => process.screenId === row.screenId);
    return known?.processToken
      ? { ...row, processToken: known.processToken }
      : row;
  });
}

function publicDisplays(roomId: string) {
  return listDisplays(roomId).map((display) => ({
    ...display,
    processes: withoutProcessTokens(display.processes),
  }));
}

function authenticateDisplayProcesses(
  roomId: string,
  clientId: string | undefined,
  results: Array<{
    screenId: number;
    ok: boolean;
    processId?: number;
    processToken?: string;
    error?: string;
  }>
) {
  const registration = clientId
    ? roomDisplays(roomId).get(clientId)
    : undefined;
  const checked = results.map((result) => {
    const known = registration?.processes.find(
      (process) => process.screenId === result.screenId
    );
    const authenticated = Boolean(
      known?.processToken &&
        result.processToken &&
        known.processToken === result.processToken
    );
    return {
      screenId: result.screenId,
      processId: result.processId,
      ok: result.ok && authenticated,
      authenticated,
      error: authenticated
        ? result.error
        : "Process authentication failed",
      processToken: result.processToken,
    };
  });
  return {
    ok: checked.length > 0 && checked.every((row) => row.authenticated),
    results: checked,
  };
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginOption(),
      credentials: true,
    },
    path: "/socket.io",
    pingInterval: 20000,
    pingTimeout: 25000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const user = verifyToken(token);
      (socket.data as SocketData).user = user;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as SocketData).user;
    socket.join(`user:${user.id}`);

    socket.emit("connected", {
      userId: user.id,
      username: user.username,
      socketId: socket.id,
    });

    socket.on("room:join", async (payload: { roomId?: string }, ack?) => {
      try {
        const roomId = payload?.roomId;
        if (!roomId) throw new Error("roomId is required");

        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { campaign: { select: { id: true, name: true } } },
        });
        if (!room) throw new Error("Room not found");

        await socket.join(`room:${roomId}`);
        socket.to(`room:${roomId}`).emit("room:presence", {
          type: "join",
          user: { id: user.id, username: user.username },
          roomId,
        });

        ack?.({
          ok: true,
          roomId,
          name: room.name,
          campaignId: room.campaignId,
          campaign: room.campaign,
          displays: publicDisplays(roomId),
          materialSource: publicMaterialOffer(roomId),
        });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : "join failed" });
      }
    });

    socket.on("room:leave", (payload: { roomId?: string }, ack?) => {
      const roomId = payload?.roomId;
      if (!roomId) {
        ack?.({ ok: false, error: "roomId is required" });
        return;
      }

      unregisterDisplay(socket, roomId);
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("room:presence", {
        type: "leave",
        user: { id: user.id, username: user.username },
        roomId,
      });
      ack?.({ ok: true });
    });

    /**
     * Control Mode announces a LAN address where it is serving downloaded materials.
     * Display Mode uses this when it cannot download those files from this server.
     */
    socket.on(
      "control:materials-offer",
      (
        payload: {
          roomId?: string;
          port?: number;
          token?: string;
          hosts?: string[];
          materials?: Array<{ id?: string; name?: string; type?: string }>;
        },
        ack?
      ) => {
        try {
          const offer = parseMaterialOffer(socket.id, payload ?? {});
          const roomKey = `room:${offer.roomId}`;
          if (!socket.rooms.has(roomKey)) throw new Error("Join the room first");
          const pendingOfferDrop = offerDropTimers.get(offer.roomId);
          if (pendingOfferDrop) {
            clearTimeout(pendingOfferDrop);
            offerDropTimers.delete(offer.roomId);
          }
          materialOffers.set(offer.roomId, offer);
          const published = publicMaterialOffer(offer.roomId);
          io.to(roomKey).emit("control:materials", published);
          ack?.({ ok: true, offer: published });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "offer failed",
          });
        }
      }
    );

    socket.on(
      "materials:fetch-source",
      (payload: { roomId?: string }, ack?) => {
        try {
          const roomId = payload?.roomId;
          if (!roomId) throw new Error("roomId is required");
          if (!socket.rooms.has(`room:${roomId}`)) {
            throw new Error("Join the room first");
          }
          const offer = publicMaterialOffer(roomId);
          if (!offer) throw new Error("Control Mode has not shared materials");
          ack?.({ ok: true, offer });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "fetch failed",
          });
        }
      }
    );

    /**
     * Display App registers detected screens + process map after entering a room.
     * Used so Control App knows which screen IDs are available.
     */
    socket.on(
      "display:register",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          mainPid?: number;
          screens?: DisplayScreenInfo[];
          processes?: DisplayRegistration["processes"];
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, mainPid, screens, processes } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!clientId) throw new Error("clientId is required");
          if (!Array.isArray(screens) || screens.length === 0) {
            throw new Error("screens[] is required");
          }

          const roomKey = `room:${roomId}`;
          if (!socket.rooms.has(roomKey)) {
            throw new Error("Join the room first");
          }

          const registration: DisplayRegistration = {
            socketId: socket.id,
            roomId,
            clientId,
            mainPid: mainPid ?? 0,
            screens,
            processes: processes ?? [],
            updatedAt: new Date().toISOString(),
          };

          cancelDisplayDrop(roomId, clientId);
          roomDisplays(roomId).set(clientId, registration);
          const data = socket.data as SocketData;
          data.displayClientId = clientId;
          data.displayRoomId = roomId;

          io.to(roomKey).emit("display:registry", {
            roomId,
            displays: publicDisplays(roomId),
          });

          ack?.({
            ok: true,
            registration: {
              ...registration,
              processes: withoutProcessTokens(registration.processes),
            },
          });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "register failed",
          });
        }
      }
    );

    /** Current Display Mode clients in the room. Control polls this so a missed push still shows up. */
    socket.on("display:list", (payload: { roomId?: string }, ack?) => {
      try {
        const roomId = payload?.roomId;
        if (!roomId) throw new Error("roomId is required");
        if (!socket.rooms.has(`room:${roomId}`)) {
          throw new Error("Join the room first");
        }
        ack?.({
          ok: true,
          roomId,
          displays: publicDisplays(roomId),
        });
      } catch (err) {
        ack?.({
          ok: false,
          error: err instanceof Error ? err.message : "list failed",
        });
      }
    });

    /** Heartbeat / process verification update from Display App */
    socket.on(
      "display:heartbeat",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          processes?: DisplayRegistration["processes"];
          mainPid?: number;
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, processes, mainPid } = payload ?? {};
          if (!roomId || !clientId) throw new Error("roomId and clientId are required");
          const map = roomDisplays(roomId);
          const existing = map.get(clientId);
          if (!existing || existing.socketId !== socket.id) {
            throw new Error("Display client not registered");
          }
          existing.processes = mergeProcessSecrets(existing.processes, processes);
          if (typeof mainPid === "number") existing.mainPid = mainPid;
          existing.updatedAt = new Date().toISOString();
          map.set(clientId, existing);

          socket.to(`room:${roomId}`).emit("display:heartbeat", {
            roomId,
            clientId,
            processes: withoutProcessTokens(existing.processes),
            mainPid: existing.mainPid,
            at: existing.updatedAt,
          });
          ack?.({ ok: true, at: existing.updatedAt });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "heartbeat failed",
          });
        }
      }
    );

    /**
     * Challenge Display App to verify its screen processes are still alive.
     * Display responds with display:verify-result (or ack).
     */
    socket.on(
      "display:verify",
      (payload: { roomId?: string; clientId?: string; challengeId?: string }, ack?) => {
        try {
          const roomId = payload?.roomId;
          if (!roomId) throw new Error("roomId is required");
          const challengeId = payload?.challengeId ?? randomUUID();
          const targets = listDisplays(roomId).filter(
            (d) => !payload?.clientId || d.clientId === payload.clientId
          );
          if (targets.length === 0) throw new Error("No display clients in room");

          for (const target of targets) {
            io.to(target.socketId).emit("display:verify", {
              roomId,
              challengeId,
              clientId: target.clientId,
            });
          }
          ack?.({ ok: true, challengeId, clients: targets.map((t) => t.clientId) });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "verify failed",
          });
        }
      }
    );

    socket.on(
      "display:verify-result",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          challengeId?: string;
          mainPid?: number;
          processes?: DisplayRegistration["processes"];
          ok?: boolean;
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, challengeId, processes, mainPid, ok } =
            payload ?? {};
          if (!roomId || !clientId || !challengeId) {
            throw new Error("roomId, clientId, and challengeId are required");
          }

          const map = roomDisplays(roomId);
          const existing = map.get(clientId);
          if (existing && existing.socketId === socket.id) {
            existing.processes = mergeProcessSecrets(existing.processes, processes);
            if (typeof mainPid === "number") existing.mainPid = mainPid;
            existing.updatedAt = new Date().toISOString();
            map.set(clientId, existing);
          }

          const result = {
            roomId,
            clientId,
            challengeId,
            ok: ok !== false,
            mainPid,
            processes: withoutProcessTokens(
              existing?.processes ?? processes ?? []
            ),
            at: new Date().toISOString(),
          };

          io.to(`room:${roomId}`).emit("display:verify-result", result);
          ack?.({ ok: true, result });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "verify-result failed",
          });
        }
      }
    );

    /**
     * Process-verification ack after applying a content assignment.
     * Broadcast so Control App can confirm each screen showed the content.
     */
    socket.on(
      "display:ack",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          requestId?: string;
          results?: Array<{
            screenId: number;
            ok: boolean;
            processId?: number;
            error?: string;
          }>;
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, requestId, results } = payload ?? {};
          if (!roomId || !requestId) {
            throw new Error("roomId and requestId are required");
          }
          const auth = authenticateDisplayProcesses(
            roomId,
            clientId,
            results ?? []
          );
          const publicResults = auth.results.map(
            ({ processToken: _token, ...rest }) => rest
          );
          const event = {
            roomId,
            clientId,
            requestId,
            authenticated: auth.ok,
            results: publicResults,
            at: new Date().toISOString(),
          };
          io.to(`room:${roomId}`).emit("display:ack", event);
          io.to(`room:${roomId}`).emit("display:authenticated", event);
          ack?.({ ok: true, event });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "ack failed",
          });
        }
      }
    );

    socket.on(
      "chat:message",
      (payload: { roomId?: string; content?: string }, ack?) => {
        try {
          const { roomId, content } = payload ?? {};
          if (!roomId || !content?.trim()) {
            throw new Error("roomId and content are required");
          }
          if (content.length > 2000) {
            throw new Error("Message too long");
          }

          const roomKey = `room:${roomId}`;
          if (!socket.rooms.has(roomKey)) {
            throw new Error("Join the room first");
          }

          const message = {
            roomId,
            content: content.trim(),
            sender: { id: user.id, username: user.username },
            at: new Date().toISOString(),
          };

          io.to(roomKey).emit("chat:message", message);
          ack?.({ ok: true, message });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "send failed",
          });
        }
      }
    );

    socket.on(
      "dice:roll",
      (
        payload: { roomId?: string; expression?: string; reason?: string },
        ack?
      ) => {
        try {
          const { roomId, expression, reason } = payload ?? {};
          if (!roomId || !expression) {
            throw new Error("roomId and expression are required");
          }

          const roomKey = `room:${roomId}`;
          if (!socket.rooms.has(roomKey)) {
            throw new Error("Join the room first");
          }

          const result = rollDice(expression);
          const event = {
            ...result,
            reason,
            roomId,
            roller: { id: user.id, username: user.username },
            at: new Date().toISOString(),
          };

          io.to(roomKey).emit("dice:result", event);
          ack?.({ ok: true, result: event });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "roll failed",
          });
        }
      }
    );

    /**
     * Play or switch BGM and one-shot effects on Display Mode speakers.
     * Display clients apply the command from their own downloaded files.
     */
    socket.on(
      "sound:play",
      (
        payload: {
          roomId?: string;
          requestId?: string;
          channel?: string;
          action?: string;
          materialId?: string;
          volume?: number;
          gain?: number;
          position?: number;
          targets?: Array<{ clientId?: string; screenId?: number }>;
        },
        ack?
      ) => {
        try {
          const { roomId, channel, action, materialId, volume, gain, position, targets, requestId } =
            payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!socket.rooms.has(`room:${roomId}`)) {
            throw new Error("Join the room first");
          }
          if (channel !== "bgm" && channel !== "effect") {
            throw new Error("channel must be bgm or effect");
          }
          if (
            action !== "play" &&
            action !== "pause" &&
            action !== "stop" &&
            action !== "seek" &&
            action !== "volume"
          ) {
            throw new Error("action must be play, pause, stop, seek, or volume");
          }
          if (action === "play" && !materialId) {
            throw new Error("materialId is required");
          }
          const at = Number(position);
          const seekTo = Number.isFinite(at) && at >= 0 ? at : undefined;
          if (action === "seek" && seekTo === undefined) {
            throw new Error("position is required");
          }
          const speakers = (targets ?? []).flatMap((target) => {
            if (!target?.clientId || typeof target.screenId !== "number") return [];
            return [{ clientId: target.clientId, screenId: target.screenId }];
          });
          if (speakers.length === 0) {
            throw new Error("No Display Mode speakers are connected");
          }
          const level = Math.min(1, Math.max(0, Number(volume)));
          const output = Math.min(1, Math.max(0, Number(gain)));
          const event = {
            roomId,
            requestId: requestId ?? randomUUID(),
            channel,
            action,
            materialId,
            volume: Number.isFinite(level) ? level : 1,
            ...(Number.isFinite(output) ? { gain: output } : {}),
            ...(seekTo !== undefined ? { position: seekTo } : {}),
            targets: speakers,
            at: new Date().toISOString(),
          };
          io.to(`room:${roomId}`).emit("sound:play", event);
          ack?.({ ok: true, event });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "sound failed",
          });
        }
      }
    );

    /**
     * Initiative order for every Display Mode screen in the room.
     */
    socket.on(
      "initiative:update",
      (
        payload: {
          roomId?: string;
          board?: {
            entries?: Array<{
              id?: string;
              name?: string;
              speed?: number;
              visible?: boolean;
              maxHp?: number;
              hp?: number;
              hpVisible?: boolean;
            }>;
            turnId?: string | null;
            barVisible?: boolean;
          };
        },
        ack?
      ) => {
        try {
          const { roomId, board } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!socket.rooms.has(`room:${roomId}`)) throw new Error("Join the room first");
          const entries = (board?.entries ?? []).slice(0, 40).flatMap((entry) => {
            const name = String(entry?.name ?? "").trim().slice(0, 40);
            const speed = Number(entry?.speed);
            const id = String(entry?.id ?? "").trim().slice(0, 80);
            if (!id || !name || !Number.isFinite(speed)) return [];
            const maxHp = Number(entry?.maxHp);
            const hp = Number(entry?.hp);
            const cappedMax = Number.isFinite(maxHp) && maxHp > 0 ? Math.min(9999, Math.round(maxHp)) : 0;
            const cappedHp = cappedMax > 0 ? Math.min(cappedMax, Math.max(0, Math.round(Number.isFinite(hp) ? hp : 0))) : 0;
            return [
              {
                id,
                name,
                speed,
                visible: entry?.visible !== false,
                maxHp: cappedMax,
                hp: cappedHp,
                hpVisible: entry?.hpVisible === true,
              },
            ];
          });
          const turnId = entries.some((entry) => entry.id === board?.turnId) ? board?.turnId ?? null : null;
          const event = {
            roomId,
            board: {
              entries,
              turnId,
              barVisible: board?.barVisible !== false,
            },
          };
          io.to(`room:${roomId}`).emit("initiative:update", event);
          ack?.({ ok: true });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "initiative failed",
          });
        }
      }
    );

    /**
     * Move the map camera on one display without replaying materials.
     */
    socket.on(
      "map:camera",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          screenId?: number;
          map?: { columns?: number; rows?: number; focusCol?: number; focusRow?: number; zoom?: number };
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, screenId, map } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!socket.rooms.has(`room:${roomId}`)) throw new Error("Join the room first");
          if (!clientId || typeof screenId !== "number") throw new Error("screen target is required");
          const columns = Number(map?.columns);
          const rows = Number(map?.rows);
          const focusCol = Number(map?.focusCol);
          const focusRow = Number(map?.focusRow);
          const zoom = Number(map?.zoom);
          if (![columns, rows, focusCol, focusRow, zoom].every((value) => Number.isFinite(value))) {
            throw new Error("map frame is required");
          }
          io.to(`room:${roomId}`).emit("map:camera", {
            roomId,
            clientId,
            screenId,
            map: { columns, rows, focusCol, focusRow, zoom },
          });
          ack?.({ ok: true });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "map camera failed",
          });
        }
      }
    );

    /**
     * A cell measurement on the map screen. Display Mode draws the same shape.
     */
    socket.on(
      "map:measure",
      (
        payload: {
          roomId?: string;
          clientId?: string;
          screenId?: number;
          measure?: {
            mode?: string;
            startCol?: number;
            startRow?: number;
            endCol?: number;
            endRow?: number;
          } | null;
        },
        ack?
      ) => {
        try {
          const { roomId, clientId, screenId, measure } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!socket.rooms.has(`room:${roomId}`)) throw new Error("Join the room first");
          if (!clientId || typeof screenId !== "number") throw new Error("screen target is required");
          if (!measure) {
            io.to(`room:${roomId}`).emit("map:measure", {
              roomId,
              clientId,
              screenId,
              measure: null,
            });
            ack?.({ ok: true });
            return;
          }
          if (measure.mode !== "line" && measure.mode !== "circle" && measure.mode !== "square") {
            throw new Error("measure mode must be line, circle, or square");
          }
          const startCol = Number(measure.startCol);
          const startRow = Number(measure.startRow);
          const endCol = Number(measure.endCol);
          const endRow = Number(measure.endRow);
          if (![startCol, startRow, endCol, endRow].every((value) => Number.isFinite(value))) {
            throw new Error("measure cells are required");
          }
          io.to(`room:${roomId}`).emit("map:measure", {
            roomId,
            clientId,
            screenId,
            measure: { mode: measure.mode, startCol, startRow, endCol, endRow },
          });
          ack?.({ ok: true });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "map measure failed",
          });
        }
      }
    );

    /**
     * Play material/combination on specific screen(s).
     * Prefer `assignments` for multi-screen routing; falls back to single screenId.
     */
    socket.on(
      "material:play",
      (
        payload: {
          roomId?: string;
          materialId?: string;
          combinationId?: string;
          screenId?: number;
          assignments?: Array<{
            screenId: number;
            materialId?: string;
            materialIds?: string[];
            combinationId?: string;
          }>;
          requestId?: string;
        },
        ack?
      ) => {
        try {
          const {
            roomId,
            materialId,
            combinationId,
            screenId,
            assignments,
            requestId,
          } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");

          const resolvedAssignments =
            assignments && assignments.length > 0
              ? assignments
              : materialId || combinationId
                ? [
                    {
                      screenId: screenId as number | undefined,
                      materialId,
                      materialIds: materialId ? [materialId] : undefined,
                      combinationId,
                    },
                  ]
                : null;

          if (!resolvedAssignments) {
            throw new Error(
              "assignments[] or materialId/combinationId is required"
            );
          }

          for (const a of resolvedAssignments) {
            if (
              !a.materialId &&
              !a.combinationId &&
              !Array.isArray(a.materialIds)
            ) {
              throw new Error(
                "Each assignment needs materialId, materialIds, or combinationId"
              );
            }
          }

          const roomKey = `room:${roomId}`;
          if (!socket.rooms.has(roomKey)) {
            throw new Error("Join the room first");
          }

          const event = {
            roomId,
            requestId: requestId ?? randomUUID(),
            materialId,
            combinationId,
            screenId,
            assignments: resolvedAssignments,
            by: { id: user.id, username: user.username },
            at: new Date().toISOString(),
          };

          io.to(roomKey).emit("material:play", event);
          ack?.({ ok: true, event });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "play failed",
          });
        }
      }
    );

    socket.on("disconnect", () => {
      const data = socket.data as SocketData;
      if (data.displayRoomId && data.displayClientId) {
        scheduleDisplayDrop(socket, data.displayRoomId, data.displayClientId);
      }
      for (const [roomId, offer] of materialOffers) {
        if (offer.socketId === socket.id) scheduleOfferDrop(socket.id, roomId);
      }

      for (const room of socket.rooms) {
        if (room.startsWith("room:")) {
          socket.to(room).emit("room:presence", {
            type: "disconnect",
            user: { id: user.id, username: user.username },
            roomId: room.replace("room:", ""),
          });
        }
      }
    });
  });

  return io;
}

function unregisterDisplay(
  socket: Socket,
  roomId: string,
  clientId?: string
) {
  const map = displayRegistry.get(roomId);
  if (!map) return;

  const data = socket.data as SocketData;
  const id = clientId ?? data.displayClientId;
  if (id) {
    const existing = map.get(id);
    if (existing && existing.socketId === socket.id) {
      map.delete(id);
    }
  } else {
    for (const [key, value] of map) {
      if (value.socketId === socket.id) map.delete(key);
    }
  }

  if (map.size === 0) displayRegistry.delete(roomId);

  socket.to(`room:${roomId}`).emit("display:registry", {
    roomId,
    displays: publicDisplays(roomId),
  });
}

export type AppSocketServer = ReturnType<typeof createSocketServer>;

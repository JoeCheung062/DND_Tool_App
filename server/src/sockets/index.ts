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
  }>;
  updatedAt: string;
};

/** In-memory display client registry per room */
const displayRegistry = new Map<string, Map<string, DisplayRegistration>>();

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

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginOption(),
      credentials: true,
    },
    path: "/socket.io",
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
          displays: listDisplays(roomId),
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

          roomDisplays(roomId).set(clientId, registration);
          const data = socket.data as SocketData;
          data.displayClientId = clientId;
          data.displayRoomId = roomId;

          io.to(roomKey).emit("display:registry", {
            roomId,
            displays: listDisplays(roomId),
          });

          ack?.({ ok: true, registration });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "register failed",
          });
        }
      }
    );

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
          existing.processes = processes ?? existing.processes;
          if (typeof mainPid === "number") existing.mainPid = mainPid;
          existing.updatedAt = new Date().toISOString();
          map.set(clientId, existing);

          socket.to(`room:${roomId}`).emit("display:heartbeat", {
            roomId,
            clientId,
            processes: existing.processes,
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
            existing.processes = processes ?? existing.processes;
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
            processes: processes ?? existing?.processes ?? [],
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
          const event = {
            roomId,
            clientId,
            requestId,
            results: results ?? [],
            at: new Date().toISOString(),
          };
          io.to(`room:${roomId}`).emit("display:ack", event);
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
            if (!a.materialId && !a.combinationId) {
              throw new Error(
                "Each assignment needs materialId or combinationId"
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
        unregisterDisplay(socket, data.displayRoomId, data.displayClientId);
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
    displays: listDisplays(roomId),
  });
}

export type AppSocketServer = ReturnType<typeof createSocketServer>;

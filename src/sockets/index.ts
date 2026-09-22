import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { rollDice } from "../utils/dice.js";
import type { AuthUser } from "../types/auth.js";

type SocketData = {
  user: AuthUser;
};

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
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
          select: { id: true, name: true },
        });
        if (!room) throw new Error("Room not found");

        await socket.join(`room:${roomId}`);
        socket.to(`room:${roomId}`).emit("room:presence", {
          type: "join",
          user: { id: user.id, username: user.username },
          roomId,
        });

        ack?.({ ok: true, roomId, name: room.name });
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

      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("room:presence", {
        type: "leave",
        user: { id: user.id, username: user.username },
        roomId,
      });
      ack?.({ ok: true });
    });

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

    socket.on(
      "material:play",
      (
        payload: {
          roomId?: string;
          materialId?: string;
          combinationId?: string;
        },
        ack?
      ) => {
        try {
          const { roomId, materialId, combinationId } = payload ?? {};
          if (!roomId) throw new Error("roomId is required");
          if (!materialId && !combinationId) {
            throw new Error("materialId or combinationId is required");
          }

          const roomKey = `room:${roomId}`;
          if (!socket.rooms.has(roomKey)) {
            throw new Error("Join the room first");
          }

          const event = {
            roomId,
            materialId,
            combinationId,
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

export type AppSocketServer = ReturnType<typeof createSocketServer>;

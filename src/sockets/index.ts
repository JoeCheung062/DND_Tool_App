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

    socket.on("campaign:join", async (payload: { campaignId?: string }, ack?) => {
      try {
        const campaignId = payload?.campaignId;
        if (!campaignId) throw new Error("campaignId is required");

        const allowed = await prisma.campaign.findFirst({
          where: {
            id: campaignId,
            OR: [
              { ownerId: user.id },
              { members: { some: { userId: user.id } } },
            ],
          },
          select: { id: true, name: true },
        });

        if (!allowed) {
          throw new Error("Not a member of this campaign");
        }

        await socket.join(`campaign:${campaignId}`);
        socket.to(`campaign:${campaignId}`).emit("campaign:presence", {
          type: "join",
          user: { id: user.id, username: user.username },
          campaignId,
        });

        ack?.({ ok: true, campaignId, name: allowed.name });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : "join failed" });
      }
    });

    socket.on("campaign:leave", (payload: { campaignId?: string }, ack?) => {
      const campaignId = payload?.campaignId;
      if (!campaignId) {
        ack?.({ ok: false, error: "campaignId is required" });
        return;
      }

      socket.leave(`campaign:${campaignId}`);
      socket.to(`campaign:${campaignId}`).emit("campaign:presence", {
        type: "leave",
        user: { id: user.id, username: user.username },
        campaignId,
      });
      ack?.({ ok: true });
    });

    socket.on(
      "chat:message",
      async (
        payload: { campaignId?: string; content?: string },
        ack?
      ) => {
        try {
          const { campaignId, content } = payload ?? {};
          if (!campaignId || !content?.trim()) {
            throw new Error("campaignId and content are required");
          }
          if (content.length > 2000) {
            throw new Error("Message too long");
          }

          const room = `campaign:${campaignId}`;
          if (!socket.rooms.has(room)) {
            throw new Error("Join the campaign room first");
          }

          const message = await prisma.message.create({
            data: {
              campaignId,
              senderId: user.id,
              content: content.trim(),
            },
            include: {
              sender: { select: { id: true, username: true, avatarUrl: true } },
            },
          });

          io.to(room).emit("chat:message", message);
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
        payload: { campaignId?: string; expression?: string; reason?: string },
        ack?
      ) => {
        try {
          const { campaignId, expression, reason } = payload ?? {};
          if (!campaignId || !expression) {
            throw new Error("campaignId and expression are required");
          }

          const room = `campaign:${campaignId}`;
          if (!socket.rooms.has(room)) {
            throw new Error("Join the campaign room first");
          }

          const result = rollDice(expression);
          const event = {
            ...result,
            reason,
            campaignId,
            roller: { id: user.id, username: user.username },
            at: new Date().toISOString(),
          };

          io.to(room).emit("dice:result", event);
          ack?.({ ok: true, result: event });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "roll failed",
          });
        }
      }
    );

    socket.on("session:update", (payload: Record<string, unknown>, ack?) => {
      const campaignId = payload?.campaignId as string | undefined;
      if (!campaignId) {
        ack?.({ ok: false, error: "campaignId is required" });
        return;
      }

      const room = `campaign:${campaignId}`;
      if (!socket.rooms.has(room)) {
        ack?.({ ok: false, error: "Join the campaign room first" });
        return;
      }

      io.to(room).emit("session:update", {
        ...payload,
        by: { id: user.id, username: user.username },
        at: new Date().toISOString(),
      });
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      // Presence leave is handled per-room when clients call campaign:leave.
      // Broadcast a soft disconnect for any campaign rooms still joined.
      for (const room of socket.rooms) {
        if (room.startsWith("campaign:")) {
          socket.to(room).emit("campaign:presence", {
            type: "disconnect",
            user: { id: user.id, username: user.username },
            campaignId: room.replace("campaign:", ""),
          });
        }
      }
    });
  });

  return io;
}

export type AppSocketServer = ReturnType<typeof createSocketServer>;

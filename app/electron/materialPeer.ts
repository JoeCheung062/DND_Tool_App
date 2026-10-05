import { randomBytes } from "node:crypto";
import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import path from "node:path";

export const CONTROL_DISCOVERY_PORT = 47820;

export type SharedMaterial = {
  id: string;
  name: string;
  type: string;
  filePath: string;
};

export type ControlPublisher = {
  token: string;
  port: number;
  discoveryPort: number;
  hosts: string[];
  roomId: string;
  close: () => Promise<void>;
};

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function readPacket(message: Buffer): Record<string, unknown> | null {
  try {
    const body = JSON.parse(message.toString("utf8")) as unknown;
    if (!body || typeof body !== "object") return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function interfaces(): NetworkInterfaceInfo[] {
  try {
    return Object.values(networkInterfaces()).flatMap((entries) => entries ?? []);
  } catch {
    return [];
  }
}

export function lanHosts(): string[] {
  const hosts = new Set<string>(["127.0.0.1"]);
  for (const entry of interfaces()) {
    if (entry.family === "IPv4" && !entry.internal) hosts.add(entry.address);
  }
  return [...hosts];
}

function broadcastTargets(): string[] {
  const targets = new Set<string>(["255.255.255.255", "127.0.0.1"]);
  for (const entry of interfaces()) {
    if (entry.family !== "IPv4" || entry.internal) continue;
    const ip = entry.address.split(".").map(Number);
    const mask = entry.netmask.split(".").map(Number);
    if (ip.length !== 4 || mask.length !== 4 || mask.some((part) => Number.isNaN(part))) {
      continue;
    }
    targets.add(ip.map((part, index) => (part | (255 - mask[index])) & 255).join("."));
  }
  return [...targets];
}

function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function bindUdp(socket: UdpSocket, port: number) {
  return new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, () => {
      socket.off("error", reject);
      try {
        socket.setBroadcast(true);
      } catch {
        // Broadcast is optional; directed replies still work.
      }
      resolve();
    });
  });
}

export async function startControlPublisher(options: {
  roomId: string;
  materials: SharedMaterial[];
  discoveryPort?: number;
}): Promise<ControlPublisher> {
  const token = randomBytes(16).toString("hex");
  const byId = new Map(options.materials.map((material) => [material.id, material]));
  const catalog = {
    roomId: options.roomId,
    materials: options.materials
      .filter((material) => SAFE_ID.test(material.id))
      .map((material) => ({
        id: material.id,
        name: material.name,
        type: material.type,
        ext: path.extname(material.filePath) || ".bin",
      })),
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.headers["x-dnd-token"] !== token) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }

    if (req.method === "GET" && url.pathname === "/catalog") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(catalog));
      return;
    }

    const match = url.pathname.match(/^\/materials\/([^/]+)$/);
    if (req.method !== "GET" || !match) {
      res.writeHead(404);
      res.end();
      return;
    }

    const id = decodeURIComponent(match[1]);
    const material = SAFE_ID.test(id) ? byId.get(id) : undefined;
    if (!material) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, { "content-type": "application/octet-stream" });
    createReadStream(material.filePath).pipe(res);
  });

  await listen(server, 0, "0.0.0.0");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  let udp: UdpSocket | null = createSocket({ type: "udp4", reuseAddr: true });
  let discoveryPort = 0;
  try {
    await bindUdp(udp, options.discoveryPort ?? CONTROL_DISCOVERY_PORT);
    const bound = udp.address();
    discoveryPort = bound.port;
    udp.on("message", (message, rinfo) => {
      const body = readPacket(message);
      if (!body || body.role !== "display" || body.roomId !== options.roomId) return;
      const reply = Buffer.from(
        JSON.stringify({
          v: 1,
          role: "control",
          roomId: options.roomId,
          port,
          token,
        })
      );
      udp?.send(reply, rinfo.port, rinfo.address);
    });
  } catch {
    udp.close();
    udp = null;
  }

  return {
    token,
    port,
    discoveryPort,
    hosts: lanHosts(),
    roomId: options.roomId,
    close: () =>
      new Promise((resolve) => {
        udp?.close();
        udp = null;
        server.close(() => resolve());
      }),
  };
}

export function discoverControlSource(
  roomId: string,
  options?: { timeoutMs?: number; discoveryPort?: number }
): Promise<{ baseUrl: string; token: string } | null> {
  const timeoutMs = options?.timeoutMs ?? 6000;
  const discoveryPort = options?.discoveryPort ?? CONTROL_DISCOVERY_PORT;

  return new Promise((resolve) => {
    const udp = createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    let probe: ReturnType<typeof setInterval> | undefined;

    const finish = (value: { baseUrl: string; token: string } | null) => {
      if (settled) return;
      settled = true;
      if (probe) clearInterval(probe);
      clearTimeout(giveUp);
      udp.close();
      resolve(value);
    };

    const giveUp = setTimeout(() => finish(null), timeoutMs);

    udp.on("error", () => finish(null));
    udp.on("message", (message, rinfo) => {
      const body = readPacket(message);
      if (!body || body.role !== "control" || body.roomId !== roomId) return;
      if (typeof body.port !== "number" || typeof body.token !== "string") return;
      finish({ baseUrl: `http://${rinfo.address}:${body.port}`, token: body.token });
    });

    udp.bind(0, () => {
      try {
        udp.setBroadcast(true);
      } catch {
        // Directed probes still run.
      }
      const payload = Buffer.from(JSON.stringify({ v: 1, role: "display", roomId }));
      const send = () => {
        for (const target of broadcastTargets()) {
          try {
            udp.send(payload, discoveryPort, target);
          } catch {
            // Skip an interface that refuses the probe.
          }
        }
      };
      send();
      probe = setInterval(send, 700);
    });
  });
}

type CatalogMaterial = {
  id: string;
  name: string;
  type: string;
  ext?: string;
};

export async function downloadControlMaterials(options: {
  token: string;
  directory: string;
  baseUrl?: string;
  hosts?: string[];
  port?: number;
}): Promise<{
  saved: Array<{
    id: string;
    name: string;
    type: string;
    localUrl: string;
    bytes: number;
    filePath: string;
  }>;
  failed: Array<{ id: string; error: string }>;
  directory: string;
}> {
  const bases = [
    ...(options.baseUrl ? [options.baseUrl] : []),
    ...(options.hosts && options.port
      ? options.hosts.map((host) => `http://${host}:${options.port}`)
      : []),
  ];
  if (bases.length === 0) {
    throw new Error("Failed to fetch Control Mode materials");
  }

  let catalog: CatalogMaterial[] | null = null;
  let baseUrl = "";
  let lastError = "Failed to fetch Control Mode materials";
  for (const base of bases) {
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}/catalog`, {
        headers: { "x-dnd-token": options.token },
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const body = (await response.json()) as { materials?: CatalogMaterial[] };
      catalog = Array.isArray(body.materials) ? body.materials : [];
      baseUrl = base.replace(/\/$/, "");
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Failed to fetch";
    }
  }

  if (!catalog || !baseUrl) {
    throw new Error(lastError || "Failed to fetch Control Mode materials");
  }

  await mkdir(options.directory, { recursive: true });
  const saved: Array<{
    id: string;
    name: string;
    type: string;
    localUrl: string;
    bytes: number;
    filePath: string;
  }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const material of catalog) {
    if (!material?.id || !SAFE_ID.test(material.id)) {
      failed.push({ id: String(material?.id ?? ""), error: "invalid material id" });
      continue;
    }
    try {
      const response = await fetch(
        `${baseUrl}/materials/${encodeURIComponent(material.id)}`,
        { headers: { "x-dnd-token": options.token } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const ext =
        material.ext && /^\.[A-Za-z0-9.]+$/.test(material.ext) ? material.ext : ".bin";
      const filePath = path.join(options.directory, `${material.id}${ext}`);
      await writeFile(filePath, bytes);
      saved.push({
        id: material.id,
        name: material.name,
        type: material.type,
        localUrl: `local-material://${material.id}`,
        bytes: bytes.length,
        filePath,
      });
    } catch (err) {
      failed.push({
        id: material.id,
        error: err instanceof Error ? err.message : "download failed",
      });
    }
  }

  return { saved, failed, directory: options.directory };
}

import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

export const SERVER_DISCOVERY_PORT = 47821;

export type DiscoveredServer = {
  apiBase: string;
  host: string;
  port: number;
};

function interfaces(): NetworkInterfaceInfo[] {
  try {
    return Object.values(networkInterfaces()).flatMap((entries) => entries ?? []);
  } catch {
    return [];
  }
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
    targets.add(ip.map((part, index) => ((part | (255 - mask[index])) & 255)).join("."));
  }
  return [...targets];
}

function readPacket(message: Buffer): Record<string, unknown> | null {
  try {
    const body = JSON.parse(message.toString("utf8")) as unknown;
    if (!body || typeof body !== "object") return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function confirmsServer(host: string, port: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { service?: string } };
    return body.data?.service === "dnd-app-server";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function discoverApiServer(options?: {
  timeoutMs?: number;
  discoveryPort?: number;
}): Promise<DiscoveredServer | null> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const discoveryPort = options?.discoveryPort ?? SERVER_DISCOVERY_PORT;

  return new Promise((resolve) => {
    const udp: UdpSocket = createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    let probe: ReturnType<typeof setInterval> | undefined;

    const finish = (value: DiscoveredServer | null) => {
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
      if (!body || body.role !== "server" || body.kind !== "announce") return;
      if (body.service !== "dnd-app-server" || typeof body.port !== "number") return;
      if (settled) return;
      const host = rinfo.address;
      const port = body.port;
      void confirmsServer(host, port).then((ok) => {
        if (ok) finish({ apiBase: `http://${host}:${port}/api`, host, port });
      });
    });

    udp.bind(0, () => {
      try {
        udp.setBroadcast(true);
      } catch {
        // Directed probes still run.
      }
      const payload = Buffer.from(
        JSON.stringify({ v: 1, role: "client", kind: "discover" })
      );
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

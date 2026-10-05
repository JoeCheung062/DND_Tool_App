import { createSocket, type Socket as UdpSocket } from "node:dgram";

export const SERVER_DISCOVERY_PORT = 47821;

/**
 * Answers LAN probes so DND App on other computers can find this API
 * without a baked-in address. One beacon per machine.
 */
export function startServerBeacon(apiPort: number): Promise<void> {
  const udp: UdpSocket = createSocket({ type: "udp4", reuseAddr: true });

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    udp.on("error", (err) => {
      console.error(
        `Server discovery beacon unavailable (${err instanceof Error ? err.message : "bind failed"}). Other apps must enter this computer's address by hand.`
      );
      try {
        udp.close();
      } catch {
        // Already closed.
      }
      finish();
    });

    udp.on("message", (message, rinfo) => {
      let body: { role?: unknown; kind?: unknown };
      try {
        body = JSON.parse(message.toString("utf8")) as { role?: unknown; kind?: unknown };
      } catch {
        return;
      }
      if (body.role !== "client" || body.kind !== "discover") return;
      const reply = Buffer.from(
        JSON.stringify({
          v: 1,
          role: "server",
          kind: "announce",
          port: apiPort,
          service: "dnd-app-server",
        })
      );
      udp.send(reply, rinfo.port, rinfo.address);
    });

    udp.bind(SERVER_DISCOVERY_PORT, () => {
      try {
        udp.setBroadcast(true);
      } catch {
        // Replies to the probe's source address still work.
      }
      console.log(`Server discovery beacon on UDP ${SERVER_DISCOVERY_PORT}`);
      finish();
    });
  });
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Room } from "../lib/api";
import {
  connectAndEnterRoom,
  leaveSession,
  type SessionState,
} from "../lib/session";
import { getDisplayApiOrMock } from "../lib/displayApi";

export function SessionPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let active: SessionState | null = null;

    (async () => {
      try {
        setStatus("Loading room…");
        const r = await api.getRoom(roomId);
        if (!alive) return;
        setRoom(r);

        setStatus("Detecting screens & joining Socket.IO…");
        active = await connectAndEnterRoom(roomId);
        if (!alive) {
          await leaveSession(active);
          return;
        }
        setSession(active);
        setStatus(
          `Live · ${active.screens.length} screen(s) registered · waiting for instructions`
        );

        active.socket.on("display:ack", (payload) => {
          if (!alive) return;
          setVerifyNote(
            `Ack ${payload.requestId}: ${(payload.results || [])
              .map(
                (r: { screenId: number; ok: boolean }) =>
                  `screen ${r.screenId}=${r.ok ? "ok" : "fail"}`
              )
              .join(", ")}`
          );
        });
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to enter room");
        setStatus("Failed");
      }
    })();

    return () => {
      alive = false;
      void leaveSession(active);
    };
  }, [roomId]);

  async function runVerify() {
    if (!session) return;
    const result = await getDisplayApiOrMock().verifyProcesses();
    session.socket.emit("display:verify-result", {
      roomId: session.roomId,
      clientId: session.clientId,
      challengeId: `local-${Date.now()}`,
      ok: result.ok,
      mainPid: result.mainPid,
      processes: result.processes,
    });
    setVerifyNote(
      result.ok
        ? `Process verification OK · pid ${result.mainPid}`
        : "Process verification FAILED — a display window is dead"
    );
  }

  async function leave() {
    await leaveSession(session);
    setSession(null);
    navigate("/", { replace: true });
  }

  return (
    <section className="panel">
      <p className="eyebrow">In room</p>
      <h1>{room?.name || "Room"}</h1>
      <p className="lede">
        Script:{" "}
        <strong>{room?.campaign?.name || "None selected"}</strong>
        {" · "}
        Status: {status}
      </p>

      {error ? (
        <div className="stack">
          <p className="error">{error}</p>
          <Link className="btn ghost" to="/">
            Back home
          </Link>
        </div>
      ) : (
        <>
          <div className="screen-grid">
            {(session?.screens || []).map((s) => (
              <article key={s.id} className="screen-card">
                <h2>
                  Screen {s.id}
                  {s.primary ? " · primary" : ""}
                </h2>
                <p className="mono">{s.label}</p>
                <p>
                  {s.bounds.width}×{s.bounds.height} @ ({s.bounds.x},{" "}
                  {s.bounds.y})
                </p>
              </article>
            ))}
            {!session ? <p className="muted">Detecting displays…</p> : null}
          </div>

          <div className="meta-block">
            <p>
              Client <span className="mono">{session?.clientId || "—"}</span>
            </p>
            <p>
              Main PID <span className="mono">{session?.mainPid ?? "—"}</span>
            </p>
            {verifyNote ? <p className="ok">{verifyNote}</p> : null}
          </div>

          <div className="cta-row">
            <button
              type="button"
              className="btn ghost"
              onClick={() => void runVerify()}
              disabled={!session}
            >
              Verify processes
            </button>
            <button type="button" className="btn" onClick={() => void leave()}>
              Leave room
            </button>
          </div>
        </>
      )}
    </section>
  );
}

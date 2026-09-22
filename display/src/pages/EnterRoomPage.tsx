import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Room } from "../lib/api";

export function EnterRoomPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [manualId, setManualId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listRooms();
        if (!cancelled) {
          setRooms(list);
          setRoomId(list[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load rooms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = (manualId.trim() || roomId).trim();
    if (!id) {
      setError("Select or enter a room id");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.getRoom(id);
      navigate(`/session/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room not found");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Enter Room</p>
      <h1>Join an existing room</h1>
      <p className="lede">
        Pick a room from the list or paste a room id, then enter to detect
        screens and listen for display instructions.
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Existing rooms
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={loading || rooms.length === 0}
          >
            {rooms.length === 0 ? (
              <option value="">
                {loading ? "Loading…" : "No rooms yet"}
              </option>
            ) : (
              rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.campaign ? ` · ${r.campaign.name}` : ""}
                </option>
              ))
            )}
          </select>
        </label>
        <label>
          Or room id
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="cuid…"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="cta-row">
          <Link className="btn ghost" to="/">
            Back
          </Link>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Entering…" : "Enter Room"}
          </button>
        </div>
      </form>
    </section>
  );
}

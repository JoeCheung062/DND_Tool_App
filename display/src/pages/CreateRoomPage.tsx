import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Campaign } from "../lib/api";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingScripts, setLoadingScripts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listCampaigns();
        if (!cancelled) {
          setCampaigns(list);
          setCampaignId(list[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scripts");
        }
      } finally {
        if (!cancelled) setLoadingScripts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!campaignId) {
      setError("Select a script");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom(name.trim(), campaignId);
      navigate(`/session/${room.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Create Room</p>
      <h1>Set room &amp; script</h1>
      <p className="lede">
        Name the room, choose a script (campaign), then enter to open screen
        windows.
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Room name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Table Alpha"
            required
            maxLength={100}
          />
        </label>
        <label>
          Script
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            required
            disabled={loadingScripts}
          >
            {campaigns.length === 0 ? (
              <option value="">
                {loadingScripts ? "Loading…" : "No scripts available"}
              </option>
            ) : (
              campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="cta-row">
          <Link className="btn ghost" to="/">
            Back
          </Link>
          <button className="btn" type="submit" disabled={busy || !campaignId}>
            {busy ? "Entering…" : "Enter Room"}
          </button>
        </div>
      </form>
    </section>
  );
}

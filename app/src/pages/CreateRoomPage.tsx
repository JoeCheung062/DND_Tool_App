import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Campaign } from "../lib/api";
import { modeHome, useRouteMode } from "../lib/mode";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const mode = useRouteMode();
  const home = modeHome(mode);
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

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
          setError(err instanceof Error ? err.message : "Failed to load campaigns");
        }
      } finally {
        if (!cancelled) setLoadingCampaigns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!campaignId) {
      setError("Select a campaign");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom(name.trim(), campaignId);
      navigate(`${home}/session/${room.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Create Room</p>
      <h1>Set room &amp; campaign</h1>
      <p className="lede">
        Name the room and choose a campaign, then enter. Display Mode and
        Control Mode both ask you to confirm that campaign before the session
        continues.
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
          Campaign
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            required
            disabled={loadingCampaigns}
          >
            {campaigns.length === 0 ? (
              <option value="">
                {loadingCampaigns ? "Loading…" : "No campaigns available"}
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
          <Link className="btn ghost" to={home}>
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

import { useEffect, useState, type FormEvent } from "react";
import { api, type Campaign } from "../lib/api";

export function SelectCampaignStep({
  roomName,
  initialCampaignId,
  onConfirm,
  onBack,
}: {
  roomName?: string;
  initialCampaignId?: string | null;
  onConfirm: (campaignId: string) => Promise<void>;
  onBack: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialCampaignId) setCampaignId(initialCampaignId);
  }, [initialCampaignId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listCampaigns();
        if (cancelled) return;
        setCampaigns(list);
        setCampaignId((current) => current || list[0]?.id || "");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load campaigns");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!campaignId) {
      setError("Select a campaign");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the campaign");
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">In room</p>
      <h1>Select a campaign</h1>
      <p className="lede">
        {roomName ? `${roomName} is open. ` : ""}
        Choose the campaign for this session before screens connect and materials
        download. General materials are included with that campaign.
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Campaign
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            required
            disabled={loading || busy}
          >
            {campaigns.length === 0 ? (
              <option value="">{loading ? "Loading…" : "No campaigns available"}</option>
            ) : (
              campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))
            )}
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="cta-row">
          <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button className="btn" type="submit" disabled={busy || loading || !campaignId}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </section>
  );
}

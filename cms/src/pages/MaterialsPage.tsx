import { useCallback, useEffect, useState, type FormEvent } from "react";
import { campaignsApi, materialsApi, tagsApi } from "../api/resources";
import type { Campaign, Material, MaterialType, Tag } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

const TYPES: MaterialType[] = ["IMAGE", "EFFECT", "SOUND"];

export function MaterialsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [type, setType] = useState<MaterialType>("IMAGE");
  const [name, setName] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [materials, camps, tagList] = await Promise.all([
        materialsApi.list(),
        campaignsApi.list(),
        tagsApi.list(),
      ]);
      setRows(materials);
      setCampaigns(camps);
      setTags(tagList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setType("IMAGE");
    setName("");
    setAssetUrl("");
    setCampaignIds([]);
    setTagIds([]);
    setOpen(true);
  }

  function openEdit(row: Material) {
    setEditing(row);
    setType(row.type);
    setName(row.name);
    setAssetUrl(row.assetUrl);
    setCampaignIds(row.campaigns?.map((c) => c.id) ?? []);
    setTagIds(row.tagList?.map((t) => t.id) ?? []);
    setOpen(true);
  }

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        type,
        name: name.trim(),
        assetUrl: assetUrl.trim(),
        campaignIds,
        tagIds,
      };
      if (editing) await materialsApi.update(editing.id, body);
      else await materialsApi.create(body);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row: Material) {
    if (!confirm(`Delete material "${row.name}"?`)) return;
    try {
      await materialsApi.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Materials"
        subtitle="Image / Effect / Sound slides with campaign presets and tags."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            New material
          </button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : (
        <div className="panel">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "name", header: "Name", render: (r) => r.name },
              {
                key: "type",
                header: "Type",
                render: (r) => <span className="pill">{r.type}</span>,
              },
              {
                key: "asset",
                header: "Asset",
                render: (r) => (
                  <span className="mono">{r.assetUrl}</span>
                ),
              },
              {
                key: "campaigns",
                header: "Campaign presets",
                render: (r) =>
                  r.campaigns?.length
                    ? r.campaigns.map((c) => (
                        <span key={c.id} className="pill muted">
                          {c.name}
                        </span>
                      ))
                    : "—",
              },
              {
                key: "tags",
                header: "Tags",
                render: (r) =>
                  r.tagList?.length
                    ? r.tagList.map((t) => (
                        <span key={t.id} className="pill">
                          {t.name}
                        </span>
                      ))
                    : "—",
              },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <div className="row-actions">
                    <button type="button" className="btn secondary" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button type="button" className="btn danger" onClick={() => void onDelete(r)}>
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        open={open}
        title={editing ? "Edit material" : "New material"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="mat-form" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="mat-form" onSubmit={onSubmit}>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MaterialType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Asset URL">
            <input
              value={assetUrl}
              onChange={(e) => setAssetUrl(e.target.value)}
              placeholder="/uploads/file.png"
              required
            />
          </Field>
          <Field label="Presets in campaigns">
            <div className="checklist">
              {campaigns.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={campaignIds.includes(c.id)}
                    onChange={() => toggle(campaignIds, c.id, setCampaignIds)}
                  />
                  {c.name}
                </label>
              ))}
              {campaigns.length === 0 ? <span>No campaigns yet</span> : null}
            </div>
          </Field>
          <Field label="Tags">
            <div className="checklist">
              {tags.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={tagIds.includes(t.id)}
                    onChange={() => toggle(tagIds, t.id, setTagIds)}
                  />
                  {t.name}
                </label>
              ))}
              {tags.length === 0 ? <span>No tags yet</span> : null}
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  );
}

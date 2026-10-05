import { useCallback, useEffect, useState, type FormEvent } from "react";
import { campaignsApi, materialsApi, tagsApi } from "../api/resources";
import { MATERIAL_TYPE_LABEL, type Campaign, type Material, type MaterialType, type Tag } from "../api/types";
import { DataTable } from "../components/DataTable";
import { DropFile } from "../components/DropFile";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

const TYPES: MaterialType[] = ["IMAGE", "EFFECT", "SOUND"];

const ACCEPT_BY_TYPE: Record<MaterialType, string> = {
  IMAGE: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
  EFFECT: "image/*,video/mp4,video/webm,.mp4,.webm,.gif,.png,.jpg,.jpeg,.webp",
  SOUND: "audio/mpeg,audio/wav,audio/ogg,audio/webm,.mp3,.wav,.ogg",
};

function AssetPreview({ material }: { material: Material }) {
  const url = material.assetUrl;
  if (material.type === "IMAGE" || material.type === "EFFECT") {
    if (/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("/uploads/")) {
      return (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={material.name} className="asset-thumb" />
        </a>
      );
    }
  }
  if (material.type === "SOUND") {
    return <audio controls src={url} preload="metadata" className="asset-audio" />;
  }
  return (
    <a className="mono" href={url} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}

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
  const [file, setFile] = useState<File | null>(null);
  const [general, setGeneral] = useState(false);
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [npc, setNpc] = useState(false);
  const [artFile, setArtFile] = useState<File | null>(null);
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
    setFile(null);
    setGeneral(false);
    setCampaignIds([]);
    setTagIds([]);
    setNpc(false);
    setArtFile(null);
    setOpen(true);
  }

  function openEdit(row: Material) {
    setEditing(row);
    setType(row.type);
    setName(row.name);
    setFile(null);
    setGeneral(Boolean(row.general));
    setCampaignIds(row.campaigns?.map((c) => c.id) ?? []);
    setTagIds(row.tagList?.map((t) => t.id) ?? []);
    setNpc(Boolean(row.npc) && row.type !== "SOUND");
    setArtFile(null);
    setOpen(true);
  }

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const visual = type === "IMAGE" || type === "EFFECT";
  const visualNpc = visual && npc;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing && !file) {
      setError("Please choose a file to upload");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await materialsApi.update(editing.id, {
          type,
          name: name.trim(),
          file: file ?? undefined,
          general,
          npc: visualNpc,
          characterArt: visualNpc ? artFile : null,
          campaignIds,
          tagIds,
        });
      } else {
        await materialsApi.create({
          type,
          name: name.trim(),
          file: file!,
          general,
          npc: visualNpc,
          characterArt: visualNpc ? artFile : null,
          campaignIds,
          tagIds,
        });
      }
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
        subtitle="Upload Image / Animation / Sound files with campaign presets and tags."
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
                render: (r) => <span className="pill">{MATERIAL_TYPE_LABEL[r.type]}</span>,
              },
              {
                key: "asset",
                header: "Asset",
                render: (r) => <AssetPreview material={r} />,
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
        <form
          id="mat-form"
          onSubmit={onSubmit}
          onDragOver={(event) => event.preventDefault()}
        >
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as MaterialType);
                setFile(null);
              }}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {MATERIAL_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          {visual ? (
            <Field label="Label">
              <button
                type="button"
                className={npc ? "btn" : "btn secondary"}
                aria-pressed={npc}
                onClick={() => setNpc((current) => !current)}
              >
                NPC
              </button>
              <span className="hint">
                {npc
                  ? "NPC is on. The map uses the Avatar. The zone uses Character Art."
                  : "Turn on NPC to place this character from the map into a zone."}
              </span>
            </Field>
          ) : null}
          <Field label={visualNpc ? "Avatar" : editing ? "Replace file (optional)" : "Upload file"}>
            {visualNpc ? (
              <span className="hint">Upload the Avatar. This is the image shown on the map.</span>
            ) : null}
            <DropFile
              accept={ACCEPT_BY_TYPE[type]}
              file={file}
              onFile={setFile}
              onReject={(message) => setError(message || null)}
            />
          </Field>
          {editing && !file ? <span className="hint">Current avatar: {editing.assetUrl}</span> : null}
          {visualNpc ? (
            <Field label="Character Art">
              <span className="hint">Upload Character Art. This image is added to the zone.</span>
              <DropFile
                accept={ACCEPT_BY_TYPE.IMAGE}
                file={artFile}
                onFile={setArtFile}
                onReject={(message) => setError(message || null)}
              />
              {editing?.characterArtUrl && !artFile ? (
                <span className="hint">Current character art: {editing.characterArtUrl}</span>
              ) : null}
            </Field>
          ) : null}
          <Field label="General">
            <label className="hint">
              <input
                type="checkbox"
                checked={general}
                onChange={(e) => setGeneral(e.target.checked)}
              />{" "}
              Available to every campaign
            </label>
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

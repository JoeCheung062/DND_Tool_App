import { useCallback, useEffect, useState, type FormEvent } from "react";
import { combinationsApi, materialsApi } from "../api/resources";
import { MATERIAL_TYPE_LABEL, type Combination, type CombinationCategory, type Material } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

const ZONE_DIRECTION: Record<number, string> = {
  1: "Up",
  2: "Left",
  3: "Right",
  4: "Down",
};

function zoneHeading(zone: number) {
  return `Zone ${zone} · ${ZONE_DIRECTION[zone] ?? ""}`;
}

function ZoneImageField({
  zone,
  images,
  value,
  onChange,
}: {
  zone: number;
  images: Material[];
  value: string;
  onChange: (materialId: string) => void;
}) {
  const selected = images.find((material) => material.id === value);
  return (
    <div className="field">
      <span>{zoneHeading(zone)} image</span>
      <div className="zone-pick">
        <a
          className="zone-pick-preview"
          href={selected?.assetUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={selected ? `Open ${selected.name}` : `${zoneHeading(zone)} has no image`}
        >
          {selected ? (
            <img src={selected.assetUrl} alt={selected.name} />
          ) : (
            <span>Select an image</span>
          )}
        </a>
        <div className="zone-pick-controls">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            aria-label={`${zoneHeading(zone)} image`}
          >
            <option value="" disabled>
              Select an image
            </option>
            {images.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
            <div className="zone-thumbs" role="listbox" aria-label={`${zoneHeading(zone)} image previews`}>
            {images.map((material) => (
              <button
                key={material.id}
                type="button"
                role="option"
                aria-selected={material.id === value}
                className={material.id === value ? "on" : ""}
                title={material.name}
                onClick={() => onChange(material.id)}
              >
                <img src={material.assetUrl} alt="" />
                <span>{material.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CombinationsPage() {
  const [rows, setRows] = useState<Combination[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Combination | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CombinationCategory>("STANDARD");
  const [mainMaterialId, setMainMaterialId] = useState("");
  const [connectMaterialIds, setConnectMaterialIds] = useState<string[]>([]);
  const [zoneMaterialIds, setZoneMaterialIds] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const images = materials.filter((material) => material.type === "IMAGE");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [combinations, mats] = await Promise.all([
        combinationsApi.list(),
        materialsApi.list(),
      ]);
      setRows(combinations);
      setMaterials(mats);
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
    setName("");
    setCategory("STANDARD");
    setMainMaterialId(materials[0]?.id ?? "");
    setConnectMaterialIds([]);
    setZoneMaterialIds([
      images[0]?.id ?? "",
      images[1]?.id ?? images[0]?.id ?? "",
      images[2]?.id ?? images[0]?.id ?? "",
      images[3]?.id ?? images[0]?.id ?? "",
    ]);
    setOpen(true);
  }

  function openEdit(row: Combination) {
    setEditing(row);
    setName(row.name);
    setCategory(row.category ?? "STANDARD");
    setMainMaterialId(row.mainMaterialId ?? "");
    setConnectMaterialIds(row.connectMaterialList?.map((m) => m.id) ?? []);
    setZoneMaterialIds([
      row.zone1MaterialId ?? "",
      row.zone2MaterialId ?? "",
      row.zone3MaterialId ?? "",
      row.zone4MaterialId ?? "",
    ]);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        category === "ENVIRONMENT_PACK"
          ? {
              name: name.trim(),
              category,
              zone1MaterialId: zoneMaterialIds[0],
              zone2MaterialId: zoneMaterialIds[1],
              zone3MaterialId: zoneMaterialIds[2],
              zone4MaterialId: zoneMaterialIds[3],
            }
          : {
              name: name.trim(),
              category,
              mainMaterialId,
              connectMaterialIds,
            };
      if (editing) await combinationsApi.update(editing.id, body);
      else await combinationsApi.create(body);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row: Combination) {
    if (!confirm(`Delete combination "${row.name}"?`)) return;
    try {
      await combinationsApi.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Combinations"
        subtitle="A standard combination pairs a main material with connected materials. An environment pack assigns one image to each zone."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            New combination
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
                key: "category",
                header: "Category",
                render: (r) =>
                  r.category === "ENVIRONMENT_PACK" ? "Environment Pack" : "Standard",
              },
              {
                key: "main",
                header: "Main material",
                render: (r) =>
                  r.category === "ENVIRONMENT_PACK"
                    ? "—"
                    : r.mainMaterial?.name ?? r.mainMaterialId ?? "—",
              },
              {
                key: "connect",
                header: "Connect materials",
                render: (r) =>
                  r.category === "ENVIRONMENT_PACK"
                    ? [1, 2, 3, 4].map((zone) => {
                        const material = r[`zone${zone}Material` as keyof Combination] as
                          | Material
                          | null
                          | undefined;
                        return (
                          <span key={zone} className="pill muted">
                            {zoneHeading(zone)}: {material?.name ?? "—"}
                          </span>
                        );
                      })
                    : r.connectMaterialList?.length
                      ? r.connectMaterialList.map((m) => (
                          <span key={m.id} className="pill muted">
                            {m.name}
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
        title={editing ? "Edit combination" : "New combination"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="comb-form" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="comb-form" onSubmit={onSubmit}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CombinationCategory)}
            >
              <option value="STANDARD">Standard</option>
              <option value="ENVIRONMENT_PACK">Environment Pack</option>
            </select>
          </Field>
          {category === "ENVIRONMENT_PACK" ? (
            [1, 2, 3, 4].map((zone) => (
              <ZoneImageField
                key={zone}
                zone={zone}
                images={images}
                value={zoneMaterialIds[zone - 1]}
                onChange={(materialId) =>
                  setZoneMaterialIds((current) =>
                    current.map((id, index) => (index === zone - 1 ? materialId : id))
                  )
                }
              />
            ))
          ) : (
            <>
          <Field label="Main material">
            <select
              value={mainMaterialId}
              onChange={(e) => setMainMaterialId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select material
              </option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  [{MATERIAL_TYPE_LABEL[m.type]}] {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Connect materials">
            <div className="checklist">
              {materials
                .filter((m) => m.id !== mainMaterialId)
                .map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={connectMaterialIds.includes(m.id)}
                      onChange={() =>
                        setConnectMaterialIds((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((id) => id !== m.id)
                            : [...prev, m.id]
                        )
                      }
                    />
                    [{MATERIAL_TYPE_LABEL[m.type]}] {m.name}
                  </label>
                ))}
            </div>
          </Field>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

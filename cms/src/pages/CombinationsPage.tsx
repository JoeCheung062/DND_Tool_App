import { useCallback, useEffect, useState, type FormEvent } from "react";
import { combinationsApi, materialsApi } from "../api/resources";
import type { Combination, Material } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

export function CombinationsPage() {
  const [rows, setRows] = useState<Combination[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Combination | null>(null);
  const [name, setName] = useState("");
  const [mainMaterialId, setMainMaterialId] = useState("");
  const [connectMaterialIds, setConnectMaterialIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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
    setMainMaterialId(materials[0]?.id ?? "");
    setConnectMaterialIds([]);
    setOpen(true);
  }

  function openEdit(row: Combination) {
    setEditing(row);
    setName(row.name);
    setMainMaterialId(row.mainMaterialId);
    setConnectMaterialIds(row.connectMaterialList?.map((m) => m.id) ?? []);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
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
        subtitle="Main material plus connected materials."
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
                key: "main",
                header: "Main material",
                render: (r) => r.mainMaterial?.name ?? r.mainMaterialId,
              },
              {
                key: "connect",
                header: "Connect materials",
                render: (r) =>
                  r.connectMaterialList?.length
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
                  [{m.type}] {m.name}
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
                    [{m.type}] {m.name}
                  </label>
                ))}
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  );
}

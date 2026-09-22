import { useCallback, useEffect, useState, type FormEvent } from "react";
import { charactersApi, usersApi } from "../api/resources";
import type { Character, User } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

export function CharactersPage() {
  const [rows, setRows] = useState<Character[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chars, userList] = await Promise.all([
        charactersApi.list(),
        usersApi.list(),
      ]);
      setRows(chars);
      setUsers(userList);
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
    setFile(null);
    setUserId(users[0]?.id ?? "");
    setOpen(true);
  }

  function openEdit(row: Character) {
    setEditing(row);
    setName(row.name);
    setFile(null);
    setUserId(row.userId);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setError("Owner (user) is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await charactersApi.update(editing.id, {
          name: name.trim(),
          userId,
          file: file ?? undefined,
        });
      } else {
        await charactersApi.create({
          name: name.trim(),
          userId,
          file: file ?? undefined,
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

  async function onDelete(row: Character) {
    if (!confirm(`Delete character "${row.name}"?`)) return;
    try {
      await charactersApi.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Characters"
        subtitle="Player characters with uploaded illustration and owner."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            New character
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
                key: "illustration",
                header: "Illustration",
                render: (r) =>
                  r.illustration ? (
                    <a href={r.illustration} target="_blank" rel="noreferrer">
                      <img
                        src={r.illustration}
                        alt={r.name}
                        className="asset-thumb"
                      />
                    </a>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "user",
                header: "Owner",
                render: (r) => r.user?.displayName || r.user?.username || r.userId,
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
        title={editing ? "Edit character" : "New character"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="char-form" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="char-form" onSubmit={onSubmit}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={editing ? "Replace illustration (optional)" : "Illustration"}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {editing?.illustration && !file ? (
              <span className="hint">
                Current:{" "}
                <a href={editing.illustration} target="_blank" rel="noreferrer">
                  view
                </a>
              </span>
            ) : null}
            {file ? <span className="hint">Selected: {file.name}</span> : null}
          </Field>
          <Field label="Owner (user)">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="" disabled>
                Select user
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username}
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}

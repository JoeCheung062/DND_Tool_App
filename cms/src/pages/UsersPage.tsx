import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usersApi } from "../api/resources";
import type { User } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

export function UsersPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await usersApi.list());
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
    setEmail("");
    setUsername("");
    setDisplayName("");
    setAvatarUrl("");
    setBio("");
    setOpen(true);
  }

  function openEdit(row: User) {
    setEditing(row);
    setEmail(row.email);
    setUsername(row.username);
    setDisplayName(row.displayName ?? "");
    setAvatarUrl(row.avatarUrl ?? "");
    setBio(row.bio ?? "");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await usersApi.update(editing.id, {
          email: email.trim(),
          username: username.trim(),
          displayName: displayName.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          bio: bio.trim() || null,
        });
      } else {
        await usersApi.create({
          email: email.trim(),
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
          bio: bio.trim() || undefined,
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

  async function onDelete(row: User) {
    if (!confirm(`Delete user "${row.username}"?`)) return;
    try {
      await usersApi.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Player profiles only — Users cannot sign in to the CMS."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            New user
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
              {
                key: "name",
                header: "Profile",
                render: (r) => (
                  <div>
                    <strong>{r.displayName || r.username}</strong>
                    <div className="mono">{r.email}</div>
                  </div>
                ),
              },
              {
                key: "username",
                header: "Username",
                render: (r) => r.username,
              },
              {
                key: "bio",
                header: "Bio",
                render: (r) => r.bio || "—",
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
        title={editing ? "Edit user" : "New user"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="user-form" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={onSubmit}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Avatar URL">
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
          </Field>
          <Field label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminsApi } from "../api/resources";
import type { Admin, AdminRole } from "../api/types";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, Field, LoadingState, PageHeader } from "../components/ui";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "DM"];

export function AdminsPage() {
  const [rows, setRows] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Admin | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("ADMIN");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminsApi.list());
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
    setPassword("");
    setRole("ADMIN");
    setDisplayName("");
    setOpen(true);
  }

  function openEdit(row: Admin) {
    setEditing(row);
    setEmail(row.email);
    setUsername(row.username);
    setPassword("");
    setRole(row.role);
    setDisplayName(row.displayName ?? "");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await adminsApi.update(editing.id, {
          email: email.trim(),
          username: username.trim(),
          role,
          displayName: displayName.trim() || null,
          ...(password.trim() ? { password: password.trim() } : {}),
        });
      } else {
        await adminsApi.create({
          email: email.trim(),
          username: username.trim(),
          password: password.trim(),
          role,
          displayName: displayName.trim() || undefined,
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

  async function onDelete(row: Admin) {
    if (!confirm(`Delete admin "${row.username}" (${row.role})?`)) return;
    try {
      await adminsApi.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Admins"
        subtitle="Login accounts: Super Admin, Admin, and DM."
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            New admin
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
                header: "Admin",
                render: (r) => (
                  <div>
                    <strong>{r.displayName || r.username}</strong>
                    <div className="mono">{r.email}</div>
                  </div>
                ),
              },
              {
                key: "role",
                header: "Role",
                render: (r) => (
                  <span className="pill">{r.role.replace("_", " ")}</span>
                ),
              },
              {
                key: "username",
                header: "Username",
                render: (r) => r.username,
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
        title={editing ? "Edit admin" : "New admin"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="admin-form" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="admin-form" onSubmit={onSubmit}>
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
          <Field label={editing ? "Password (leave blank to keep)" : "Password"}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editing}
              minLength={editing ? undefined : 8}
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              required
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

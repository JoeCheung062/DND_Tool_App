import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { getApiBase, setApiBase } from "../lib/api";
import { getSavedEmail, useAuth } from "../lib/auth";

export function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState(getSavedEmail());
  const [password, setPassword] = useState("password123");
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setApiBase(apiBase.trim());
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel narrow">
      <h1>Sign in</h1>
      <p className="lede">
        Display App uses an Admin / DM account to create rooms and receive
        Socket.IO play instructions.
      </p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          API base
          <input
            value={apiBase}
            onChange={(e) => setApiBaseState(e.target.value)}
            placeholder="http://localhost:3000/api"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

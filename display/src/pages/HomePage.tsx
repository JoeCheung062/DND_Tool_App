import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function HomePage() {
  const { admin, logout } = useAuth();

  return (
    <section className="hero-panel">
      <p className="eyebrow">Home</p>
      <h1>Display App</h1>
      <p className="lede">
        Create a room with a script, or enter an existing room. On enter, this
        app detects connected screens and waits for Socket.IO display
        instructions.
      </p>
      <div className="cta-row">
        <Link className="btn" to="/create">
          Create Room
        </Link>
        <Link className="btn ghost" to="/enter">
          Enter Room
        </Link>
      </div>
      <p className="meta">
        Signed in as {admin?.displayName || admin?.username || "Admin"}
        {" · "}
        <button type="button" className="linkish" onClick={logout}>
          Sign out
        </button>
      </p>
    </section>
  );
}

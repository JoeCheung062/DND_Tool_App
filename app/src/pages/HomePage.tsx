import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { modeHome, useRouteMode } from "../lib/mode";

export function HomePage() {
  const { admin, logout } = useAuth();
  const mode = useRouteMode();
  const home = modeHome(mode);
  const displayMode = mode === "display";

  return (
    <section className="hero-panel">
      <p className="eyebrow">{displayMode ? "Display mode" : "Control mode"}</p>
      <h1>{displayMode ? "Display" : "Control"}</h1>
      <p className="lede">
        {displayMode
          ? "Create or enter a room, then select a campaign. This mode detects connected displays, downloads that campaign’s materials plus General ones, and waits for Control Mode."
          : "Create or enter a room, then select a campaign. This mode sees the screens a Display Mode client registered and sends the materials those screens should show."}
      </p>
      <div className="cta-row">
        <Link className="btn" to={`${home}/create`}>
          Create Room
        </Link>
        <Link className="btn ghost" to={`${home}/enter`}>
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

import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { modeHome, setAppMode, type AppMode } from "../lib/mode";

export function ModePage() {
  const navigate = useNavigate();
  const { admin, logout } = useAuth();

  function choose(mode: AppMode) {
    setAppMode(mode);
    navigate(modeHome(mode));
  }

  return (
    <section className="hero-panel">
      <p className="eyebrow">After sign in</p>
      <h1>Choose a mode</h1>
      <p className="lede">
        This desktop app runs as the screens or as the table control. Pick one
        for this session. Open the app a second time to run the other mode on
        the same computer.
      </p>
      <div className="mode-grid">
        <button type="button" className="mode-card" onClick={() => choose("display")}>
          <span className="eyebrow">Output</span>
          <h2>Display Mode</h2>
          <p>
            Detect screens, download the campaign and General materials, and
            paint whatever Control Mode sends to each screen.
          </p>
        </button>
        <button type="button" className="mode-card" onClick={() => choose("control")}>
          <span className="eyebrow">Operator</span>
          <h2>Control Mode</h2>
          <p>
            Join the room, see connected screen IDs, and send materials to the
            displays. Each screen must authenticate before it paints.
          </p>
        </button>
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

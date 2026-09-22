import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { isDesktopApp } from "./lib/displayApi";
import { HomePage } from "./pages/HomePage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { EnterRoomPage } from "./pages/EnterRoomPage";
import { SessionPage } from "./pages/SessionPage";
import { LoginPage } from "./pages/LoginPage";
import "./styles.css";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  if (!isDesktopApp()) {
    return (
      <section className="panel narrow">
        <p className="eyebrow">Desktop app required</p>
        <h1>DND Display is not a website</h1>
        <p className="lede">
          This is a cross-platform Electron application for Windows, macOS, and
          Linux. Open it from the installed desktop app, or launch the native
          shell locally:
        </p>
        <pre className="code-block">{`npm run display:dev
# or after packaging:
# Windows: DND Display.exe
# macOS:   DND Display.app
# Linux:   DND Display.AppImage`}</pre>
        <p className="muted">
          Opening this UI in a browser cannot detect physical screens or open
          fullscreen display windows.
        </p>
      </section>
    );
  }
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">DND</span>
            <span className="brand-name">Display</span>
            <span className="brand-badge">Desktop</span>
          </div>
        </header>
        <main className="main">
          <DesktopOnlyGate>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <HomePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/create"
                element={
                  <RequireAuth>
                    <CreateRoomPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/enter"
                element={
                  <RequireAuth>
                    <EnterRoomPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/session/:roomId"
                element={
                  <RequireAuth>
                    <SessionPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DesktopOnlyGate>
        </main>
      </div>
    </AuthProvider>
  );
}

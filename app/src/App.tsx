import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { isDesktopApp } from "./lib/displayApi";
import { HomePage } from "./pages/HomePage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { EnterRoomPage } from "./pages/EnterRoomPage";
import { SessionPage } from "./pages/SessionPage";
import { ControlSessionPage } from "./pages/ControlSessionPage";
import { LoginPage } from "./pages/LoginPage";
import { ModePage } from "./pages/ModePage";
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
        <h1>DND App is not a website</h1>
        <p className="lede">
          This is a cross-platform Electron application for Windows, macOS, and
          Linux. Open it from the installed desktop app, or launch the native
          shell locally:
        </p>
        <pre className="code-block">{`npm run app:dev
# or after packaging:
# Windows: DND App.exe
# macOS:   DND App.app
# Linux:   DND App.AppImage`}</pre>
        <p className="muted">
          Opening this UI in a browser cannot detect physical screens or open
          fullscreen display windows.
        </p>
      </section>
    );
  }
  return children;
}

function Shell() {
  const { pathname } = useLocation();
  const modeLabel = pathname.startsWith("/control")
    ? "Control"
    : pathname.startsWith("/display")
      ? "Display"
      : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DND</span>
          <span className="brand-name">App</span>
          <span className="brand-badge">{modeLabel ?? "Desktop"}</span>
          {modeLabel ? (
            <Link className="linkish brand-switch" to="/">
              Switch mode
            </Link>
          ) : null}
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
                  <ModePage />
                </RequireAuth>
              }
            />
            <Route
              path="/display"
              element={
                <RequireAuth>
                  <HomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/display/create"
              element={
                <RequireAuth>
                  <CreateRoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="/display/enter"
              element={
                <RequireAuth>
                  <EnterRoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="/display/session/:roomId"
              element={
                <RequireAuth>
                  <SessionPage />
                </RequireAuth>
              }
            />
            <Route
              path="/control"
              element={
                <RequireAuth>
                  <HomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/control/create"
              element={
                <RequireAuth>
                  <CreateRoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="/control/enter"
              element={
                <RequireAuth>
                  <EnterRoomPage />
                </RequireAuth>
              }
            />
            <Route
              path="/control/session/:roomId"
              element={
                <RequireAuth>
                  <ControlSessionPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DesktopOnlyGate>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

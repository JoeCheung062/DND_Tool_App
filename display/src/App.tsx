import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
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

export function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">DND</span>
            <span className="brand-name">Display</span>
          </div>
        </header>
        <main className="main">
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
        </main>
      </div>
    </AuthProvider>
  );
}

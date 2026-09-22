import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoadingState } from "./components/ui";
import { CampaignsPage } from "./pages/CampaignsPage";
import { CharactersPage } from "./pages/CharactersPage";
import { CombinationsPage } from "./pages/CombinationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { RoomsPage } from "./pages/RoomsPage";
import { SqlTablesPage } from "./pages/SqlTablesPage";
import { TagsPage } from "./pages/TagsPage";
import { UsersPage } from "./pages/UsersPage";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="combinations" element={<CombinationsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="sql" element={<SqlTablesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../api/resources";
import type { Overview } from "../api/types";
import { ErrorBanner, LoadingState, PageHeader } from "../components/ui";

const links = [
  { to: "/rooms", key: "rooms", label: "Rooms" },
  { to: "/campaigns", key: "campaigns", label: "Campaigns" },
  { to: "/characters", key: "characters", label: "Characters" },
  { to: "/tags", key: "tags", label: "Tags" },
  { to: "/materials", key: "materials", label: "Materials" },
  { to: "/combinations", key: "combinations", label: "Combinations" },
  { to: "/users", key: "users", label: "Users" },
] as const;

export function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .overview()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of everything stored in PostgreSQL."
        actions={
          <Link className="btn secondary" to="/sql">
            Inspect SQL tables
          </Link>
        }
      />
      <ErrorBanner message={error} />
      {!data ? (
        <LoadingState />
      ) : (
        <>
          <div className="stats">
            {links.map((item, i) => (
              <Link
                key={item.key}
                to={item.to}
                className="stat-card"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span>{item.label}</span>
                <strong>{data.counts[item.key]}</strong>
              </Link>
            ))}
          </div>
          <section className="panel">
            <h2 style={{ marginBottom: "0.8rem" }}>Materials by type</h2>
            <div className="stats" style={{ marginBottom: 0 }}>
              {(["IMAGE", "EFFECT", "SOUND"] as const).map((type) => (
                <div key={type} className="stat-card">
                  <span>{type}</span>
                  <strong>{data.materialsByType[type] ?? 0}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

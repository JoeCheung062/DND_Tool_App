import { useEffect, useState } from "react";
import { adminApi } from "../api/resources";
import type { SqlColumn, SqlTable } from "../api/types";
import { DataTable } from "../components/DataTable";
import { ErrorBanner, LoadingState, PageHeader } from "../components/ui";

export function SqlTablesPage() {
  const [tables, setTables] = useState<SqlTable[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [columns, setColumns] = useState<SqlColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .tables()
      .then(setTables)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function inspect(table: string) {
    setSelected(table);
    setError(null);
    try {
      const detail = await adminApi.describe(table);
      setColumns(detail.columns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to describe table");
      setColumns([]);
    }
  }

  return (
    <div>
      <PageHeader
        title="SQL Tables"
        subtitle="Inspect PostgreSQL tables and column definitions."
      />
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState />
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="panel">
            <DataTable
              rows={tables}
              rowKey={(r) => r.table}
              columns={[
                { key: "table", header: "Table", render: (r) => r.table },
                { key: "rows", header: "Rows", render: (r) => r.rows },
                {
                  key: "actions",
                  header: "Actions",
                  render: (r) => (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => void inspect(r.table)}
                    >
                      Describe
                    </button>
                  ),
                },
              ]}
            />
          </div>
          {selected ? (
            <div className="panel">
              <h2 style={{ marginBottom: "0.8rem" }}>Columns — {selected}</h2>
              <DataTable
                rows={columns}
                rowKey={(c) => c.column_name}
                empty="No columns"
                columns={[
                  { key: "name", header: "Column", render: (c) => c.column_name },
                  { key: "type", header: "Type", render: (c) => c.data_type },
                  {
                    key: "null",
                    header: "Nullable",
                    render: (c) => c.is_nullable,
                  },
                  {
                    key: "default",
                    header: "Default",
                    render: (c) => c.column_default ?? "—",
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

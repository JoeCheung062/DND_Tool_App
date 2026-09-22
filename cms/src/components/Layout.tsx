import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/rooms", label: "Rooms" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/characters", label: "Characters" },
  { to: "/tags", label: "Tags" },
  { to: "/materials", label: "Materials" },
  { to: "/combinations", label: "Combinations" },
  { to: "/users", label: "Users" },
  { to: "/admins", label: "Admins" },
  { to: "/sql", label: "SQL Tables" },
];

export function Layout() {
  const { admin, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">DND</span>
          <span className="brand-text">CMS</span>
        </Link>
        <nav className="nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <strong>{admin?.displayName || admin?.username}</strong>
            <span>
              {admin?.role?.replace("_", " ")} · {admin?.email}
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

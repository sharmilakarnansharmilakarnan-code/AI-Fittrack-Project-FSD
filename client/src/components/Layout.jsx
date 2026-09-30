import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Menu entries. `roles` (optional) only hides links in the UI - the backend
// enforces the same rules and answers 403 for anything not allowed.
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "grid" },
  { to: "/workouts", label: "Workout log", icon: "list" },
  { to: "/workouts/new", label: "Add workout", icon: "plus" },
  { to: "/goals", label: "Goals", icon: "target" },
  { to: "/progress", label: "Progress", icon: "chart" },
  { to: "/attendance", label: "Attendance", icon: "check" },
  { to: "/recommendation", label: "AI recommendation", icon: "spark" },
  { to: "/fitness-insights", label: "AI Fitness Insights", icon: "insights" },
  { to: "/profile", label: "Profile", icon: "user" },
  { to: "/admin", label: "Admin", icon: "shield", roles: ["admin"] },
];

const ICONS = {
  grid: (
    <svg viewBox="0 0 20 20" fill="none"><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
  ),
  list: (
    <svg viewBox="0 0 20 20" fill="none"><circle cx="4" cy="5" r="1.2" fill="currentColor"/><circle cx="4" cy="10" r="1.2" fill="currentColor"/><circle cx="4" cy="15" r="1.2" fill="currentColor"/><path d="M8 5H17M8 10H17M8 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
  plus: (
    <svg viewBox="0 0 20 20" fill="none"><path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  spark: (
    <svg viewBox="0 0 20 20" fill="none"><path d="M10 2L11.8 7.6L17.5 9.5L11.8 11.4L10 17L8.2 11.4L2.5 9.5L8.2 7.6L10 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
  ),
  insights: (
    <svg viewBox="0 0 20 20" fill="none"><path d="M2.5 11H6L8 5.5L12 15L14 11H17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  user: (
    <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.5" r="3.2" stroke="currentColor" strokeWidth="1.5"/><path d="M3.5 17C4.3 13.5 6.9 11.8 10 11.8C13.1 11.8 15.7 13.5 16.5 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
  chart: (
    <svg viewBox="0 0 20 20" fill="none"><path d="M3 16.5H17M5.5 14V9M10 14V4.5M14.5 14V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  target: (
    <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.5"/></svg>
  ),
  check: (
    <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M6.8 10.2L9 12.4L13.4 7.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5L16 4.8V9.6C16 13.2 13.5 15.9 10 17.5C6.5 15.9 4 13.2 4 9.6V4.8L10 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
  ),
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role || "user"));

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__brand-mark">FT</span>
          <span className="sidebar__brand-name">AI FitTrack</span>
        </div>

        <nav className="sidebar__nav">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/workouts"}
              className={({ isActive }) => `sidebar__link ${isActive ? "is-active" : ""}`}
            >
              <span className="sidebar__icon">{ICONS[item.icon]}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="sidebar__avatar">{(user?.name || "?").charAt(0).toUpperCase()}</span>
            <div>
              <div className="sidebar__user-name">{user?.name}{user?.role && user.role !== "user" ? ` (${user.role})` : ""}</div>
              <div className="sidebar__user-email">{user?.email}</div>
            </div>
          </div>
          <button type="button" className="btn btn--ghost btn--block" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}

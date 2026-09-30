import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import StatCard from "../components/StatCard";
import { errorText, formatDate } from "../utils/format";

const ROLES = ["user", "admin"];

export default function Admin() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStats = useCallback(async () => {
    const res = await adminApi.stats();
    setStats(res.data.data.stats);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await adminApi.users({ q: q.trim() || undefined, limit: 50 });
    setUsers(res.data.data.users);
  }, [q]);

  useEffect(() => {
    loadStats()
      .catch((err) => setError(errorText(err)))
      .finally(() => setIsLoading(false));
  }, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers().catch((err) => setError(errorText(err))), 300);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  // Role and delete rules (not your own account, admin only) are enforced by the backend.
  const run = async (action, message) => {
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const changeRole = (u, role) => run(() => adminApi.setRole(u.id, role), `${u.name} is now ${role}.`);
  const remove = (u) =>
    window.confirm(`Delete ${u.name} and all their workouts, goals and visits?`) && run(() => adminApi.deleteUser(u.id), `${u.name} was deleted.`);

  if (isLoading) return <Layout><Loader label="Loading admin dashboard…" /></Layout>;

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Admin</h1>
          <p className="page-header__subtitle">System overview and user management (admin role only).</p>
        </div>
      </div>
      <Banner type="error" onClose={() => setError("")}>{error}</Banner>
      <Banner type="success" onClose={() => setSuccess("")}>{success}</Banner>

      {stats && (
        <div className="stack">
          <div className="stats-grid">
            <StatCard label="Users" value={stats.users.total} accent />
            <StatCard label="New (7 days)" value={stats.users.newInLast7Days} />
            <StatCard label="Workouts logged" value={stats.workouts.total} />
            <StatCard label="Gym visits" value={stats.attendance.totalVisits} />
            <StatCard label="Checked in now" value={stats.attendance.currentlyCheckedIn} />
            <StatCard label="Active goals" value={stats.goals.byStatus.active || 0} />
          </div>

          <div>
            <h2 className="section-title">Users</h2>
            <div className="search-bar"><input type="text" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td><td>{u.email}</td><td>{formatDate(u.createdAt)}</td>
                      <td>
                        <select value={u.role} disabled={u.id === me?.id} onChange={(e) => changeRole(u, e.target.value)}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>{u.id !== me?.id && <button className="btn btn--danger btn--sm" onClick={() => remove(u)}>Delete</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

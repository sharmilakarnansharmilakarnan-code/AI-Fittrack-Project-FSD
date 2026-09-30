import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { workoutApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import Banner from "../components/Banner";

const CATEGORIES = ["", "Cardio", "Strength", "Flexibility", "Balance", "Sports", "HIIT", "Yoga", "Other"];

const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Workouts() {
  const [workouts, setWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const hasFilters = query.trim() || category || date;
      const res = hasFilters
        ? await workoutApi.search({ query: query.trim() || undefined, category: category || undefined, date: date || undefined })
        : await workoutApi.list({ limit: 50 });
      setWorkouts(hasFilters ? res.data.data.workouts : res.data.data.workouts);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [query, category, date]);

  useEffect(() => {
    const timer = setTimeout(load, 300); // debounce search
    return () => clearTimeout(timer);
  }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      await workoutApi.remove(id);
      setSuccess("Workout deleted.");
      setWorkouts((prev) => prev.filter((w) => w._id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Workout log</h1>
          <p className="page-header__subtitle">Browse, search, and manage everything you've logged.</p>
        </div>
        <Link to="/workouts/new" className="btn btn--primary">+ Add workout</Link>
      </div>

      <Banner type="error" onClose={() => setError("")}>{error}</Banner>
      <Banner type="success" onClose={() => setSuccess("")}>{success}</Banner>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by workout name or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c || "All categories"}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {isLoading ? (
        <Loader label="Loading workouts…" />
      ) : workouts.length === 0 ? (
        <EmptyState
          title="No workouts found"
          description="Try a different search, or log a new workout to get started."
          action={<Link to="/workouts/new" className="btn btn--primary btn--sm">Add a workout</Link>}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workout</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Calories</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workouts.map((w) => (
                <tr key={w._id}>
                  <td><Link to={`/workouts/${w._id}`}>{w.workoutName}</Link></td>
                  <td><span className="badge">{w.category}</span></td>
                  <td className="numeral">{w.duration} min</td>
                  <td className="numeral">{w.caloriesBurned} kcal</td>
                  <td>{formatDate(w.workoutDate)}</td>
                  <td>
                    <div className="table-actions">
                      <Link to={`/workouts/${w._id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(w._id, w.workoutName)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

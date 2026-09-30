import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { progressApi, workoutApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import StatCard from "../components/StatCard";
import EmptyState from "../components/EmptyState";
import Banner from "../components/Banner";
import { useAuth } from "../context/AuthContext";

const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [summaryRes, workoutsRes] = await Promise.all([
          progressApi.summary(),
          workoutApi.list({ page: 1, limit: 5 }),
        ]);
        if (!isMounted) return;
        setStats(summaryRes.data.data.summary);
        setRecent(workoutsRes.data.data.workouts);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name?.split(" ")[0]}</h1>
          <p className="page-header__subtitle">Here's how your training is going.</p>
        </div>
        <Link to="/workouts/new" className="btn btn--primary">+ Add workout</Link>
      </div>

      <Banner type="error">{error}</Banner>

      {isLoading ? (
        <Loader label="Loading your dashboard…" />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Total workouts" value={stats?.totals.workouts ?? 0} accent />
            <StatCard label="Average duration" value={stats?.totals.averageDuration ?? 0} unit="min" />
            <StatCard label="Calories burned" value={stats?.totals.totalCalories ?? 0} unit="kcal" />
            <StatCard label="Current streak" value={stats?.streak.current ?? 0} unit="days" />
            <StatCard label="Gym visits (30 days)" value={stats?.attendance.visitsLast30Days ?? 0} />
          </div>

          <h2 className="section-title">Recent workouts</h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No workouts logged yet"
              description="Add your first workout to start tracking your progress and get AI recommendations."
              action={<Link to="/workouts/new" className="btn btn--primary btn--sm">Add your first workout</Link>}
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
                  </tr>
                </thead>
                <tbody>
                  {recent.map((w) => (
                    <tr key={w._id}>
                      <td><Link to={`/workouts/${w._id}`}>{w.workoutName}</Link></td>
                      <td><span className="badge">{w.category}</span></td>
                      <td className="numeral">{w.duration} min</td>
                      <td className="numeral">{w.caloriesBurned} kcal</td>
                      <td>{formatDate(w.workoutDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

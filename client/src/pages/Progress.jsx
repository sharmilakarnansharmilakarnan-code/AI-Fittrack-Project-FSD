import { useEffect, useState } from "react";
import { progressApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import StatCard from "../components/StatCard";
import ProgressBar from "../components/ProgressBar";
import { errorText, formatDate } from "../utils/format";

export default function Progress() {
  const [summary, setSummary] = useState(null);
  const [weekly, setWeekly] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([progressApi.summary(), progressApi.weekly(8)])
      .then(([s, w]) => {
        setSummary(s.data.data.summary);
        setWeekly(w.data.data.weekly);
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Layout><Loader label="Calculating your progress…" /></Layout>;
  const maxWeek = Math.max(1, ...weekly.map((w) => w.workouts));

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Progress</h1>
          <p className="page-header__subtitle">Calculated by the server from your logged workouts (weeks run Monday to Sunday, UTC).</p>
        </div>
      </div>
      <Banner type="error" onClose={() => setError("")}>{error}</Banner>

      {summary && (
        <div className="stack">
          <div className="stats-grid">
            <StatCard label="Total workouts" value={summary.totals.workouts} accent />
            <StatCard label="Total time" value={summary.totals.totalDuration} unit="min" />
            <StatCard label="Calories burned" value={summary.totals.totalCalories} unit="kcal" />
            <StatCard label="Current streak" value={summary.streak.current} unit="days" />
            <StatCard label="Longest streak" value={summary.streak.longest} unit="days" />
            <StatCard label="Consistency (30 days)" value={summary.consistency.percentage} unit="%" />
            <StatCard label="Workouts per week" value={summary.frequency.workoutsPerWeek} />
            <StatCard label="Gym visits (30 days)" value={summary.attendance.visitsLast30Days} />
          </div>
          {summary.streak.lastWorkoutDay && <p className="muted">Last workout: {formatDate(summary.streak.lastWorkoutDay)}</p>}

          <div className="card">
            <h2 className="section-title">Weekly progress</h2>
            {weekly.map((w) => (
              <div className="bar-row" key={w.weekStart}>
                <span>{formatDate(w.weekStart)}</span>
                <ProgressBar value={(w.workouts / maxWeek) * 100} label={`Week of ${w.weekStart}`} />
                <span className="numeral">{w.workouts} · {w.duration} min</span>
              </div>
            ))}
          </div>

          {summary.categoryDistribution.length > 0 && (
            <div className="card">
              <h2 className="section-title">Category distribution</h2>
              {summary.categoryDistribution.map((c) => (
                <div className="bar-row" key={c.category}>
                  <span>{c.category}</span>
                  <ProgressBar value={c.percentage} label={c.category} />
                  <span className="numeral">{c.count} ({c.percentage}%)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

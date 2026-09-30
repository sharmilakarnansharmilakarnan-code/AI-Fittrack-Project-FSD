import { useCallback, useEffect, useState } from "react";
import { goalApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import ProgressBar from "../components/ProgressBar";
import StatusBadge from "../components/StatusBadge";
import { errorText, formatDate } from "../utils/format";

const METRICS = [
  { value: "manual", label: "Manual (I enter my progress)" },
  { value: "workouts", label: "Number of workouts (calculated)" },
  { value: "workout_minutes", label: "Workout minutes (calculated)" },
  { value: "calories", label: "Calories burned (calculated)" },
  { value: "visits", label: "Gym visits (calculated)" },
];
const EMPTY = { title: "", metric: "workouts", targetValue: 10, currentValue: 0, unit: "", targetDate: "" };

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [values, setValues] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await goalApi.list({ limit: 50 });
      setGoals(res.data.data.goals);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, message) => {
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  // Progress is never sent: the backend calculates it from the stored data.
  const create = (e) => {
    e.preventDefault();
    const payload = { title: form.title, metric: form.metric, targetValue: Number(form.targetValue), targetDate: form.targetDate };
    if (form.unit.trim()) payload.unit = form.unit.trim();
    if (form.metric === "manual") payload.currentValue = Number(form.currentValue);
    run(async () => {
      await goalApi.create(payload);
      setForm(EMPTY);
    }, "Goal created.");
  };
  const saveValue = (g) => run(() => goalApi.update(g._id, { currentValue: Number(values[g._id]) }), "Progress updated.");
  const remove = (g) => window.confirm(`Delete "${g.title}"?`) && run(() => goalApi.remove(g._id), "Goal deleted.");
  const cancel = (g) => run(() => goalApi.update(g._id, { status: "cancelled" }), "Goal cancelled.");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Goals</h1>
          <p className="page-header__subtitle">Set a target. Progress is calculated by the server from your workouts and attendance.</p>
        </div>
      </div>
      <Banner type="error" onClose={() => setError("")}>{error}</Banner>
      <Banner type="success" onClose={() => setSuccess("")}>{success}</Banner>

      <div className="stack">
        <div className="card">
          <h2 className="section-title">New goal</h2>
          <form className="form" onSubmit={create}>
            <label className="form__field">Title<input required value={form.title} onChange={set("title")} /></label>
            <label className="form__field">What should be measured?
              <select value={form.metric} onChange={set("metric")}>
                {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <div className="form__row">
              <label className="form__field">Target value<input type="number" min="0.01" step="any" required value={form.targetValue} onChange={set("targetValue")} /></label>
              <label className="form__field">Target date<input type="date" required value={form.targetDate} onChange={set("targetDate")} /></label>
            </div>
            <div className="form__row">
              <label className="form__field">Unit (optional)<input value={form.unit} onChange={set("unit")} /></label>
              {form.metric === "manual" && (
                <label className="form__field">Current value<input type="number" min="0" step="any" value={form.currentValue} onChange={set("currentValue")} /></label>
              )}
            </div>
            <div><button className="btn btn--primary" type="submit">Create goal</button></div>
          </form>
        </div>

        {isLoading ? (
          <Loader label="Loading goals…" />
        ) : goals.length === 0 ? (
          <EmptyState title="No goals yet" description="Create your first goal above." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Goal</th><th>Progress</th><th>Target date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g._id}>
                    <td>{g.title}<br /><span className="muted">{g.currentValue} / {g.targetValue} {g.unit}</span></td>
                    <td style={{ minWidth: 150 }}><ProgressBar value={g.progress} label={g.title} /><span className="muted">{g.progress}%</span></td>
                    <td>{formatDate(g.targetDate)}</td>
                    <td><StatusBadge status={g.status} /></td>
                    <td>
                      <div className="table-actions">
                        {g.metric === "manual" && g.status === "active" && (
                          <span className="inline-form">
                            <input type="number" min="0" step="any" style={{ width: 90 }} placeholder="value" value={values[g._id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [g._id]: e.target.value }))} />
                            <button className="btn btn--ghost btn--sm" disabled={(values[g._id] ?? "") === ""} onClick={() => saveValue(g)}>Update</button>
                          </span>
                        )}
                        {g.status === "active" && <button className="btn btn--ghost btn--sm" onClick={() => cancel(g)}>Cancel</button>}
                        <button className="btn btn--danger btn--sm" onClick={() => remove(g)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

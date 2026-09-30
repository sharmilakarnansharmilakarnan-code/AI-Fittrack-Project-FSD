import { useState } from "react";
import { Link } from "react-router-dom";
import { aiApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { errorText } from "../utils/format";

export default function Recommendation() {
  const { user } = useAuth();
  const saved = user?.fitnessProfile || {};
  // Empty fields are not sent: the backend then uses the saved fitness profile.
  const [form, setForm] = useState({ age: "", fitnessGoal: "", experienceLevel: "" });
  const [result, setResult] = useState(null);
  const [basedOn, setBasedOn] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setResult(null);
    try {
      const payload = {};
      if (form.age !== "") payload.age = Number(form.age);
      if (form.fitnessGoal) payload.fitnessGoal = form.fitnessGoal;
      if (form.experienceLevel) payload.experienceLevel = form.experienceLevel;
      const res = await aiApi.recommendation(payload);
      setResult(res.data.data.recommendation);
      setBasedOn(res.data.data.basedOn);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>AI workout recommendation</h1>
          <p className="page-header__subtitle">
            A personalized plan from Google Gemini, based on your fitness profile, goals, recent workouts and progress.
            Leave a field empty to use the value saved in your <Link to="/profile">profile</Link>.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <form className="form" onSubmit={handleSubmit}>
          {error && <Banner type="error" onClose={() => setError("")}>{error}</Banner>}
          <div className="form__row">
            <label className="form__field">
              <span>Age</span>
              <input type="number" min="10" max="100" step="1" value={form.age} onChange={handleChange("age")} placeholder={saved.age ? `${saved.age} (saved)` : "22"} />
            </label>
            <label className="form__field">
              <span>Experience level</span>
              <select value={form.experienceLevel} onChange={handleChange("experienceLevel")}>
                <option value="">{saved.experienceLevel ? `${saved.experienceLevel} (saved)` : "Not set"}</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
          </div>
          <label className="form__field">
            <span>Fitness goal</span>
            <select value={form.fitnessGoal} onChange={handleChange("fitnessGoal")}>
              <option value="">{saved.fitnessGoal ? `${saved.fitnessGoal} (saved)` : "Not set"}</option>
              <option>Weight Loss</option>
              <option>Muscle Gain</option>
              <option>Endurance</option>
              <option>General Fitness</option>
              <option>Flexibility</option>
            </select>
          </label>
          <button type="submit" className="btn btn--primary" disabled={isLoading}>
            {isLoading ? "Generating…" : "Generate recommendation"}
          </button>
        </form>
      </div>

      {isLoading && <Loader label="Gemini is building your plan…" />}

      {!isLoading && !result && !error && (
        <EmptyState title="No recommendation yet" description="Generate a personalized workout plan from your profile, goals and workouts." />
      )}

      {result && (
        <div className="card">
          {basedOn && <p className="muted">Based on your last {basedOn.recentWorkouts} workout(s) and {basedOn.activeGoals} active goal(s).</p>}
          <div className="ai-block">
            <h3>Overview</h3>
            <p>{result.workoutPlan?.overview}</p>
            {result.workoutPlan?.durationWeeks && (
              <p style={{ marginTop: 6 }}>
                <span className="badge">{result.workoutPlan.durationWeeks}-week plan</span>
              </p>
            )}
          </div>

          {Array.isArray(result.weeklySchedule) && result.weeklySchedule.length > 0 && (
            <div className="ai-block">
              <h3>Weekly schedule</h3>
              <div className="schedule-grid">
                {result.weeklySchedule.map((day, i) => (
                  <div className="schedule-day" key={i}>
                    <div className="schedule-day__head">
                      <span>{day.day}</span>
                      <span className="schedule-day__focus">{day.focus}</span>
                    </div>
                    {Array.isArray(day.exercises) && (
                      <ul>
                        {day.exercises.map((ex, j) => <li key={j}>{ex}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(result.suitableExercises) && result.suitableExercises.length > 0 && (
            <div className="ai-block">
              <h3>Suitable exercises</h3>
              <ul>{result.suitableExercises.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}

          {Array.isArray(result.trainingTips) && result.trainingTips.length > 0 && (
            <div className="ai-block">
              <h3>Training tips</h3>
              <ul>{result.trainingTips.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}

          {Array.isArray(result.safetyRecommendations) && result.safetyRecommendations.length > 0 && (
            <div className="ai-block">
              <h3>Safety recommendations</h3>
              <ul>{result.safetyRecommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}

          {result.motivationalMessage && (
            <div className="ai-block">
              <h3>Keep going</h3>
              <p>{result.motivationalMessage}</p>
            </div>
          )}

          {result.disclaimer && <p className="disclaimer">{result.disclaimer}</p>}
        </div>
      )}
    </Layout>
  );
}

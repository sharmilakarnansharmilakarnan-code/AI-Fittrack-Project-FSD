import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { aiApi, progressApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import StatCard from "../components/StatCard";
import { errorText } from "../utils/format";

const NO_WORKOUTS_MESSAGE =
  "No workout history is available yet. Add your first workout to receive personalized AI fitness insights.";

export default function FitnessInsights() {
  // { totalWorkouts, averageWorkoutDuration, totalCaloriesBurned } - same three numbers the AI receives
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  // Show the current statistics right away, using the existing progress API.
  useEffect(() => {
    progressApi
      .summary()
      .then((res) => {
        const totals = res.data.data.summary.totals;
        setStats({
          totalWorkouts: totals.workouts,
          averageWorkoutDuration: totals.averageDuration,
          totalCaloriesBurned: totals.totalCalories,
        });
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setIsLoadingStats(false));
  }, []);

  const handleGenerate = async () => {
    if (isGenerating) return; // no duplicate requests while one is running
    setError("");
    setInsights(null);
    setIsGenerating(true);
    try {
      const res = await aiApi.fitnessInsights();
      const { statistics, insights: result } = res.data.data;
      setStats(statistics); // show exactly the numbers the AI analysed
      setInsights(result); // null when the user has no workouts
    } catch (err) {
      setError(errorText(err)); // e.g. "AI service is temporarily busy. Please try again in a moment."
    } finally {
      setIsGenerating(false);
    }
  };

  const hasNoWorkouts = stats !== null && stats.totalWorkouts === 0;

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>AI Fitness Insights</h1>
          <p className="page-header__subtitle">AI-powered analysis of your workout progress using Google Gemini.</p>
        </div>
      </div>

      <Banner type="error" onClose={() => setError("")}>{error}</Banner>

      {isLoadingStats ? (
        <Loader label="Loading your statistics…" />
      ) : (
        <>
          {stats && (
            <div className="stats-grid">
              <StatCard label="Total Workouts" value={stats.totalWorkouts} accent />
              <StatCard label="Average Workout Duration" value={stats.averageWorkoutDuration} unit="min" />
              <StatCard label="Total Calories Burned" value={stats.totalCaloriesBurned} unit="kcal" />
            </div>
          )}

          {hasNoWorkouts ? (
            <EmptyState
              title="No workouts yet"
              description={NO_WORKOUTS_MESSAGE}
              action={<Link to="/workouts/new" className="btn btn--primary btn--sm">Add your first workout</Link>}
            />
          ) : (
            <div className="insights-actions">
              <button type="button" className="btn btn--primary" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating…" : "Generate AI Insights"}
              </button>
              <span className="muted">Analyses your totals, recent workouts, fitness goal and experience level.</span>
            </div>
          )}

          {isGenerating && <Loader label="Gemini is analysing your progress…" />}

          {!isGenerating && !hasNoWorkouts && stats && !insights && !error && (
            <EmptyState title="No insights yet" description="Click “Generate AI Insights” to get your personalized analysis." />
          )}

          {insights && (
            <>
              <div className="insights-grid">
                <div className="card">
                  <h2 className="section-title">Performance Analysis</h2>
                  <p>{insights.performanceAnalysis}</p>
                </div>

                <div className="card">
                  <h2 className="section-title">Improvement Suggestions</h2>
                  <ul>
                    {insights.improvementSuggestions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <h2 className="section-title">Motivational Advice</h2>
                  <p>{insights.motivationalAdvice}</p>
                </div>

                <div className="card">
                  <h2 className="section-title">Fitness Progress Summary</h2>
                  <p>{insights.fitnessProgressSummary}</p>
                </div>
              </div>
              <p className="disclaimer">
                AI-generated general fitness guidance, not medical advice. Consult a doctor or certified professional if you have health concerns.
              </p>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

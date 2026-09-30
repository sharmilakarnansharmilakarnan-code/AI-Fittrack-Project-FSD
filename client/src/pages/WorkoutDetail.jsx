import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { workoutApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import Banner from "../components/Banner";

const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    workoutApi
      .getById(id)
      .then((res) => { if (isMounted) setWorkout(res.data.data.workout); })
      .catch((err) => { if (isMounted) setError(err.message); })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${workout.workoutName}"? This cannot be undone.`)) return;
    try {
      await workoutApi.remove(id);
      navigate("/workouts");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Workout details</h1>
          <p className="page-header__subtitle"><Link to="/workouts" className="link-btn">← Back to workout log</Link></p>
        </div>
      </div>

      <Banner type="error">{error}</Banner>

      {isLoading ? (
        <Loader label="Loading workout…" />
      ) : workout ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2>{workout.workoutName}</h2>
              <span className="badge">{workout.category}</span>
            </div>
            <div className="table-actions">
              <Link to={`/workouts/${id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
              <button className="btn btn--danger btn--sm" onClick={handleDelete}>Delete</button>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-card__label">Duration</span>
              <span className="stat-card__value numeral">{workout.duration}<span className="stat-card__unit">min</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Calories burned</span>
              <span className="stat-card__value numeral">{workout.caloriesBurned}<span className="stat-card__unit">kcal</span></span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Date</span>
              <span className="stat-card__value" style={{ fontSize: 18 }}>{formatDate(workout.workoutDate)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

import { useNavigate } from "react-router-dom";
import { workoutApi } from "../api/endpoints";
import Layout from "../components/Layout";
import WorkoutForm from "../components/WorkoutForm";

export default function AddWorkout() {
  const navigate = useNavigate();

  const handleSubmit = async (payload) => {
    await workoutApi.create(payload);
    navigate("/workouts");
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Add workout</h1>
          <p className="page-header__subtitle">Log a session to keep your training history up to date.</p>
        </div>
      </div>
      <div className="card">
        <WorkoutForm onSubmit={handleSubmit} submitLabel="Add workout" />
      </div>
    </Layout>
  );
}

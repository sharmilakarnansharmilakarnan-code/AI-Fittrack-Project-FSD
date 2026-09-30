import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { workoutApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Loader from "../components/Loader";
import Banner from "../components/Banner";
import WorkoutForm from "../components/WorkoutForm";

export default function EditWorkout() {
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

  const handleSubmit = async (payload) => {
    await workoutApi.update(id, payload);
    navigate(`/workouts/${id}`);
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Edit workout</h1>
          <p className="page-header__subtitle">Update the details of this session.</p>
        </div>
      </div>

      <Banner type="error">{error}</Banner>

      {isLoading ? (
        <Loader label="Loading workout…" />
      ) : workout ? (
        <div className="card">
          <WorkoutForm initialValues={workout} onSubmit={handleSubmit} submitLabel="Save changes" />
        </div>
      ) : null}
    </Layout>
  );
}

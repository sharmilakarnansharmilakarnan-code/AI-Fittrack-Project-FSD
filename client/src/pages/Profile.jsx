import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/endpoints";
import Layout from "../components/Layout";
import Banner from "../components/Banner";
import { useAuth } from "../context/AuthContext";
import { errorText, formatDate } from "../utils/format";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const toForm = (user) => ({
  name: user?.name || "",
  age: user?.fitnessProfile?.age ?? "",
  heightCm: user?.fitnessProfile?.heightCm ?? "",
  weightKg: user?.fitnessProfile?.weightKg ?? "",
  experienceLevel: user?.fitnessProfile?.experienceLevel || "",
  fitnessGoal: user?.fitnessProfile?.fitnessGoal || "",
});

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(toForm(user));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(user));
  }, [user]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Only fields that have a value are sent; the backend validates them and calculates nothing here.
  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const payload = {};
    if (form.name.trim()) payload.name = form.name.trim();
    ["age", "heightCm", "weightKg"].forEach((k) => {
      if (form[k] !== "") payload[k] = Number(form[k]);
    });
    if (form.experienceLevel) payload.experienceLevel = form.experienceLevel;
    if (form.fitnessGoal.trim()) payload.fitnessGoal = form.fitnessGoal.trim();

    setIsSaving(true);
    try {
      const res = await authApi.updateProfile(payload);
      setUser(res.data.data.user);
      localStorage.setItem("fittrack_user", JSON.stringify(res.data.data.user));
      setSuccess("Profile saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p className="page-header__subtitle">Your account and the fitness information used for AI recommendations.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <p className="muted" style={{ marginBottom: 16 }}>
          {user?.email} · role: {user?.role} · member since {user?.createdAt ? formatDate(user.createdAt) : "-"}
        </p>
        <Banner type="error" onClose={() => setError("")}>{error}</Banner>
        <Banner type="success" onClose={() => setSuccess("")}>{success}</Banner>

        <form className="form" onSubmit={save}>
          <label className="form__field">Name<input value={form.name} onChange={set("name")} required minLength={2} maxLength={60} /></label>
          <div className="form__row">
            <label className="form__field">Age<input type="number" min="10" max="100" step="1" value={form.age} onChange={set("age")} /></label>
            <label className="form__field">Experience level
              <select value={form.experienceLevel} onChange={set("experienceLevel")}>
                <option value="">Not set</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="form__row">
            <label className="form__field">Height (cm)<input type="number" min="50" max="260" step="any" value={form.heightCm} onChange={set("heightCm")} /></label>
            <label className="form__field">Weight (kg)<input type="number" min="20" max="400" step="any" value={form.weightKg} onChange={set("weightKg")} /></label>
          </div>
          <label className="form__field">Fitness goal<input value={form.fitnessGoal} onChange={set("fitnessGoal")} placeholder="e.g. Weight loss, Build muscle, Endurance" maxLength={100} /></label>
          <div><button className="btn btn--primary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save profile"}</button></div>
        </form>

        <button className="btn btn--danger" style={{ marginTop: 24 }} onClick={handleLogout}>Log out</button>
      </div>
    </Layout>
  );
}

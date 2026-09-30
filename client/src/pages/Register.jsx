import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Banner from "../components/Banner";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate("/");
    } catch (err) {
      setError((err.errors && err.errors.join(" ")) || err.message || "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__brand">
          <span className="sidebar__brand-mark">FT</span>
          <span className="sidebar__brand-name">AI FitTrack</span>
        </div>
        <h1>Create your account</h1>
        <p className="auth-card__subtitle">Start logging workouts and get AI-powered guidance.</p>

        <Banner type="error">{error}</Banner>

        <form className="form" onSubmit={handleSubmit}>
          <label className="form__field">
            <span>Name</span>
            <input type="text" value={form.name} onChange={handleChange("name")} placeholder="Rahul Sharma" required />
          </label>
          <label className="form__field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={handleChange("email")} placeholder="you@example.com" required />
          </label>
          <label className="form__field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={handleChange("password")}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="auth-card__footer">
          Already have an account? <Link to="/login" className="link-btn">Log in</Link>
        </div>
      </div>
    </div>
  );
}

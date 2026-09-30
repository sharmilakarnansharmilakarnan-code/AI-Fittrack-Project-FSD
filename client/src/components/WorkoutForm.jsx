import { useState } from "react";

const CATEGORIES = ["Cardio", "Strength", "Flexibility", "Balance", "Sports", "HIIT", "Yoga", "Other"];

const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export default function WorkoutForm({ initialValues, onSubmit, submitLabel = "Save workout" }) {
  const [values, setValues] = useState({
    workoutName: initialValues?.workoutName || "",
    category: initialValues?.category || CATEGORIES[0],
    duration: initialValues?.duration ?? "",
    caloriesBurned: initialValues?.caloriesBurned ?? "",
    workoutDate: toDateInput(initialValues?.workoutDate) || new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (e) => {
    setValues((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);
    setIsSubmitting(true);
    try {
      await onSubmit({
        workoutName: values.workoutName.trim(),
        category: values.category,
        duration: Number(values.duration),
        caloriesBurned: Number(values.caloriesBurned),
        workoutDate: values.workoutDate,
      });
    } catch (err) {
      setErrors(err.errors && err.errors.length ? err.errors : [err.message]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      {errors.length > 0 && (
        <div className="banner banner--error" role="alert">
          <ul>
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form__row">
        <label className="form__field">
          <span>Workout name</span>
          <input
            type="text"
            value={values.workoutName}
            onChange={handleChange("workoutName")}
            placeholder="e.g. Morning Running"
            required
          />
        </label>

        <label className="form__field">
          <span>Category</span>
          <select value={values.category} onChange={handleChange("category")}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form__row">
        <label className="form__field">
          <span>Duration (minutes)</span>
          <input
            type="number"
            min="1"
            value={values.duration}
            onChange={handleChange("duration")}
            placeholder="30"
            required
          />
        </label>

        <label className="form__field">
          <span>Calories burned</span>
          <input
            type="number"
            min="0"
            value={values.caloriesBurned}
            onChange={handleChange("caloriesBurned")}
            placeholder="250"
            required
          />
        </label>
      </div>

      <div className="form__row">
        <label className="form__field">
          <span>Workout date</span>
          <input type="date" value={values.workoutDate} onChange={handleChange("workoutDate")} required />
        </label>
      </div>

      <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

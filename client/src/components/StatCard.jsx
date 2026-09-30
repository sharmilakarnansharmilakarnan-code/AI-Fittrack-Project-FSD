export default function StatCard({ label, value, unit, accent = false }) {
  return (
    <div className={`stat-card ${accent ? "stat-card--accent" : ""}`}>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value numeral">
        {value}
        {unit && <span className="stat-card__unit">{unit}</span>}
      </span>
    </div>
  );
}

export default function ProgressBar({ value = 0, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

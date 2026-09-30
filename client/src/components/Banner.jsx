export default function Banner({ type = "info", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`banner banner--${type}`} role={type === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="banner__close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

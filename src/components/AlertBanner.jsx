export default function AlertBanner({ message, error, onClose }) {
  if (!message && !error) return null;

  return (
    <div className={`alert ${error ? "alert-error" : "alert-success"} glass`}>
      <div className="alert-row">
        <span>{error || message}</span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
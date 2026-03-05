import { useToast } from "../contexts/ToastContext";

export default function ToastViewport() {
  const { toasts, remove } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type} glass`}>
          <div className="toast-head">
            <strong>{t.title}</strong>
            <button className="btn btn-ghost btn-icon" onClick={() => remove(t.id)} title="Close">
              ✕
            </button>
          </div>
          <div className="toast-body">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
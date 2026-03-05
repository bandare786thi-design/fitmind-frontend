import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = uid();
    const t = {
      id,
      type: toast.type || "info", // info | success | error | warn
      title: toast.title || "",
      message: toast.message || "",
      durationMs: toast.durationMs ?? 3500
    };

    setToasts((prev) => [t, ...prev].slice(0, 4));

    if (t.durationMs > 0) {
      setTimeout(() => remove(id), t.durationMs);
    }

    return id;
  }, [remove]);

  const api = useMemo(
    () => ({
      toasts,
      remove,
      push,
      success: (message, title = "Success") => push({ type: "success", title, message }),
      error: (message, title = "Error") => push({ type: "error", title, message }),
      info: (message, title = "Info") => push({ type: "info", title, message }),
      warn: (message, title = "Warning") => push({ type: "warn", title, message })
    }),
    [toasts, remove, push]
  );

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
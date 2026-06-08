import { createContext, useCallback, useContext, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTriangleExclamation, faInfo } from "@fortawesome/free-solid-svg-icons";
const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", duration = 3200) => {
      const id = ++idCounter;
      setToasts((list) => [...list, { id, message, type }]);
      if (duration > 0) setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  const api = {
    show: push,
    success: (m, d) => push(m, "success", d),
    error: (m, d) => push(m, "error", d ?? 4500),
    info: (m, d) => push(m, "info", d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => remove(t.id)}>
            <span className="toast-icon">
                {t.type === "success" ? <FontAwesomeIcon icon={faCheck} /> : t.type === "error" ? <FontAwesomeIcon icon={faTriangleExclamation} /> : <FontAwesomeIcon icon={faCat} />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

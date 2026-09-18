import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Suspense fallback for lazy modals. Waits briefly so fast loads don't flash. */
export default function LoadingFallback({ delay = 150 }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  if (!show) return null;
  return (
    <div className="chunk-loading" role="status" aria-live="polite">
      <span className="chunk-spinner" aria-hidden="true" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

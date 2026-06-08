import { useEffect, useState } from "react";
import { bootstrapAnalytics } from "../analytics";
import ConsentBanner from "./ConsentBanner";

/** Boots GA4 when consent was already granted; otherwise shows the consent banner. */
export default function AnalyticsGate({ children }) {
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    const { needsConsent: show } = bootstrapAnalytics();
    setNeedsConsent(show);
  }, []);

  return (
    <>
      {children}
      {needsConsent && <ConsentBanner />}
    </>
  );
}

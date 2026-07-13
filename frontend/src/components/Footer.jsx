import { useTranslation } from "react-i18next";

const SITE_URL = "https://drytrix.com";
const GITHUB_URL = "https://github.com/DRYTRIX/CatMap";

/** Attribution strip below the map (in document flow — does not overlay the map). */
export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          {t("footer.by")}{" "}
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
            DRYTRIX
          </a>
        </span>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          {t("footer.github")}
        </a>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <a href="/privacy.html">{t("footer.privacy")}</a>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <span className="site-footer-privacy">{t("footer.analytics")}</span>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <span>
          {t("footer.mapCopyright")}{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>
        </span>
      </div>
    </footer>
  );
}

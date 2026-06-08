const SITE_URL = "https://drytrix.com";
const GITHUB_URL = "https://github.com/DRYTRIX/CatMap";

/** Attribution strip below the map (in document flow — does not overlay the map). */
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>
          CatMap by{" "}
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
            DRYTRIX
          </a>
        </span>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <span className="site-footer-sep" aria-hidden="true">
          ·
        </span>
        <span>
          Map ©{" "}
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

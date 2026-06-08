/** Slim attribution strip beneath the map. */
export default function Footer() {
  return (
    <footer className="site-footer">
      <span>
        Map data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        contributors · Geocoding by Nominatim
      </span>
    </footer>
  );
}

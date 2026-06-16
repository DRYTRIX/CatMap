import { useCallback, useEffect, useState } from "react";
import { assetUrl, fetchMine, fetchRecent } from "../api";
import { track } from "../analytics";
import { timeAgo } from "../lib/time";
import Modal from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const PAGE = 20;

const TABS = [
  { id: "recent", label: "Recent" },
  { id: "confirmed", label: "Most confirmed" },
  { id: "mine", label: "My cats" },
];

/**
 * Slide-up browse panel: feed of sightings (recent / most-confirmed) plus the
 * device's own cats. Selecting a card opens the existing SightingSheet.
 */
export default function SightingList({ onClose, onSelect }) {
  const [tab, setTab] = useState("recent");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const loadPage = useCallback(
    async (currentTab, offset) => {
      setLoading(true);
      setError(null);
      try {
        let rows;
        if (currentTab === "mine") {
          rows = await fetchMine();
          setDone(true);
        } else {
          rows = await fetchRecent({ limit: PAGE, offset, sort: currentTab });
          setDone(rows.length < PAGE);
        }
        setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Reset and load whenever the tab changes.
  useEffect(() => {
    track("list_view", { tab });
    setItems([]);
    setDone(false);
    loadPage(tab, 0);
  }, [tab, loadPage]);

  return (
    <Modal onClose={onClose} labelledBy="list-title" className="sheet list-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="wizard-head">
        <h2 id="list-title">🐾 Browse cats</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="list-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`list-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      <div className="list-scroll">
        {items.length === 0 && !loading && !error && (
          <p className="hint">
            {tab === "mine" ? "You haven't added any cats yet." : "No cats yet."}
          </p>
        )}

        <ul className="list-items">
          {items.map((s) => (
            <li key={s.id}>
              <button
                className="list-card"
                onClick={() => {
                  track("list_select", { tab });
                  onSelect(s.id);
                }}
              >
                <img
                  className="list-card-img"
                  src={assetUrl(s.thumbnail_url)}
                  alt=""
                  loading="lazy"
                />
                <div className="list-card-body">
                  <p className="list-card-desc">
                    {s.description || <em>A cat was spotted</em>}
                  </p>
                  <p className="list-card-meta">
                    🐱 {timeAgo(s.created_at)} · {s.confirmations_count} confirmed
                    {s.stale && " · may be outdated"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {loading && <p className="hint">Loading…</p>}
        {!loading && !done && items.length > 0 && (
          <button
            className="btn btn-ghost btn-block"
            onClick={() => loadPage(tab, items.length)}
          >
            Load more
          </button>
        )}
      </div>
    </Modal>
  );
}

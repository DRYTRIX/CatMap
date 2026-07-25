import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../analytics";
import { geocode } from "../api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
/** Place search using OpenStreetMap Nominatim. Flies the map on selection. */
export default function SearchBar({ map }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timerRef.current);
    if (q.length < 3) {
      setResults([]);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const data = await geocode(q, controller.signal);
        setResults(data);
        setActiveIndex(-1);
        setOpen(true);
        track("search", { result_count: data.length });
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function choose(r) {
    track("search_select", { has_bounds: Boolean(r.boundingbox) });
    setQuery(r.display_name.split(",")[0]);
    setOpen(false);
    setResults([]);
    if (!map) return;
    if (r.boundingbox) {
      const [s, n, w, e] = r.boundingbox.map(Number);
      map.fitBounds([
        [s, w],
        [n, e],
      ]);
    } else {
      map.setView([Number(r.lat), Number(r.lon)], 14);
    }
  }

  return (
    <div className="search" ref={boxRef}>
      <span className="search-icon" aria-hidden="true">
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </span>
      <input
        type="search"
        className="search-input"
        placeholder={t("search.placeholder")}
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="search-results-list"
        aria-activedescendant={
          activeIndex >= 0 ? `search-result-${activeIndex}` : undefined
        }
        aria-label={t("search.ariaLabel")}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {loading && <span className="search-spinner" aria-hidden="true" />}
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox" id="search-results-list">
          {results.map((r, i) => (
            <li key={r.place_id}>
              <button
                type="button"
                id={`search-result-${i}`}
                className={`search-result ${i === activeIndex ? "is-active" : ""}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => choose(r)}
              >
                <span className="search-result-name">
                  {r.display_name.split(",")[0]}
                </span>
                <span className="search-result-sub">
                  {r.display_name.split(",").slice(1).join(",").trim()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { geocode } from "../api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
/** Place search using OpenStreetMap Nominatim. Flies the map on selection. */
export default function SearchBar({ map }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    clearTimeout(timerRef.current);
    if (q.length < 3) {
      setResults([]);
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
        setOpen(true);
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

  function choose(r) {
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
        placeholder="Search a place…"
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Search for a place"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {loading && <span className="search-spinner" aria-hidden="true" />}
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                className="search-result"
                role="option"
                aria-selected="false"
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

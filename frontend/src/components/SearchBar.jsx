import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { track } from "../analytics";
import { fetchRecent, geocode } from "../api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

/** Combined place + cat search. Flies the map or opens a sighting. */
export default function SearchBar({ map, onSelectSighting }) {
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
    if (q.length < 2) {
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
        const [places, cats] = await Promise.all([
          q.length >= 3
            ? geocode(q, controller.signal).catch(() => [])
            : Promise.resolve([]),
          fetchRecent(
            {
              limit: 20,
              q,
              status: "active",
              ...(map
                ? {
                    near_lat: map.getCenter().lat,
                    near_lng: map.getCenter().lng,
                    radius_km: 500,
                  }
                : {}),
            },
            controller.signal
          ).catch(() => []),
        ]);
        const combined = [
          ...cats.map((c) => ({
            type: "cat",
            id: c.id,
            title: c.cat_name || c.description || t("common.catSighting"),
            sub: c.kind === "missing" ? t("sighting.missingBadge") : t("common.catSighting"),
            lat: c.lat,
            lng: c.lng,
          })),
          ...places.map((r) => ({
            type: "place",
            id: r.place_id,
            title: r.display_name.split(",")[0],
            sub: r.display_name.split(",").slice(1).join(",").trim(),
            lat: Number(r.lat),
            lng: Number(r.lon),
            boundingbox: r.boundingbox,
          })),
        ];
        setResults(combined);
        setActiveIndex(-1);
        setOpen(true);
        track("search", { result_count: combined.length });
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [query, t, map]);

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
    track("search_select", { type: r.type });
    setQuery(r.title);
    setOpen(false);
    setResults([]);
    if (r.type === "cat") {
      onSelectSighting?.(r.id);
      if (map && r.lat != null) map.setView([r.lat, r.lng], 16);
      return;
    }
    if (!map) return;
    if (r.boundingbox) {
      const [s, n, w, e] = r.boundingbox.map(Number);
      map.fitBounds([
        [s, w],
        [n, e],
      ]);
    } else {
      map.setView([r.lat, r.lng], 14);
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
            <li key={`${r.type}-${r.id}`}>
              <button
                type="button"
                id={`search-result-${i}`}
                className={`search-result ${i === activeIndex ? "is-active" : ""}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => choose(r)}
              >
                <span className="search-result-name">{r.title}</span>
                <span className="search-result-sub">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

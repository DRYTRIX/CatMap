import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCat, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  assetUrl,
  fetchCats,
  fetchMergeSuggestions,
  respondMergeSuggestion,
  suggestCatMerge,
} from "../api";
import Modal from "./Modal";
import { useToast } from "./Toast";

/**
 * "Same cat?" — suggest that another profile is this cat, and (for the owner)
 * answer pending suggestions. Both owners must approve before profiles merge.
 *
 * Props: catId, isMine, onChanged() (reload this profile), onMovedTo(catId)
 * (this profile was merged away — open the surviving one).
 */
export default function MergeSuggestions({ catId, isMine, onChanged, onMovedTo }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isMine) return undefined;
    const controller = new AbortController();
    fetchMergeSuggestions(catId, controller.signal)
      .then(setPending)
      .catch(() => {});
    return () => controller.abort();
  }, [catId, isMine]);

  useEffect(() => {
    if (!picking) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchCats({ q: query.trim() || undefined, limit: 20 }, controller.signal)
        .then((rows) => setResults(rows.filter((c) => c.id !== catId)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [picking, query, catId]);

  function afterMerge(res) {
    if (res.merged) {
      toast.success(t("merge.merged"));
      if (res.into_cat_id !== catId) onMovedTo?.(res.into_cat_id);
      else onChanged?.();
    }
  }

  async function suggest(fromId) {
    setBusy(true);
    try {
      const res = await suggestCatMerge(catId, fromId);
      setPicking(false);
      if (res.merged) afterMerge(res);
      else toast.success(t("merge.sent"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function respond(s, accept) {
    setBusy(true);
    try {
      const res = await respondMergeSuggestion(s.id, accept);
      const done = !accept || res.merged;
      setPending((rows) =>
        done ? rows.filter((r) => r.id !== s.id) : rows.map((r) => (r.id === s.id ? res : r))
      );
      if (!accept) toast.success(t("merge.rejected"));
      else if (res.merged) afterMerge(res);
      else toast.success(t("merge.approved"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="merge-section">
      {pending
        .filter((s) => s.can_respond)
        .map((s) => {
          const other = s.into_cat_id === catId ? s.from_name : s.into_name;
          return (
            <div className="draft-banner" role="status" key={s.id}>
              <span>{t("merge.pending", { name: other || t("merge.unnamed") })}</span>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => respond(s, true)}>
                {t("merge.accept")}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => respond(s, false)}>
                {t("merge.reject")}
              </button>
            </div>
          );
        })}

      <button type="button" className="btn btn-ghost btn-block" onClick={() => setPicking(true)}>
        <FontAwesomeIcon icon={faCat} /> {t("merge.button")}
      </button>

      {picking && (
        <Modal onClose={() => setPicking(false)} labelledBy="merge-title" className="sheet">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="wizard-head">
            <h2 id="merge-title">{t("merge.title")}</h2>
            <button className="icon-btn" aria-label={t("common.close")} onClick={() => setPicking(false)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <p className="hint">{t("merge.hint")}</p>
          <input
            type="search"
            value={query}
            placeholder={t("merge.search")}
            aria-label={t("merge.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results && results.length === 0 && <p className="hint">{t("merge.none")}</p>}
          <div className="sighting-list" role="list">
            {(results || []).map((c) => (
              <button
                key={c.id}
                type="button"
                className="sighting-list-item"
                role="listitem"
                disabled={busy}
                onClick={() => suggest(c.id)}
              >
                {c.thumbnail_url && (
                  <img className="sighting-list-thumb" src={assetUrl(c.thumbnail_url)} alt="" loading="lazy" />
                )}
                <div className="sighting-list-body">
                  <p className="sighting-list-desc">{c.name || t("merge.unnamed")}</p>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

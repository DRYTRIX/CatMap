import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import i18n, { STORAGE_KEY } from "../i18n";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

/** Compact globe menu in the header — matches theme-toggle styling. */
export default function LanguageSwitcher() {
  const { t, i18n: i18nInstance } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = i18nInstance.language?.split("-")[0] || "en";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function changeLanguage(code) {
    i18n.changeLanguage(code);
    localStorage.setItem(STORAGE_KEY, code);
    setOpen(false);
  }

  return (
    <div className="lang-switcher" ref={rootRef}>
      <button
        type="button"
        className="icon-btn lang-switcher-btn"
        aria-label={t("footer.language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FontAwesomeIcon icon={faGlobe} />
        <span className="lang-switcher-code" aria-hidden="true">
          {current.toUpperCase()}
        </span>
      </button>
      {open && (
        <ul className="lang-switcher-menu" role="listbox" aria-label={t("footer.language")}>
          {LANGUAGES.map((lang) => (
            <li key={lang.code} role="none">
              <button
                type="button"
                role="option"
                aria-selected={lang.code === current}
                className={`lang-switcher-opt${lang.code === current ? " is-active" : ""}`}
                onClick={() => changeLanguage(lang.code)}
              >
                {lang.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus within `ref` while `active`, moves initial focus inside,
 * and restores focus to the previously focused element on deactivate.
 */
export function useFocusTrap(ref, active = true) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const node = ref.current;
    previouslyFocused.current = document.activeElement;

    const focusables = () =>
      Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );

    // Move focus inside on open.
    const first = focusables()[0];
    if (first) first.focus();
    else node.focus();

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [ref, active]);
}

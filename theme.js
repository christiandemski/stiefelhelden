// Hell/Dunkel: ohne eigene Wahl folgt die Seite dem System.
// Wird im <head> geladen, damit beim Laden nichts aufblitzt.
(function () {
  const KEY = "stiefel-theme";
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const current = () => stored() || (mq.matches ? "dark" : "light");

  const apply = (t) => {
    document.documentElement.setAttribute("data-bs-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#06052a" : "#f4f5f9";
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
      b.setAttribute("aria-pressed", t === "dark");
      b.setAttribute("aria-label", t === "dark" ? "Hellen Modus einschalten" : "Dunklen Modus einschalten");
    });
  };

  apply(current());
  mq.addEventListener("change", () => { if (!stored()) apply(current()); });
  document.addEventListener("DOMContentLoaded", () => apply(current()));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const t = current() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, t); } catch (err) { /* privat/blockiert: gilt dann nur bis zum Neuladen */ }
    apply(t);
  });
})();

(() => {
  "use strict";

  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cursor = document.querySelector("[data-custom-cursor]");
  if (!cursor || !finePointer.matches || reducedMotion.matches) return;

  const root = document.documentElement;
  root.classList.add("custom-cursor-enabled");
  window.addEventListener("pointermove", event => {
    cursor.style.setProperty("--cursor-x", `${event.clientX}px`);
    cursor.style.setProperty("--cursor-y", `${event.clientY}px`);
    cursor.classList.add("visible");
    cursor.classList.toggle("interactive", Boolean(event.target.closest?.("a, button")));
  }, { passive: true });
  window.addEventListener("pointerdown", () => cursor.classList.add("pressed"));
  window.addEventListener("pointerup", () => cursor.classList.remove("pressed"));
  root.addEventListener("mouseleave", () => cursor.classList.remove("visible"));
})();

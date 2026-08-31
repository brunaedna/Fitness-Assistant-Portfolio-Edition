(function () {
  "use strict";
  const UNANSWERED_KEY = "fitness-assistant-fitness-unanswered-v1";
  const RATINGS_KEY = "fitness-assistant-fitness-ratings-v1";
  const read = key => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const escape = value => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

  let centralReviews = null;
  const date = value => value ? new Date(value).toLocaleString("pt-BR") : "—";

  function currentData() {
    if (!centralReviews) return { unanswered: read(UNANSWERED_KEY), ratings: read(RATINGS_KEY).slice().reverse() };
    return {
      unanswered: centralReviews.filter(item => item.kind === "unanswered"),
      ratings: centralReviews.filter(item => item.kind === "rating").slice().reverse()
    };
  }

  function render() {
    const { unanswered, ratings } = currentData();
    const open = unanswered.filter(item => item.status !== "resolved");
    const positive = ratings.filter(item => item.rating === "up").length;
    document.querySelector("#openCount").textContent = open.length;
    document.querySelector("#negativeCount").textContent = ratings.filter(item => item.rating === "down").length;
    document.querySelector("#positiveRate").textContent = ratings.length ? `${Math.round(positive / ratings.length * 100)}%` : "—";
    document.querySelector("#unansweredEmpty").hidden = open.length > 0;
    document.querySelector("#ratingsEmpty").hidden = ratings.length > 0;
    document.querySelector("#unansweredBody").innerHTML = open.map(item => `<tr><td>${escape(item.question)}</td><td>${escape(item.topic)}</td><td>${escape(item.language)}</td><td>${item.count}</td><td>${escape(item.status)}</td><td>${escape(date(item.createdAt))}</td><td>${centralReviews ? "Somente leitura" : `<button type="button" data-resolve="${escape(item.id)}">Marcar revisada</button>`}</td></tr>`).join("");
    document.querySelector("#ratingsBody").innerHTML = ratings.map(item => `<tr><td class="rating-${item.rating}">${item.rating === "up" ? "Útil" : "Não útil"}</td><td>${escape(item.question)}</td><td>${escape(item.topic)}</td><td>${escape(item.source)}</td><td>${escape(item.confidence)}</td></tr>`).join("");
    document.querySelectorAll("[data-resolve]").forEach(button => button.addEventListener("click", () => {
      const records = read(UNANSWERED_KEY);
      const record = records.find(item => item.id === button.dataset.resolve);
      if (record) { record.status = "resolved"; record.resolvedAt = new Date().toISOString(); write(UNANSWERED_KEY, records); render(); }
    }));
  }

  document.querySelector("#exportData").addEventListener("click", () => {
    const data = currentData();
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), source: centralReviews ? "central" : "local", ...data }, null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    link.download = `fitness-assistant-fitness-quality-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  async function loadCentralQueue() {
    const token = window.FITNESS_ASSISTANT_ADMIN_TOKEN;
    if (!token) { render(); return; }
    try {
      const response = await fetch("/api/admin/reviews", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      centralReviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      document.querySelector("#dataSource").textContent = "Fonte central autenticada (somente leitura)";
    } catch (_) {
      document.querySelector("#dataSource").textContent = "Fonte local; fila central indisponível";
    }
    render();
  }
  loadCentralQueue();
})();


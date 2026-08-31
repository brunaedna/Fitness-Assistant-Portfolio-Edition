/* Browser boundary for the same-origin, server-side Groq/Gemini gateway. No secret is present here. */
(function () {
  "use strict";
  class ServerProvider {
    constructor() { this.name = "server-gateway"; }
    async isAvailable() { return Boolean((await this.healthCheck()).available); }
    async healthCheck() {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Provider status unavailable");
      return response.json();
    }
    async generateResponse(payload) {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const error = new Error(details.error || "External provider unavailable");
        error.status = response.status;
        error.fallback = Boolean(details.fallback);
        throw error;
      }
      return response.json();
    }
    async classifyIntent() { return null; }
    async summarizeContext() { return null; }
  }
  window.FitnessAIProvider = new ServerProvider();
})();


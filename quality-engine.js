/* Offline answer-quality layer: provenance, confidence, feedback and anonymous review queue. */
(function () {
  "use strict";

  const UNANSWERED_KEY = "fitness-assistant-fitness-unanswered-v1";
  const RATINGS_KEY = "fitness-assistant-fitness-ratings-v1";

  const read = key => {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (_) { return []; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value.slice(-500)));
  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const redact = value => String(value || "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:\+?\d[\s().-]*){8,}\b/g, "[telefone]")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|quilos?|cm|m|anos?)\b/gi, "[dado físico]")
    .slice(0, 500);

  function submitCentralReview(kind, payload) {
    if (!window.FitnessConsent?.canImprove?.()) return;
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, improvementConsent: true, payload })
    }).catch(() => {});
  }

  function isGeneric(answer) {
    const t = normalize(answer);
    return /posso ajudar de forma mais especifica|i can help more specifically|ich kann dir gezielt|puedo ayudarte de forma mas especifica/.test(t);
  }

  function followUp(topic, language) {
    const pt = {
      food: ["Quer que eu detalhe as porções em gramas?", "food-grams"],
      nutrition: ["Quer um exemplo aplicado à sua rotina?", "quality-topic-example"],
      calories: ["Quer comparar essa estimativa com seu objetivo?", "quality-calorie-goal"],
      workout: ["Quer adaptar esse treino ao seu equipamento e tempo disponível?", "quality-workout-constraints"],
      "muscle-building": ["Quer uma progressão para as próximas quatro semanas?", "quality-muscle-progression"],
      chest: ["Quer adaptar o treino de peito ao seu nível?", "quality-chest-level"],
      protein: ["Quer dividir essa quantidade entre suas refeições?", "quality-protein-meals"],
      "weight-loss": ["Quer transformar isso em ações para sua semana?", "quality-weight-week"],
      "fat-loss": ["Quer transformar isso em ações para sua semana?", "quality-weight-week"],
      sport: ["Quer encaixar essa sessão no calendário de treinos e jogos?", "quality-sport-calendar"],
      football: ["Quer encaixar essa sessão no calendário de treinos e jogos?", "quality-sport-calendar"],
      recovery: ["Quer que eu relacione isso ao seu treino mais recente?", "quality-recovery-recent"],
      hydration: ["Quer estimar uma faixa usando seu peso e rotina?", "quality-hydration"],
      cravings: ["Quer montar um plano para o gatilho mais comum?", "quality-cravings-plan"]
    };
    if (language !== "pt") return { text: "Would you like me to adapt this to your goal, experience, and available equipment?", action: "quality-deepen" };
    const suggestion = pt[topic] || ["Quer aprofundar algum ponto desta resposta?", "quality-deepen"];
    return { text: suggestion[0], action: suggestion[1] };
  }

  function provenance(state, answer) {
    const artifact = state.lastArtifact || {};
    if (isGeneric(answer)) return { source: "Motor local · resposta de contingência", confidence: "baixa" };
    if (artifact.type === "calorie-estimate") return { source: "Cálculo local · equação de Mifflin–St Jeor", confidence: state.pendingFields?.length ? "média" : "alta" };
    if (artifact.type === "protein-plan") return { source: "Fitness Assistant Portfolio Edition knowledge base · protein", confidence: state.profile?.weightKg ? "alta" : "média" };
    if (artifact.recordId) return { source: `Fitness Assistant Portfolio Edition catalog · ${artifact.recordId}`, confidence: "alta" };
    if (artifact.type === "knowledge") return { source: `Fitness Assistant Portfolio Edition knowledge base · ${artifact.topic || "fitness"}`, confidence: "alta" };
    if (artifact.type) return { source: "Conversation context + Fitness Assistant Portfolio Edition knowledge base", confidence: "média" };
    return { source: "Motor especializado local", confidence: "média" };
  }

  function recordUnanswered(question, language, topic) {
    if (!window.FitnessConsent?.canImprove?.()) return;
    const sanitized = redact(question);
    const signature = normalize(sanitized);
    const records = read(UNANSWERED_KEY);
    const existing = records.find(item => item.signature === signature && item.status !== "resolved");
    if (existing) {
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
    } else {
      records.push({ id: `uq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, signature, question: sanitized, language, topic: topic || "unknown", count: 1, status: "open", firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() });
    }
    write(UNANSWERED_KEY, records);
    submitCentralReview("unanswered", existing || records.at(-1));
  }

  function enrich(response, { question, language, state }) {
    const payload = typeof response === "string" ? { text: response } : { ...response };
    const quality = provenance(state, payload.text);
    const interpretationConfidence = state.lastInterpretation?.confidence;
    if (interpretationConfidence === "insufficient") quality.confidence = "insuficiente";
    else if (interpretationConfidence === "low" && quality.confidence === "alta") quality.confidence = "baixa";
    else if (interpretationConfidence === "medium" && quality.confidence === "alta") quality.confidence = "média";
    const generic = isGeneric(payload.text);
    const suggestion = payload.suppressFollowUp
      ? { text: null, action: null }
      : generic
        ? { text: language === "pt" ? "Qual é seu objetivo principal: treino, alimentação, emagrecimento ou esporte?" : "What is your main goal: training, nutrition, fat loss, or sport?", action: "quality-clarify-domain" }
        : followUp(state.lastTopic || state.lastArtifact?.topic, language);
    if (generic) recordUnanswered(question, language, "unknown");
    return {
      ...payload,
      quality: {
        answerId: `answer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: payload.source || quality.source,
        confidence: payload.confidence || quality.confidence,
        followUp: suggestion.text,
        followUpAction: suggestion.action,
        question: redact(question),
        topic: generic ? "unknown" : (state.lastTopic || "unknown"),
        generic
      }
    };
  }

  function rate(quality, value) {
    if (!quality?.answerId || !["up", "down"].includes(value)) return;
    if (!window.FitnessConsent?.canImprove?.()) return;
    const ratings = read(RATINGS_KEY);
    const existing = ratings.find(item => item.answerId === quality.answerId);
    const entry = { answerId: quality.answerId, rating: value, question: quality.question, topic: quality.topic, source: quality.source, confidence: quality.confidence, updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, entry); else ratings.push(entry);
    write(RATINGS_KEY, ratings);
    submitCentralReview("rating", entry);
  }

  window.FitnessQualityEngine = { enrich, rate, isGeneric, keys: { unanswered: UNANSWERED_KEY, ratings: RATINGS_KEY }, redact };
})();


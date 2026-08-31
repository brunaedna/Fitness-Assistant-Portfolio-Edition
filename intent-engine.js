/* Central offline interpretation pipeline: typo repair, intents, entities, references and confidence. */
(function () {
  "use strict";
  const normalize = value => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9,.?\s-]/g, " ").replace(/\s+/g, " ").trim();
  const repairs = new Map(Object.entries({
    treon: "treino", trieno: "treino", treio: "treino", treinso: "treinos", exrcicio: "exercicio", exercico: "exercicio",
    proteina: "proteina", protiena: "proteina", calroias: "calorias", caloriaas: "calorias", emagreer: "emagrecer",
    hipertofia: "hipertrofia", hpertrofia: "hipertrofia", nutircao: "nutricao", recuparacao: "recuperacao",
    pernaas: "pernas", peit: "peito", peitoral: "peito", halter: "halteres", acadmeia: "academia", imgaens: "imagens"
  }));
  const repair = text => normalize(text).split(" ").map(word => repairs.get(word) || word).join(" ");
  const patterns = {
    workout: /treino|exercicio|musculacao|serie|repeticao/,
    nutrition: /nutricao|alimentacao|comida|refeicao|cardapio|dieta/,
    calories: /caloria|kcal|metabolismo|manutencao/,
    protein: /proteina|whey|aminoacido/,
    recovery: /recuperacao|recuperar|descanso|sono|fadiga|dor muscular|recovery|recover|descanso|recuperacion|erholung|regeneration/,
    sport: /futebol|corrida|ciclismo|natacao|basquete|volei|tenis|esporte/
  };
  function language(t, fallback = "pt") {
    const scores = {
      pt: (t.match(/\b(que|como|quero|treino|para|sem|meu|minha|outra)\b/g) || []).length,
      en: (t.match(/\b(what|how|want|workout|without|my|another|please)\b/g) || []).length,
      es: (t.match(/\b(que|como|quiero|entreno|sin|mi|otra|por favor)\b/g) || []).length,
      de: (t.match(/\b(wie|was|training|ohne|mein|noch|bitte)\b/g) || []).length
    };
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] ? best[0] : fallback;
  }
  function analyze(text, context = {}) {
    const rewritten = repair(text);
    const scored = Object.entries(patterns).map(([intent, pattern]) => [intent, (rewritten.match(new RegExp(pattern.source, "g")) || []).length]).sort((a, b) => b[1] - a[1]);
    const top = scored[0];
    const duration = rewritten.match(/\b(\d{1,3})\s*(?:min|minutes?|minutos?|minuten)\b/) || rewritten.match(/\b(?:meia|uma|1) hora\b|\bhalf an hour\b|\bmedia hora\b|\beine halbe stunde\b/);
    const group = [["legs", /pernas?|gluteos?|panturrilha/], ["chest", /peito/], ["back", /costas/], ["shoulders", /ombros?/], ["arms", /bracos?|biceps|triceps/], ["core", /core|abdomen/], ["full-body", /corpo inteiro/]].find(([, p]) => p.test(rewritten))?.[0] || null;
    const sport = [["football", /futebol/], ["running", /corrida|correr/], ["cycling", /ciclismo|bicicleta/], ["swimming", /natacao|nadar/], ["basketball", /basquete/], ["volleyball", /volei/], ["tennis", /tenis/]].find(([, p]) => p.test(rewritten))?.[0] || null;
    const action = /outr|diferente|alternativa/.test(rewritten) ? "alternative" : /troque|mude|sem |mais facil|mais dificil|so tenho/.test(rewritten) ? "modify" : /continue|explique|detalhe|e depois/.test(rewritten) ? "continue" : /imagem|foto|visual/.test(rewritten) ? "reference" : "request";
    const confidenceScore = Math.min(1, (top?.[1] || 0) * .35 + (group || sport ? .25 : 0) + (action !== "request" ? .15 : 0) + (context.lastTopic ? .1 : 0));
    return {
      original: text, rewritten, language: language(rewritten, context.lastLanguage || "pt"), intent: top?.[1] ? top[0] : null,
      action, entities: { group, sport, durationMinutes: duration ? (/meia hora|half an hour|media hora|halbe stunde/.test(duration[0]) ? 30 : /hora/.test(duration[0]) ? 60 : Number(duration[1])) : null,
        equipment: /sem (?:halter|equipamento)|peso corporal/.test(rewritten) ? "bodyweight" : /halter/.test(rewritten) ? "dumbbells" : /academia|maquina/.test(rewritten) ? "gym" : null },
      referencesPrevious: /^(?:isso|esse|essa|ele|ela|outr|continue|e |mais |sem |troque)/.test(rewritten),
      compound: /\be\b|,/.test(rewritten), confidenceScore, confidence: confidenceScore >= .7 ? "high" : confidenceScore >= .35 ? "medium" : confidenceScore >= .2 ? "low" : "insufficient"
    };
  }
  window.FitnessIntentEngine = { analyze, normalize, repair };
})();


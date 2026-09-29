(function () {
  "use strict";

  function normalize(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function parseDurationMinutes(text) {
    const normalized = normalize(text);
    const minutes = normalized.match(/\b(15|20|25|30|35|40|45|50|60|75|90|120)\s*(?:min|minuto|minutos)\b/);
    if (minutes) return Number(minutes[1]);
    const hours = normalized.match(/\b(uma|1|1[.,]5|2)\s*(?:h|hora|horas)\b(?:\s*e\s*(15|30|45)\s*(?:min|minutos)?)?/);
    if (!hours) return null;
    const base = hours[1] === "uma" ? 1 : Number(hours[1].replace(",", "."));
    return Math.min(120, Math.round(base * 60 + Number(hours[2] || 0)));
  }

  function browserLanguage() {
    const code = String(globalThis.navigator?.language || "en").slice(0, 2).toLowerCase();
    return ["pt", "en", "de", "es"].includes(code) ? code : "en";
  }

  function detectLanguage(text, fallback = browserLanguage()) {
    const normalized = normalize(text);
    if (/answer (only )?in english|respond (only )?in english|responda (apenas )?em ingles/.test(normalized)) return "en";
    if (/responda (apenas )?em portugues|fale (apenas )?em portugues/.test(normalized)) return "pt";
    if (/responde? (?:solo )?en espanol|habla (?:solo )?en espanol/.test(normalized)) return "es";
    if (/antworte? (?:nur )?auf deutsch|sprich (?:nur )?deutsch/.test(normalized)) return "de";

    const scores = {
      pt: (normalized.match(/\b(quanto|quanta|quantos|quantas|como|tenho|tem|preciso|treino|dias|massa|gordura|posso|sem|devo|proteina|perder|ganhar|voce|lembra|qual|idade|altura|peso|calorias|quero|emagrecer|trabalho|sentada|sedentario|sedentaria|feminino|feminina|masculino|masculina|mulher|homem|gere|monte|faca|pernas|peito|costas|bracos|ombros|hoje|exercicios|foto|fotos|imagem|imagens|exemplo|exemplos|meu|minha|melhorar|faz|sentido|antes|depois|estou|dor|vezes|semana|parou|beber|comer|agua|sono|recuperacao|estime|estima|estimar|calcule|calcular|informei|informe|informado|dados|agora|ainda|ja|consumir|diaria|diario|favor|pode|esses|estas|isso|outra|facil|descanso|lista|compras)\b/g) || []).length,
      en: (normalized.match(/\b(how|what|when|where|which|need|want|workout|training|weight|height|age|calories|protein|female|male|sedentary|estimate|calculate|already|provided|data|daily|please|remember|create|make|another|option|meal|structure|shopping|list|only|minutes|without|equipment|easier|rest|days|images|improve|hydration|explain|during|split|four|weigh|have|light)\b/g) || []).length,
      de: (normalized.match(/\b(wie|ich|muskeln|brauche|viel|trainiere|tagen|eiweiss|protein|gewicht|aufbauen|kalorien|berechnen|erstelle|einen|eine|andere|option|ernahrungsplan|trainingsplan|wochentlich|tage|woche|habe|nur|minuten|ohne|gerate|einfacher|lange|pause|bilder|flussigkeitszufuhr|verbessern|erklare|genauer|wahrend|mahlzeiten|wiege|keine|brustschmerzen|leichtes)\b/g) || []).length,
      es: (normalized.match(/\b(cuanta|cuantas|como|tengo|necesito|entreno|entrenamiento|dias|semana|musculo|grasa|puedo|proteina|perder|ganar|calorias|calcular|datos|crea|haz|otra|opcion|estructura|alimentaria|compras|solo|minutos|sin|equipo|facil|descanso|imagenes|mejorar|hidratacion|explica|durante|divide|cuatro|comidas|peso|ligero)\b/g) || []).length,
    };
    const highest = Math.max(...Object.values(scores));
    if (highest === 0) return fallback;
    const leaders = Object.keys(scores).filter((language) => scores[language] === highest);
    return leaders.includes(fallback) ? fallback : leaders[0];
  }

  const routingReplacements = {
    en: [
      [/\b(create|make|build|give me)\b/g, "monte"], [/\bweekly (workout|training) plan\b/g, "plano semanal de treino"],
      [/\bmeal (structure|plan)\b/g, "estrutura alimentar"], [/\bvegetarian\b/g, "vegetariana"], [/\bvegan\b/g, "vegana"],
      [/\banother (option|one)|a different option\b/g, "outra opcao"], [/\bwith more protein\b/g, "com mais proteina"],
      [/\bhow many calories does (it|this) have\b/g, "quantas calorias tem"], [/\bshopping list\b/g, "lista de compras"],
      [/\b(\d+) days per week\b/g, "$1 dias por semana"], [/\bi only have (\d+) minutes\b/g, "so tenho $1 minutos"],
      [/\b(no|without) equipment\b/g, "sem equipamento"], [/\bmake it easier\b|\beasier\b/g, "mais facil"],
      [/\bhow much rest\b/g, "quanto descanso"], [/\bdo you have images\b|\bimages\b/g, "tem imagens"],
      [/\band on rest days\b/g, "e nos dias sem treino"], [/\bwithout whey\b/g, "sem whey"],
      [/\bsplit it into four meals\b/g, "divida em quatro refeicoes"], [/\bexplain it better\b/g, "explique melhor"],
      [/\band during (the )?(workout|training)\b/g, "e durante o treino"], [/\bhydration\b/g, "hidratacao"],
      [/\bi weigh\b/g, "peso"], [/\bhow much protein do i need\b/g, "quanta proteina preciso"],
    ],
    es: [
      [/\b(crea|haz|genera|dame)\b/g, "monte"], [/\bplan semanal de entrenamiento\b/g, "plano semanal de treino"],
      [/\bestructura alimentaria\b|\bplan de comidas\b/g, "estrutura alimentar"], [/\bvegetariana?\b/g, "vegetariana"], [/\bvegana?\b/g, "vegana"],
      [/\botra opcion\b|\botra alternativa\b/g, "outra opcao"], [/\bcon mas proteina\b/g, "com mais proteina"],
      [/\bcuantas calorias tiene\b/g, "quantas calorias tem"], [/\blista de compras\b/g, "lista de compras"],
      [/\b(\d+) dias por semana\b/g, "$1 dias por semana"], [/\bsolo tengo (\d+) minutos\b/g, "so tenho $1 minutos"],
      [/\bsin equipo\b/g, "sem equipamento"], [/\bmas facil\b/g, "mais facil"], [/\bcuanto descanso\b/g, "quanto descanso"],
      [/\btienes imagenes\b|\bimagenes\b/g, "tem imagens"], [/\by en los dias de descanso\b/g, "e nos dias sem treino"],
      [/\bsin whey\b/g, "sem whey"], [/\bdividelo en cuatro comidas\b/g, "divida em quatro refeicoes"],
      [/\bexplicalo mejor\b/g, "explique melhor"], [/\by durante el entrenamiento\b/g, "e durante o treino"],
      [/\bhidratacion\b/g, "hidratacao"], [/\bcuanta proteina necesito\b/g, "quanta proteina preciso"],
    ],
    de: [
      [/\b(erstelle|mach|gib mir)\b/g, "monte"], [/\bwochentlichen trainingsplan\b|\bwochenplan\b/g, "plano semanal de treino"],
      [/\bvegetarischen ernahrungsplan\b|\bernahrungsplan\b/g, "estrutura alimentar vegetariana"], [/\bvegane?n?\b/g, "vegana"],
      [/\beine andere option\b|\bnoch eine option\b/g, "outra opcao"], [/\bmit mehr protein\b/g, "com mais proteina"],
      [/\bwie viele kalorien hat (er|es|dies)\b/g, "quantas calorias tem"], [/\beinkaufsliste\b/g, "lista de compras"],
      [/\b(\d+) tage pro woche\b/g, "$1 dias por semana"], [/\bich habe nur (\d+) minuten\b/g, "so tenho $1 minutos"],
      [/\bohne gerate\b/g, "sem equipamento"], [/\beinfacher\b/g, "mais facil"], [/\bwie lange pause\b/g, "quanto descanso"],
      [/\bhast du bilder\b|\bbilder\b/g, "tem imagens"], [/\bund an trainingsfreien tagen\b/g, "e nos dias sem treino"],
      [/\bohne whey\b/g, "sem whey"], [/\bteile es auf vier mahlzeiten auf\b/g, "divida em quatro refeicoes"],
      [/\berklare es genauer\b/g, "explique melhor"], [/\bund wahrend des trainings\b/g, "e durante o treino"],
      [/\bflussigkeitszufuhr\b/g, "hidratacao"], [/\bwie viel protein brauche ich\b/g, "quanta proteina preciso"],
    ],
  };

  function canonicalizeForRouting(text, language) {
    let normalized = normalize(text);
    if (language === "pt") return normalized;
    for (const [pattern, replacement] of routingReplacements[language] || routingReplacements.de) {
      normalized = normalized.replace(pattern, replacement);
    }
    return normalized.replace(/\s+/g, " ").trim();
  }

  function detectSport(text) {
    const normalized = normalize(text);
    const sports = [
      ["football", /\b(futebol|football|soccer)\b/], ["basketball", /\b(basquete|basketball)\b/],
      ["volleyball", /\b(volei|voleibol|volleyball)\b/], ["swimming", /\b(natacao|nadar|swimming)\b/],
      ["tennis", /\b(tenis|tennis)\b/], ["cycling", /\b(ciclismo|bicicleta|cycling)\b/],
      ["running", /\b(corrida|correr|running)\b/],
    ];
    return sports.find(([, pattern]) => pattern.test(normalized))?.[0] || null;
  }

  window.FitnessConversationUtils = {
    normalize,
    parseDurationMinutes,
    browserLanguage,
    detectLanguage,
    canonicalizeForRouting,
    detectSport,
  };
})();

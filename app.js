(() => {
  "use strict";

  const PROFILE_STORAGE_PREFIX = "fitness-assistant-fitness-profile-v3:";
  const VISITOR_SESSION_KEY = "fitness-assistant-fitness-visitor-v3";
  const UI_LANGUAGE_KEY = "fitness-assistant-ui-language-v1";

  function readUiLanguage() {
    try {
      const language = localStorage.getItem(UI_LANGUAGE_KEY);
      return ["pt", "en"].includes(language) ? language : null;
    } catch (_) {
      return null;
    }
  }

  function initialMessageFor(language) {
    return language === "pt"
      ? "Olá! Sou o Fitness Assistant. Posso ajudar com treino, nutrição, emagrecimento, hipertrofia e desempenho esportivo. O que você quer melhorar hoje?"
      : "Hi! I am your Fitness Assistant. I can help with training, nutrition, weight loss, muscle building, and sports performance. What would you like to improve today?";
  }

  let uiLanguage = readUiLanguage() || browserLanguage();
  if (!["pt", "en"].includes(uiLanguage)) uiLanguage = "en";
  const initialMessage = initialMessageFor(uiLanguage);

  const emptyProfile = () => ({
    name: null,
    preferredLanguage: null,
    age: null,
    heightCm: null,
    weightKg: null,
    sex: null,
    activity: null,
    goal: null,
    targetLossKg: null,
    dietNotes: [],
    allergies: [],
    equipment: null,
    experience: null,
    limitations: [],
    durationMinutes: null,
    trainingDays: null,
    primarySport: null
  });

  function sanitizeProfile(candidate) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const profile = emptyProfile();
    if (typeof source.name === "string" && /^[\p{L}'’ -]{2,31}$/u.test(source.name.trim())) profile.name = source.name.trim();
    if (["pt", "en", "es", "de"].includes(source.preferredLanguage)) profile.preferredLanguage = source.preferredLanguage;
    if (Number.isInteger(source.age) && source.age >= 14 && source.age <= 99) profile.age = source.age;
    if (Number.isFinite(source.heightCm) && source.heightCm >= 130 && source.heightCm <= 220) profile.heightCm = source.heightCm;
    if (Number.isFinite(source.weightKg) && source.weightKg >= 35 && source.weightKg <= 250) profile.weightKg = source.weightKg;
    if (["female", "male"].includes(source.sex)) profile.sex = source.sex;
    if (["sedentary", "light", "moderate", "very-active"].includes(source.activity)) profile.activity = source.activity;
    if (["loss", "muscle"].includes(source.goal)) profile.goal = source.goal;
    if (Number.isFinite(source.targetLossKg) && source.targetLossKg > 0 && source.targetLossKg <= 50) profile.targetLossKg = source.targetLossKg;
    const allowedDietNotes = new Set(["frequent-junk-food", "vegan", "vegetarian", "lactose-free"]);
    profile.dietNotes = Array.isArray(source.dietNotes) ? [...new Set(source.dietNotes.filter(item => allowedDietNotes.has(item)))].slice(0, 12) : [];
    const allowedAllergies = new Set(["peanut", "milk", "egg", "fish", "soy", "gluten"]);
    profile.allergies = Array.isArray(source.allergies) ? [...new Set(source.allergies.filter(item => allowedAllergies.has(item)))].slice(0, 12) : [];
    if (["bodyweight", "dumbbells", "gym", "flexible"].includes(source.equipment)) profile.equipment = source.equipment;
    if (["beginner", "intermediate", "advanced"].includes(source.experience)) profile.experience = source.experience;
    const allowedLimitations = new Set(["knee", "back", "shoulder"]);
    profile.limitations = Array.isArray(source.limitations) ? [...new Set(source.limitations.filter(item => allowedLimitations.has(item)))].slice(0, 8) : [];
    if (Number.isFinite(source.durationMinutes) && source.durationMinutes >= 15 && source.durationMinutes <= 120) profile.durationMinutes = source.durationMinutes;
    if (Number.isInteger(source.trainingDays) && source.trainingDays >= 2 && source.trainingDays <= 6) profile.trainingDays = source.trainingDays;
    if (["football", "running", "basketball", "volleyball", "cycling", "swimming", "tennis"].includes(source.primarySport)) profile.primarySport = source.primarySport;
    return profile;
  }

  function stableId(value) {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function resolveVisitorId() {
    const hostUserId = String(window.FITNESS_ASSISTANT_USER_ID || "").trim();
    const previewProfile = new URLSearchParams(window.location.search).get("profile")?.trim();
    if (hostUserId) return `account-${stableId(hostUserId)}`;
    if (previewProfile) return `preview-${stableId(previewProfile)}`;

    let anonymousId = sessionStorage.getItem(VISITOR_SESSION_KEY);
    if (!anonymousId) {
      anonymousId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      sessionStorage.setItem(VISITOR_SESSION_KEY, anonymousId);
    }
    return `anonymous-${stableId(anonymousId)}`;
  }

  const visitorId = resolveVisitorId();
  const profileStorageKey = `${PROFILE_STORAGE_PREFIX}${visitorId}`;
  const profileSessionKey = `${PROFILE_STORAGE_PREFIX}session:${visitorId}`;
  const consent = window.FitnessConsentManager.create(visitorId);
  window.FitnessConsent = consent;

  const els = {
    modal: document.querySelector("#chatModal"),
    messages: document.querySelector("#messages"),
    form: document.querySelector("#chatForm"),
    input: document.querySelector("#messageInput"),
    send: document.querySelector("#sendButton"),
    managePrivacy: document.querySelector("#managePrivacyButton"),
    deleteData: document.querySelector("#deleteDataButton"),
    close: document.querySelector("#closeChat"),
    reopen: document.querySelector("#reopenChat"),
    languageGate: document.querySelector("#languageGate"),
    languageButton: document.querySelector("#languageButton"),
    languageChoices: [...document.querySelectorAll("[data-language]")],
    howItWorks: document.querySelector("#howItWorksButton"),
    projectInfo: document.querySelector("#projectInfoOverlay"),
    closeProjectInfo: document.querySelector("#closeProjectInfo"),
    chips: [...document.querySelectorAll(".quick-chips button")]
  };

  const state = loadState();
  let isLoading = false;
  let privacyWizardStep = null;
  let externalAI = { available: false, providers: [], order: [] };

  function loadState() {
    let profile = emptyProfile();
    try {
      const storage = consent.canPersistProfile() ? localStorage : sessionStorage;
      const key = consent.canPersistProfile() ? profileStorageKey : profileSessionKey;
      const storedProfile = JSON.parse(storage.getItem(key));
      if (storedProfile && typeof storedProfile === "object") {
        if (storedProfile._privacy?.expiresAt && Date.parse(storedProfile._privacy.expiresAt) <= Date.now()) {
          storage.removeItem(key);
        } else {
          const { _privacy, ...profileFields } = storedProfile;
          profile = sanitizeProfile(profileFields);
        }
      }
    } catch (_) {}
    if (["pt", "en"].includes(uiLanguage)) profile.preferredLanguage = uiLanguage;
    return {
      conversationId: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      messages: [{ role: "bot", text: initialMessage, timestamp: Date.now() }],
      profile,
      lastTopic: null,
      lastWorkoutGroup: null,
      lastLanguage: profile.preferredLanguage || uiLanguage,
      lastArtifact: null,
      artifactHistory: [],
      lastArtifactVersion: 0,
      lastIntent: null,
      lastAction: null,
      lastUserQuestion: null,
      lastBotAnswer: initialMessage,
      lastBotOffer: null,
      lastReferencedEntity: null,
      activeSubtopic: null,
      activeDetail: null,
      activeItem: null,
      lastRecordId: null,
      recentRecordIds: [],
      pendingRequest: null,
      pendingFields: [],
      pendingConfirmation: null,
      appliedModifiers: [],
      conversationConstraints: [],
      sessionLimitations: [],
      pendingPrivacyNotice: null
    };
  }

  function saveState() {
    // Only the visitor's fitness profile is persistent. Messages and conversational
    // context remain in memory for this page session and are never shared across profiles.
    state.profile = sanitizeProfile(state.profile);
    const hasProfileData = Object.entries(state.profile).some(([key, value]) => key !== "preferredLanguage" && value !== null && value !== "" && (!Array.isArray(value) || value.length));
    const storedProfile = { ...state.profile, _privacy: { savedAt: new Date().toISOString(), retentionDays: 180, expiresAt: new Date(Date.now() + 180 * 86400000).toISOString() } };
    if (hasProfileData) sessionStorage.setItem(profileSessionKey, JSON.stringify(storedProfile));
    else sessionStorage.removeItem(profileSessionKey);
    const ageAllowsPersistence = !state.profile.age || state.profile.age >= 18 || window.FITNESS_ASSISTANT_GUARDIAN_VERIFIED === true;
    if (!ageAllowsPersistence && consent.canPersistProfile()) {
      consent.chooseProfileStorage("session");
      state.pendingPrivacyNotice = "minor-session-only";
    }
    if (!ageAllowsPersistence && consent.canUseExternalAI()) {
      consent.chooseExternalAI(false);
      state.pendingPrivacyNotice = "minor-session-only";
    }
    if (consent.canPersistProfile() && ageAllowsPersistence) localStorage.setItem(profileStorageKey, JSON.stringify(storedProfile));
    else localStorage.removeItem(profileStorageKey);
  }

  function rememberArtifact(artifact, { intent = null, action = "create", text = null } = {}) {
    if (!artifact) return;
    if (state.lastArtifact && action !== "reference") {
      state.artifactHistory = [...state.artifactHistory, structuredClone(state.lastArtifact)].slice(-12);
    }
    const isNew = action === "create" || !state.lastArtifact || (artifact.recordId && artifact.recordId !== state.lastArtifact.recordId) || artifact.type !== state.lastArtifact.type;
    const version = isNew ? 1 : state.lastArtifactVersion + (action === "reference" ? 0 : 1);
    const completeArtifact = { ...artifact, version, text: text || artifact.text || null };
    state.lastArtifact = completeArtifact;
    state.lastArtifactVersion = version;
    state.lastTopic = completeArtifact.topic || state.lastTopic;
    state.lastIntent = intent || completeArtifact.intent || state.lastIntent;
    state.lastAction = action;
    if (completeArtifact.recordId) {
      state.lastRecordId = completeArtifact.recordId;
      state.recentRecordIds = [...state.recentRecordIds.filter(id => id !== completeArtifact.recordId), completeArtifact.recordId].slice(-12);
    }
  }

  function rememberCatalogResult(result, action = "create") {
    if (!result) return null;
    rememberArtifact(result.artifact, { intent: result.artifact?.intent, action, text: result.text });
    return result.text;
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
  }

  function cleanBotFormatting(value) {
    let text = String(value ?? "");
    // The modal intentionally renders safe plain text. Normalize common AI
    // Markdown/LaTeX so their control characters never become visible noise.
    text = text
      .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, "$1")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
      .replace(/\{,\}/g, ",")
      .replace(/\\(?:times|cdot)/g, "x")
      .replace(/\\approx/g, "≈")
      .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
      .replace(/\^2\b/g, "²");
    // A few passes cover ordinary, non-nested fractions produced by models.
    for (let pass = 0; pass < 3; pass += 1) {
      text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)");
    }
    return text
      .replace(/\\(?:left|right)\b/g, "")
      .replace(/\\([a-zA-Z]+)\b/g, "$1")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function tableCells(line) {
    const trimmed = String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map(cell => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function appendSafeRichText(container, value) {
    const lines = cleanBotFormatting(value).split("\n");
    let plainLines = [];
    const flushPlainText = () => {
      if (!plainLines.length) return;
      const block = document.createElement("div");
      block.className = "message-text-block";
      block.textContent = plainLines.join("\n").trim();
      if (block.textContent) container.append(block);
      plainLines = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
      const header = tableCells(lines[index]);
      const beginsTable = lines[index].includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]);
      if (!beginsTable || header.length < 2) {
        plainLines.push(lines[index]);
        continue;
      }

      flushPlainText();
      const tableWrap = document.createElement("div");
      tableWrap.className = "bot-table-wrap";
      tableWrap.setAttribute("role", "region");
      tableWrap.setAttribute("aria-label", "Scrollable comparison table");
      tableWrap.tabIndex = 0;
      const table = document.createElement("table");
      table.className = "bot-table";
      const thead = document.createElement("thead");
      const headingRow = document.createElement("tr");
      header.forEach(label => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        headingRow.append(th);
      });
      thead.append(headingRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        const cells = tableCells(lines[index]);
        if (cells.length !== header.length || isTableDivider(lines[index])) break;
        const row = document.createElement("tr");
        cells.forEach(cellText => {
          const td = document.createElement("td");
          td.textContent = cellText;
          row.append(td);
        });
        tbody.append(row);
        index += 1;
      }
      index -= 1;
      table.append(tbody);
      tableWrap.append(table);
      container.append(tableWrap);
    }
    flushPlainText();
  }

  function appendMessageContent(bubble, text, media, quality = null, isBot = false) {
    const body = document.createElement("div");
    body.className = "message-text";
    if (isBot) appendSafeRichText(body, text);
    else body.textContent = text;
    bubble.append(body);

    const mediaItems = Array.isArray(media) ? media : media?.src ? [media] : [];
    mediaItems.forEach(mediaItem => {
      const figure = document.createElement("figure");
      figure.className = "message-media";
      const link = document.createElement("a");
      link.href = mediaItem.src;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = mediaItem.openLabel || "Open larger image";
      const image = document.createElement("img");
      image.src = mediaItem.src;
      image.alt = mediaItem.alt || "Fitness exercise reference";
      image.loading = "lazy";
      link.append(image);
      figure.append(link);
      if (mediaItem.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = mediaItem.caption;
        figure.append(caption);
      }
      bubble.append(figure);
    });

    if (quality) {
      const panel = document.createElement("div");
      panel.className = "answer-quality";
      const provenance = document.createElement("div");
      provenance.className = "answer-provenance";
      provenance.textContent = `${quality.source} · confiança ${quality.confidence}`;
      panel.append(provenance);
      if (quality.followUp) {
        const followUp = document.createElement("button");
        followUp.type = "button";
        followUp.className = "answer-followup";
        followUp.textContent = quality.followUp;
        followUp.addEventListener("click", () => sendMessage(quality.followUp, quality.followUpAction));
        panel.append(followUp);
      }
      const feedback = document.createElement("div");
      feedback.className = "answer-feedback";
      feedback.setAttribute("aria-label", "Avalie esta resposta");
      [["up", "Útil", "👍"], ["down", "Não foi útil", "👎"]].forEach(([value, label, icon]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.rating = value;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.textContent = icon;
        button.addEventListener("click", () => {
          window.FitnessQualityEngine?.rate(quality, value);
          feedback.querySelectorAll("button").forEach(item => item.classList.toggle("selected", item === button));
        });
        feedback.append(button);
      });
      panel.append(feedback);
      bubble.append(panel);
    }
  }

  function addMessage(role, response, persist = true) {
    const payload = typeof response === "string" ? { text: response } : response;
    const text = payload.text;
    const media = payload.media || null;
    const timestamp = Date.now();
    const row = document.createElement("div");
    row.className = `message ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    appendMessageContent(bubble, text, media, role === "bot" ? payload.quality : null, role === "bot");
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = `${role === "bot" ? "Fitness Bot" : uiLanguage === "pt" ? "Você" : "You"} · ${formatTime(timestamp)}`;
    bubble.append(meta);
    row.append(bubble);
    els.messages.append(row);
    scrollToLatest();

    if (persist) {
      state.messages.push({ role, text, media, quality: payload.quality || null, timestamp });
      state.messages = state.messages.slice(-30);
      if (role === "user") state.lastUserQuestion = text;
      if (role === "bot") state.lastBotAnswer = text;
      saveState();
    }
  }

  function renderHistory() {
    els.messages.textContent = "";
    state.messages.forEach(({ role, text, media, quality, timestamp }) => {
      const row = document.createElement("div");
      row.className = `message ${role}`;
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      appendMessageContent(bubble, text, media, role === "bot" ? quality : null, role === "bot");
      const meta = document.createElement("span");
      meta.className = "message-meta";
      meta.textContent = `${role === "bot" ? "Fitness Bot" : uiLanguage === "pt" ? "Você" : "You"} · ${formatTime(timestamp)}`;
      bubble.append(meta);
      row.append(bubble);
      els.messages.append(row);
    });
    scrollToLatest(false);
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "message bot";
    row.id = "typingIndicator";
    row.setAttribute("aria-label", "Fitness Bot is typing");
    row.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
    els.messages.append(row);
    scrollToLatest();
  }

  function scrollToLatest(smooth = true) {
    requestAnimationFrame(() => els.messages.scrollTo({
      top: els.messages.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    }));
  }

  function setLoading(value) {
    isLoading = value;
    els.send.disabled = value;
    els.input.disabled = value;
    els.chips.forEach(chip => chip.disabled = value);
    els.send.textContent = value ? "..." : localized({ pt:"Enviar", en:"Send", es:"Enviar", de:"Senden" }, state.lastLanguage || "en");
  }

  function normalize(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function parseDurationMinutes(text) {
    const t = normalize(String(text || ""));
    const minutes = t.match(/\b(15|20|25|30|35|40|45|50|60|75|90|120)\s*(?:min|minuto|minutos)\b/);
    if (minutes) return Number(minutes[1]);
    const hours = t.match(/\b(uma|1|1[.,]5|2)\s*(?:h|hora|horas)\b(?:\s*e\s*(15|30|45)\s*(?:min|minutos)?)?/);
    if (!hours) return null;
    const base = hours[1] === "uma" ? 1 : Number(hours[1].replace(",", "."));
    return Math.min(120, Math.round(base * 60 + Number(hours[2] || 0)));
  }

  function browserLanguage() {
    const code = String(navigator.language || "en").slice(0, 2).toLowerCase();
    return ["pt", "en", "de", "es"].includes(code) ? code : "en";
  }

  function applyInterfaceLanguage(language, { persist = true, replaceWelcome = true } = {}) {
    const lang = language === "pt" ? "pt" : "en";
    uiLanguage = lang;
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    document.body.dataset.uiLanguage = lang;
    state.lastLanguage = lang;
    state.profile.preferredLanguage = lang;

    if (persist) {
      try { localStorage.setItem(UI_LANGUAGE_KEY, lang); } catch (_) {}
    }

    const copy = {
      pt: {
        title: "Fitness Assistant Portfolio Edition",
        subtitle: "Treino · Nutrição · Emagrecimento · Hipertrofia",
        how: "Como funciona",
        manage: "Gerenciar privacidade",
        remove: "Apagar meus dados",
        reopen: "Abrir Fitness Bot",
        eyebrow: "VISÃO DO PROJETO",
        infoTitle: "Como o Fitness Assistant funciona",
        chips: [
          ["Emagrecimento", "Como posso emagrecer sem perder massa muscular?"],
          ["Hipertrofia", "Como posso ganhar massa muscular de forma eficiente?"],
          ["Proteína", "Quanta proteína preciso por dia?"],
          ["Peito", "Monte um treino eficiente para peito."],
          ["Alimentação", "Quais alimentos devo priorizar para meu objetivo?"],
          ["Compulsão", "Como posso controlar a vontade de comer?"],
          ["Academia", "Como uma pessoa iniciante deve começar na academia?"],
          ["Esporte", "Como posso melhorar meu desempenho esportivo?"]
        ]
      },
      en: {
        title: "Fitness Assistant Portfolio Edition",
        subtitle: "Training · Nutrition · Weight Loss · Muscle Building",
        how: "How it works",
        manage: "Manage privacy",
        remove: "Delete my data",
        reopen: "Open Fitness Bot",
        eyebrow: "PROJECT OVERVIEW",
        infoTitle: "How the Fitness Assistant works",
        chips: [
          ["Weight Loss", "How can I lose weight without losing muscle?"],
          ["Muscle Building", "How can I build muscle effectively?"],
          ["Protein", "How much protein do I need each day?"],
          ["Chest", "Give me an effective chest workout."],
          ["Food", "What foods should I prioritize for my fitness goals?"],
          ["Cravings", "How can I manage food cravings?"],
          ["Gym", "How should a beginner start at the gym?"],
          ["Sport", "How can I improve my sports performance?"]
        ]
      }
    }[lang];

    document.querySelector("#chatTitle").textContent = copy.title;
    document.querySelector(".title-wrap p").textContent = copy.subtitle;
    if (els.howItWorks) els.howItWorks.textContent = copy.how;
    if (els.languageButton) {
      els.languageButton.textContent = lang.toUpperCase();
      els.languageButton.setAttribute("aria-label", lang === "pt" ? "Alterar idioma" : "Change language");
    }
    if (els.managePrivacy) els.managePrivacy.textContent = copy.manage;
    if (els.deleteData) els.deleteData.textContent = copy.remove;
    if (els.reopen) els.reopen.innerHTML = `<span aria-hidden="true">●</span> ${copy.reopen}`;
    document.querySelector("#projectInfoEyebrow").textContent = copy.eyebrow;
    document.querySelector("#projectInfoTitle").textContent = copy.infoTitle;
    document.querySelectorAll("[data-info-language]").forEach(panel => { panel.hidden = panel.dataset.infoLanguage !== lang; });

    els.chips.forEach((chip, index) => {
      const item = copy.chips[index];
      if (!item) return;
      chip.textContent = item[0];
      chip.dataset.prompt = item[1];
    });

    if (replaceWelcome && state.messages.length === 1 && state.messages[0]?.role === "bot") {
      const welcome = initialMessageFor(lang);
      state.messages[0].text = welcome;
      state.lastBotAnswer = welcome;
    }
    updateMedicalNote(lang);
    renderHistory();
    renderConsentCard();
    saveState();
  }

  function detectLanguage(text, fallback = browserLanguage()) {
    const t = normalize(text);
    if (/answer (only )?in english|respond (only )?in english|responda (apenas )?em ingles/.test(t)) return "en";
    if (/responda (apenas )?em portugues|fale (apenas )?em portugues/.test(t)) return "pt";
    if (/responde? (?:solo )?en espanol|habla (?:solo )?en espanol/.test(t)) return "es";
    if (/antworte? (?:nur )?auf deutsch|sprich (?:nur )?deutsch/.test(t)) return "de";
    const scores = {
      pt: (t.match(/\b(quanto|quanta|quantos|quantas|como|tenho|tem|preciso|treino|dias|massa|gordura|posso|sem|devo|proteina|perder|ganhar|voce|lembra|qual|idade|altura|peso|calorias|quero|emagrecer|trabalho|sentada|sedentario|sedentaria|feminino|feminina|masculino|masculina|mulher|homem|gere|monte|faca|pernas|peito|costas|bracos|ombros|hoje|exercicios|foto|fotos|imagem|imagens|exemplo|exemplos|meu|minha|melhorar|faz|sentido|antes|depois|estou|dor|vezes|semana|parou|beber|comer|agua|sono|recuperacao|estime|estima|estimar|calcule|calcular|informei|informe|informado|dados|agora|ainda|ja|consumir|diaria|diario|favor|pode|esses|estas|isso|outra|facil|descanso|lista|compras)\b/g) || []).length,
      en: (t.match(/\b(how|what|when|where|which|need|want|workout|training|weight|height|age|calories|protein|female|male|sedentary|estimate|calculate|already|provided|data|daily|please|remember|create|make|another|option|meal|structure|shopping|list|only|minutes|without|equipment|easier|rest|days|images|improve|hydration|explain|during|split|four|weigh|have|light)\b/g) || []).length,
      de: (t.match(/\b(wie|ich|muskeln|brauche|viel|trainiere|tagen|eiweiss|protein|gewicht|aufbauen|kalorien|berechnen|erstelle|einen|eine|andere|option|ernahrungsplan|trainingsplan|wochentlich|tage|woche|habe|nur|minuten|ohne|gerate|einfacher|lange|pause|bilder|flussigkeitszufuhr|verbessern|erklare|genauer|wahrend|mahlzeiten|wiege|keine|brustschmerzen|leichtes)\b/g) || []).length,
      es: (t.match(/\b(cuanta|cuantas|como|tengo|necesito|entreno|entrenamiento|dias|semana|musculo|grasa|puedo|proteina|perder|ganar|calorias|calcular|datos|crea|haz|otra|opcion|estructura|alimentaria|compras|solo|minutos|sin|equipo|facil|descanso|imagenes|mejorar|hidratacion|explica|durante|divide|cuatro|comidas|peso|ligero)\b/g) || []).length
    };
    const highest = Math.max(...Object.values(scores));
    if (highest === 0) return fallback;
    const leaders = Object.keys(scores).filter(language => scores[language] === highest);
    return leaders.includes(fallback) ? fallback : leaders[0];
  }

  function canonicalizeForRouting(text, language) {
    let t = normalize(text);
    if (language === "pt") return t;
    const replacements = language === "en" ? [
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
      [/\bi weigh\b/g, "peso"], [/\bhow much protein do i need\b/g, "quanta proteina preciso"]
    ] : language === "es" ? [
      [/\b(crea|haz|genera|dame)\b/g, "monte"], [/\bplan semanal de entrenamiento\b/g, "plano semanal de treino"],
      [/\bestructura alimentaria\b|\bplan de comidas\b/g, "estrutura alimentar"], [/\bvegetariana?\b/g, "vegetariana"], [/\bvegana?\b/g, "vegana"],
      [/\botra opcion\b|\botra alternativa\b/g, "outra opcao"], [/\bcon mas proteina\b/g, "com mais proteina"],
      [/\bcuantas calorias tiene\b/g, "quantas calorias tem"], [/\blista de compras\b/g, "lista de compras"],
      [/\b(\d+) dias por semana\b/g, "$1 dias por semana"], [/\bsolo tengo (\d+) minutos\b/g, "so tenho $1 minutos"],
      [/\bsin equipo\b/g, "sem equipamento"], [/\bmas facil\b/g, "mais facil"], [/\bcuanto descanso\b/g, "quanto descanso"],
      [/\btienes imagenes\b|\bimagenes\b/g, "tem imagens"], [/\by en los dias de descanso\b/g, "e nos dias sem treino"],
      [/\bsin whey\b/g, "sem whey"], [/\bdividelo en cuatro comidas\b/g, "divida em quatro refeicoes"],
      [/\bexplicalo mejor\b/g, "explique melhor"], [/\by durante el entrenamiento\b/g, "e durante o treino"],
      [/\bhidratacion\b/g, "hidratacao"], [/\bcuanta proteina necesito\b/g, "quanta proteina preciso"]
    ] : [
      [/\b(erstelle|mach|gib mir)\b/g, "monte"], [/\bwochentlichen trainingsplan\b|\bwochenplan\b/g, "plano semanal de treino"],
      [/\bvegetarischen ernahrungsplan\b|\bernahrungsplan\b/g, "estrutura alimentar vegetariana"], [/\bvegane?n?\b/g, "vegana"],
      [/\beine andere option\b|\bnoch eine option\b/g, "outra opcao"], [/\bmit mehr protein\b/g, "com mais proteina"],
      [/\bwie viele kalorien hat (er|es|dies)\b/g, "quantas calorias tem"], [/\beinkaufsliste\b/g, "lista de compras"],
      [/\b(\d+) tage pro woche\b/g, "$1 dias por semana"], [/\bich habe nur (\d+) minuten\b/g, "so tenho $1 minutos"],
      [/\bohne gerate\b/g, "sem equipamento"], [/\beinfacher\b/g, "mais facil"], [/\bwie lange pause\b/g, "quanto descanso"],
      [/\bhast du bilder\b|\bbilder\b/g, "tem imagens"], [/\bund an trainingsfreien tagen\b/g, "e nos dias sem treino"],
      [/\bohne whey\b/g, "sem whey"], [/\bteile es auf vier mahlzeiten auf\b/g, "divida em quatro refeicoes"],
      [/\berklare es genauer\b/g, "explique melhor"], [/\bund wahrend des trainings\b/g, "e durante o treino"],
      [/\bflussigkeitszufuhr\b/g, "hidratacao"], [/\bwie viel protein brauche ich\b/g, "quanta proteina preciso"]
    ];
    replacements.forEach(([pattern, replacement]) => { t = t.replace(pattern, replacement); });
    return t.replace(/\s+/g, " ").trim();
  }

  function extractProfile(text) {
    const t = normalize(text);
    const changed = [];
    const set = (key, value) => {
      if (value !== null && value !== undefined && state.profile[key] !== value) {
        state.profile[key] = value;
        changed.push(key);
      }
    };

    const name = text.match(/(?:meu nome [ée]|me chamo|i am|my name is|ich hei(?:ß|ss)e|me llamo)\s+([\p{L}][\p{L}'’-]{1,30})/iu);
    if (name) set("name", name[1].slice(0, 1).toUpperCase() + name[1].slice(1).toLowerCase());

    const kgMatches = [...t.matchAll(/\b((?:3[5-9]|[4-9]\d|1[0-9]\d|2[0-4]\d)(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b/g)];
    const kg = kgMatches.at(-1);
    if (kg) set("weightKg", Number(kg[1].replace(",", ".")));
    if (!kg && state.pendingRequest === "protein-target") {
      const bareWeight = t.match(/^\s*((?:3[5-9]|[4-9]\d|1[0-9]\d|2[0-4]\d)(?:[.,]\d+)?)\s*$/);
      if (bareWeight) set("weightKg", Number(bareWeight[1].replace(",", ".")));
    }

    const ageMatches = [...t.matchAll(/\b(1[4-9]|[2-8]\d)\s*(?:anos(?: de idade)?|years? old|jahre alt|anos de edad)\b/g)];
    const age = ageMatches.at(-1);
    if (age) set("age", Number(age[1]));

    const heightMatches = [...t.matchAll(/\b(1[3-9]\d|2[0-2]\d)\s*cm\b/g)];
    const heightCm = heightMatches.at(-1);
    if (heightCm) set("heightCm", Number(heightCm[1]));
    const heightMMatches = [...t.matchAll(/\b([12])[,.](\d{1,2})\s*(?:m(?:etros?)?|de altura)?\b/g)];
    const heightM = heightMMatches.at(-1);
    if (heightM) {
      const centimeters = Number(heightM[1]) * 100 + Number(heightM[2].padEnd(2, "0").slice(0, 2));
      if (centimeters >= 130 && centimeters <= 220) set("heightCm", centimeters);
    }

    // When the bot is waiting for calorie data, accept a compact reply such as
    // "25, 1,58, 54kg, feminino, sedentário" without demanding every unit label.
    if (state.lastTopic === "calories") {
      const withoutDecimalsAndUnits = t
        .replace(/\b\d+[,.]\d+\b/g, " ")
        .replace(/\b\d+\s*(?:kg|quilos?|kilos?|cm|anos?|years?)\b/g, " ");
      const looseNumbers = [...withoutDecimalsAndUnits.matchAll(/\b(\d{2,3})\b/g)].map(match => Number(match[1]));
      if (!state.profile.age) {
        const possibleAge = looseNumbers.find(value => value >= 14 && value <= 99);
        if (possibleAge) set("age", possibleAge);
      }
      if (!state.profile.weightKg && looseNumbers.length > 1) {
        const possibleWeight = [...looseNumbers].reverse().find(value => value >= 35 && value <= 250 && value !== state.profile.age);
        if (possibleWeight) set("weightKg", possibleWeight);
      }
    }

    if (/\b(mulher|feminin[oa]?|female|frau|mujer)\b/.test(t)) set("sex", "female");
    if (/\b(homem|masculin[oa]?|male|mann|hombre)\b/.test(t)) set("sex", "male");

    if (/sedentar|trabalho sentad|fico sentad|desk job|sitzend|trabajo sentad/.test(t)) set("activity", "sedentary");
    else if (/muito ativ|very active|sehr aktiv|muy activ/.test(t)) set("activity", "very-active");
    else if (/moderad|3 a 5|3-5|three to five|tres a cinco/.test(t)) set("activity", "moderate");
    else if (/levemente ativ|pouco ativ|lightly active|leicht aktiv|ligeramente activ/.test(t)) set("activity", "light");

    const lossAmount = t.match(/(?:emagrecer|perder|lose|abnehmen|bajar)\s+(\d{1,2})(?:[,.]\d+)?\s*kg\b/);
    if (lossAmount) set("targetLossKg", Number(lossAmount[1]));

    if (!/nao (?:quero|pretendo).*(?:ganhar massa|hipertrofia)/.test(t) && /ganhar massa|ganho de massa|build muscle|muscle gain|muskeln aufbauen|ganar musculo/.test(t)) set("goal", "muscle");
    if (!/nao (?:quero|pretendo).*(?:emagrecer|perder peso|perder gordura)/.test(t) && /emagrecer|perder (peso|gordura)|lose weight|fat loss|abnehmen|perder grasa|bajar peso/.test(t)) set("goal", "loss");
    const sportMap = [
      ["football", /\b(futebol|football|soccer)\b/], ["running", /\b(corrida|correr|running|run)\b/],
      ["basketball", /\b(basquete|basketball)\b/], ["volleyball", /\b(volei|voleibol|volleyball)\b/],
      ["cycling", /\b(ciclismo|bicicleta|cycling)\b/], ["swimming", /\b(natacao|nadar|swimming)\b/], ["tennis", /\b(tenis|tennis)\b/]
    ];
    const detectedSport = sportMap.find(([, pattern]) => pattern.test(t));
    if (detectedSport) set("primarySport", detectedSport[0]);

    if (/muita besteira|como besteira|junk food|fast food|ultraprocessad|ultra processad/.test(t)) {
      const notes = Array.isArray(state.profile.dietNotes) ? state.profile.dietNotes : [];
      if (!notes.includes("frequent-junk-food")) {
        state.profile.dietNotes = [...notes, "frequent-junk-food"];
        changed.push("dietNotes");
      }
    }
    const removeDietPreference = preference => {
      if ((state.profile.dietNotes || []).includes(preference)) {
        state.profile.dietNotes = state.profile.dietNotes.filter(item => item !== preference);
        changed.push("dietNotes");
      }
    };
    if (/\b(nao sou|deixei de ser|nao sigo).*(vegana?|vegan)\b/.test(t)) removeDietPreference("vegan");
    if (/\b(nao sou|deixei de ser|nao sigo).*(vegetarian[oa]?)\b/.test(t)) removeDietPreference("vegetarian");
    if (/\b(nao preciso|nao sou|posso consumir).*(sem lactose|lactose)\b/.test(t)) removeDietPreference("lactose-free");
    [["vegan", /\b(vegano|vegana|vegan)\b/], ["vegetarian", /\b(vegetariano|vegetariana|vegetarian)\b/], ["lactose-free", /\b(sem lactose|lactose free)\b/]].forEach(([preference, pattern]) => {
      const negated = preference === "vegan" ? /\b(nao sou|deixei de ser|nao sigo).*(vegana?|vegan)\b/.test(t)
        : preference === "vegetarian" ? /\b(nao sou|deixei de ser|nao sigo).*vegetarian/.test(t)
          : /\b(nao preciso|posso consumir).*lactose\b/.test(t);
      if (!negated && pattern.test(t) && !(state.profile.dietNotes || []).includes(preference)) {
        state.profile.dietNotes = [...(state.profile.dietNotes || []), preference];
        changed.push("dietNotes");
      }
    });
    if (/alerg|allerg/.test(t)) {
      const allergyMap = [["peanut", /amendoim|peanut/], ["milk", /leite|lactose|milk/], ["egg", /ovo|egg/], ["fish", /peixe|fish/], ["soy", /soja|soy/], ["gluten", /gluten/]];
      allergyMap.forEach(([allergen, pattern]) => {
        const denied = new RegExp(`(?:nao tenho|nao sou|sem|not|no soy|keine?)\\s+(?:alergia|alergico|alergica|allergy|allergic|alergia|allergie)?[^,.;]{0,24}${pattern.source}`).test(t);
        if (!denied && pattern.test(t) && !(state.profile.allergies || []).includes(allergen)) {
          state.profile.allergies = [...(state.profile.allergies || []), allergen]; changed.push("allergies");
        }
      });
    }

    if (/sem equipamentos?|sem halteres?|sem nenhum equipamento|nao tenho (?:nenhum )?equipamento|nao tenho halteres|so o peso do corpo|bodyweight|no equipment|ohne gerate|sin equipo/.test(t)) set("equipment", "bodyweight");
    else if (/halter|dumbbell|mancuerna/.test(t)) set("equipment", "dumbbells");
    else if (/academia|gym|fitnessstudio|gimnasio/.test(t)) set("equipment", "gym");

    if (/iniciante|nunca treinei|beginner|anfanger|principiante/.test(t)) set("experience", "beginner");
    else if (/intermediari|intermediate|fortgeschritten|intermedio/.test(t)) set("experience", "intermediate");
    else if (/avancad|advanced|erfahren|avanzad/.test(t)) set("experience", "advanced");

    const duration = parseDurationMinutes(t);
    if (duration) set("durationMinutes", duration);
    const weeklyDays = t.match(/\b([2-6])\s*dias?\s*(?:por semana|na semana|de treino|semanais?)\b/);
    if (weeklyDays) set("trainingDays", Number(weeklyDays[1]));
    if (!duration && state.pendingRequest === "workout-constraints") {
      const bareDuration = t.match(/^\s*(15|20|25|30|35|40|45|50|60|75|90)\s*$/);
      if (bareDuration) set("durationMinutes", Number(bareDuration[1]));
    }

    const limitationMap = [
      ["knee", /dor (?:no|nos) joelh|joelho machuc|knee pain|knieschmerz|dolor de rodilla/],
      ["back", /dor (?:na|nas) costas|dor lombar|back pain|ruckenschmerz|dolor de espalda/],
      ["shoulder", /dor (?:no|nos) ombr|shoulder pain|schulterschmerz|dolor de hombro/]
    ];
    const deniesPain = /\b(nao tenho|nao sinto|sem)\s+(?:nenhuma\s+)?dor\b/.test(t);
    limitationMap.forEach(([name, pattern]) => {
      if (!deniesPain && pattern.test(t) && !state.sessionLimitations.includes(name)) {
        state.sessionLimitations = [...state.sessionLimitations, name];
        state.conversationConstraints = [...new Set([...state.conversationConstraints, `reported-${name}-pain`])].slice(-20);
      }
    });

    return changed;
  }

  function profileSummary(lang) {
    const p = state.profile;
    const values = [];
    if (p.name) values.push({ pt: `nome ${p.name}`, en: `name ${p.name}`, de: `Name ${p.name}`, es: `nombre ${p.name}` }[lang]);
    if (p.age) values.push({ pt: `${p.age} anos`, en: `age ${p.age}`, de: `${p.age} Jahre`, es: `${p.age} años` }[lang]);
    if (p.heightCm) values.push(`${(p.heightCm / 100).toFixed(2).replace(".", lang === "en" ? "." : ",")} m`);
    if (p.weightKg) values.push(`${p.weightKg} kg`);
    if (p.sex) values.push({ pt: p.sex === "female" ? "sexo feminino" : "sexo masculino", en: p.sex === "female" ? "female" : "male", de: p.sex === "female" ? "weiblich" : "männlich", es: p.sex === "female" ? "sexo femenino" : "sexo masculino" }[lang]);
    if (p.activity) values.push({
      pt: { sedentary: "rotina sedentária", light: "atividade leve", moderate: "atividade moderada", "very-active": "rotina muito ativa" },
      en: { sedentary: "sedentary routine", light: "light activity", moderate: "moderate activity", "very-active": "very active routine" },
      de: { sedentary: "sitzender Alltag", light: "leichte Aktivität", moderate: "moderate Aktivität", "very-active": "sehr aktiver Alltag" },
      es: { sedentary: "rutina sedentaria", light: "actividad ligera", moderate: "actividad moderada", "very-active": "rutina muy activa" }
    }[lang][p.activity]);
    if (p.goal === "loss") values.push({ pt: "objetivo de emagrecer", en: "fat-loss goal", de: "Abnehmziel", es: "objetivo de adelgazar" }[lang]);
    if (p.goal === "muscle") values.push({ pt: "objetivo de hipertrofia", en: "muscle-building goal", de: "Muskelaufbauziel", es: "objetivo de hipertrofia" }[lang]);
    if (p.experience) values.push({
      pt: { beginner: "nível iniciante", intermediate: "nível intermediário", advanced: "nível avançado" },
      en: { beginner: "beginner level", intermediate: "intermediate level", advanced: "advanced level" },
      de: { beginner: "Anfängerniveau", intermediate: "mittleres Niveau", advanced: "fortgeschrittenes Niveau" },
      es: { beginner: "nivel principiante", intermediate: "nivel intermedio", advanced: "nivel avanzado" }
    }[lang][p.experience]);
    if (p.trainingDays) values.push({ pt: `${p.trainingDays} dias de treino por semana`, en: `${p.trainingDays} training days per week`, de: `${p.trainingDays} Trainingstage pro Woche`, es: `${p.trainingDays} días de entrenamiento por semana` }[lang]);
    if (p.primarySport) {
      const sportLabels = {
        pt: { football: "futebol", running: "corrida", basketball: "basquete", volleyball: "vôlei", cycling: "ciclismo", swimming: "natação", tennis: "tênis" },
        en: { football: "football", running: "running", basketball: "basketball", volleyball: "volleyball", cycling: "cycling", swimming: "swimming", tennis: "tennis" },
        de: { football: "Fußball", running: "Laufen", basketball: "Basketball", volleyball: "Volleyball", cycling: "Radfahren", swimming: "Schwimmen", tennis: "Tennis" },
        es: { football: "fútbol", running: "carrera", basketball: "baloncesto", volleyball: "voleibol", cycling: "ciclismo", swimming: "natación", tennis: "tenis" }
      };
      values.push({ pt: `esporte ${sportLabels.pt[p.primarySport]}`, en: `sport ${sportLabels.en[p.primarySport]}`, de: `Sport ${sportLabels.de[p.primarySport]}`, es: `deporte ${sportLabels.es[p.primarySport]}` }[lang]);
    }
    return values.join(", ");
  }

  function detectWorkoutGroup(text) {
    const t = normalize(text);
    const groups = [
      ["legs", /\b(pernas?|leg|legs|beine|piernas?)\b/],
      ["chest", /\b(peito|chest|brust|pecho)\b/],
      ["back", /\b(costas|back|rucken|espalda)\b/],
      ["shoulders", /\b(ombros?|shoulders?|schultern?|hombros?)\b/],
      ["arms", /\b(bracos?|biceps|triceps|arms?|arme|brazos?)\b/],
      ["core", /\b(core|abdomen|abdominal|bauch)\b/],
      ["full-body", /corpo inteiro|full body|ganzkorper|cuerpo completo/]
    ];
    return groups.find(([, pattern]) => pattern.test(t))?.[0] || null;
  }

  function workoutAnswer(lang, group) {
    const p = state.profile;
    const isStarting = p.experience === "beginner" || (!p.experience && p.activity === "sedentary") || (p.age && (p.age < 18 || p.age >= 70));
    const sets = isStarting ? 2 : 3;
    const duration = p.durationMinutes || (isStarting ? 35 : 45);
    const equipment = p.equipment || "flexible";
    const hasPain = (Array.isArray(p.limitations) && p.limitations.length > 0) || state.sessionLimitations.length > 0;

    const planData = {
      legs: {
        pt: ["Agachamento para cadeira ou goblet — 8–12 repetições", "Levantamento romeno com halteres ou mochila — 8–12", "Afundo reverso com apoio — 8–10 por perna", "Ponte de glúteos ou hip thrust — 10–15", "Elevação de panturrilhas — 12–18"],
        en: ["Chair or goblet squat — 8–12 reps", "Romanian deadlift with dumbbells or a backpack — 8–12", "Supported reverse lunge — 8–10 per leg", "Glute bridge or hip thrust — 10–15", "Calf raise — 12–18"],
        de: ["Stuhl- oder Goblet-Kniebeuge — 8–12 Wdh.", "Rumänisches Kreuzheben mit Hanteln oder Rucksack — 8–12", "Rückwärts-Ausfallschritt mit Halt — 8–10 je Bein", "Glute Bridge oder Hip Thrust — 10–15", "Wadenheben — 12–18"],
        es: ["Sentadilla a silla o goblet — 8–12 repeticiones", "Peso muerto rumano con mancuernas o mochila — 8–12", "Zancada inversa con apoyo — 8–10 por pierna", "Puente de glúteos o hip thrust — 10–15", "Elevación de pantorrillas — 12–18"]
      },
      chest: {
        pt: ["Flexão inclinada ou supino — 8–12 repetições", "Supino inclinado com halteres — 8–12", "Crucifixo ou crossover — 10–15", "Flexão com amplitude confortável — 6–12"],
        en: ["Incline push-up or bench press — 8–12 reps", "Incline dumbbell press — 8–12", "Dumbbell fly or cable crossover — 10–15", "Push-up with comfortable range — 6–12"],
        de: ["Erhöhte Liegestütze oder Bankdrücken — 8–12 Wdh.", "Schrägbankdrücken mit Kurzhanteln — 8–12", "Flys oder Cable Crossover — 10–15", "Liegestütze im angenehmen Bewegungsbereich — 6–12"],
        es: ["Flexión inclinada o press banca — 8–12 repeticiones", "Press inclinado con mancuernas — 8–12", "Aperturas o crossover — 10–15", "Flexión con rango cómodo — 6–12"]
      },
      back: {
        pt: ["Remada com halteres, elástico ou mochila — 8–12", "Puxada na frente ou puxada com elástico — 8–12", "Remada unilateral — 10–12 por lado", "Bird-dog controlado — 8–10 por lado"],
        en: ["Row with dumbbells, band, or backpack — 8–12", "Front pulldown or band pulldown — 8–12", "One-arm row — 10–12 per side", "Controlled bird dog — 8–10 per side"],
        de: ["Rudern mit Hanteln, Band oder Rucksack — 8–12", "Latzug oder Bandzug — 8–12", "Einarmiges Rudern — 10–12 je Seite", "Kontrollierter Bird Dog — 8–10 je Seite"],
        es: ["Remo con mancuernas, banda o mochila — 8–12", "Jalón frontal o con banda — 8–12", "Remo unilateral — 10–12 por lado", "Bird-dog controlado — 8–10 por lado"]
      },
      shoulders: {
        pt: ["Desenvolvimento com halteres — 8–12", "Elevação lateral — 10–15", "Crucifixo inverso — 10–15", "Elevação frontal alternada — 10–12"],
        en: ["Dumbbell overhead press — 8–12", "Lateral raise — 10–15", "Reverse fly — 10–15", "Alternating front raise — 10–12"],
        de: ["Schulterdrücken mit Kurzhanteln — 8–12", "Seitheben — 10–15", "Reverse Fly — 10–15", "Abwechselndes Frontheben — 10–12"],
        es: ["Press de hombros con mancuernas — 8–12", "Elevación lateral — 10–15", "Apertura inversa — 10–15", "Elevación frontal alternada — 10–12"]
      },
      arms: {
        pt: ["Rosca direta com halteres ou elástico — 8–12", "Tríceps na polia ou com elástico — 8–12", "Rosca martelo — 10–12", "Tríceps acima da cabeça — 10–12"],
        en: ["Dumbbell or band curl — 8–12", "Cable or band triceps pressdown — 8–12", "Hammer curl — 10–12", "Overhead triceps extension — 10–12"],
        de: ["Curls mit Hanteln oder Band — 8–12", "Trizepsdrücken am Kabel oder Band — 8–12", "Hammer Curls — 10–12", "Trizepsstrecken über Kopf — 10–12"],
        es: ["Curl con mancuernas o banda — 8–12", "Extensión de tríceps en polea o banda — 8–12", "Curl martillo — 10–12", "Extensión de tríceps sobre la cabeza — 10–12"]
      },
      core: {
        pt: ["Dead bug — 8–10 por lado", "Prancha inclinada ou no chão — 20–40 s", "Bird-dog — 8–10 por lado", "Prancha lateral — 15–30 s por lado"],
        en: ["Dead bug — 8–10 per side", "Incline or floor plank — 20–40 sec", "Bird dog — 8–10 per side", "Side plank — 15–30 sec per side"],
        de: ["Dead Bug — 8–10 je Seite", "Erhöhte oder Bodenplanke — 20–40 Sek.", "Bird Dog — 8–10 je Seite", "Seitstütz — 15–30 Sek. je Seite"],
        es: ["Dead bug — 8–10 por lado", "Plancha inclinada o en el suelo — 20–40 s", "Bird-dog — 8–10 por lado", "Plancha lateral — 15–30 s por lado"]
      },
      "full-body": {
        pt: ["Agachamento para cadeira — 8–12", "Flexão inclinada — 8–12", "Remada com mochila ou halteres — 8–12", "Ponte de glúteos — 10–15", "Dead bug — 8–10 por lado"],
        en: ["Chair squat — 8–12", "Incline push-up — 8–12", "Backpack or dumbbell row — 8–12", "Glute bridge — 10–15", "Dead bug — 8–10 per side"],
        de: ["Stuhl-Kniebeuge — 8–12", "Erhöhte Liegestütze — 8–12", "Rudern mit Rucksack oder Hanteln — 8–12", "Glute Bridge — 10–15", "Dead Bug — 8–10 je Seite"],
        es: ["Sentadilla a silla — 8–12", "Flexión inclinada — 8–12", "Remo con mochila o mancuernas — 8–12", "Puente de glúteos — 10–15", "Dead bug — 8–10 por lado"]
      }
    };
    const selected = planData[group] || planData["full-body"];
    const bodyweightLegs = {
      pt: ["Agachamento para cadeira — 8–12 repetições", "Bom-dia sem carga, com movimento lento — 10–12", "Afundo reverso com apoio — 8–10 por perna", "Ponte de glúteos — 10–15", "Elevação de panturrilhas — 12–18"],
      en: ["Chair squat — 8–12 reps", "Slow bodyweight good morning — 10–12", "Supported reverse lunge — 8–10 per leg", "Glute bridge — 10–15", "Calf raise — 12–18"],
      de: ["Stuhl-Kniebeuge — 8–12 Wdh.", "Langsamer Good Morning ohne Gewicht — 10–12", "Rückwärts-Ausfallschritt mit Halt — 8–10 je Bein", "Glute Bridge — 10–15", "Wadenheben — 12–18"],
      es: ["Sentadilla a silla — 8–12 repeticiones", "Buenos días sin carga y lentos — 10–12", "Zancada inversa con apoyo — 8–10 por pierna", "Puente de glúteos — 10–15", "Elevación de pantorrillas — 12–18"]
    };
    const bodyweightArms = {
      pt: ["Flexão inclinada com mãos próximas — 8–12", "Rosca com resistência da outra mão — 8–12 por braço", "Extensão de tríceps na parede — 8–12", "Rosca isométrica pisando em uma toalha — 20–30 s", "Prancha com toque no ombro — 8–12 por lado"],
      en: ["Close-grip incline push-up — 8–12", "Self-resisted biceps curl — 8–12 per arm", "Wall bodyweight triceps extension — 8–12", "Towel isometric biceps curl — 20–30 sec", "Plank shoulder tap — 8–12 per side"],
      de: ["Enge erhöhte Liegestütze — 8–12", "Bizepscurl mit Eigenwiderstand — 8–12 je Arm", "Trizepsstrecken an der Wand — 8–12", "Isometrischer Handtuchcurl — 20–30 Sek.", "Plank mit Schultertippen — 8–12 je Seite"],
      es: ["Flexión inclinada con manos juntas — 8–12", "Curl de bíceps con autorresistencia — 8–12 por brazo", "Extensión de tríceps en pared — 8–12", "Curl isométrico con toalla — 20–30 s", "Plancha tocando hombros — 8–12 por lado"]
    };
    const exerciseList = equipment === "bodyweight" && group === "legs"
      ? bodyweightLegs[lang]
      : equipment === "bodyweight" && group === "arms"
        ? bodyweightArms[lang]
        : selected[lang];
    const exercises = exerciseList.map((exercise, index) => `${index + 1}. ${exercise} · ${sets} ${lang === "pt" || lang === "es" ? "séries" : lang === "de" ? "Sätze" : "sets"}`).join("\n");
    const known = profileSummary(lang);
    const equipmentNote = {
      pt: equipment === "bodyweight" ? "Adaptei tudo para peso corporal." : equipment === "dumbbells" ? "Adaptei para halteres." : equipment === "gym" ? "Considerei que você está na academia." : "Use halteres se tiver; em casa, uma mochila carregada funciona como alternativa.",
      en: equipment === "bodyweight" ? "I adapted everything to bodyweight." : equipment === "dumbbells" ? "I adapted this for dumbbells." : equipment === "gym" ? "I assumed you are at the gym." : "Use dumbbells if available; at home, a loaded backpack works as an alternative.",
      de: equipment === "bodyweight" ? "Alles ist für Körpergewicht angepasst." : equipment === "dumbbells" ? "Der Plan ist für Kurzhanteln angepasst." : equipment === "gym" ? "Ich gehe davon aus, dass du im Fitnessstudio bist." : "Nutze Hanteln, falls vorhanden; zu Hause funktioniert ein beladener Rucksack.",
      es: equipment === "bodyweight" ? "Adapté todo al peso corporal." : equipment === "dumbbells" ? "Lo adapté para mancuernas." : equipment === "gym" ? "Consideré que estás en el gimnasio." : "Usa mancuernas si tienes; en casa, una mochila cargada funciona como alternativa."
    }[lang];
    const upperBody = ["arms", "chest", "back", "shoulders"].includes(group);
    const warmupText = upperBody ? {
      pt: "Marcha leve, círculos controlados dos braços, 8 retrações das escápulas e 8 flexões na parede.",
      en: "Easy marching, controlled arm circles, 8 scapular retractions, and 8 wall push-ups.",
      de: "Leichtes Marschieren, kontrollierte Armkreise, 8 Schulterblatt-Retraktionen und 8 Wandliegestütze.",
      es: "Marcha suave, círculos controlados de brazos, 8 retracciones escapulares y 8 flexiones en pared."
    }[lang] : {
      pt: "Caminhada leve ou marcha no lugar, seguida de 8 agachamentos curtos e mobilidade de quadril.",
      en: "Easy walking or marching, followed by 8 shallow squats and hip mobility.",
      de: "Leichtes Gehen oder Marschieren, danach 8 flache Kniebeugen und Hüftmobilität.",
      es: "Caminata suave o marcha, seguida de 8 sentadillas cortas y movilidad de cadera."
    }[lang];
    const caution = hasPain ? {
      pt: " Como você mencionou dor ou limitação, não force movimentos dolorosos; interrompa se a dor piorar e procure avaliação profissional antes de progredir.",
      en: " Because you mentioned pain or a limitation, do not push through painful movements; stop if pain worsens and seek professional assessment before progressing.",
      de: " Da du Schmerzen oder Einschränkungen erwähnt hast, trainiere nicht durch Schmerzen hindurch; brich bei Verschlechterung ab und lass dich vor einer Steigerung untersuchen.",
      es: " Como mencionaste dolor o una limitación, no fuerces movimientos dolorosos; detente si empeora y busca evaluación profesional antes de progresar."
    }[lang] : "";

    return {
      pt: `Claro. Considerando o que já sei (${known || "sem dados pessoais suficientes"}), montei uma sessão de aproximadamente ${duration} minutos${isStarting ? " com volume inicial moderado" : ""}. ${equipmentNote}\n\nAquecimento — 5 minutos\n${warmupText}\n\nTreino\n${exercises}\n\nDescanse 60–90 s entre séries e termine cada uma sentindo que ainda conseguiria fazer 2–3 repetições com boa técnica. Se completar o máximo de repetições com facilidade em dois treinos, aumente um pouco a carga ou uma repetição.${caution}\n\nPara eu deixar o próximo treino ainda mais preciso, diga se será em casa ou na academia, quais equipamentos você tem e se sente alguma dor.`,
      en: `Sure. Based on what I already know (${known || "not enough personal data yet"}), here is an approximately ${duration}-minute session${isStarting ? " with moderate starting volume" : ""}. ${equipmentNote}\n\nWarm-up — 5 minutes\n${warmupText}\n\nWorkout\n${exercises}\n\nRest 60–90 seconds between sets and finish each set with about 2–3 good reps still possible. When the top of the rep range feels easy for two workouts, add a little load or one rep.${caution}\n\nTo make the next workout more precise, tell me whether you are at home or a gym, what equipment you have, and whether anything hurts.`,
      de: `Gern. Auf Basis meiner bisherigen Informationen (${known || "noch nicht genug persönliche Angaben"}) bekommst du eine Einheit von ungefähr ${duration} Minuten${isStarting ? " mit moderatem Einstiegsvolumen" : ""}. ${equipmentNote}\n\nAufwärmen — 5 Minuten\n${warmupText}\n\nTraining\n${exercises}\n\n60–90 Sekunden Satzpause; beende jeden Satz mit etwa 2–3 sauberen Wiederholungen in Reserve. Wenn das obere Ende zweimal leicht fällt, erhöhe Gewicht oder Wiederholungen leicht.${caution}`,
      es: `Claro. Según lo que ya sé (${known || "aún no hay suficientes datos personales"}), preparé una sesión de unos ${duration} minutos${isStarting ? " con volumen inicial moderado" : ""}. ${equipmentNote}\n\nCalentamiento — 5 minutos\n${warmupText}\n\nEntrenamiento\n${exercises}\n\nDescansa 60–90 s entre series y termina cada una con 2–3 repeticiones buenas en reserva. Si el máximo resulta fácil en dos sesiones, aumenta un poco la carga o una repetición.${caution}`
    }[lang];
  }

  function muscleGroupsAnswer(lang = "pt") {
    return {
      pt: "Os principais grupos musculares usados para organizar a musculação são:\n\n• Peito — peitoral maior e menor.\n• Costas — latíssimo do dorso, trapézio, romboides e musculatura lombar.\n• Ombros — deltoides anterior, lateral e posterior.\n• Braços — bíceps, tríceps e antebraços.\n• Pernas — quadríceps, posteriores da coxa e adutores.\n• Glúteos — máximo, médio e mínimo.\n• Panturrilhas — gastrocnêmio e sóleo.\n• Core — abdômen, oblíquos e estabilizadores profundos do tronco.\n\nUm treino equilibrado combina padrões de agachar, empurrar, puxar, dobrar o quadril, estabilizar o core e locomover-se. Não é necessário treinar cada músculo isoladamente.",
      en: "The main muscle groups used to organize strength training are chest, back, shoulders, arms, quadriceps, hamstrings, glutes, calves, and core. A balanced program combines squatting, pushing, pulling, hip hinging, core stabilization, and locomotion; every muscle does not need an isolation exercise.",
      de: "Die wichtigsten Muskelgruppen sind Brust, Rücken, Schultern, Arme, Quadrizeps, hintere Oberschenkel, Gesäß, Waden und Core. Ein ausgewogener Plan kombiniert Kniebeugen, Drücken, Ziehen, Hüftbeugen und Rumpfstabilität.",
      es: "Los principales grupos musculares son pecho, espalda, hombros, brazos, cuádriceps, isquiotibiales, glúteos, pantorrillas y core. Un plan equilibrado combina sentadilla, empuje, tirón, bisagra de cadera y estabilidad del tronco."
    }[lang];
  }

  function weeklyWorkoutAnswer({ days, equipment, includeCardio = false, easier = false, replaceWednesday = false, durationMinutes = null } = {}) {
    const p = state.profile;
    days = Math.min(6, Math.max(2, days || p.trainingDays || (p.experience === "beginner" || p.activity === "sedentary" ? 3 : 4)));
    equipment = equipment || p.equipment || "flexible";
    const sets = easier || p.experience === "beginner" || (!p.experience && p.activity === "sedentary") ? 2 : 3;
    const duration = durationMinutes || p.durationMinutes || (easier ? 30 : 40);
    const equipmentText = equipment === "bodyweight" ? "peso corporal, cadeira e mochila opcional" : equipment === "dumbbells" ? "halteres" : equipment === "gym" ? "máquinas, cabos e pesos livres" : "halteres, elástico ou mochila; adapte ao que tiver";
    const exerciseSets = equipment === "bodyweight" ? {
      fullA: ["agachamento para cadeira", "flexão inclinada", "remada auto-resistida ou com toalha", "ponte de glúteos", "dead bug"],
      fullB: ["afundo reverso com apoio", "flexão na parede ou bancada", "elevação Y-T deitada", "ponte unilateral", "prancha lateral"],
      upper: ["flexão inclinada", "remada auto-resistida ou com toalha", "flexão pike na parede", "elevação Y-T deitada", "tríceps na parede + rosca auto-resistida"],
      lower: ["agachamento para cadeira", "bom-dia sem carga", "afundo reverso com apoio", "ponte de glúteos", "panturrilha unilateral"],
      push: ["flexão na parede", "flexão inclinada", "flexão pike assistida", "elevação lateral isométrica na parede", "tríceps na parede"],
      pull: ["remada auto-resistida", "puxada isométrica com toalha", "elevação Y-T deitada", "bird-dog", "rosca auto-resistida"],
      legs: ["agachamento para cadeira", "bom-dia sem carga", "afundo com apoio", "ponte unilateral", "panturrilhas"]
    } : {
      fullA: ["agachamento goblet ou leg press", "supino ou flexão", "remada", "levantamento romeno", "dead bug"],
      fullB: ["afundo ou passada", "desenvolvimento", "puxada na frente", "hip thrust", "prancha lateral"],
      upper: ["supino ou flexão", "remada", "desenvolvimento de ombros", "puxada ou pullover", "rosca + tríceps"],
      lower: ["agachamento", "levantamento romeno", "afundo ou step-up", "ponte de glúteos", "panturrilhas"],
      push: ["supino ou flexão", "desenvolvimento", "supino inclinado", "elevação lateral", "tríceps"],
      pull: ["remada", "puxada", "remada unilateral", "crucifixo inverso", "bíceps"],
      legs: ["agachamento", "levantamento romeno", "afundo", "ponte de glúteos", "panturrilhas"]
    };
    const format = (title, key) => `${title}: ${exerciseSets[key].map(item => `${item} (${sets}×8–12)`).join("; ")}.`;
    let week;
    if (days === 2) week = [format("Segunda — Corpo inteiro A", "fullA"), "Terça — descanso ou caminhada leve", "Quarta — mobilidade leve", format("Quinta — Corpo inteiro B", "fullB"), "Sexta — descanso", "Sábado — atividade recreativa leve", "Domingo — descanso"];
    else if (days === 3) week = [format("Segunda — Corpo inteiro A", "fullA"), "Terça — descanso ou caminhada leve", format(replaceWednesday ? "Quarta — Corpo inteiro B alternativo" : "Quarta — Pernas e core", replaceWednesday ? "fullB" : "lower"), "Quinta — descanso", format("Sexta — Parte superior + corpo inteiro", "upper"), "Sábado — atividade leve opcional", "Domingo — descanso"];
    else if (days === 4) week = [format("Segunda — Parte superior A", "upper"), format("Terça — Parte inferior A", "lower"), "Quarta — descanso ou mobilidade", format("Quinta — Parte superior B", "push"), format("Sexta — Parte inferior B", "legs"), "Sábado — atividade leve opcional", "Domingo — descanso"];
    else if (days === 5) week = [format("Segunda — Empurrar", "push"), format("Terça — Puxar", "pull"), format("Quarta — Pernas", "legs"), "Quinta — descanso ou mobilidade", format("Sexta — Parte superior", "upper"), format("Sábado — Parte inferior", "lower"), "Domingo — descanso"];
    else week = [format("Segunda — Empurrar", "push"), format("Terça — Puxar", "pull"), format("Quarta — Pernas", "legs"), format("Quinta — Parte superior", "upper"), format("Sexta — Parte inferior", "lower"), format("Sábado — Corpo inteiro leve", "fullB"), "Domingo — descanso completo"];
    if (includeCardio) {
      const index = days >= 5 ? 3 : 1;
      week[index] += "; acrescente 20–30 minutos de cardio leve em ritmo conversacional";
    }
    const known = profileSummary("pt");
    const goal = p.goal === "loss" ? "emagrecimento com preservação de massa muscular" : p.goal === "muscle" ? "hipertrofia" : "condicionamento e força geral";
    const caution = p.limitations?.length || state.sessionLimitations.length ? " Como há uma limitação informada nesta sessão, não force movimentos dolorosos e procure avaliação profissional se a dor persistir ou piorar." : "";
    return {
      text: `Plano semanal de ${days} dias — objetivo: ${goal}\nConsiderei ${known || "um perfil geral"} e sessões de aproximadamente ${duration} minutos. Equipamento: ${equipmentText}.\n\n${week.map(item => `• ${item}`).join("\n")}\n\nAqueça por 5–8 minutos, termine as séries com 2–3 repetições em reserva e descanse 60–90 s nos acessórios ou 90–150 s nos exercícios principais. Progrida primeiro nas repetições e depois na carga. Os dias de descanso fazem parte do plano.${caution}`,
      days, equipment, includeCardio, easier, replaceWednesday, durationMinutes: duration
    };
  }

  function weeklyWorkoutDeepDive(artifact, text) {
    if (artifact?.type !== "weekly-workout" || (state.lastLanguage || "pt") !== "pt") return null;
    const t = normalize(text);
    if (/(?:foto|fotos|imagem|imagens|visual|mostrar.*exercicio|como.*faz)/.test(t)) return workoutPlanVisualResponse("pt", artifact);
    const daysMatch = t.match(/\b([2-6])\s*dias?\b/);
    const durationMinutes = parseDurationMinutes(t);
    const equipment = /sem equipamento|peso corporal|em casa/.test(t) ? "bodyweight" : /halteres/.test(t) ? "dumbbells" : /academia|maquinas/.test(t) ? "gym" : artifact.equipment;
    const hasChange = daysMatch || durationMinutes || equipment !== artifact.equipment || /inclua|adicione|coloque/.test(t) && /cardio|corrida|aerobico/.test(t) || /mais leve|mais facil/.test(t) || /troque|mude|substitua/.test(t) && /quarta/.test(t);
    if (hasChange) {
      const plan = weeklyWorkoutAnswer({
        days: daysMatch ? Number(daysMatch[1]) : artifact.days,
        equipment,
        durationMinutes: durationMinutes || artifact.durationMinutes,
        includeCardio: artifact.includeCardio || /cardio|corrida|aerobico/.test(t),
        easier: artifact.easier || /mais leve|mais facil/.test(t),
        replaceWednesday: artifact.replaceWednesday || /(?:troque|mude|substitua).*quarta/.test(t)
      });
      state.profile.trainingDays = plan.days;
      state.profile.equipment = plan.equipment;
      state.profile.durationMinutes = plan.durationMinutes;
      saveState();
      rememberArtifact({ type: "weekly-workout", topic: "weekly-workout", ...plan }, { action: "modify", text: plan.text });
      return plan.text;
    }
    if (/quanto descanso|intervalo entre series/.test(t)) return "No plano semanal, descanse 90–150 segundos nos exercícios principais e 60–90 segundos nos acessórios. Entre sessões exigentes do mesmo grupo muscular, mantenha aproximadamente 48 horas.";
    if (/detalhe|explique melhor|aprofunde/.test(t)) {
      const minutes = artifact.durationMinutes || 40;
      return `Como executar cada sessão do plano semanal de ${artifact.days} dias:\n• ${Math.max(5, Math.round(minutes * .12))} minutos de aquecimento e séries leves do primeiro exercício.\n• ${Math.max(18, Math.round(minutes * .48))} minutos para os três movimentos principais, com 90–150 s de descanso.\n• ${Math.max(10, Math.round(minutes * .27))} minutos para acessórios e core, com 60–90 s de descanso.\n• ${Math.max(3, Math.round(minutes * .08))} minutos para registrar cargas e fazer volta à calma.\n\nComece pelo primeiro exercício de cada dia, respeite a ordem e interrompa a série quando a técnica piorar. Você pode continuar alterando duração, frequência, equipamento, cardio ou dificuldade sem recriar o plano.`;
    }
    if (/todos os dias|sete dias|7 dias/.test(t)) return "Não é necessário fazer musculação intensa todos os dias. Os dias leves e de descanso permitem recuperar músculos, articulações e desempenho. Se quiser se movimentar diariamente, use caminhada, mobilidade ou atividade recreativa leve nos intervalos.";
    if (/outr[oa]|alternativa|diferente/.test(t)) {
      const plan = weeklyWorkoutAnswer({ ...artifact, replaceWednesday: !artifact.replaceWednesday });
      rememberArtifact({ type: "weekly-workout", topic: "weekly-workout", ...plan }, { action: "alternative", text: plan.text });
      return plan.text;
    }
    return null;
  }

  function monthlyWorkoutAnswer({ days, equipment, durationMinutes, includeCardio = false, easier = false, variation = 0 } = {}) {
    const weekly = weeklyWorkoutAnswer({ days, equipment, durationMinutes, includeCardio, easier, replaceWednesday: Boolean(variation % 2) });
    const goal = state.profile.goal === "loss" ? "emagrecimento com preservação de massa muscular" : state.profile.goal === "muscle" ? "hipertrofia" : "força, técnica e condicionamento geral";
    const progression = [
      "Semana 1 — adaptação e técnica: use a menor carga da faixa, faça as séries previstas e termine com 3–4 repetições em reserva. Registre carga, repetições e percepção de esforço.",
      "Semana 2 — progressão de repetições: mantenha os exercícios e acrescente 1 repetição por série quando a técnica estiver estável. Termine com aproximadamente 2–3 repetições em reserva.",
      "Semana 3 — sobrecarga controlada: ao alcançar o topo da faixa, aumente a carga em 2–5% ou use uma variação um pouco mais difícil. Não aumente carga e volume ao mesmo tempo.",
      "Semana 4 — consolidação e recuperação: reduza cerca de 30–40% das séries, mantenha movimentos confortáveis e avalie sono, dor, energia e desempenho antes do próximo ciclo."
    ];
    const text = `Plano mensal de treinamento — 4 semanas\nObjetivo: ${goal}. Frequência: ${weekly.days} dias por semana. Duração: aproximadamente ${weekly.durationMinutes} minutos por sessão.\n\nEstrutura semanal que será repetida com progressão:\n${weekly.text}\n\nProgressão do mês\n${progression.map(item => `• ${item}`).join("\n")}\n\nComo acompanhar\n• Registre exercícios, carga, repetições e repetições em reserva.\n• Progrida somente quando completar a faixa com técnica estável.\n• Se perder uma sessão, continue pelo próximo treino da sequência; não tente compensar tudo no mesmo dia.\n• Dor aguda, inchaço, perda de força ou piora persistente exigem interrupção e avaliação profissional.\n\nAo final da quarta semana, compare desempenho, medidas relevantes ao objetivo, energia e recuperação. O próximo mês deve partir desses resultados, não apenas trocar exercícios.`;
    return { text, type: "monthly-workout", topic: "monthly-workout", days: weekly.days, equipment: weekly.equipment, durationMinutes: weekly.durationMinutes, includeCardio, easier, variation, progression };
  }

  function monthlyWeekDetail(artifact, week) {
    const details = {
      1: "Semana 1 detalhada: faça exatamente a divisão semanal do plano, usando 3–4 repetições em reserva. A prioridade é aprender amplitude, ritmo e regulagem dos exercícios. Não aumente carga durante a sessão para perseguir cansaço; registre um ponto de partida reproduzível.",
      2: "Semana 2 detalhada: repita os mesmos exercícios e tente acrescentar 1 repetição em cada série, sem ultrapassar a faixa indicada. Se um exercício já estiver no máximo de repetições, mantenha-o e progrida apenas os demais. Preserve 2–3 repetições em reserva.",
      3: "Semana 3 detalhada: nos exercícios em que você alcançou o topo da faixa em todas as séries, aumente a carga em aproximadamente 2–5% e volte ao início da faixa. Com peso corporal, use maior amplitude, descida de 3 segundos ou variação ligeiramente mais difícil.",
      4: "Semana 4 detalhada: faça os mesmos dias, mas retire uma série de cada exercício ou reduza o total em 30–40%. Evite falha muscular. Use a semana para recuperar e revisar quais exercícios progrediram, ficaram estáveis ou causaram desconforto."
    };
    return `${details[week]} Cada sessão continua com aproximadamente ${artifact.durationMinutes} minutos e a frequência permanece em ${artifact.days} dias por semana.`;
  }

  function monthlyWorkoutDeepDive(artifact, text) {
    if (artifact?.type !== "monthly-workout" || (state.lastLanguage || "pt") !== "pt") return null;
    const t = normalize(text);
    if (/(?:foto|fotos|imagem|imagens|visual|mostrar.*exercicio|como.*faz)/.test(t)) return workoutPlanVisualResponse("pt", artifact);
    const weekMatch = t.match(/\bsemana\s*(1|2|3|4|um|dois|tres|quatro)\b/);
    const weekMap = { um: 1, dois: 2, tres: 3, quatro: 4 };
    if (weekMatch && /detalh|explique|como|e a|quero ver/.test(t)) {
      const week = Number(weekMatch[1]) || weekMap[weekMatch[1]];
      const answer = monthlyWeekDetail(artifact, week);
      rememberArtifact({ ...artifact, activeWeek: week }, { action: "reference", text: answer });
      return answer;
    }
    if (/perder|pular|faltar/.test(t) && /dia|treino|sessao/.test(t)) return "Se perder um dia, continue pelo próximo treino da sequência quando puder. Não junte duas sessões completas para compensar. Se a semana ficar muito apertada, priorize os treinos de corpo inteiro ou um dia de parte superior e outro de parte inferior.";
    if (/^(?:detalhe|explique melhor|aprofunde|mais detalhes)$/.test(t)) {
      const minutes = artifact.durationMinutes || 40;
      return `Detalhamento das sessões do mês:\n• Aquecimento: ${Math.max(5, Math.round(minutes * .12))} minutos, seguido de 1–3 séries progressivas do primeiro exercício.\n• Bloco principal: ${Math.max(20, Math.round(minutes * .5))} minutos para os três primeiros movimentos, com 90–150 s de descanso.\n• Acessórios e core: ${Math.max(10, Math.round(minutes * .25))} minutos, com 60–90 s de descanso.\n• Registro e volta à calma: ${Math.max(3, Math.round(minutes * .08))} minutos.\n\nNa semana 1 aprenda e registre; na 2 aumente repetições; na 3 aumente carga somente onde completou a faixa; na 4 reduza 30–40% do volume. Você pode pedir “detalhe a semana 1”, “detalhe a semana 2” e assim por diante.`;
    }
    if (/como.*progred|progredir.*carga|aumentar.*carga|quando.*aumentar/.test(t)) return "Use progressão dupla: primeiro aumente repetições dentro da faixa; quando alcançar o máximo em todas as séries com 2–3 repetições em reserva, aumente a carga em 2–5% e retorne ao início da faixa. Modifique apenas uma variável por vez.";
    if (/repetir.*mes|mes seguinte|proximo mes/.test(t)) {
      const next = monthlyWorkoutAnswer({ ...artifact, variation: (artifact.variation || 0) + 1 });
      const answer = `Para o próximo mês, mantive os padrões principais e troquei parte da distribuição para evitar mudança aleatória de tudo. Use as cargas finais deste ciclo como referência.\n\n${next.text}`;
      rememberArtifact(next, { action: "alternative", text: answer });
      return answer;
    }
    const daysMatch = t.match(/\b([2-6])\s*dias?\b/);
    const durationMinutes = parseDurationMinutes(t);
    const equipment = /sem equipamento|peso corporal|em casa/.test(t) ? "bodyweight" : /halteres/.test(t) ? "dumbbells" : /academia|maquinas/.test(t) ? "gym" : artifact.equipment;
    const includesCardio = artifact.includeCardio || /inclua|adicione|coloque/.test(t) && /cardio|corrida|aerobico/.test(t);
    const easier = artifact.easier || /mais leve|mais facil/.test(t);
    if (daysMatch || durationMinutes || equipment !== artifact.equipment || includesCardio !== artifact.includeCardio || easier !== artifact.easier) {
      const next = monthlyWorkoutAnswer({ days: daysMatch ? Number(daysMatch[1]) : artifact.days, equipment, durationMinutes: durationMinutes || artifact.durationMinutes, includeCardio: includesCardio, easier, variation: artifact.variation || 0 });
      state.profile.trainingDays = next.days;
      state.profile.equipment = next.equipment;
      state.profile.durationMinutes = next.durationMinutes;
      saveState();
      rememberArtifact(next, { action: "modify", text: next.text });
      return next.text;
    }
    if (/outr[oa]|alternativa|diferente/.test(t)) {
      const next = monthlyWorkoutAnswer({ ...artifact, variation: (artifact.variation || 0) + 1 });
      rememberArtifact(next, { action: "alternative", text: next.text });
      return next.text;
    }
    return null;
  }

  function calorieAnswer(lang) {
    const p = state.profile;
    const missingBasics = !p.age || !p.heightCm || !p.weightKg;
    if (missingBasics) {
      const known = profileSummary(lang);
      const labels = {
        pt: { age: "idade", height: "altura", weight: "peso", sex: "sexo usado pela fórmula", activity: "nível de atividade" },
        en: { age: "age", height: "height", weight: "weight", sex: "sex used by the equation", activity: "activity level" },
        de: { age: "Alter", height: "Größe", weight: "Gewicht", sex: "Geschlecht für die Formel", activity: "Aktivitätsniveau" },
        es: { age: "edad", height: "altura", weight: "peso", sex: "sexo usado por la fórmula", activity: "nivel de actividad" }
      }[lang];
      const missing = [];
      if (!p.age) missing.push(labels.age);
      if (!p.heightCm) missing.push(labels.height);
      if (!p.weightKg) missing.push(labels.weight);
      if (!p.sex) missing.push(labels.sex);
      if (!p.activity) missing.push(labels.activity);
      const last = missing.pop();
      const missingText = missing.length ? `${missing.join(", ")} ${lang === "en" ? "and" : lang === "de" ? "und" : lang === "es" ? "y" : "e"} ${last}` : last;
      return {
        pt: `${known ? `Até agora guardei: ${known}. ` : ""}Para continuar, falta informar ${missingText}. Você pode responder de forma curta; por exemplo: “25 anos, 1,58 m, 54 kg, feminino, sedentária”.`,
        en: `${known ? `So far I have saved: ${known}. ` : ""}To continue, I still need ${missingText}. You can reply briefly; for example: “25 years, 1.58 m, 54 kg, female, sedentary”.`,
        de: `${known ? `Bisher habe ich gespeichert: ${known}. ` : ""}Zum Fortfahren fehlen noch ${missingText}. Eine kurze Antwort genügt.`,
        es: `${known ? `Hasta ahora guardé: ${known}. ` : ""}Para continuar, todavía necesito ${missingText}. Puedes responder brevemente.`
      }[lang];
    }

    const femaleBmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age - 161;
    const maleBmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + 5;
    const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55, "very-active": 1.725 };
    const factorLow = p.activity ? factors[p.activity] : 1.2;
    const factorHigh = p.activity ? factors[p.activity] : 1.375;
    const selectedBmr = p.sex === "female" ? femaleBmr : p.sex === "male" ? maleBmr : null;
    const maintenanceLow = Math.round((selectedBmr || Math.min(femaleBmr, maleBmr)) * factorLow / 10) * 10;
    const maintenanceHigh = Math.round((selectedBmr || Math.max(femaleBmr, maleBmr)) * factorHigh / 10) * 10;
    const lossLow = Math.max(1200, maintenanceLow - 350);
    const lossHigh = Math.max(lossLow + 100, maintenanceHigh - 250);
    const summary = profileSummary(lang);
    const needs = [];
    if (!p.sex) needs.push({ pt: "o sexo usado pela fórmula", en: "the sex used by the equation", de: "das in der Formel verwendete Geschlecht", es: "el sexo usado por la fórmula" }[lang]);
    if (!p.activity) needs.push({ pt: "seu nível de atividade", en: "your activity level", de: "dein Aktivitätsniveau", es: "tu nivel de actividad" }[lang]);

    let warning = "";
    if (p.goal === "loss" && p.targetLossKg && p.heightCm) {
      const targetWeight = p.weightKg - p.targetLossKg;
      const targetBmi = targetWeight / Math.pow(p.heightCm / 100, 2);
      if (targetBmi < 18.5) {
        warning = {
          pt: ` Atenção: perder ${p.targetLossKg} kg levaria você a cerca de ${targetWeight} kg (IMC aproximado ${targetBmi.toFixed(1).replace(".", ",")}), abaixo da faixa geralmente considerada saudável. Eu não recomendaria perseguir essa meta sem avaliação de nutricionista ou médico.`,
          en: ` Important: losing ${p.targetLossKg} kg would put you near ${targetWeight} kg (estimated BMI ${targetBmi.toFixed(1)}), below the range generally considered healthy. I would not pursue that target without a dietitian or doctor's assessment.`,
          de: ` Wichtig: ${p.targetLossKg} kg weniger wären etwa ${targetWeight} kg (geschätzter BMI ${targetBmi.toFixed(1)}), unter dem allgemein gesunden Bereich. Dieses Ziel solltest du ohne ärztliche oder ernährungsmedizinische Begleitung nicht verfolgen.`,
          es: ` Importante: perder ${p.targetLossKg} kg te dejaría cerca de ${targetWeight} kg (IMC estimado ${targetBmi.toFixed(1)}), por debajo del rango generalmente saludable. No perseguiría esa meta sin evaluación profesional.`
        }[lang];
      }
    }

    const rangeLow = p.goal === "loss" ? Math.round(lossLow / 10) * 10 : maintenanceLow;
    const rangeHigh = p.goal === "loss" ? Math.round(lossHigh / 10) * 10 : maintenanceHigh;
    const ranges = Math.abs(rangeHigh - rangeLow) <= 20
      ? String(Math.round((rangeLow + rangeHigh) / 20) * 10)
      : `${rangeLow}–${rangeHigh}`;
    const type = p.goal === "loss"
      ? { pt: "para uma perda gradual", en: "for gradual loss", de: "für langsames Abnehmen", es: "para una pérdida gradual" }[lang]
      : { pt: "para manutenção", en: "for maintenance", de: "zur Gewichtserhaltung", es: "para mantenimiento" }[lang];
    const ask = needs.length
      ? { pt: ` Para refinar, diga ${needs.join(" e ")}.`, en: ` To refine it, tell me ${needs.join(" and ")}.`, de: ` Für eine genauere Schätzung nenne mir ${needs.join(" und ")}.`, es: ` Para afinarlo, dime ${needs.join(" y ")}.` }[lang]
      : "";
    const food = Array.isArray(p.dietNotes) && p.dietNotes.includes("frequent-junk-food")
      ? { pt: " Como você disse que come muita besteira, eu começaria trocando parte desses alimentos por refeições com proteína, legumes, frutas e fibras, sem tentar mudar tudo de uma vez.", en: " Since you mentioned eating a lot of junk food, start by replacing some of it with meals containing protein, vegetables, fruit, and fiber instead of changing everything at once.", de: " Da du häufig stark verarbeitete Lebensmittel isst, ersetze zunächst einen Teil davon durch Mahlzeiten mit Protein, Gemüse, Obst und Ballaststoffen.", es: " Como comentaste que comes mucha comida poco nutritiva, empieza sustituyendo una parte por comidas con proteína, verduras, fruta y fibra." }[lang]
      : "";

    return {
      pt: `Guardei estes dados: ${summary}. Sua estimativa inicial é cerca de ${ranges} kcal/dia ${type}. Isso é uma faixa de teste, não uma prescrição; acompanhe fome, energia e evolução por 2–3 semanas.${ask}${warning}${food}`,
      en: `I saved these details: ${summary}. Your initial estimate is about ${ranges} kcal/day ${type}. This is a starting range, not a prescription; track hunger, energy, and progress for 2–3 weeks.${ask}${warning}${food}`,
      de: `Ich habe gespeichert: ${summary}. Eine erste Schätzung liegt bei etwa ${ranges} kcal pro Tag ${type}. Das ist ein Startbereich, keine Verordnung; beobachte Hunger, Energie und Entwicklung 2–3 Wochen lang.${ask}${warning}${food}`,
      es: `Guardé estos datos: ${summary}. Tu estimación inicial es de unas ${ranges} kcal/día ${type}. Es un rango inicial, no una prescripción; observa hambre, energía y progreso durante 2–3 semanas.${ask}${warning}${food}`
    }[lang];
  }

  function proteinAnswer(lang, weight) {
    if (!weight) {
      return {
        pt: "Para calcular uma faixa personalizada, diga seu peso em kg e seu objetivo. Para quem treina e busca hipertrofia, uma referência comum é cerca de 1,6–2,2 g de proteína por kg de peso ao dia.",
        de: "Für eine persönliche Spanne brauche ich dein Gewicht in kg und dein Ziel. Für Muskelaufbau bei regelmäßigem Training sind etwa 1,6–2,2 g Protein pro kg Körpergewicht und Tag ein üblicher Richtwert.",
        es: "Para calcular un rango personalizado, dime tu peso en kg y tu objetivo. Para ganar músculo entrenando con regularidad, una referencia habitual es 1,6–2,2 g de proteína por kg al día.",
        en: "For a personalized range, tell me your weight in kg and your goal. For regular training and muscle gain, a commonly used target is about 1.6–2.2 g of protein per kg of body weight per day."
      }[lang];
    }
    const low = Math.round(weight * 1.6);
    const high = Math.round(weight * 2.2);
    return {
      pt: `Com ${weight} kg, uma faixa prática para hipertrofia é aproximadamente ${low}–${high} g de proteína por dia (${weight} × 1,6–2,2 g/kg). Você pode começar perto do meio da faixa, distribuir em 3–5 refeições e ajustar conforme alimentação, tolerância e orientação profissional.`,
      de: `Bei ${weight} kg liegt eine praktische Spanne für Muskelaufbau bei etwa ${low}–${high} g Protein pro Tag (${weight} × 1,6–2,2 g/kg). Starte zum Beispiel in der Mitte der Spanne, verteile die Menge auf 3–5 Mahlzeiten und passe sie bei Bedarf an.`,
      es: `Con ${weight} kg, un rango práctico para ganar músculo es de unos ${low}–${high} g de proteína al día (${weight} × 1,6–2,2 g/kg). Puedes comenzar cerca del punto medio, repartirlo en 3–5 comidas y ajustarlo según tu alimentación y tolerancia.`,
      en: `At ${weight} kg, a practical muscle-building range is about ${low}–${high} g of protein per day (${weight} × 1.6–2.2 g/kg). You could start near the middle, spread it across 3–5 meals, and adjust for your diet, tolerance, and professional guidance.`
    }[lang];
  }

  function restDayAnswer(lang, weight) {
    const amount = weight ? proteinAnswer(lang, weight).split(/(?<=\.)\s/)[0] + " " : "";
    const followup = {
      pt: "Nos dias sem treino, mantenha aproximadamente a mesma meta: a recuperação e a construção muscular continuam. O total diário e a consistência ao longo da semana importam mais do que reduzir proteína no descanso.",
      de: "An trainingsfreien Tagen solltest du ungefähr dasselbe Ziel beibehalten, denn Erholung und Muskelaufbau laufen weiter. Die tägliche Gesamtmenge und die Konstanz über die Woche sind wichtiger als eine Reduktion an Ruhetagen.",
      es: "En los días de descanso, mantén aproximadamente el mismo objetivo: la recuperación y la construcción muscular continúan. El total diario y la constancia semanal importan más que reducir la proteína esos días.",
      en: "On rest days, keep roughly the same protein target because recovery and muscle building are still happening. Your daily total and weekly consistency matter more than lowering protein when you do not train."
    }[lang];
    return amount + followup;
  }

  function workoutVisualResponse(lang, group, workoutText = "", includeWorkoutText = true) {
    const notice = {
      pt: "Os recursos visuais proprietários não fazem parte desta edição pública. A descrição textual do exercício continua disponível.",
      en: "Proprietary visual assets are not included in this public edition. Text-based exercise guidance remains available.",
      de: "Proprietäre visuelle Inhalte sind in dieser öffentlichen Edition nicht enthalten. Textbasierte Übungsanleitungen bleiben verfügbar.",
      es: "Los recursos visuales propietarios no se incluyen en esta edición pública. La guía textual de ejercicios sigue disponible."
    }[lang] || "Visual assets are not included in this public edition.";
    return { text: `${includeWorkoutText && workoutText ? `${workoutText}\n\n` : ""}${notice}`, media: [] };

    const visuals = {
      legs: {
        src: "",
        names: {
          pt: ["Agachamento para cadeira", "Bom-dia sem carga", "Afundo reverso com apoio", "Ponte de glúteos", "Elevação de panturrilhas"],
          en: ["Chair squat", "Bodyweight good morning", "Supported reverse lunge", "Glute bridge", "Calf raise"],
          de: ["Stuhl-Kniebeuge", "Good Morning ohne Gewicht", "Rückwärts-Ausfallschritt", "Glute Bridge", "Wadenheben"],
          es: ["Sentadilla a silla", "Buenos días sin carga", "Zancada inversa", "Puente de glúteos", "Elevación de pantorrillas"]
        }
      },
      arms: {
        src: "",
        names: {
          pt: ["Flexão inclinada com mãos próximas", "Rosca com resistência da outra mão", "Extensão de tríceps na parede", "Rosca isométrica com toalha", "Prancha com toque no ombro"],
          en: ["Close-grip incline push-up", "Self-resisted biceps curl", "Wall triceps extension", "Towel isometric curl", "Plank shoulder tap"],
          de: ["Enge erhöhte Liegestütze", "Bizepscurl mit Eigenwiderstand", "Trizepsstrecken an der Wand", "Isometrischer Handtuchcurl", "Plank mit Schultertippen"],
          es: ["Flexión inclinada cerrada", "Curl con autorresistencia", "Extensión de tríceps en pared", "Curl isométrico con toalla", "Plancha tocando hombros"]
        }
      },
      chest: {
        src: "",
        names: {
          pt: ["Flexão inclinada", "Supino com halteres", "Supino inclinado com halteres", "Crucifixo com halteres", "Press de peito com elástico"],
          en: ["Incline push-up", "Dumbbell bench press", "Incline dumbbell press", "Dumbbell chest fly", "Resistance-band chest press"],
          de: ["Erhöhte Liegestütze", "Kurzhantel-Bankdrücken", "Schrägbankdrücken", "Kurzhantel-Flys", "Brustdrücken mit Band"],
          es: ["Flexión inclinada", "Press con mancuernas", "Press inclinado", "Apertura con mancuernas", "Press con banda"]
        }
      },
      back: {
        src: "",
        names: {
          pt: ["Remada curvada com halteres", "Puxada com elástico", "Remada unilateral apoiada", "Elevação Y deitada", "Bird-dog"],
          en: ["Bent-over dumbbell row", "Band lat pulldown", "Supported one-arm row", "Prone Y raise", "Bird dog"],
          de: ["Vorgebeugtes Rudern", "Latziehen mit Band", "Einarmiges Rudern", "Y-Heben in Bauchlage", "Bird Dog"],
          es: ["Remo inclinado", "Jalón con banda", "Remo unilateral apoyado", "Elevación Y boca abajo", "Bird-dog"]
        }
      },
      shoulders: {
        src: "",
        names: {
          pt: ["Desenvolvimento com halteres", "Elevação lateral", "Crucifixo inverso", "Elevação frontal alternada", "Flexão pike assistida"],
          en: ["Dumbbell overhead press", "Lateral raise", "Reverse fly", "Alternating front raise", "Assisted pike push-up"],
          de: ["Kurzhantel-Schulterdrücken", "Seitheben", "Reverse Fly", "Abwechselndes Frontheben", "Unterstützte Pike-Liegestütze"],
          es: ["Press de hombros", "Elevación lateral", "Apertura inversa", "Elevación frontal alternada", "Flexión pike asistida"]
        }
      },
      core: {
        src: "",
        names: {
          pt: ["Dead bug", "Prancha nos antebraços", "Bird-dog", "Prancha lateral", "Escalador lento"],
          en: ["Dead bug", "Forearm plank", "Bird dog", "Side plank", "Slow mountain climber"],
          de: ["Dead Bug", "Unterarmstütz", "Bird Dog", "Seitstütz", "Langsamer Mountain Climber"],
          es: ["Dead bug", "Plancha de antebrazos", "Bird-dog", "Plancha lateral", "Escalador lento"]
        }
      },
      "full-body": {
        src: "",
        names: {
          pt: ["Agachamento goblet", "Flexão inclinada", "Remada unilateral apoiada", "Levantamento romeno com halteres", "Dead bug"],
          en: ["Goblet squat", "Incline push-up", "Supported one-arm row", "Dumbbell Romanian deadlift", "Dead bug"],
          de: ["Goblet-Kniebeuge", "Erhöhte Liegestütze", "Einarmiges Rudern", "Rumänisches Kreuzheben", "Dead Bug"],
          es: ["Sentadilla goblet", "Flexión inclinada", "Remo unilateral", "Peso muerto rumano", "Dead bug"]
        }
      }
    };
    const visual = visuals[group];
    if (!visual) return null;
    const names = visual.names[lang];
    const planText = normalize(workoutText || "");
    const differsFromReference = Boolean(planText) && names.some(name => !planText.includes(normalize(name).split(/\s+/).slice(0, 2).join(" ")));
    const intro = {
      pt: `Aqui estão as imagens correspondentes às variações padrão, na mesma ordem do treino:${differsFromReference ? " O plano ativo contém adaptações; quando o nome abaixo for diferente, a imagem mostra a variação original e não deve ser tratada como demonstração exata da substituição." : ""}`,
      en: `Here are the images for the standard variations in workout order:${differsFromReference ? " The active plan contains adaptations; where a name differs, the image shows the original variation rather than an exact demonstration of the replacement." : ""}`,
      de: "Hier sind die passenden Bilder in derselben Reihenfolge wie im Training:",
      es: "Aquí están las imágenes correspondientes, en el mismo orden del entrenamiento:"
    }[lang];
    const caution = {
      pt: "Toque na imagem para ampliar. Use-a como referência geral e interrompa qualquer movimento que provoque dor.",
      en: "Tap the image to enlarge it. Use it as a general reference and stop any movement that causes pain.",
      de: "Zum Vergrößern auf das Bild tippen. Nutze es als allgemeine Referenz und stoppe bei Schmerzen.",
      es: "Toca la imagen para ampliarla. Úsala como referencia general y detente si aparece dolor."
    }[lang];
    const list = names.map((name, index) => `${index + 1}. ${name}`).join("\n");
    return {
      text: `${includeWorkoutText && workoutText ? `${workoutText}\n\n` : ""}${intro}\n${list}\n\n${caution}`,
      media: {
        src: visual.src,
        alt: names.join(", "),
        caption: { pt: "Referência visual do treino · toque para ampliar", en: "Workout visual reference · tap to enlarge", de: "Visuelle Trainingsreferenz · zum Vergrößern tippen", es: "Referencia visual · toca para ampliar" }[lang],
        openLabel: { pt: "Abrir imagem ampliada", en: "Open larger image", de: "Bild vergrößern", es: "Abrir imagen ampliada" }[lang]
      }
    };
  }

  function workoutPlanVisualResponse(lang, artifact) {
    return workoutVisualResponse(lang, "full-body", "", false);

    const groups = Number(artifact?.days || 3) <= 3
      ? ["full-body", "legs", "core"]
      : ["chest", "back", "shoulders", "arms", "legs", "core"];
    const responses = groups.map(group => workoutVisualResponse(lang, group, "", false)).filter(Boolean);
    const title = {
      pt: "Aqui está a galeria visual vinculada ao plano ativo. Cada prancha identifica as variações pelo número; compare o número com a lista apresentada junto da imagem.",
      en: "Here is the visual gallery linked to the active plan. Each sheet identifies its variations by number; match the number with the list beside the image.",
      de: "Hier ist die visuelle Galerie zum aktiven Plan. Die Übungen sind nummeriert und der Liste beim Bild zugeordnet.",
      es: "Aquí está la galería visual vinculada al plan activo. Cada lámina numera sus variaciones; relaciona el número con la lista junto a la imagen."
    }[lang];
    return { text: `${title}\n\n${responses.map(item => item.text.split("\n\n")[0]).join("\n")}`, media: responses.map(item => item.media) };
  }

  function sportVisualResponse(lang, sport) {
    return workoutVisualResponse(lang, "full-body", "", false);

    const specialized = {
      running: { src: "", labels: { pt: ["Aquecimento dinâmico", "Corrida leve", "Aceleração", "Corrida inclinada", "Caminhada de volta à calma"], en: ["Dynamic warm-up", "Easy run", "Acceleration", "Incline run", "Walking cooldown"] } },
      cycling: { src: "", labels: { pt: ["Aquecimento sentado", "Ritmo de resistência", "Intervalo de cadência", "Subida em pé", "Volta à calma"], en: ["Seated warm-up", "Endurance pace", "Cadence interval", "Standing climb", "Cooldown"] } },
      swimming: { src: "", labels: { pt: ["Posição hidrodinâmica", "Entrada e puxada do crawl", "Respiração lateral", "Pernada com prancha", "Nado leve"], en: ["Streamline", "Freestyle catch and pull", "Side breathing", "Kickboard drill", "Easy swim"] } }
    };
    const fallbackLabels = {
      pt: ["Aceleração", "Deslocamento lateral", "Salto com aterrissagem controlada", "Agilidade na escada", "Equilíbrio unilateral"],
      en: ["Acceleration", "Lateral shuffle", "Controlled jump landing", "Agility ladder", "Single-leg balance"],
      de: ["Beschleunigung", "Seitliches Verschieben", "Kontrollierte Landung", "Koordinationsleiter", "Einbeinbalance"],
      es: ["Aceleración", "Desplazamiento lateral", "Aterrizaje controlado", "Escalera de agilidad", "Equilibrio unilateral"]
    }[lang];
    const selected = specialized[sport];
    const labels = selected?.labels[lang] || selected?.labels.en || fallbackLabels;
    const sportName = sport || "field/court";
    const intro = selected
      ? { pt: `Referência visual específica para os blocos da sessão de ${sportName}.`, en: `Sport-specific visual reference for the ${sportName} session.`, de: `Sportspezifische visuelle Referenz für ${sportName}.`, es: `Referencia visual específica para la sesión de ${sportName}.` }[lang]
      : { pt: `Referência visual para os blocos físicos da sessão de ${sportName}. Exercícios técnicos com bola exigem orientação específica do esporte.`, en: `Visual reference for the physical blocks of the ${sportName} session. Ball skills require sport-specific instruction.`, de: `Visuelle Referenz für die athletischen Blöcke der Einheit ${sportName}.`, es: `Referencia visual para los bloques físicos de la sesión de ${sportName}.` }[lang];
    return {
      text: `${intro}\n${labels.map((name, index) => `${index + 1}. ${name}`).join("\n")}\n\n${{ pt: "Use como referência geral, preserve a técnica e interrompa se sentir dor.", en: "Use this as a general reference and stop if you feel pain.", de: "Als allgemeine Referenz nutzen und bei Schmerzen stoppen.", es: "Úsala como referencia general y detente si aparece dolor." }[lang]}`,
      media: { src: selected?.src || "", alt: labels.join(", "), caption: { pt: "Referência visual de performance · toque para ampliar", en: "Performance visual reference · tap to enlarge", de: "Visuelle Performance-Referenz", es: "Referencia visual de rendimiento" }[lang] }
    };
  }

  function catalogQueryForDialogue(analysis, artifact) {
    const modifiers = analysis.modifiers;
    const parts = [];
    if (modifiers.easier) parts.push("para uma pessoa iniciante");
    if (modifiers.harder) parts.push("para uma pessoa avançada");
    if (modifiers.noEquipment) parts.push("em casa sem equipamentos");
    if (modifiers.dumbbells) parts.push("com halteres");
    if (modifiers.gym) parts.push("na academia com máquinas");
    if (modifiers.home) parts.push("em casa");
    if (modifiers.durationMinutes) parts.push(`em apenas ${modifiers.durationMinutes} minutos`);
    if (modifiers.moreProtein) parts.push("rica em proteína");
    if (modifiers.fewerCalories) parts.push("com objetivo de emagrecimento");
    if (modifiers.lactoseFree) parts.push("sem consumir lactose");
    if (modifiers.vegetarian) parts.push("alimentação vegetariana");
    if (modifiers.vegan) parts.push("alimentação vegana");
    if (modifiers.glutenFree) parts.push("sem glúten");
    if (modifiers.cheaper) parts.push("com orçamento reduzido");
    if (modifiers.restDay) parts.push("nos dias de descanso");
    if (modifiers.trainingDay) parts.push("nos dias de treino");
    if (modifiers.speed) parts.push("com foco em velocidade");
    if (modifiers.sedentary) parts.push("para uma pessoa que trabalha sentada e tem rotina sedentária");
    if (artifact?.focus) parts.push(artifact.focus);
    return parts.join(" ") || analysis.query;
  }

  function workoutGroupFromArtifact(artifact) {
    if (artifact?.group) return artifact.group;
    const focus = normalize(artifact?.focus || "");
    if (/perna|gluteo|panturrilha|posterior/.test(focus)) return "legs";
    if (/peito/.test(focus)) return "chest";
    if (/costa/.test(focus)) return "back";
    if (/ombro/.test(focus)) return "shoulders";
    if (/biceps|triceps|braco/.test(focus)) return "arms";
    return state.lastWorkoutGroup || "full-body";
  }

  function variedWorkoutText(lang, artifact, analysis) {
    const group = workoutGroupFromArtifact(artifact);
    const variation = (artifact?.variation || 0) + 1;
    let text = workoutAnswer(lang, group);
    if (lang !== "pt") return { text, group, variation };
    const replacements = {
      legs: ["Step-up em banco baixo — 8–12 por perna", "Agachamento sumô — 10–15", "Passada lateral — 8–10 por lado", "Elevação pélvica unilateral — 8–12 por lado", "Wall sit — 20–40 s"],
      chest: ["Chest press na máquina — 8–12", "Flexão com apoio — 8–15", "Crossover baixo para cima — 10–15", "Supino com pausa — 6–10", "Crucifixo no cabo — 12–15"],
      back: ["Remada apoiada — 8–12", "Puxada neutra — 8–12", "Pullover no cabo — 10–15", "Remada alta com elástico — 10–15", "Face pull — 12–18"],
      shoulders: ["Desenvolvimento unilateral — 8–12", "Elevação lateral inclinada — 10–15", "Face pull — 12–18", "Crucifixo inverso apoiado — 10–15", "Elevação lateral no cabo — 12–15"],
      arms: ["Rosca inclinada — 8–12", "Tríceps testa — 8–12", "Rosca no cabo — 10–15", "Tríceps unilateral — 10–15", "Rosca martelo cruzada — 10–12"],
      "full-body": ["Agachamento goblet — 8–12", "Supino com halteres — 8–12", "Remada unilateral — 8–12", "Levantamento romeno — 8–12", "Prancha lateral — 20–30 s"]
    }[group] || [];
    const replaceLine = (source, number, replacement) => {
      const pattern = new RegExp(`^${number}\\. .*$`, "m");
      const currentLine = source.match(pattern)?.[0] || "";
      const retainedSets = currentLine.match(/(?:·\s*|—\s*)(\d+)\s*(?:series|séries)|\b(\d+)×/i);
      const sets = Number(retainedSets?.[1] || retainedSets?.[2]) || (state.profile.experience === "beginner" ? 2 : 3);
      return source.replace(pattern, `${number}. ${replacement} · ${sets} séries`);
    };

    if (analysis.action === "alternative") {
      text = replaceLine(text, 2, replacements[variation % replacements.length]);
      text = replaceLine(text, 4, replacements[(variation + 2) % replacements.length]);
      text = `Aqui está uma alternativa diferente para o mesmo objetivo.\n\n${text}`;
    }
    if (analysis.modifiers.swapOrdinal) {
      const index = analysis.modifiers.swapOrdinal;
      text = replaceLine(artifact?.text || text, index, replacements[(variation + index) % replacements.length]);
      text = `Substituí somente o exercício ${index} e mantive o restante do plano.\n\n${text}`;
    }
    if (analysis.modifiers.easier) text = `Versão mais fácil: use 2 séries, amplitude confortável e termine com 3–4 repetições em reserva.\n\n${text.replace(/· 3 séries/g, "· 2 séries")}`;
    if (analysis.modifiers.harder) text = `Versão mais difícil: mantenha a técnica e acrescente uma série aos dois primeiros exercícios ou use uma descida de 3 segundos.\n\n${text}`;
    if (analysis.modifiers.shorter) text = `Versão mais curta: preserve o aquecimento e os três primeiros exercícios; retire os acessórios finais se o tempo acabar.\n\n${text}`;
    if (analysis.modifiers.fuller) text = `Versão mais completa: mantenha o plano e acrescente 2 séries de core ou mobilidade ao final, sem aumentar o volume se a recuperação estiver ruim.\n\n${text}`;
    return { text, group, variation };
  }

  function knowledgeContinuation(topic, action) {
    const alternatives = {
      "fat-loss": "Outra estratégia é organizar primeiro o ambiente e a rotina: defina 2–3 refeições-base, aumente passos gradualmente, mantenha musculação e acompanhe médias semanais. Se a adesão estiver boa por 2–3 semanas, ajuste apenas uma variável.",
      "weight-plateau": "Uma segunda abordagem para o platô é fazer uma semana de auditoria sem reduzir calorias: confira porções, bebidas, fins de semana, passos, sono e ciclo menstrual. Depois altere somente o fator com maior impacto provável.",
      hypertrophy: "Outra forma de progredir na hipertrofia é usar progressão dupla: mantenha a carga dentro de uma faixa de repetições e só aumente o peso quando atingir o topo da faixa em todas as séries com boa técnica.",
      hydration: "Outra forma prática de acompanhar hidratação é observar sede, cor da urina e variação do peso antes e depois de treinos longos. Em calor ou suor intenso, água e sódio podem precisar de ajuste.",
      recovery: "Para aprofundar a recuperação, acompanhe quatro sinais: desempenho, qualidade do sono, dor muscular e disposição. Queda persistente em vários deles sugere reduzir temporariamente volume ou intensidade.",
      creatine: "Como alternativa de uso, mantenha 3–5 g de creatina monohidratada diariamente, em qualquer horário que facilite a consistência. A fase de saturação é opcional.",
      supplements: "Avalie suplementos por necessidade: proteína quando a alimentação não alcança a meta, creatina para força e esforços repetidos, e cafeína quando não prejudica sono ou ansiedade. Evite produtos com promessas exageradas.",
      cardio: "Outra opção de cardio é combinar duas sessões leves em ritmo conversacional com uma sessão curta de intervalos, mantendo pelo menos 48 horas entre trabalhos intensos.",
      running: "Uma alternativa para corrida é alternar corrida e caminhada três vezes por semana, aumentando primeiro os minutos correndo e somente depois a velocidade.",
      football: "Outra sessão para futebol pode combinar 10 minutos de domínio de bola, 6 acelerações de 15–20 m, 4 blocos de mudança de direção e jogo reduzido, preservando qualidade técnica.",
      "sports-performance": "Aprofunde dividindo a performance em técnica, força, potência, velocidade e resistência. Escolha uma ou duas prioridades por bloco e meça resultados, não apenas cansaço.",
      cravings: "Outra estratégia é aplicar uma pausa de 10 minutos: identifique o gatilho, faça um lanche saciante se houver fome e depois escolha conscientemente uma porção do alimento desejado, sem proibição absoluta.",
      "nutrition-basics": "Outra estrutura simples é escolher uma proteína, um vegetal ou fruta, um carboidrato adequado à atividade e uma pequena fonte de gordura em cada refeição principal.",
      "protein-quality-timing": "Para aprofundar, distribua o total em 3–5 refeições. O total diário é prioritário; variar fontes animais e vegetais ajuda a cobrir aminoácidos e micronutrientes.",
      "gym-beginner": "Outra opção para começar é fazer duas sessões de corpo inteiro por semana, registrar cargas e acrescentar uma repetição antes de aumentar o peso."
    };
    const base = alternatives[topic];
    if (!base) return null;
    return action === "explain" ? `Explicando melhor: ${base}` : base;
  }

  function explicitKnowledgeTopic(text) {
    const t = normalize(text);
    return [
      ["sleep", /\b(sono|dormir)\b/], ["recovery", /\b(recuperar|recuperacao)\b/],
      ["cardio", /\b(cardio|aerobico)\b/], ["hydration", /\b(hidratacao|agua|quantos litros)\b/],
      ["creatine", /\bcreatina\b/], ["fiber", /\bfibras?\b/], ["supplements", /\bsuplementos?\b/],
      ["protein-quality-timing", /\b(fontes? de proteina|proteina vegetal|proteina animal)\b/]
    ].find(([, pattern]) => pattern.test(t))?.[0] || null;
  }

  function knowledgeDeepDive(artifact, text, analysis) {
    if (artifact?.type !== "knowledge" || (state.lastLanguage || "pt") !== "pt") return null;
    const topic = artifact.topic;
    const t = normalize(text).replace(/[?.!,]/g, "").trim();
    let answer = null;

    if (topic === "hydration") {
      if (analysis.action === "alternative") answer = knowledgeContinuation(topic, analysis.action);
      else if (/dias? de treino|quando treino/.test(t)) answer = "Nos dias de treino, mantenha sua base diária e acrescente líquidos conforme duração, calor e suor. Em uma sessão comum, comece com 400–800 ml por hora, em pequenos goles; para treinos longos ou muito quentes, compare o peso antes e depois e considere sódio. Evite forçar grandes volumes de uma vez.";
      else if (/como sei|suficiente|sinais?|acompanhar/.test(t)) answer = "Você pode avaliar se a hidratação está suficiente combinando três sinais: sede controlada, urina amarelo-clara na maior parte do dia e pouca variação de peso após o treino. Urina totalmente transparente o dia inteiro não é meta. Tontura, confusão ou mal-estar no calor exigem interromper o exercício e buscar ajuda.";
      else if (analysis.action === "continue") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "recovery") {
      if (/pernas?|membros inferiores/.test(t)) answer = "Depois de um treino de pernas, faça atividade leve se estiver confortável, reponha líquidos e faça uma refeição com proteína e carboidrato. Antes de repetir pernas, observe se amplitude, força e técnica voltaram ao normal; dor muscular leve pode durar 24–72 horas, mas dor articular ou piora progressiva não deve ser ignorada.";
      else if (/quanto tempo|demora|quantos dias/.test(t)) answer = "A recuperação de uma sessão comum costuma exigir cerca de 24–72 horas, variando com volume, intensidade, sono, alimentação e experiência. Use o calendário apenas como referência: repita o estímulo quando aquecimento, força e técnica estiverem próximos do normal, sem dor aguda.";
      else if (analysis.action === "explain" || analysis.action === "continue" || analysis.action === "alternative") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "creatine") {
      if (/^quanto$|dose|quantos? gramas?/.test(t)) answer = "A dose simples e bem estudada é 3–5 g de creatina monohidratada por dia. Não precisa calcular por horário nem fazer saturação; tomar diariamente e escolher um horário fácil de lembrar é suficiente.";
      else if (/dias? sem treino|descanso|quando nao treino/.test(t)) answer = "Nos dias sem treino, mantenha a mesma dose diária de 3–5 g. A creatina funciona pela saturação gradual do músculo, portanto consistência ao longo das semanas importa mais que o horário ou a proximidade do treino.";
      else if (/risco|segur|efeito colateral|faz mal|rim/.test(t)) answer = "Em adultos saudáveis, creatina monohidratada nas doses usuais é considerada bem estudada; pode aumentar um pouco o peso por água intramuscular e ocasionalmente causar desconforto gastrointestinal. Quem tem doença renal, está grávida ou usa medicamentos relevantes deve conversar com médico antes. Isso não substitui avaliação individual.";
      else if (/preciso|necessari|obrigatori/.test(t)) answer = "Creatina não é obrigatória. Ela pode oferecer um benefício pequeno a moderado para força, hipertrofia e esforços repetidos, mas treino consistente, alimentação, proteína e sono continuam sendo prioridades. Use apenas se couber no orçamento e não houver contraindicação individual.";
      else if (/barat|econom|custo/.test(t)) answer = "Para economizar, procure creatina monohidratada pura, sem misturas ou sabores, e compare o preço por dose de 3–5 g. Não é necessário comprar pré-treino junto nem usar fase de saturação; se o orçamento estiver apertado, alimentação e treino têm prioridade.";
      else if (analysis.action === "alternative" || analysis.action === "continue") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "supplements") {
      if (/preciso|necessario|obrigatorio|mesmo/.test(t)) answer = "Você não precisa de suplemento por princípio. Primeiro identifique uma necessidade: whey apenas facilita atingir proteína, creatina pode ajudar força e esforços repetidos, e cafeína pode ajudar desempenho quando não prejudica sono ou ansiedade. Se alimentação, treino e sono já funcionam, muitos suplementos não acrescentam benefício relevante.";
      else if (/barat|econom|custo/.test(t)) answer = "A opção mais econômica costuma ser não suplementar sem necessidade. Para proteína, compare custo por 25 g entre ovos, leite ou soja, frango, sardinha, feijão e whey. Se escolher um único suplemento com evidência para força, creatina monohidratada simples costuma ter melhor relação custo-benefício que misturas pré-treino.";
      else if (analysis.action === "alternative" || analysis.action === "continue") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "cardio") {
      if (analysis.action === "alternative") answer = knowledgeContinuation(topic, analysis.action);
      else if (/20 minutos|pouco tempo/.test(t)) answer = "Em 20 minutos, faça 4 minutos leves, 10 minutos alternando 1 minuto moderado e 1 minuto leve, 3 minutos em ritmo contínuo confortável e 3 minutos de volta à calma. Para iniciantes, deixe todos os blocos em ritmo conversacional nas primeiras semanas.";
      else if (/encaix|musculacao|treino de forca/.test(t)) answer = "Para conciliar cardio e musculação, priorize o treino mais importante primeiro. Faça cardio leve após a força ou em dias separados; deixe intervalos intensos longe do treino pesado de pernas e mantenha pelo menos 24–48 horas entre estímulos exigentes quando a recuperação cair.";
      else if (analysis.action === "continue" || analysis.action === "explain") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "running") {
      if (/faca um plano|plano/.test(t)) answer = "Plano inicial de corrida, 3 vezes por semana: 5 minutos caminhando; depois 8 blocos de 1 minuto correndo leve + 2 minutos caminhando; finalize com 5 minutos leves. Repita por duas semanas e aumente primeiro o tempo correndo, sem elevar velocidade e volume juntos.";
      else if (/mais facil|facil/.test(t)) answer = "Versão mais fácil: faça 6 blocos de 30 segundos de corrida muito leve com 2 minutos e 30 segundos de caminhada. Termine sentindo que conseguiria repetir mais dois blocos e mantenha ao menos um dia livre entre sessões.";
      else if (/quantas vezes|frequencia|por semana/.test(t)) answer = "Comece com 2–3 sessões por semana, separadas por pelo menos um dia. Mantenha a maioria leve e aumente o volume semanal gradualmente; se dor ou fadiga se acumularem, repita a mesma semana ou reduza antes de progredir.";
      else if (analysis.action === "alternative" || analysis.action === "continue") answer = knowledgeContinuation(topic, analysis.action);
    }
    if (topic === "sleep") {
      if (/seis horas|6 horas/.test(t)) answer = "Se seis horas forem ocasionais, reduza a intensidade se estiver sonolenta e evite compensar com excesso de cafeína. Se forem habituais, tente ampliar o tempo na cama em 15–30 minutos por semana; recuperação, apetite e desempenho tendem a melhorar quando você se aproxima de 7–9 horas.";
      else if (/como melhorar|o que fazer|dicas?/.test(t) || analysis.action === "continue") answer = "Para melhorar o sono, fixe primeiro o horário de acordar, reserve 7–9 horas na cama, pegue luz natural pela manhã, evite cafeína nas 6–8 horas anteriores e crie uma última hora mais escura e calma. Se ronco intenso, pausas respiratórias ou insônia persistirem, procure avaliação profissional.";
    }
    if (topic === "pre-workout-nutrition") {
      if (/^e depois$|depois do treino|pos treino/.test(t)) {
        answer = "Depois do treino, faça nas horas seguintes uma refeição com proteína e carboidrato e reidrate-se. Não existe obrigação de tomar shake imediatamente se você já se alimentou antes; o total do dia continua sendo o principal.";
        artifact = { ...artifact, topic: "post-workout-nutrition" };
      } else if (/quanto tempo|quando|tempo antes/.test(t)) answer = "Com 2–3 horas de antecedência, cabe uma refeição completa; com 30–60 minutos, prefira um lanche menor e fácil de digerir. Quanto mais perto do treino, menores devem ser porções de gordura e fibra para reduzir desconforto.";
      else if (/sem lactose/.test(t)) answer = "Opções sem lactose antes do treino: banana com aveia e bebida de soja, pão com ovos, arroz com frango ou iogurte sem lactose com fruta. Escolha a porção pelo tempo disponível e pela sua tolerância digestiva.";
    }
    if (topic === "post-workout-nutrition") {
      if (/quanto tempo|quando/.test(t)) answer = "Faça a refeição pós-treino quando for prático, idealmente nas próximas poucas horas. Se treinou em jejum ou ficará muitas horas sem comer, antecipe; se comeu proteína antes, não há urgência de minutos.";
      else if (/sem lactose/.test(t)) answer = "Pós-treino sem lactose pode ser arroz com frango ou tofu, pão com ovos, bebida de soja com fruta e aveia, ou refeição comum com proteína e carboidrato. Whey não é obrigatório.";
    }
    if (topic === "fiber") {
      if (/como atingir|como chegar|fontes|o que comer/.test(t)) answer = "Para chegar à meta, distribua fibras: aveia e fruta no café, feijão ou lentilha no almoço, fruta ou sementes no lanche e bastante verdura no jantar. Aumente uma porção por vez e acompanhe água; não tente saltar de uma ingestão baixa direto para 30 g.";
      else if (analysis.action === "alternative") answer = "Outra forma de aumentar fibras é trocar parte dos refinados por integrais, acrescentar 1 concha de feijão, consumir duas frutas com casca quando possível e usar 1 colher de sementes ao dia. Faça a mudança gradualmente.";
      else if (/gases|estufa|desconforto|inchaco/.test(t)) answer = "Se houver gases, reduza temporariamente o aumento, mastigue devagar e reintroduza em etapas. Leguminosas podem ser deixadas de molho e cozidas bem. Dor forte, sangue nas fezes ou mudança intestinal persistente exige avaliação profissional.";
    }

    if (!answer && ["alternative", "continue", "explain"].includes(analysis.action)) answer = knowledgeContinuation(topic, analysis.action);
    if (!answer) return null;
    rememberArtifact({ ...artifact, variation: (artifact.variation || 0) + 1 }, { action: analysis.action || "reference", text: answer });
    return answer;
  }

  function setConversationFocus({ subtopic = null, detail = null, item = null, entity = null } = {}) {
    if (subtopic !== null) state.activeSubtopic = subtopic;
    if (detail !== null) state.activeDetail = detail;
    if (item !== null) state.activeItem = item;
    if (entity !== null) state.lastReferencedEntity = entity;
  }

  function setBotOffer(action, data = {}) {
    state.lastBotOffer = { action, data, createdAt: Date.now() };
    state.pendingConfirmation = action;
  }

  function consumeBotOffer() {
    const offer = state.lastBotOffer;
    state.lastBotOffer = null;
    state.pendingConfirmation = null;
    return offer;
  }

  function restorePreviousArtifact() {
    const previous = state.artifactHistory.pop();
    if (!previous) return null;
    state.lastArtifact = previous;
    state.lastArtifactVersion = previous.version || Math.max(1, state.lastArtifactVersion - 1);
    state.lastTopic = previous.topic || state.lastTopic;
    state.lastRecordId = previous.recordId || null;
    if (previous.group) state.lastWorkoutGroup = previous.group;
    return previous;
  }

  function declineBotOffer(lang) {
    consumeBotOffer();
    const subject = state.lastArtifact?.type === "food-plan" ? "o cardápio atual" : state.lastArtifact?.type === "workout" ? "o treino atual" : state.lastArtifact?.type === "sport-session" ? "a sessão atual" : "a resposta atual";
    const text = {
      pt: `Tudo bem — mantive ${subject} sem essa alteração. Você pode pedir outra opção, mudar apenas uma parte ou iniciar um novo assunto.`,
      en: "No problem — I kept the current result unchanged. You can ask for another option, change one part, or start a new topic.",
      de: "Kein Problem — das aktuelle Ergebnis bleibt unverändert. Du kannst eine Alternative, eine einzelne Änderung oder ein neues Thema anfordern.",
      es: "De acuerdo: mantuve el resultado actual sin cambios. Puedes pedir otra opción, cambiar una parte o iniciar otro tema."
    }[lang];
    return { text, suppressFollowUp: true };
  }

  const foodServingTable = {
    omelete: { grams: 120, kcal: 180, protein: 16 }, "pao integral": { grams: 50, kcal: 125, protein: 5 }, mamao: { grams: 150, kcal: 60, protein: 1 },
    iogurte: { grams: 170, kcal: 110, protein: 9 }, aveia: { grams: 40, kcal: 150, protein: 5 }, banana: { grams: 100, kcal: 90, protein: 1 },
    arroz: { grams: 120, kcal: 155, protein: 3 }, feijao: { grams: 100, kcal: 75, protein: 5 }, frango: { grams: 120, kcal: 200, protein: 37 },
    salada: { grams: 150, kcal: 50, protein: 2 }, batata: { grams: 180, kcal: 140, protein: 3 }, peixe: { grams: 140, kcal: 210, protein: 30 },
    legumes: { grams: 160, kcal: 70, protein: 3 }, tofu: { grams: 180, kcal: 215, protein: 23 }, fruta: { grams: 130, kcal: 70, protein: 1 },
    castanhas: { grams: 20, kcal: 120, protein: 4 }, vegetais: { grams: 180, kcal: 80, protein: 4 }, carboidrato: { grams: 120, kcal: 160, protein: 3 }, proteina: { grams: 120, kcal: 190, protein: 28 }
  };

  function servingFor(name) {
    const key = normalize(name);
    const match = Object.keys(foodServingTable).find(candidate => key.includes(candidate));
    return { name: name.trim(), ...(foodServingTable[match] || { grams: 100, kcal: 120, protein: 5 }) };
  }

  function splitFoods(value) {
    return String(value || "").replace(/\.$/, "").split(/,|\s+e\s+/i).map(part => part.trim()).filter(Boolean).map(servingFor);
  }

  function foodQuantities(artifact) {
    if (artifact.quantities) return artifact.quantities;
    return {
      breakfast: splitFoods(artifact.breakfast),
      mainMeal: splitFoods(artifact.mainMeal),
      snack: splitFoods(artifact.snack),
      otherMeal: [servingFor("vegetais"), servingFor("proteína"), servingFor("carboidrato")]
    };
  }

  function mealTotals(items) {
    return items.reduce((total, item) => ({ kcal: total.kcal + item.kcal, protein: total.protein + item.protein }), { kcal: 0, protein: 0 });
  }

  function foodTotals(quantities) {
    return Object.values(quantities).flat().reduce((total, item) => ({ kcal: total.kcal + item.kcal, protein: total.protein + item.protein }), { kcal: 0, protein: 0 });
  }

  function formatGramMeal(label, items) {
    return `• ${label}: ${items.map(item => `${item.name} ${item.grams} g`).join(", ")}`;
  }

  function updateFoodArtifact(artifact, changes, action, text) {
    const updated = { ...artifact, ...changes };
    rememberArtifact(updated, { action, text });
    return updated;
  }

  function foodDeepDive(artifact, query) {
    const t = normalize(query).replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
    const quantities = foodQuantities(artifact);
    const labels = { breakfast: "Café da manhã", mainMeal: "Almoço/refeição principal", snack: "Lanche", otherMeal: "Jantar/outra refeição" };
    const fullMenu = normalize(`${artifact.breakfast} ${artifact.mainMeal} ${artifact.snack} ${artifact.otherMeal}`)
      .replace(/iogurte vegetal|leite vegetal|bebida de soja/g, "");
    const animalItems = ["omelete", "ovos", "frango", "peixe", "carne", "sardinha", "iogurte", "leite", "queijo", "ricota"].filter(item => fullMenu.includes(item));

    if (/\b(e vegana|e vegano|isso e vegano|essa dieta e vegana|cardapio e vegano)\b/.test(t)) {
      setConversationFocus({ subtopic: "dietary-check", detail: "vegan", entity: artifact.recordId });
      if (!animalItems.length) return "Sim. A estrutura atual é vegana: não contém carnes, ovos ou laticínios. Ainda assim, confirme rótulos de produtos industrializados e planeje fontes de vitamina B12, cálcio, ferro e ômega-3 com orientação adequada.";
      setBotOffer("food-make-vegan");
      return `Não. A estrutura atual não é vegana porque contém ${animalItems.join(", ")}. Posso adaptar este mesmo cardápio para uma versão realmente vegana, preservando sua organização e aproximando proteína e calorias.`;
    }

    if (/\b(torne|deixe|adapte|faca).*(vegana|vegano)\b|\bversao vegana\b/.test(t)) {
      const updated = {
        ...artifact,
        focus: "vegana",
        context: "adaptada para alimentação vegana",
        breakfast: "tofu mexido, pão integral e mamão",
        mainMeal: "arroz, feijão, tofu e salada",
        snack: "iogurte vegetal com sementes",
        otherMeal: "vegetais, lentilha e carboidrato ajustado à atividade"
      };
      delete updated.quantities;
      const answer = `Adaptei o mesmo cardápio para uma versão realmente vegana:\n• Café da manhã: ${updated.breakfast}.\n• Refeição principal: ${updated.mainMeal}.\n• Lanche: ${updated.snack}.\n• Outra refeição: ${updated.otherMeal}.\n\nRetirei carnes, ovos e laticínios. As porções ainda precisam ser ajustadas ao objetivo; vitamina B12 exige atenção específica em alimentação vegana.`;
      state.appliedModifiers.push("vegan");
      setConversationFocus({ subtopic: "dietary-adaptation", detail: "vegan", entity: artifact.recordId });
      updateFoodArtifact(artifact, updated, "modify", answer);
      return answer;
    }

    if (/\b(qual porcao|quais porcoes|quanto de cada|porcao de cada|porcoes devo)\b/.test(t)) {
      setConversationFocus({ subtopic: "portions", detail: "visual-portions", entity: artifact.recordId });
      setBotOffer("food-grams");
      return "Como ponto de partida visual, use uma palma de proteína, um punho de carboidrato cozido, metade do prato de vegetais e uma pequena porção de gordura. Isso não é uma prescrição: fome, objetivo, treino e evolução determinam o ajuste. Posso converter exatamente esta estrutura para uma versão estimada em gramas.";
    }

    if (/\b(em gramas|quantos gramas|gramas de alimentos|versao em gramas)\b/.test(t)) {
      const totals = foodTotals(quantities);
      const answer = `Mantendo o mesmo cardápio, uma versão inicial em peso pronto para consumo é:\n${formatGramMeal(labels.breakfast, quantities.breakfast)}\n${formatGramMeal(labels.mainMeal, quantities.mainMeal)}\n${formatGramMeal(labels.snack, quantities.snack)}\n${formatGramMeal(labels.otherMeal, quantities.otherMeal)}\n\nEstimativa do dia: cerca de ${totals.kcal} kcal e ${totals.protein} g de proteína. Arroz, feijão, carnes e vegetais estão em peso cozido; marcas e preparo alteram os valores. Use como referência educativa, não como prescrição clínica.`;
      setConversationFocus({ subtopic: "portions", detail: "grams", entity: artifact.recordId });
      setBotOffer("food-calories");
      updateFoodArtifact(artifact, { quantities, units: "grams" }, "deepen", answer);
      return answer;
    }

    if (/\b(calorias|kcal)\b/.test(t) && !/\b(devo|preciso|meta|necessidade)\b/.test(t)) {
      if (/\b(cafe da manha|desjejum)\b/.test(t)) {
        const breakfast = mealTotals(quantities.breakfast);
        return `O café da manhã desse plano fica aproximadamente em ${Math.max(0, breakfast.kcal - 50)}–${breakfast.kcal + 50} kcal, dependendo principalmente das quantidades utilizadas.`;
      }
      const lines = Object.entries(quantities).map(([key, items]) => `• ${labels[key]}: aproximadamente ${mealTotals(items).kcal} kcal`).join("\n");
      const totals = foodTotals(quantities);
      const heading = /atualize/.test(t) ? "Calorias atualizadas para a versão atual" : `Com porções usuais, a estrutura completa fica aproximadamente em ${Math.max(0, totals.kcal - 150)}–${totals.kcal + 150} kcal por dia`;
      const answer = `${heading}:\n${lines}\n• Total aproximado: ${totals.kcal} kcal/dia.\n\nÉ uma estimativa calórica do cardápio em gramas; os valores variam com marcas, cortes, óleo e modo de preparo.`;
      setConversationFocus({ subtopic: "nutrition-values", detail: "calories" });
      setBotOffer("food-by-meal");
      updateFoodArtifact(artifact, { quantities, calculatedTotals: totals }, "calculate", answer);
      return answer;
    }

    if (/\b(separe por refeicao|divida por refeicao|por refeicao|individualmente)\b/.test(t)) {
      const lines = Object.entries(quantities).map(([key, items]) => { const total = mealTotals(items); return `${formatGramMeal(labels[key], items)} — ${total.kcal} kcal, ${total.protein} g de proteína`; }).join("\n");
      const answer = `A mesma versão, separada por refeição:\n${lines}`;
      setConversationFocus({ subtopic: "meals", detail: "meal-breakdown" });
      setBotOffer("food-protein-by-meal");
      updateFoodArtifact(artifact, { quantities }, "deepen", answer);
      return answer;
    }

    if (/\b(proteina de cada|proteina por refeicao|e a proteina|quanta proteina tem cada)\b/.test(t)) {
      const answer = `Proteína estimada por refeição na versão atual:\n${Object.entries(quantities).map(([key, items]) => `• ${labels[key]}: cerca de ${mealTotals(items).protein} g`).join("\n")}\n• Total: aproximadamente ${foodTotals(quantities).protein} g/dia.`;
      setConversationFocus({ subtopic: "meals", detail: "protein-by-meal" });
      updateFoodArtifact(artifact, { quantities }, "deepen", answer);
      return answer;
    }

    const requestedMeal = [
      ["breakfast", /\b(so|apenas|e|quanto no|qual) (?:o )?(cafe da manha|desjejum)\b/],
      ["mainMeal", /\b(so|apenas|e|quanto no|qual) (?:o )?(almoco|refeicao principal)\b/],
      ["snack", /\b(so|apenas|e|quanto no|qual) (?:o )?lanche\b/],
      ["otherMeal", /\b(so|apenas|e|quanto no|qual) (?:o )?(jantar|outra refeicao)\b/]
    ].find(([, pattern]) => pattern.test(t));
    if (requestedMeal) {
      const key = requestedMeal[0];
      const total = mealTotals(quantities[key]);
      const answer = `${formatGramMeal(labels[key], quantities[key])}. Total aproximado: ${total.kcal} kcal e ${total.protein} g de proteína.`;
      setConversationFocus({ subtopic: "meals", detail: state.activeDetail || "meal", item: key, entity: labels[key] });
      return answer;
    }

    const directSwap = t.match(/\b(?:troque|substitua|mude)\s+(?:o |a )?([a-z ]{2,30}?)\s+por\s+([a-z ]{2,30})$/);
    if (directSwap) {
      const oldItem = directSwap[1].trim();
      const replacement = directSwap[2].trim();
      const replacementServing = servingFor(replacement);
      const next = Object.fromEntries(Object.entries(quantities).map(([meal, items]) => [meal, items.map(item => normalize(item.name).includes(normalize(oldItem)) ? replacementServing : item)]));
      const changedCount = Object.values(quantities).flat().filter(item => normalize(item.name).includes(normalize(oldItem))).length;
      if (!changedCount) return `Não encontrei “${oldItem}” no cardápio ativo. Posso trocar apenas um alimento que apareça na versão atual; diga o nome como está escrito no plano.`;
      const total = foodTotals(next);
      const answer = `Substituí somente ${oldItem} por ${replacementServing.grams} g de ${replacement} e mantive o restante. A versão atual fica em aproximadamente ${total.kcal} kcal e ${total.protein} g de proteína no dia.`;
      state.appliedModifiers.push(`${oldItem}->${replacement}`);
      setConversationFocus({ subtopic: "substitution", detail: "applied", item: replacement, entity: replacement });
      updateFoodArtifact(artifact, { quantities: next }, "modify", answer);
      return answer;
    }

    const namedSwap = t.match(/\b(?:posso trocar|troque|substitua)\s+(?:o |a )?([a-z]+(?:\s+[a-z]+){0,2})\b/);
    if (namedSwap || /\bposso trocar o frango\b/.test(t)) {
      const item = namedSwap?.[1] || "frango";
      const itemKey = normalize(item);
      const alternatives = /arroz|batata|massa|pao|tapioca|cuscuz|mandioca|carboidrato/.test(itemKey)
        ? "batata, arroz, mandioca, massa ou outro carboidrato em porção equivalente"
        : /salada|vegetais|legumes|brocolis|couve|abobora/.test(itemKey)
          ? "outro vegetal de que goste, mantendo volume e variedade"
          : /leite|iogurte|queijo|ricota/.test(itemKey)
            ? "uma alternativa sem lactose ou bebida/iogurte de soja fortificado"
            : "tofu, peixe, ovos, leguminosas ou outra fonte proteica equivalente";
      setConversationFocus({ subtopic: "substitution", detail: "choose-replacement", item, entity: item });
      state.pendingRequest = "food-replacement";
      state.pendingConfirmation = item;
      setBotOffer("food-replacement", { item });
      return `Sim. Posso substituir mantendo a função do alimento. Para trocar ${item}, considere ${alternatives}. Diga somente a opção desejada, por exemplo: “por tofu”.`;
    }

    const replacement = t.match(/^por\s+([a-z]+(?:\s+[a-z]+){0,2})$/)?.[1]
      || (state.pendingRequest === "food-replacement" && /^[a-z]+(?:\s+[a-z]+){0,2}$/.test(t) && !/^(sim|nao|pode|talvez)$/.test(t) ? t : null);
    if (replacement && (state.pendingRequest === "food-replacement" || state.activeSubtopic === "substitution")) {
      const oldItem = state.activeItem || state.lastReferencedEntity || "frango";
      const replacementServing = servingFor(replacement);
      if (normalize(replacement).includes("tofu")) Object.assign(replacementServing, foodServingTable.tofu, { name: "tofu" });
      const next = Object.fromEntries(Object.entries(quantities).map(([meal, items]) => [meal, items.map(item => normalize(item.name).includes(normalize(oldItem)) ? replacementServing : item)]));
      const total = foodTotals(next);
      const answer = `Substituí somente ${oldItem} por ${replacementServing.grams} g de ${replacement} na refeição principal e mantive o restante. A versão atual fica em aproximadamente ${total.kcal} kcal e ${total.protein} g de proteína no dia.`;
      state.pendingRequest = null;
      state.pendingConfirmation = null;
      state.appliedModifiers.push(`${oldItem}->${replacement}`);
      setConversationFocus({ subtopic: "substitution", detail: "applied", item: replacement, entity: replacement });
      updateFoodArtifact(artifact, { quantities: next }, "modify", answer);
      return answer;
    }

    if (/\bquanto (?:de |do |da )?tofu\b|^quanto\??$/.test(t) && state.activeItem === "tofu") {
      const tofu = Object.values(quantities).flat().find(item => normalize(item.name).includes("tofu")) || servingFor("tofu");
      return `Na versão atual, use aproximadamente ${tofu.grams} g de tofu pronto para consumo. Isso fornece cerca de ${tofu.kcal} kcal e ${tofu.protein} g de proteína; a marca e o teor de água podem alterar os valores.`;
    }

    if (/\b(lista de compras|compras dessa versao|ingredientes dessa versao)\b/.test(t) && artifact.quantities) {
      const items = Object.values(quantities).flat();
      const merged = {};
      items.forEach(item => { merged[item.name] = (merged[item.name] || 0) + item.grams; });
      return `Lista-base para esse cardápio — versão ${artifact.version || state.lastArtifactVersion}, para um dia:\n${Object.entries(merged).map(([name, grams]) => `• ${name}: aproximadamente ${grams} g`).join("\n")}\n\nMultiplique pelas pessoas e pelos dias planejados; para itens cozidos, compre um pouco mais considerando perdas e rendimento.`;
    }
    return null;
  }

  function workoutExercises(artifact) {
    return String(artifact.planText || artifact.text || "").split("\n").map(line => line.match(/^\s*(\d+)\.\s+(.+?)(?:\s+[—·]|$)/)).filter(Boolean).map(match => ({ index: Number(match[1]), name: match[2].trim() }));
  }

  function activeExercise(artifact) {
    const exercises = workoutExercises(artifact);
    const index = Number(state.activeItem?.index || state.activeItem || 0);
    return exercises.find(item => item.index === index) || null;
  }

  function workoutDeepDive(artifact, query) {
    const t = normalize(query);
    const explicitlyRequestedGroup = detectWorkoutGroup(t);
    const activeGroup = workoutGroupFromArtifact(artifact);
    if ((!explicitlyRequestedGroup || explicitlyRequestedGroup === activeGroup) && /(?:foto|fotos|imagem|imagens|visual|mostrar.*exercicio|como.*faz)/.test(t)) {
      return workoutVisualResponse(state.lastLanguage || "pt", workoutGroupFromArtifact(artifact), artifact.planText || artifact.text || "", false);
    }
    const ordinal = t.match(/\b(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|[1-5])\b/);
    const ordinalMap = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5 };
    const selected = ordinal ? (Number(ordinal[1]) || ordinalMap[ordinal[1]]) : null;
    if (selected && /\b(explique|detalhe|e o|sobre o)\b/.test(t)) {
      const exercise = workoutExercises(artifact).find(item => item.index === selected);
      if (!exercise) return null;
      setConversationFocus({ subtopic: "exercise", detail: "explanation", item: exercise, entity: exercise.name });
      setBotOffer("workout-technique", { index: selected });
      return `O exercício ${selected}, ${exercise.name}, é parte do treino ativo. Ele deve ser executado com movimento controlado, amplitude confortável e carga que permita manter a técnica. Posso detalhar os músculos envolvidos ou a execução passo a passo.`;
    }
    const exercise = activeExercise(artifact);
    if (!exercise) return null;
    if (/\b(qual musculo|quais musculos|ele trabalha|músculo trabalha)\b/.test(t)) {
      const name = normalize(exercise.name);
      const muscles = /afundo|agachamento|leg press|step-up|cadeira extensora/.test(name) ? "principalmente quadríceps e glúteos, com posteriores e core estabilizando" : /ponte|hip thrust/.test(name) ? "principalmente glúteos e posteriores de coxa" : /supino|flexao|crucifixo/.test(name) ? "peitoral, tríceps e deltoide anterior" : "o grupo principal do padrão de movimento, com core e articulações próximas estabilizando";
      state.activeDetail = "muscles";
      return `${exercise.name} trabalha ${muscles}. O músculo dominante pode mudar um pouco com postura, amplitude e equipamento.`;
    }
    if (/\b(como faco|corretamente|execucao|passo a passo|como executar)\b/.test(t)) {
      state.activeDetail = "technique";
      return `Execução de ${exercise.name}: estabilize o tronco, alinhe joelho e pé, faça a fase de descida de forma controlada, use apenas amplitude sem dor e suba sem perder a postura. Respire antes da repetição e solte o ar ao vencer a parte mais difícil. Interrompa se houver dor aguda.`;
    }
    if (/\b(troque|substitua|mude) (?:esse|este|ele|o exercicio)\b/.test(t)) {
      const name = normalize(exercise.name);
      const replacement = /agachamento|afundo|leg press|step-up|cadeira|ponte/.test(name) ? "step-up com apoio" : /supino|flexao|crucifixo|peito/.test(name) ? "flexão inclinada" : /remada|puxada|pulldown/.test(name) ? "remada unilateral" : /rosca|biceps/.test(name) ? "rosca martelo" : /triceps|extensao/.test(name) ? "extensão de tríceps" : "uma variação equivalente e confortável";
      const source = artifact.planText || artifact.text || "";
      const currentLine = source.match(new RegExp(`^${exercise.index}\\. .*$`, "m"))?.[0] || "";
      const prescription = currentLine.match(/\s+[—·].*$/)?.[0] || " — 2–3×8–12";
      const planText = source.replace(new RegExp(`^${exercise.index}\\. .*$`, "m"), `${exercise.index}. ${replacement}${prescription}`);
      state.activeItem = { index: exercise.index, name: replacement };
      state.lastReferencedEntity = replacement;
      state.appliedModifiers.push(`exercise-${exercise.index}:${exercise.name}->${replacement}`);
      const answer = `Troquei somente o exercício ${exercise.index}: ${exercise.name} por ${replacement}, mantendo séries, repetições e o restante do treino.\n\n${planText}`;
      rememberArtifact({ ...artifact, planText }, { action: "modify", text: answer });
      return answer;
    }
    if (/\b(tem substituicao|posso substituir|outra opcao para ele)\b/.test(t)) {
      state.activeDetail = "substitution";
      setBotOffer("workout-no-equipment", { index: exercise.index });
      return `Sim. Posso substituir ${exercise.name} por outro exercício do mesmo padrão. Se estiver sem equipamento, adapto somente este item e mantenho o restante do treino.`;
    }
    if (/\bsem equipamento\b/.test(t)) {
      const replacement = exercise.index === 3 ? "agachamento dividido com apoio" : "uma variação equivalente com peso corporal";
      state.appliedModifiers.push(`exercise-${exercise.index}:bodyweight`);
      state.activeDetail = "bodyweight-substitution";
      state.activeItem = { index: exercise.index, name: replacement };
      state.lastReferencedEntity = replacement;
      const source = artifact.planText || artifact.text || "";
      const planText = source.replace(new RegExp(`^${exercise.index}\\. .*$`, "m"), `${exercise.index}. ${replacement} — 2–3×8–12 por lado`);
      const answer = `Para o exercício ${exercise.index}, substitua ${exercise.name} por ${replacement}: mantenha 2–3 séries de 8–12 repetições por lado, com amplitude confortável, e mantive o restante do treino igual.`;
      rememberArtifact({ ...artifact, planText }, { action: "modify", text: answer });
      return answer;
    }
    if (/\b(quantas series|numero de series)\b/.test(t)) return `Para ${exercise.name}, faça ${state.profile.experience === "beginner" ? "2" : "3"} séries. Comece pelo menor volume se ainda estiver aprendendo a técnica.`;
    if (/\b(quantas repeticoes|repeticoes)\b/.test(t)) return `Para ${exercise.name}, use 8–12 repetições com 2–3 repetições em reserva. Pare antes se a técnica piorar.`;
    if (/\b(quanto descanso|intervalo|descanso)\b/.test(t)) return `Para ${exercise.name}, descanse aproximadamente 60–90 segundos; use até 120 segundos se for exigente ou se a técnica ainda não tiver recuperado.`;
    if (/\bmais facil\b/.test(t)) {
      state.appliedModifiers.push(`exercise-${exercise.index}:easier`);
      return `Versão mais fácil de ${exercise.name}: reduza a amplitude, use apoio, faça 2 séries de 8 repetições e termine com 4 repetições em reserva. Mantive os demais exercícios.`;
    }
    if (/\b(atualize o treino inteiro|treino completo atualizado)\b/.test(t)) {
      const answer = `Treino atualizado: mantive a estrutura original e apliquei ao exercício ${exercise.index} as adaptações já discutidas (${state.appliedModifiers.filter(item => item.includes(`exercise-${exercise.index}`)).join(", ") || "técnica e volume ajustados"}).\n\n${artifact.planText || artifact.text}`;
      rememberArtifact({ ...artifact, appliedModifiers: [...state.appliedModifiers] }, { action: "modify", text: answer });
      return answer;
    }
    return null;
  }

  function proteinDeepDive(artifact, query) {
    const t = normalize(query);
    const weight = state.profile.weightKg || artifact.weightKg;
    if (!weight) return null;
    const low = Math.round(weight * 1.6), high = Math.round(weight * 2.2);
    if (/\b(divida por refeicao|por refeicao)\b/.test(t)) {
      setConversationFocus({ subtopic: "protein-distribution", detail: "four-meals" });
      setBotOffer("protein-food-grams");
      return `Dividindo ${low}–${high} g em quatro refeições, busque aproximadamente ${Math.round(low / 4)}–${Math.round(high / 4)} g de proteína em cada uma. Posso converter isso em gramas de alimentos.`;
    }
    if (/\b(em gramas de alimentos|gramas de alimentos)\b/.test(t)) {
      state.activeDetail = "food-grams";
      return `Exemplo em quatro refeições: 2 ovos + 170 g de iogurte; 120–150 g de frango; 170 g de iogurte + 30 g de queijo; e 140 g de peixe ou 180–220 g de tofu com leguminosas. Ajuste combinações para ficar perto de ${Math.round(low / 4)}–${Math.round(high / 4)} g por refeição.`;
    }
    if (/\b(opcoes baratas|mais barato|economico)\b/.test(t)) {
      state.appliedModifiers.push("budget-protein");
      return `Para reduzir custo sem perder a meta de ${low}–${high} g/dia, priorize ovos, leite ou soja, feijão, lentilha, sardinha e cortes de frango em promoção. Combine leguminosas com ovos ou sardinha nas refeições principais.`;
    }
    if (/\b(lista de compras|o que comprar)\b/.test(t)) return "Lista proteica econômica para a versão atual: ovos, leite ou bebida de soja, feijão, lentilha, sardinha, frango, tofu, iogurte e aveia. Ajuste a quantidade ao número de dias e pessoas.";
    return null;
  }

  function sportDeepDive(artifact, query) {
    const t = normalize(query);
    if (/(?:foto|fotos|imagem|imagens|visual|mostrar.*exercicio|como.*faz)/.test(t)) return sportVisualResponse(state.lastLanguage || "pt", artifact.sport);
    if (/\b(explique.*velocidade|parte de velocidade)\b/.test(t)) {
      setConversationFocus({ subtopic: "speed", detail: "sports-speed", entity: "velocidade" });
      return "A parte de velocidade deve vir depois do aquecimento e antes do condicionamento: faça 4–6 acelerações de 10–20 m, com intenção máxima e técnica limpa. Pare o bloco quando a velocidade cair perceptivelmente.";
    }
    if (/^por que|por que\??$/.test(t) && state.activeSubtopic === "speed") return "Porque velocidade depende de alta produção de força e coordenação. Com pausas insuficientes, o exercício vira condicionamento: você continua cansando, mas pratica movimentos mais lentos e perde qualidade técnica.";
    if (/\b(antes do jogo|encaixo antes|na vespera)\b/.test(t)) return "Faça a sessão principal de velocidade 48–72 horas antes do jogo. Na véspera, mantenha somente 10–20 minutos leves de mobilidade, técnica com bola e poucas acelerações, sem fadiga residual.";
    if (/\b(depois do jogo|apos o jogo|e depois)\b/.test(t)) return "Depois do jogo, priorize hidratação, refeição com carboidrato e proteína, sono e atividade leve. Aguarde a recuperação da dor e da fadiga antes de repetir velocidade ou força intensa.";
    return null;
  }

  function detectSport(text) {
    const t = normalize(text);
    const sports = [
      ["football", /\b(futebol|football|soccer)\b/], ["basketball", /\b(basquete|basketball)\b/],
      ["volleyball", /\b(volei|voleibol|volleyball)\b/], ["swimming", /\b(natacao|nadar|swimming)\b/],
      ["tennis", /\b(tenis|tennis)\b/], ["cycling", /\b(ciclismo|bicicleta|cycling)\b/],
      ["running", /\b(corrida|correr|running)\b/]
    ];
    return sports.find(([, pattern]) => pattern.test(t))?.[0] || null;
  }

  function sportSessionAnswer(sport, minutes = 45, focus = "geral", variation = 0) {
    const blocks = {
      football: ["domínio e condução com os dois pés", "acelerações de 10–20 m", "mudanças de direção com bola", "jogo reduzido ou finalizações"],
      basketball: ["controle de bola com as duas mãos", "deslocamentos defensivos e mudança de direção", "acelerações e saltos com aterrissagem estável", "arremessos após deslocamento"],
      volleyball: ["toques e manchetes controladas", "deslocamentos curtos de quadra", "saltos e aterrissagens técnicas", "saques ou ações específicas"],
      swimming: ["nado leve e educativos de técnica", "séries curtas focadas em braçada e respiração", "tiros de qualidade com pausa completa", "nado contínuo em ritmo confortável"],
      tennis: ["coordenação de pés e split-step", "deslocamentos laterais", "golpes técnicos com alvo", "pontos curtos com recuperação completa"],
      cycling: ["giro leve e técnica de cadência", "blocos de ritmo estável", "acelerações curtas", "pedalada leve de recuperação"],
      running: ["caminhada ou trote leve", "educativos de corrida", "blocos de corrida em ritmo conversacional", "acelerações curtas com técnica limpa"]
    }[sport] || ["aquecimento específico", "técnica", "velocidade controlada", "condicionamento específico"];
    const labels = { football: "futebol", basketball: "basquete", volleyball: "vôlei", swimming: "natação", tennis: "tênis", cycling: "ciclismo", running: "corrida" };
    const technique = variation % 2 ? [blocks[0], blocks[2], blocks[1], blocks[3]] : blocks;
    const speedNote = focus === "speed" ? "Use esforços curtos e pausas longas: pare quando a velocidade ou a técnica cair." : focus === "endurance" ? "Use blocos sustentáveis e aumente primeiro a duração; preserve a técnica mesmo com fadiga." : "Mantenha a maior parte em intensidade controlada e preserve qualidade técnica.";
    const mainLabel = focus === "speed" ? "Velocidade" : focus === "endurance" ? "Resistência específica" : "Bloco principal";
    return `Sessão de ${labels[sport] || "performance esportiva"} — ${minutes} minutos${variation ? " · alternativa " + (variation + 1) : ""}\n• Aquecimento: ${Math.max(5, Math.round(minutes * .18))} min de ${technique[0]}.\n• Técnica: ${Math.max(8, Math.round(minutes * .28))} min de ${technique[1]}.\n• ${mainLabel}: ${Math.max(8, Math.round(minutes * .30))} min de ${technique[2]}.\n• Aplicação: ${Math.max(5, Math.round(minutes * .16))} min de ${technique[3]}.\n• Volta à calma: ${Math.max(3, Math.round(minutes * .08))} min.\n\n${speedNote} Ajuste a carga aos jogos e interrompa se houver dor aguda.`;
  }

  function executeBotOffer(offer) {
    if (!offer || !state.lastArtifact) return null;
    const prompts = {
      "food-grams": "em gramas", "food-calories": "e as calorias", "food-by-meal": "separe por refeição", "food-protein-by-meal": "proteína de cada refeição",
      "food-make-vegan": "adapte para uma versão vegana",
      "workout-technique": "como faço corretamente", "workout-no-equipment": "sem equipamento", "protein-food-grams": "em gramas de alimentos"
    };
    if (offer.action === "quality-workout-constraints" || offer.action === "quality-chest-level") {
      state.pendingRequest = "workout-constraints";
      state.pendingFields = [!state.profile.equipment && "equipment", !state.profile.durationMinutes && "durationMinutes", !state.profile.experience && "experience"].filter(Boolean);
      return state.pendingFields.length
        ? "Claro. Diga onde vai treinar ou quais equipamentos possui, quanto tempo tem e seu nível (iniciante, intermediário ou avançado). Pode responder tudo em uma frase; vou manter o grupo muscular e o restante do contexto."
        : workoutAnswer(state.lastLanguage || "pt", workoutGroupFromArtifact(state.lastArtifact));
    }
    if (offer.action === "quality-muscle-progression") {
      const group = workoutGroupFromArtifact(state.lastArtifact);
      const answer = `Progressão de quatro semanas para o treino atual de ${workoutLabel("pt", group).toLowerCase()}:\n• Semana 1: use a menor carga que permita terminar com 3 repetições em reserva.\n• Semana 2: acrescente 1 repetição por série, mantendo a técnica.\n• Semana 3: ao alcançar o topo da faixa, aumente a carga em 2–5% e volte ao início da faixa.\n• Semana 4: reduza 25–35% das séries se houver fadiga acumulada; caso contrário, consolide a carga.\n\nMantenha os exercícios, equipamentos e duração do plano ativo. Dor ou perda de técnica são sinais para não progredir naquele dia.`;
      rememberArtifact({ ...state.lastArtifact, progressionWeeks: 4 }, { action: "deepen", text: answer });
      return answer;
    }
    if (offer.action === "quality-protein-meals") {
      const weight = state.profile.weightKg || state.lastArtifact.weightKg;
      if (!weight) {
        state.pendingRequest = "protein-target";
        state.pendingFields = ["weightKg"];
        return "Para dividir uma meta de proteína entre as refeições, informe primeiro seu peso em kg e seu objetivo.";
      }
      const low = Math.round(weight * 1.6);
      const high = Math.round(weight * 2.2);
      const answer = `Dividindo sua faixa de ${low}–${high} g em quatro refeições, busque aproximadamente ${Math.round(low / 4)}–${Math.round(high / 4)} g de proteína em cada uma. Não precisa ser exatamente igual em todas; o total diário é o principal.`;
      rememberArtifact({ ...state.lastArtifact, meals: 4 }, { action: "deepen", text: answer });
      return answer;
    }
    if (offer.action === "quality-sport-calendar") return sportDeepDive(state.lastArtifact, "como encaixo com os jogos");
    if (offer.action === "quality-weight-week") {
      const answer = "Plano prático para a próxima semana: mantenha 2–3 refeições-base com proteína e vegetais, programe 2–3 sessões de musculação, aumente passos de forma realista, proteja o sono e registre a média do peso. Ao final, ajuste somente uma variável se a tendência de 2–3 semanas não estiver alinhada ao objetivo.";
      rememberArtifact({ ...state.lastArtifact, weeklyPlan: true }, { action: "deepen", text: answer });
      return answer;
    }
    if (offer.action === "quality-calorie-goal") {
      const goal = state.profile.goal === "loss" ? "emagrecimento" : state.profile.goal === "muscle" ? "hipertrofia" : "seu objetivo";
      return `A estimativa atual deve ser comparada com ${goal}, fome, energia, desempenho e tendência de peso por 2–3 semanas. Sem essas observações, não é seguro tratar um único número como meta exata. Se quiser refinar, informe seu objetivo e como seu peso vem mudando.`;
    }
    if (offer.action === "quality-recovery-recent") return "Relacionando ao treino mais recente: priorize sono, hidratação e uma refeição com proteína e carboidrato; repita o mesmo grupo muscular quando dor, energia e desempenho estiverem recuperados. Se a queda de desempenho ou a dor persistirem, reduza temporariamente volume e intensidade.";
    if (offer.action === "quality-hydration") {
      const weight = state.profile.weightKg;
      return weight
        ? `Com ${weight} kg, uma referência inicial de hidratação diária é aproximadamente ${Math.round(weight * 30)}–${Math.round(weight * 35)} ml, antes de acrescentar o necessário por calor, suor e exercício. Use sede, cor da urina e variação do peso ao redor do treino para ajustar.`
        : "Para estimar uma faixa inicial de hidratação, informe seu peso e descreva duração do treino, calor e quanto costuma suar. Não é seguro usar um valor rígido sem esse contexto.";
    }
    if (offer.action === "quality-cravings-plan") return "Plano para o próximo gatilho: identifique se há fome física, faça uma pausa de 10 minutos, escolha um lanche com proteína e fibra quando houver fome e, se a vontade continuar, sirva uma porção planejada sem comer direto da embalagem. Registre horário e gatilho para ajustar a rotina.";
    if (offer.action === "quality-topic-example" || offer.action === "quality-deepen") {
      const lang = state.lastLanguage || "pt";
      if (lang !== "pt") return {
        en: "To adapt the current answer properly, tell me your specific goal, experience level, available equipment or dietary constraints, and how much time you have. I will keep the current topic and change only what you specify.",
        de: "Für eine passende Anpassung nenne bitte dein genaues Ziel, Trainingsniveau, verfügbare Geräte oder Ernährungseinschränkungen und deine verfügbare Zeit. Das aktuelle Thema bleibt erhalten.",
        es: "Para adaptar bien la respuesta actual, dime tu objetivo específico, nivel, equipo disponible o restricciones alimentarias y cuánto tiempo tienes. Mantendré el tema actual y cambiaré solo lo que indiques."
      }[lang];
      if (state.lastArtifact.type === "monthly-workout") return monthlyWorkoutDeepDive(state.lastArtifact, "detalhe");
      if (state.lastArtifact.type === "weekly-workout") return weeklyWorkoutDeepDive(state.lastArtifact, "detalhe");
      const continuation = knowledgeContinuation(state.lastArtifact.topic || state.lastTopic, "explain");
      return continuation || `Vou aprofundar o conteúdo atual sem trocar de assunto: ${state.lastArtifact.text || state.lastBotAnswer}`;
    }
    if (offer.action === "quality-clarify-domain") return "Diga somente uma opção — treino, alimentação, emagrecimento, proteína, recuperação ou esporte — e continuarei a partir dela.";
    if (offer.action === "food-replacement") {
      const item = offer.data?.item || state.activeItem || "esse alimento";
      setBotOffer("food-replacement", { item });
      return `Qual substituição você prefere para ${item}? Diga diretamente, por exemplo: “tofu”, “peixe”, “ovos” ou “lentilha”.`;
    }
    const prompt = prompts[offer.action];
    return prompt ? handleDeepContext(state.lastLanguage || "pt", prompt, true) : null;
  }

  function handleDeepContext(lang, text, fromOffer = false) {
    const artifact = state.lastArtifact;
    const dialogue = window.FitnessDialogueEngine?.analyze(text);
    if (!fromOffer && dialogue?.responseAct === "affirm" && state.lastBotOffer) {
      return executeBotOffer(consumeBotOffer());
    }
    if (!fromOffer && dialogue?.responseAct === "deny") return declineBotOffer(lang);
    if (!fromOffer && dialogue?.responseAct === "repeat" && state.lastBotAnswer) {
      return { pt: `Claro — repetindo a última resposta:\n\n${state.lastBotAnswer}`, en: `Sure — repeating my last answer:\n\n${state.lastBotAnswer}`, de: `Gern — hier ist die letzte Antwort noch einmal:\n\n${state.lastBotAnswer}`, es: `Claro: repito la última respuesta:\n\n${state.lastBotAnswer}` }[lang];
    }
    if (!fromOffer && dialogue?.responseAct === "undo") {
      const previous = restorePreviousArtifact();
      return previous
        ? { pt: `Desfiz a última alteração e restaurei a versão anterior.\n\n${previous.text || "O conteúdo anterior está ativo novamente."}`, en: `I undid the last change and restored the previous version.\n\n${previous.text || "The previous content is active again."}`, de: `Die letzte Änderung wurde rückgängig gemacht.\n\n${previous.text || "Die vorherige Version ist wieder aktiv."}`, es: `Deshice el último cambio y restauré la versión anterior.\n\n${previous.text || "El contenido anterior vuelve a estar activo."}` }[lang]
        : { pt: "Não há uma versão anterior nesta sessão para restaurar.", en: "There is no earlier version in this session to restore.", de: "In dieser Sitzung gibt es keine frühere Version.", es: "No hay una versión anterior en esta sesión para restaurar." }[lang];
    }
    if (!artifact || lang !== "pt") return null;
    const t = normalize(text).replace(/[?.!,]/g, "").trim();
    if (!fromOffer && dialogue?.responseAct !== "affirm") {
      state.lastBotOffer = null;
      state.pendingConfirmation = state.pendingRequest === "food-replacement" ? state.pendingConfirmation : null;
    }
    if (artifact.type === "food-plan") return foodDeepDive(artifact, text);
    if (artifact.type === "workout") return workoutDeepDive(artifact, text);
    if (artifact.type === "weekly-workout") return weeklyWorkoutDeepDive(artifact, text);
    if (artifact.type === "monthly-workout") return monthlyWorkoutDeepDive(artifact, text);
    if (artifact.type === "protein-plan") return proteinDeepDive(artifact, text);
    if (artifact.type === "sport-session") return sportDeepDive(artifact, text);
    return null;
  }

  function handleDialogueContext(lang, text) {
    const artifact = state.lastArtifact;
    if (!artifact || !window.FitnessDialogueEngine) return null;
    const analysis = window.FitnessDialogueEngine.analyze(text);
    const requestedKnowledgeTopic = explicitKnowledgeTopic(text);
    if (requestedKnowledgeTopic && requestedKnowledgeTopic !== artifact.topic) return null;
    const knowledgeAnswer = knowledgeDeepDive(artifact, text, analysis);
    if (knowledgeAnswer) return knowledgeAnswer;
    if (artifact.type === "sport-session" && /\b(resistencia|endurance|condicionamento)\b/.test(analysis.query)) {
      const sport = artifact.sport || state.profile.sport || "football";
      const answer = sportSessionAnswer(sport, artifact.durationMinutes || state.profile.durationMinutes || 45, "endurance", artifact.variation || 0);
      rememberArtifact({ ...artifact, sport, focus: "endurance" }, { action: "modify", text: answer });
      return answer;
    }
    if (!analysis.action || analysis.explicitNewRequest) return null;
    state.lastAction = analysis.action;

    const foodReference = contextualArtifactAnswer(lang, text);
    if (foodReference) return foodReference;

    if (artifact.type === "workout" && analysis.action === "alternative") {
      const varied = variedWorkoutText(lang, artifact, analysis);
      const updated = { ...artifact, type: "workout", topic: "workout", group: varied.group, variation: varied.variation, durationMinutes: state.profile.durationMinutes || artifact.durationMinutes || 35 };
      state.lastWorkoutGroup = varied.group;
      rememberArtifact(updated, { action: analysis.action, text: varied.text });
      return varied.text;
    }

    if (artifact.type === "sport-session" && analysis.action === "alternative") {
      const sport = artifact.sport || state.profile.sport || "football";
      const variation = (artifact.variation || 0) + 1;
      const answer = sportSessionAnswer(sport, artifact.durationMinutes || state.profile.durationMinutes || 45, artifact.focus || "geral", variation);
      rememberArtifact({ ...artifact, sport, variation }, { action: "alternative", text: answer });
      return answer;
    }

    if (analysis.action === "reference") {
      if (artifact.type === "workout") {
        const group = workoutGroupFromArtifact(artifact);
        if (analysis.references.duration) return `Esse treino foi planejado para aproximadamente ${state.profile.durationMinutes || artifact.durationMinutes || 35}–${(state.profile.durationMinutes || artifact.durationMinutes || 35) + 10} minutos, incluindo aquecimento.`;
        if (analysis.references.rest) return "Use cerca de 90–150 segundos nos exercícios principais e 60–90 segundos nos acessórios. Descanse mais se a técnica ou as repetições ainda não se recuperaram.";
        if (analysis.references.frequency) return "Em geral, faça esse treino 1–2 vezes por semana, mantendo ao menos 48 horas antes de repetir o mesmo grupo muscular e ajustando ao volume do restante da semana.";
        if (analysis.references.images) return workoutVisualResponse(lang, group, artifact.text || "", false) || "Diga qual exercício deseja visualizar primeiro.";
        if (analysis.references.substitution) return "Posso substituir mantendo o mesmo padrão de movimento. Diga qual exercício quer trocar ou escreva, por exemplo, “troque o terceiro exercício”.";
      }
      if (artifact.type === "sport-session") {
        if (analysis.references.rest) return "Nos exercícios de velocidade e potência, descanse 60–180 segundos para preservar qualidade. Nos blocos técnicos leves, use pausas menores conforme o controle do movimento.";
        if (analysis.references.games) return "Mantenha a sessão mais intensa longe do jogo principal: velocidade e força 48–72 horas antes; na véspera, prefira técnica leve, mobilidade e baixa fadiga. Após o jogo, use recuperação ou atividade leve.";
        if (analysis.references.duration) return `A sessão pode ser concluída em cerca de ${state.profile.durationMinutes || 45} minutos; reduza o número de blocos, não a qualidade das repetições, se tiver menos tempo.`;
        if (analysis.references.images) return sportVisualResponse(lang, artifact.sport);
      }
    }

    if (artifact.type === "protein-plan") {
      const weight = state.profile.weightKg;
      const low = weight ? Math.round(weight * 1.6) : null;
      const high = weight ? Math.round(weight * 2.2) : null;
      if (analysis.modifiers.restDay) return restDayAnswer(lang, weight);
      if (analysis.modifiers.noWhey || analysis.action === "alternative") {
        const variants = [
          "Exemplo sem whey: ovos no café da manhã, frango ou tofu no almoço, iogurte ou soja no lanche e feijão com peixe, carne magra ou tofu no jantar.",
          "Outra forma: distribua leite ou bebida de soja, ovos, feijão/lentilha e uma fonte principal como frango, peixe ou tofu ao longo do dia.",
          "Alternativa econômica: ovos, leite, sardinha, frango, feijão e lentilha podem atingir a meta sem suplemento."
        ];
        const index = (artifact.variation || 0) + 1;
        const answer = `${variants[index % variants.length]}${low ? ` Para sua faixa de ${low}–${high} g/dia, ajuste as porções e distribua entre as refeições.` : " Informe seu peso para calcular as porções."}`;
        rememberArtifact({ ...artifact, variation: index }, { action: analysis.action, text: answer });
        return answer;
      }
      if (analysis.modifiers.fourMeals) {
        return weight ? `Dividindo ${low}–${high} g em quatro refeições, busque aproximadamente ${Math.round(low / 4)}–${Math.round(high / 4)} g em cada uma. Não precisa ser exatamente igual em todas.` : "Informe seu peso para eu dividir sua meta entre quatro refeições.";
      }
    }

    if (artifact.type === "food-plan" && analysis.action === "modify") {
      const updated = { ...artifact, protein: { ...artifact.protein }, calories: { ...artifact.calories, meals: { ...artifact.calories.meals } } };
      let nextQuantities = structuredClone(foodQuantities(artifact));
      const changes = [];
      if (analysis.modifiers.moreProtein) {
        const proteinPattern = /omelete|ovo|frango|carne|peixe|sardinha|tofu|iogurte|leite|queijo|feijao|lentilha|proteina/;
        const currentProtein = foodTotals(nextQuantities).protein;
        const safeUpper = state.profile.weightKg ? Math.round(state.profile.weightKg * 2.2) : currentProtein + 25;
        const desiredProtein = Math.max(currentProtein, Math.min(currentProtein + 20, safeUpper));
        const factor = currentProtein ? desiredProtein / currentProtein : 1;
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => proteinPattern.test(normalize(item.name)) ? { ...item, grams: Math.round(item.grams * factor), kcal: Math.round(item.kcal * factor), protein: Math.round(item.protein * factor) } : item)]));
        changes.push(factor > 1 ? "aumentei moderadamente as fontes proteicas sem ultrapassar a faixa calculada para o perfil" : "mantive as fontes proteicas porque a estrutura já alcançava o limite superior estimado para o perfil");
      }
      if (analysis.modifiers.lactoseFree) {
        const dairy = /iogurte|leite|queijo|ricota/i;
        updated.breakfast = updated.breakfast.replace(/iogurte|leite|queijo|ricota/gi, "alternativa sem lactose");
        updated.mainMeal = updated.mainMeal.replace(/iogurte|leite|queijo|ricota/gi, "alternativa sem lactose");
        updated.snack = updated.snack.replace(/iogurte|leite|queijo|ricota/gi, "alternativa sem lactose");
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => dairy.test(item.name) ? servingFor("alternativa sem lactose") : item)]));
        changes.push("substituí leite, iogurte e queijos por equivalentes sem lactose ou de soja fortificados");
      }
      if (analysis.modifiers.vegetarian) {
        const meat = /frango|carne|peixe|sardinha/i;
        updated.mainMeal = updated.mainMeal.replace(/frango|carne|peixe|sardinha/gi, "tofu");
        updated.snack = updated.snack.replace(/frango|carne|peixe|sardinha/gi, "tofu");
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => meat.test(item.name) ? servingFor("tofu") : item)]));
        changes.push("troquei carnes e peixes por tofu e leguminosas, mantendo a função proteica");
      }
      if (analysis.modifiers.vegan) {
        const animal = /omelete|ovos?|frango|carne|peixe|sardinha|iogurte|leite|queijo|ricota/i;
        updated.breakfast = "tofu mexido, pão integral e mamão";
        updated.mainMeal = updated.mainMeal.replace(/frango|carne|peixe|sardinha|ovos?/gi, "tofu");
        updated.snack = updated.snack.replace(/iogurte|leite|queijo|frango|ovos?/gi, "iogurte vegetal com sementes");
        updated.otherMeal = "vegetais, tofu ou leguminosas e carboidrato ajustado à atividade";
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => animal.test(item.name) ? servingFor(/iogurte|leite|queijo/i.test(item.name) ? "iogurte vegetal com sementes" : "tofu") : item)]));
        changes.push("retirei carnes, ovos e laticínios e usei tofu, leguminosas e alternativas vegetais");
      }
      if (analysis.modifiers.glutenFree) {
        const gluten = /pao|massa|cuscuz|tortilha/i;
        updated.breakfast = updated.breakfast.replace(/pão|massa|cuscuz|tortilha/gi, "tapioca sem glúten");
        updated.mainMeal = updated.mainMeal.replace(/pão|massa|cuscuz|tortilha/gi, "arroz");
        updated.snack = updated.snack.replace(/pão|massa|cuscuz|tortilha/gi, "fruta");
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => gluten.test(normalize(item.name)) ? servingFor(meal === "mainMeal" ? "arroz" : "tapioca sem glúten") : item)]));
        changes.push("troquei fontes com glúten por arroz, tapioca ou alternativas certificadas sem glúten");
      }
      if (analysis.modifiers.cheaper) changes.push("priorizei ovos, feijão, lentilha, frango, sardinha e alimentos da estação");
      if (analysis.modifiers.fewerCalories) {
        const carbPattern = /arroz|batata|massa|pao|tapioca|cuscuz|mandioca|carboidrato|aveia/;
        nextQuantities = Object.fromEntries(Object.entries(nextQuantities).map(([meal, items]) => [meal, items.map(item => carbPattern.test(normalize(item.name)) ? { ...item, grams: Math.round(item.grams * 0.8), kcal: Math.round(item.kcal * 0.8) } : item)]));
        changes.push("reduzi principalmente gorduras adicionadas e a porção de carboidrato, preservando proteína e vegetais");
      }
      if (changes.length) {
        const totals = foodTotals(nextQuantities);
        updated.quantities = nextQuantities;
        updated.calories = { ...updated.calories, low: Math.max(800, totals.kcal - 150), high: totals.kcal + 150 };
        updated.protein = { low: Math.max(0, totals.protein - 10), high: totals.protein + 10 };
        const answer = `Mantive a estrutura anterior e alterei somente o solicitado: ${changes.join("; ")}.\n\n• Café da manhã: ${updated.breakfast}.\n• Refeição principal: ${updated.mainMeal}.\n• Lanche: ${updated.snack}.\n• Outra refeição: ${updated.otherMeal}.\n\nCom as porções de teste atualizadas, a estimativa é ${updated.calories.low}–${updated.calories.high} kcal e ${updated.protein.low}–${updated.protein.high} g de proteína por dia. Os valores continuam dependendo de marcas e preparo.`;
        rememberArtifact(updated, { action: analysis.action, text: answer });
        return answer;
      }
    }

    if (artifact.type === "sport-session" && analysis.action === "modify" && (analysis.modifiers.durationMinutes || analysis.modifiers.shorter || analysis.modifiers.speed)) {
      const minutes = analysis.modifiers.durationMinutes || Math.max(20, (artifact.durationMinutes || state.profile.durationMinutes || 45) - 10);
      state.profile.durationMinutes = minutes;
      const focus = analysis.modifiers.speed ? "speed" : (artifact.focus || "geral");
      const answer = sportSessionAnswer(artifact.sport || state.profile.sport || "football", minutes, focus, artifact.variation || 0);
      rememberArtifact({ ...artifact, durationMinutes: minutes, focus }, { action: analysis.action, text: answer });
      return answer;
    }

    // Explicit workout modifiers must adapt the active plan instead of silently
    // replacing it with another catalog entry. This preserves the requested
    // muscle group and makes short follow-ups such as "20 minutes", "easier"
    // and "without equipment" cumulative and coherent.
    if (artifact.type === "workout" && analysis.action === "modify") {
      if (analysis.modifiers.noEquipment) state.profile.equipment = "bodyweight";
      if (analysis.modifiers.dumbbells) state.profile.equipment = "dumbbells";
      if (analysis.modifiers.gym) state.profile.equipment = "gym";
      if (analysis.modifiers.home && !analysis.modifiers.dumbbells) state.profile.equipment = "bodyweight";
      if (analysis.modifiers.durationMinutes) state.profile.durationMinutes = analysis.modifiers.durationMinutes;
      if (analysis.modifiers.shorter) state.profile.durationMinutes = Math.max(15, (state.profile.durationMinutes || artifact.durationMinutes || 45) - 10);
      const varied = variedWorkoutText(lang, artifact, analysis);
      const updated = { ...artifact, type: "workout", topic: "workout", group: varied.group, variation: varied.variation, durationMinutes: state.profile.durationMinutes || 35 };
      rememberArtifact(updated, { action: analysis.action, text: varied.text });
      return varied.text;
    }

    const catalogMap = {
      "fat-loss": "weight-loss", hypertrophy: "muscle-building", "protein-quality-timing": "protein",
      "nutrition-basics": "food", cravings: "cravings", "gym-beginner": "gym",
      football: "sport", "sports-performance": "sport"
    };
    const catalogTopic = ["weight-loss", "muscle-building", "protein", "chest", "food", "cravings", "gym", "sport"].includes(artifact.topic)
      ? artifact.topic
      : catalogMap[artifact.topic];
    if (catalogTopic && (analysis.action === "alternative" || analysis.action === "modify")) {
      const result = window.FitnessCatalogEngine?.selectNext({
        topicId: catalogTopic,
        currentRecordId: artifact.recordId || state.lastRecordId,
        recentRecordIds: state.recentRecordIds,
        query: catalogQueryForDialogue(analysis, artifact),
        language: lang,
        profile: state.profile,
        previousArtifact: artifact
      });
      if (result?.artifact?.type === "workout") {
        result.artifact.group = workoutGroupFromArtifact(artifact);
        state.lastWorkoutGroup = result.artifact.group;
      }
      return rememberCatalogResult(result, analysis.action);
    }

    if (["alternative", "explain", "continue", "modify"].includes(analysis.action)) {
      const continuation = knowledgeContinuation(artifact.topic || state.lastTopic, analysis.action);
      if (continuation) {
        rememberArtifact({ ...artifact, variation: (artifact.variation || 0) + 1 }, { action: analysis.action, text: continuation });
        return continuation;
      }
    }
    return null;
  }

  function contextualArtifactAnswer(lang, text) {
    const artifact = state.lastArtifact;
    if (!artifact || artifact.type !== "food-plan" || lang !== "pt") return null;
    const t = normalize(text);
    const range = values => `${values[0]}–${values[1]} kcal`;
    const asksPlanCalories = /\b(kcal|calorias?)\b/.test(t)
      && (/\b(tem|total|cardapio|plano|refeicao|isso|essa|esse|cada)\b/.test(t) || /^(?:e )?(?:as )?(?:calorias|kcal)\??$/.test(t.trim()))
      && !/\b(devo|preciso|necessidade|meta|consumir por dia|gasto diario|manutencao)\b/.test(t);

    if (asksPlanCalories) {
      const meals = artifact.calories.meals;
      if (/cafe da manha|desjejum/.test(t)) return `O café da manhã desse plano fica aproximadamente em ${range(meals.breakfast)}, dependendo principalmente das quantidades utilizadas.`;
      if (/lanche/.test(t)) return `O lanche fica aproximadamente em ${range(meals.snack)}, variando conforme a porção e a marca dos alimentos.`;
      if (/refeicao principal|almoco/.test(t)) return `A refeição principal fica aproximadamente em ${range(meals.mainMeal)}, dependendo das porções de proteína, carboidrato e gordura.`;
      if (/outra refeicao|jantar/.test(t)) return `A outra refeição fica aproximadamente em ${range(meals.otherMeal)}, dependendo de como você montar o prato.`;
      return `Com porções usuais, a estrutura completa fica aproximadamente em ${artifact.calories.low}–${artifact.calories.high} kcal por dia:\n• Café da manhã: ${range(meals.breakfast)}\n• Refeição principal: ${range(meals.mainMeal)}\n• Lanche: ${range(meals.snack)}\n• Outra refeição: ${range(meals.otherMeal)}\n\nÉ uma estimativa, porque o cardápio anterior não fixou gramas nem marcas. Se você informar as quantidades, consigo aproximar com mais precisão. Para o seu perfil, compare essa faixa com sua necessidade diária e ajuste as porções, não apenas os alimentos.`;
    }

    if (/\b(cada refeicao|por refeicao|separe por refeicao)\b/.test(t)) {
      const meals = artifact.calories.meals;
      return `Estimativa por refeição do cardápio anterior:\n• Café da manhã: ${range(meals.breakfast)}\n• Refeição principal: ${range(meals.mainMeal)}\n• Lanche: ${range(meals.snack)}\n• Outra refeição: ${range(meals.otherMeal)}\n\nOs valores dependem das porções e marcas; sem quantidades em gramas, não existe precisão clínica.`;
    }

    const asksPlanProtein = /\b(proteina|protein)\b/.test(t)
      && (/\b(tem|total|cardapio|plano|refeicao|isso|essa|esse|quanto|quanta)\b/.test(t) || /^(?:e )?(?:a )?(?:proteina|protein)\??$/.test(t.trim()))
      && !/\b(devo|preciso|meta|por kg|consumir por dia)\b/.test(t);
    if (asksPlanProtein) {
      const personal = state.profile.weightKg
        ? ` Para ${state.profile.weightKg} kg, compare com a faixa pessoal calculada pelo bot e aumente ou reduza as porções proteicas conforme o objetivo.`
        : " Informe seu peso se quiser comparar com uma meta pessoal.";
      return `Com porções usuais, esse plano fornece aproximadamente ${artifact.protein.low}–${artifact.protein.high} g de proteína por dia. O valor muda bastante conforme o tamanho das porções e o alimento escolhido.${personal}`;
    }

    if (/lista (?:de )?compras|o que comprar|quais ingredientes|ingredientes preciso/.test(t)) {
      return `Lista-base para esse cardápio (${artifact.recordId}):\n• Café da manhã: itens para ${artifact.breakfast}.\n• Refeição principal: itens para ${artifact.mainMeal}.\n• Lanche: itens para ${artifact.snack}.\n• Outra refeição: vegetais variados, uma fonte de proteína e uma fonte de carboidrato.\n• Apoio: temperos, azeite e recipientes para organização.\n\nAntes de comprar, defina quantos dias repetirá o plano e multiplique as porções pelo número de pessoas.`;
    }

    if (/\b(trocar|troco|substituir|substituicao|no lugar|nao gosto|nao tenho)\b/.test(t)) {
      return "Pode substituir mantendo a função do alimento: proteína por outra proteína (frango, peixe, ovos, tofu ou leguminosas), carboidrato por outra fonte semelhante (arroz, batata, massa, pão ou mandioca) e vegetais por opções disponíveis. Para uma troca mais exata, diga qual alimento quer retirar e qual pretende usar.";
    }

    if (/\b(porcao|porcoes|quantidade|quantidades|quantos gramas|medida)\b/.test(t)) {
      return "Como ponto de partida visual, use uma palma de proteína, um punho de carboidrato cozido, metade do prato de vegetais e uma pequena porção de gordura. Isso não é uma prescrição: fome, objetivo, treino e evolução determinam o ajuste. Se você disser em qual refeição quer as quantidades, posso detalhar uma versão em gramas para teste.";
    }

    if (/\b(serve|funciona|adequad|bom|boa)\b.*\b(emagrecer|perder gordura|hipertrofia|ganhar massa|manutencao)\b|\b(emagrecer|perder gordura|hipertrofia|ganhar massa|manutencao)\b.*\b(serve|funciona|adequad|bom|boa)\b/.test(t)) {
      return `A estrutura pode ser adaptada ao objetivo porque contém proteína, carboidrato, vegetais e refeições organizadas. O que define emagrecimento, manutenção ou ganho de massa são principalmente as porções e o total diário. A estimativa atual é ${artifact.calories.low}–${artifact.calories.high} kcal; compare com sua necessidade e acompanhe fome, energia, treino e evolução por 2–3 semanas.`;
    }

    if (/quantos dias|por quanto tempo|todo dia|todos os dias|posso repetir|seguir esse/.test(t)) {
      return "Você pode repetir a estrutura por alguns dias se ela for prática, mas varie frutas, vegetais e fontes de proteína ao longo da semana. Não é necessário comer exatamente os mesmos alimentos diariamente. Reavalie porções conforme fome, desempenho, peso e objetivo.";
    }

    if (/quanto custa|qual o custo|fica caro|mais barato|economizar/.test(t)) {
      return "O custo depende da cidade, marcas e porções. Para economizar, priorize alimentos da estação, ovos, frango, sardinha, feijão, lentilha, arroz e vegetais congelados; compare preço por quilo e planeje o aproveitamento das sobras. Posso também adaptar esse cardápio a um orçamento semanal específico.";
    }

    return null;
  }

  function localizedFoodPlanText(artifact, lang) {
    const variant = Number(String(artifact.recordId || "0").match(/\d+/)?.[0] || 0) % 3;
    const vegan = state.profile.dietNotes?.includes("vegan");
    const vegetarian = vegan || state.profile.dietNotes?.includes("vegetarian");
    const allergies = new Set(state.profile.allergies || []);
    const soyAllowed = !allergies.has("soy");
    const eggAllowed = !vegan && !allergies.has("egg");
    const dairyAllowed = !vegan && !allergies.has("milk") && !state.profile.dietNotes?.includes("lactose-free");
    const plantProtein = soyAllowed ? "tofu" : lang === "de" ? "Linsen oder Kichererbsen" : lang === "es" ? "lentejas o garbanzos" : "lentils or chickpeas";
    const plans = {
      en: [
        [dairyAllowed ? "yogurt, oats and banana" : `${soyAllowed ? "soy yogurt" : "chia pudding"}, oats and banana`, `brown rice, beans, ${eggAllowed ? "eggs" : plantProtein} and salad`, "fruit with allowed seeds", `vegetables, ${plantProtein} and a carbohydrate adjusted to activity`],
        [eggAllowed ? "vegetable omelet, whole-grain toast and papaya" : `${plantProtein} scramble, tapioca and fruit`, `potatoes, ${plantProtein} and mixed vegetables`, dairyAllowed ? "yogurt with fruit" : "hummus with vegetables", `lentils, vegetables and rice`],
        ["oatmeal with fruit and allowed seeds", `whole-grain pasta or rice, ${plantProtein} and vegetables`, "fruit and roasted chickpeas", `bean bowl with vegetables and potatoes`]
      ],
      es: [
        [dairyAllowed ? "yogur, avena y plátano" : `${soyAllowed ? "yogur de soja" : "pudín de chía"}, avena y plátano`, `arroz integral, frijoles, ${eggAllowed ? "huevos" : plantProtein} y ensalada`, "fruta con semillas permitidas", `verduras, ${plantProtein} y carbohidrato ajustado a la actividad`],
        [eggAllowed ? "tortilla de verduras, pan integral y papaya" : `revuelto de ${plantProtein}, tapioca y fruta`, `patata, ${plantProtein} y verduras`, dairyAllowed ? "yogur con fruta" : "hummus con verduras", "lentejas, verduras y arroz"],
        ["avena con fruta y semillas permitidas", `pasta integral o arroz, ${plantProtein} y verduras`, "fruta y garbanzos tostados", "bol de frijoles con verduras y patata"]
      ],
      de: [
        [dairyAllowed ? "Joghurt, Haferflocken und Banane" : `${soyAllowed ? "Sojajoghurt" : "Chia-Pudding"}, Haferflocken und Banane`, `Vollkornreis, Bohnen, ${eggAllowed ? "Eier" : plantProtein} und Salat`, "Obst mit erlaubten Samen", `Gemüse, ${plantProtein} und an die Aktivität angepasste Kohlenhydrate`],
        [eggAllowed ? "Gemüseomelett, Vollkornbrot und Papaya" : `${plantProtein} als Rührei-Alternative, Tapioka und Obst`, `Kartoffeln, ${plantProtein} und Gemüse`, dairyAllowed ? "Joghurt mit Obst" : "Hummus mit Gemüse", "Linsen, Gemüse und Reis"],
        ["Haferflocken mit Obst und erlaubten Samen", `Vollkornnudeln oder Reis, ${plantProtein} und Gemüse`, "Obst und geröstete Kichererbsen", "Bohnenschale mit Gemüse und Kartoffeln"]
      ]
    };
    const [breakfast, main, snack, dinner] = plans[lang][variant];
    const copy = {
      en: [`Meal structure ${artifact.recordId}`, "Breakfast", "Main meal", "Snack", "Other meal", "Dietary context considered", vegetarian ? (vegan ? "vegan" : "vegetarian") : "balanced", "This is an educational structure, not a clinical prescription. Portions depend on your goal, hunger, training, preferences and health."],
      es: [`Estructura alimentaria ${artifact.recordId}`, "Desayuno", "Comida principal", "Merienda", "Otra comida", "Contexto alimentario considerado", vegetarian ? (vegan ? "vegano" : "vegetariano") : "equilibrado", "Es una estructura educativa, no una prescripción clínica. Las porciones dependen del objetivo, hambre, entrenamiento, preferencias y salud."],
      de: [`Ernährungsplan ${artifact.recordId}`, "Frühstück", "Hauptmahlzeit", "Snack", "Weitere Mahlzeit", "Berücksichtigter Ernährungskontext", vegetarian ? (vegan ? "vegan" : "vegetarisch") : "ausgewogen", "Dies ist eine Orientierung und keine klinische Verordnung. Die Portionen hängen von Ziel, Hunger, Training, Vorlieben und Gesundheit ab."]
    }[lang];
    return `${copy[0]} · ${copy[6]}\n• ${copy[1]}: ${breakfast}.\n• ${copy[2]}: ${main}.\n• ${copy[3]}: ${snack}.\n• ${copy[4]}: ${dinner}.\n• ${copy[5]}: ${copy[6]}.\n\n${copy[7]}`;
  }

  function localizedWeeklyPlan(lang, artifact = {}) {
    const days = Math.max(2, Math.min(6, artifact.days || state.profile.trainingDays || 4));
    const minutes = artifact.durationMinutes || state.profile.durationMinutes || 40;
    const bodyweight = artifact.equipment === "bodyweight" || state.profile.equipment === "bodyweight";
    const sets = artifact.easier ? 2 : 3;
    const sessions = {
      en: ["Full body A", "Lower body and core", "Upper body", "Full body B", "Cardio and mobility", "Technique and accessories"],
      es: ["Cuerpo completo A", "Piernas y core", "Tren superior", "Cuerpo completo B", "Cardio y movilidad", "Técnica y accesorios"],
      de: ["Ganzkörper A", "Unterkörper und Core", "Oberkörper", "Ganzkörper B", "Cardio und Mobilität", "Technik und Zubehörübungen"]
    }[lang];
    const exercises = bodyweight ? {
      en: "chair squat, incline push-up, supported row, glute bridge and dead bug",
      es: "sentadilla a silla, flexión inclinada, remo con apoyo, puente de glúteos y dead bug",
      de: "Stuhl-Kniebeuge, erhöhte Liegestütze, unterstütztes Rudern, Glute Bridge und Dead Bug"
    }[lang] : {
      en: "squat, press, row, Romanian deadlift and core exercise",
      es: "sentadilla, press, remo, peso muerto rumano y ejercicio de core",
      de: "Kniebeuge, Drücken, Rudern, rumänisches Kreuzheben und Core-Übung"
    }[lang];
    const labels = {
      en: ["Weekly workout plan", "days per week", "minutes per session", "Workout", "sets of 8–12 repetitions", "Rest 60–90 seconds for accessories and 90–150 seconds for main lifts. Keep about 48 hours before training the same muscle group hard again."],
      es: ["Plan semanal de entrenamiento", "días por semana", "minutos por sesión", "Entrenamiento", "series de 8–12 repeticiones", "Descansa 60–90 segundos en accesorios y 90–150 segundos en ejercicios principales. Deja unas 48 horas antes de repetir intensamente el mismo grupo muscular."],
      de: ["Wöchentlicher Trainingsplan", "Tage pro Woche", "Minuten pro Einheit", "Training", "Sätze mit 8–12 Wiederholungen", "60–90 Sekunden bei Zubehörübungen und 90–150 Sekunden bei Hauptübungen pausieren. Vor erneutem intensivem Training derselben Muskelgruppe etwa 48 Stunden lassen."]
    }[lang];
    return `${labels[0]} — ${days} ${labels[1]}, ${minutes} ${labels[2]}\n${sessions.slice(0, days).map((name, index) => `• ${labels[3]} ${index + 1}: ${name} — ${exercises}; ${sets} ${labels[4]}.`).join("\n")}\n\n${labels[5]}`;
  }

  function handleMultilingualParity(lang, text) {
    if (lang === "pt") return null;
    const t = normalize(text);
    const artifact = state.lastArtifact;
    const dialogue = window.FitnessDialogueEngine?.analyze(t);

    if (/\bmonte\b.*\bestrutura alimentar\b/.test(t)) {
      const result = window.FitnessCatalogEngine?.selectNext({ topicId: "food", currentRecordId: null, recentRecordIds: state.recentRecordIds, query: t, language: "pt", profile: state.profile, previousArtifact: artifact });
      if (!result?.artifact) return null;
      const answer = localizedFoodPlanText(result.artifact, lang);
      rememberArtifact(result.artifact, { intent: "food-plan", action: "create", text: answer });
      return answer;
    }
    if (artifact?.type === "food-plan") {
      if (dialogue?.action === "alternative") {
        const result = window.FitnessCatalogEngine?.selectNext({ topicId: "food", currentRecordId: artifact.recordId, recentRecordIds: state.recentRecordIds, query: t, language: "pt", profile: state.profile, previousArtifact: artifact });
        if (!result?.artifact) return null;
        const answer = localizedFoodPlanText(result.artifact, lang);
        rememberArtifact(result.artifact, { intent: "food-plan", action: "alternative", text: answer });
        return answer;
      }
      if (dialogue?.modifiers.moreProtein) {
        const updated = { ...artifact, protein: { low: Math.max(80, artifact.protein?.low || 80), high: Math.max(110, artifact.protein?.high || 110) } };
        const answer = {
          en: `I kept the current meal structure and increased its protein sources. The educational estimate is now about ${updated.protein.low}–${updated.protein.high} g protein and ${artifact.calories.low}–${artifact.calories.high} kcal per day. Exact values depend on portions, brands and preparation.`,
          es: `Mantuve la estructura alimentaria y aumenté sus fuentes de proteína. La estimación educativa es de unos ${updated.protein.low}–${updated.protein.high} g de proteína y ${artifact.calories.low}–${artifact.calories.high} kcal al día. Los valores dependen de porciones, marcas y preparación.`,
          de: `Der aktuelle Ernährungsplan bleibt erhalten; die Proteinquellen wurden erhöht. Die Orientierung liegt nun bei etwa ${updated.protein.low}–${updated.protein.high} g Protein und ${artifact.calories.low}–${artifact.calories.high} kcal pro Tag. Genaue Werte hängen von Portionen, Marken und Zubereitung ab.`
        }[lang];
        rememberArtifact(updated, { action: "modify", text: answer });
        return answer;
      }
      if (/\bcalorias\b/.test(t)) {
        const answer = {
          en: `The current meal structure is estimated at ${artifact.calories.low}–${artifact.calories.high} kcal per day. This is not a precise prescription: portions, brands, oil and preparation can change the total.`,
          es: `La estructura alimentaria actual se estima en ${artifact.calories.low}–${artifact.calories.high} kcal al día. No es una prescripción exacta: porciones, marcas, aceite y preparación cambian el total.`,
          de: `Der aktuelle Ernährungsplan wird auf ${artifact.calories.low}–${artifact.calories.high} kcal pro Tag geschätzt. Dies ist keine genaue Verordnung: Portionen, Marken, Öl und Zubereitung verändern die Summe.`
        }[lang];
        return answer;
      }
      if (/\blista de compras\b/.test(t)) {
        return {
          en: "Shopping list for the active meal structure: oats, fruit, rice or potatoes, beans or lentils, the selected protein sources, varied vegetables, allowed seeds and basic seasonings. Multiply portions by the number of people and planned days.",
          es: "Lista de compras para la estructura activa: avena, fruta, arroz o patata, frijoles o lentejas, las fuentes de proteína elegidas, verduras variadas, semillas permitidas y condimentos básicos. Multiplica las porciones por personas y días.",
          de: "Einkaufsliste für den aktiven Ernährungsplan: Haferflocken, Obst, Reis oder Kartoffeln, Bohnen oder Linsen, ausgewählte Proteinquellen, verschiedenes Gemüse, erlaubte Samen und Gewürze. Portionen mit Personen und Tagen multiplizieren."
        }[lang];
      }
    }

    if (artifact?.type === "weekly-workout" && /quanto descanso/.test(t)) return localizedWeeklyPlan(lang, artifact).split("\n\n").at(-1);
    if (artifact?.type === "weekly-workout" && /tem imagens/.test(t)) return workoutPlanVisualResponse(lang, artifact);
    if (/\bplano semanal de treino\b/.test(t) || artifact?.type === "weekly-workout" && (["modify", "alternative", "continue"].includes(dialogue?.action) || /\b\d dias por semana\b/.test(t))) {
      const days = Number(t.match(/\b([2-6]) dias por semana\b/)?.[1]) || artifact?.days || state.profile.trainingDays || 4;
      const minutes = parseDurationMinutes(t) || artifact?.durationMinutes || state.profile.durationMinutes || 40;
      const updated = { ...(artifact?.type === "weekly-workout" ? artifact : {}), type: "weekly-workout", topic: "weekly-workout", days, durationMinutes: minutes, equipment: /sem equipamento/.test(t) ? "bodyweight" : (artifact?.equipment || state.profile.equipment), easier: /mais facil/.test(t) || artifact?.easier };
      state.profile.trainingDays = days; state.profile.durationMinutes = minutes;
      if (updated.equipment) state.profile.equipment = updated.equipment;
      const answer = localizedWeeklyPlan(lang, updated);
      rememberArtifact(updated, { intent: "create-weekly-workout", action: artifact?.type === "weekly-workout" ? "modify" : "create", text: answer });
      return answer;
    }

    if (artifact?.type === "protein-plan") {
      const weight = state.profile.weightKg || artifact.weightKg;
      const low = weight ? Math.round(weight * 1.6) : null, high = weight ? Math.round(weight * 2.2) : null;
      if (/dias sem treino/.test(t)) return restDayAnswer(lang, weight);
      if (/sem whey/.test(t)) return {
        en: `You can reach ${low}–${high} g per day without whey by combining eggs, dairy or fortified alternatives, beans, lentils, fish, chicken or tofu across meals. Whey is optional convenience, not a requirement.`,
        es: `Puedes alcanzar ${low}–${high} g al día sin whey combinando huevos, lácteos o alternativas fortificadas, frijoles, lentejas, pescado, pollo o tofu. El whey es opcional, no obligatorio.`,
        de: `${low}–${high} g pro Tag sind ohne Whey erreichbar: Eier, Milchprodukte oder angereicherte Alternativen, Bohnen, Linsen, Fisch, Huhn oder Tofu über die Mahlzeiten verteilen. Whey ist bequem, aber nicht nötig.`
      }[lang];
      if (/quatro refeicoes/.test(t)) return {
        en: `Split across four meals, aim for about ${Math.round(low / 4)}–${Math.round(high / 4)} g protein per meal. The meals do not have to be exactly equal.`,
        es: `Repartido en cuatro comidas, busca unos ${Math.round(low / 4)}–${Math.round(high / 4)} g de proteína por comida. No necesitan ser exactamente iguales.`,
        de: `Auf vier Mahlzeiten verteilt sind etwa ${Math.round(low / 4)}–${Math.round(high / 4)} g Protein pro Mahlzeit sinnvoll. Sie müssen nicht exakt gleich groß sein.`
      }[lang];
    }

    if (artifact?.type === "knowledge" && /\b(explique melhor|continue|durante o treino)\b/.test(t)) {
      if (artifact.topic === "hydration") return {
        en: "For training hydration, start well hydrated, drink according to thirst, heat and sweat, and compare body mass before and after long sessions when useful. Heavy sweaters or prolonged sessions may need sodium as well as water; avoid forcing excessive fluid quickly.",
        es: "Para hidratarte durante el entrenamiento, empieza bien hidratado y bebe según sed, calor y sudor. En sesiones largas puede ser útil comparar el peso antes y después; con mucho sudor también puede hacer falta sodio. Evita beber cantidades excesivas rápidamente.",
        de: "Für die Flüssigkeitszufuhr im Training gut hydriert beginnen und nach Durst, Hitze und Schweiß trinken. Bei langen Einheiten kann ein Gewichtsvergleich vor und nach dem Training helfen; bei starkem Schwitzen kann zusätzlich Natrium nötig sein. Keine übermäßigen Mengen schnell erzwingen."
      }[lang];
    }
    return null;
  }

  function generalAnswer(lang, text) {
    const t = normalize(text);
    const isFollowUp = /\b(e nos dias|nos dias que|rest days|days i don.?t train|trainingsfreien tagen|dias de descanso)\b/.test(t);
    const asksCalories = /\b(kcal|calorias?|calories?|kalorien)\b/.test(t);
    const mentionsProtein = /\b(protein|proteina|eiweiss)\b/.test(t);
    const asksProteinAmount = mentionsProtein && /\b(quanto|quantos|preciso|devo consumir|por dia|diaria|how much|need|daily|per day|wie viel|brauche|cuanta|necesito)\b/.test(t);
    const asksVisual = /(fotos?|imagens?|exemplos? visuais?|demonstracao|como faz|photos?|pictures?|images?|visual examples?|bilder|fotos?|imagenes?|ejemplos? visuales?)/.test(t);
    const workoutGroup = detectWorkoutGroup(t);
    const asksWorkout = /\b(treino|treinar|exercicios?|workout|training|trainingsplan|rutina|entrenamiento)\b/.test(t) && (workoutGroup || /\b(gere|monte|crie|faca|quero|give|create|make|erstelle|crea)\b/.test(t));
    const suppliesWorkout = /(sem equipamento|nao tenho equipamento|peso do corpo|bodyweight|no equipment|halter|dumbbell|academia|\bgym\b|em casa|minut|joelho|costas|ombro|dor|iniciante|intermediari|avancad)/.test(t);
    const suppliesProfile = /(anos|altura|\bcm\b|\bkg\b|\b[12][,.]\d{1,2}\b|sedentar|sentad|mulher|homem|feminin|masculin|female|male|emagrecer|besteira|atividade|activity|informei os dados|esses dados)/.test(t);
    const asksToContinue = /\b(agora|calcule|calcular|calcula|estime|estimar|estima|continue|continuar|entao|pronto|e isso|ja informei|use os dados|com esses dados|pode fazer|faca a conta|that is all|use the data|calculate now)\b/.test(t);
    const asksMemory = /\b(qual|quais|lembra|remember|gespeichert|recuerdas)\b/.test(t) && /\b(idade|altura|peso|dados|age|height|weight|alter|gross|gewicht|edad|estatura)\b/.test(t);
    if (/\b(dor aguda|dor forte|piora progressiva|inchaco importante|instabilidade|dormencia|perda de forca|sharp pain|worsening pain|marked swelling|numbness)\b/.test(t)) {
      const safetyAnswer = {
        pt: "Não é seguro diagnosticar ou liberar esse quadro pelo chat. Pare o movimento e não tente treinar por cima de dor aguda, piora progressiva, inchaço, instabilidade, dormência ou perda de força. Procure avaliação de fisioterapeuta ou médico; até lá, mantenha apenas atividades indolores que já estejam liberadas para você.",
        en: "A chat cannot safely diagnose or clear this problem. Stop the movement and do not train through sharp or worsening pain, swelling, instability, numbness, or strength loss. Seek assessment from a physician or physiotherapist and keep only pain-free activities you are cleared to do.",
        de: "Akute oder zunehmende Schmerzen lassen sich im Chat nicht sicher beurteilen. Training abbrechen und ärztlich oder physiotherapeutisch abklären lassen.",
        es: "No es seguro diagnosticar ni autorizar este cuadro por chat. Detén el movimiento y busca valoración médica o de fisioterapia ante dolor agudo o creciente, hinchazón, inestabilidad, entumecimiento o pérdida de fuerza."
      }[lang];
      rememberArtifact({ type: "knowledge", topic: "pain-safety", variation: 0 }, { intent: "safety-triage", text: safetyAnswer });
      return safetyAnswer;
    }
    if (asksMemory) {
      const summary = profileSummary(lang);
      return summary
        ? { pt: `Sim. Até agora tenho: ${summary}.`, en: `Yes. So far I have: ${summary}.`, de: `Ja. Bisher habe ich: ${summary}.`, es: `Sí. Hasta ahora tengo: ${summary}.` }[lang]
        : { pt: "Você ainda não informou dados físicos neste perfil.", en: "You have not provided physical data for this profile yet.", de: "Für dieses Profil wurden noch keine Körperdaten angegeben.", es: "Todavía no indicaste datos físicos para este perfil." }[lang];
    }
    const multilingualParityAnswer = handleMultilingualParity(lang, text);
    if (multilingualParityAnswer) return multilingualParityAnswer;
    const asksFoodPlan = /\b(monte|crie|gere|faca)\b/.test(t) && /\b(estrutura alimentar|cardapio|plano alimentar|dieta)\b/.test(t);
    if (asksFoodPlan) {
      const result = window.FitnessCatalogEngine?.selectNext({
        topicId: "food", currentRecordId: state.lastRecordId, recentRecordIds: state.recentRecordIds,
        query: text, language: lang, profile: state.profile, previousArtifact: state.lastArtifact
      });
      return rememberCatalogResult(result, "create");
    }
    const asksMuscleGroups = /\b(quais|qual|liste|explique|mostre)\b.*\b(grupos? musculares?|musculos? do corpo)\b|^grupos? musculares?\??$/.test(t);
    if (asksMuscleGroups) {
      const answer = muscleGroupsAnswer(lang);
      rememberArtifact({ type: "knowledge", topic: "muscle-groups", variation: 0 }, { intent: "explain-muscle-groups", text: answer });
      return answer;
    }
    const asksMonthlyWorkout = /\b(treino|treinamento|plano|rotina)\b.*\b(mensal|mes inteiro|um mes|4 semanas|quatro semanas|30 dias)\b|\b(mensal|mes inteiro|4 semanas|quatro semanas)\b.*\b(treino|treinamento|treinar)\b/.test(t);
    if (asksMonthlyWorkout) {
      const daysMatch = t.match(/\b([2-6])\s*dias?\b/);
      const plan = monthlyWorkoutAnswer({ days: daysMatch ? Number(daysMatch[1]) : state.profile.trainingDays, durationMinutes: parseDurationMinutes(t) || state.profile.durationMinutes });
      state.profile.trainingDays = plan.days;
      state.profile.durationMinutes = plan.durationMinutes;
      saveState();
      rememberArtifact(plan, { intent: "create-monthly-workout", text: plan.text });
      return plan.text;
    }
    const asksWeeklyWorkout = /\b(treino|plano|rotina)\b.*\b(semana inteira|semana toda|semanal|todos os dias da semana)\b|\b(semana inteira|semana toda)\b.*\b(treino|treinar)\b/.test(t);
    if (asksWeeklyWorkout) {
      const daysMatch = t.match(/\b([2-6])\s*dias?\b/);
      const plan = weeklyWorkoutAnswer({ days: daysMatch ? Number(daysMatch[1]) : state.profile.trainingDays });
      state.profile.trainingDays = plan.days;
      saveState();
      rememberArtifact({ type: "weekly-workout", topic: "weekly-workout", ...plan }, { intent: "create-weekly-workout", text: plan.text });
      return plan.text;
    }
    const deepContextAnswer = handleDeepContext(lang, text);
    if (deepContextAnswer) return deepContextAnswer;
    const dialogueAnswer = handleDialogueContext(lang, text);
    if (dialogueAnswer) return dialogueAnswer;
    const artifactAnswer = contextualArtifactAnswer(lang, text);
    if (artifactAnswer) return artifactAnswer;
    if (state.pendingRequest === "protein-target" && state.profile.weightKg) {
      const answer = proteinAnswer(lang, state.profile.weightKg);
      state.pendingRequest = null;
      state.pendingFields = [];
      rememberArtifact({ type: "protein-plan", topic: "protein", weightKg: state.profile.weightKg, variation: 0 }, { intent: "protein-target", action: "complete-pending", text: answer });
      return answer;
    }
    const requestedSport = detectSport(t);
    const asksSportSession = /\b(treino|treinar|sessao|exercicios?)\b/.test(t) && (requestedSport || /\b(esporte|velocidade esportiva)\b/.test(t));
    if (asksSportSession) {
      const sport = requestedSport || state.profile.sport || "football";
      const minutes = state.profile.durationMinutes || 45;
      const focus = /velocidade/.test(t) ? "speed" : "geral";
      const answer = sportSessionAnswer(sport, minutes, focus, 0);
      rememberArtifact({ type: "sport-session", topic: "sports-performance", sport, focus, durationMinutes: minutes, variation: 0 }, { intent: "create-sport-session", text: answer });
      return answer;
    }
    if (asksWorkout && asksVisual) {
      const group = workoutGroup || state.lastWorkoutGroup || "full-body";
      state.lastWorkoutGroup = group;
      const workoutText = workoutAnswer(lang, group);
      const response = workoutVisualResponse(lang, group, workoutText) || workoutText;
      rememberArtifact({ type: "workout", topic: "workout", group, durationMinutes: state.profile.durationMinutes || 35, variation: 0 }, { intent: "create-workout", text: workoutText });
      return response;
    }
    if (asksVisual && state.lastTopic === "workout") {
      const contextualVisual = workoutVisualResponse(lang, state.lastWorkoutGroup, state.lastArtifact?.text || "", false);
      if (contextualVisual) return contextualVisual;
    }
    if (asksVisual && state.lastTopic === "workout") {
      if (state.lastWorkoutGroup === "legs") {
        return {
          text: {
            pt: "Sim — aqui estão exemplos visuais dos cinco exercícios do seu último treino de pernas. A numeração corresponde à ordem do plano:\n1. Agachamento para cadeira\n2. Bom-dia sem carga\n3. Afundo reverso com apoio\n4. Ponte de glúteos\n5. Elevação de panturrilhas\n\nToque na imagem para ampliá-la. Use-a como referência geral de posição; faça os movimentos devagar e interrompa se sentir dor.",
            en: "Yes — here are visual examples of the five exercises from your last leg workout. The numbers follow the workout order:\n1. Chair squat\n2. Bodyweight good morning\n3. Supported reverse lunge\n4. Glute bridge\n5. Calf raise\n\nTap the image to enlarge it. Use it as a general position reference, move slowly, and stop if you feel pain.",
            de: "Ja — hier sind visuelle Beispiele für die fünf Übungen aus deinem letzten Beintraining. Die Nummern entsprechen der Reihenfolge im Plan:\n1. Stuhl-Kniebeuge\n2. Good Morning ohne Gewicht\n3. Rückwärts-Ausfallschritt mit Halt\n4. Glute Bridge\n5. Wadenheben\n\nTippe auf das Bild, um es zu vergrößern. Nutze es als allgemeine Orientierung und stoppe bei Schmerzen.",
            es: "Sí: aquí tienes ejemplos visuales de los cinco ejercicios de tu último entrenamiento de piernas. Los números siguen el orden del plan:\n1. Sentadilla a silla\n2. Buenos días sin carga\n3. Zancada inversa con apoyo\n4. Puente de glúteos\n5. Elevación de pantorrillas\n\nToca la imagen para ampliarla. Úsala como referencia general y detente si sientes dolor."
          }[lang],
          media: {
            src: "",
            alt: {
              pt: "Cinco exemplos visuais: agachamento para cadeira, bom-dia sem carga, afundo reverso, ponte de glúteos e elevação de panturrilhas",
              en: "Five visual examples: chair squat, bodyweight good morning, reverse lunge, glute bridge, and calf raise",
              de: "Fünf Übungsbeispiele für das Beintraining",
              es: "Cinco ejemplos visuales de ejercicios de piernas"
            }[lang],
            caption: {
              pt: "Referência visual do treino · toque para ampliar",
              en: "Workout visual reference · tap to enlarge",
              de: "Visuelle Trainingsreferenz · zum Vergrößern tippen",
              es: "Referencia visual del entrenamiento · toca para ampliar"
            }[lang],
            openLabel: { pt: "Abrir imagem ampliada", en: "Open larger image", de: "Bild vergrößern", es: "Abrir imagen ampliada" }[lang]
          }
        };
      }
      return {
        pt: "Posso mostrar exemplos visuais. Diga qual exercício do último treino você quer ver primeiro.",
        en: "I can show visual examples. Tell me which exercise from the last workout you want to see first.",
        de: "Ich kann visuelle Beispiele zeigen. Sag mir, welche Übung aus dem letzten Training du zuerst sehen möchtest.",
        es: "Puedo mostrar ejemplos visuales. Dime qué ejercicio del último entrenamiento quieres ver primero."
      }[lang];
    }
    if (asksWorkout || state.pendingRequest === "workout-constraints" || (state.lastTopic === "workout" && (suppliesWorkout || workoutGroup || asksToContinue))) {
      const group = workoutGroup || state.lastWorkoutGroup || "full-body";
      state.lastWorkoutGroup = group;
      const answer = workoutAnswer(lang, group);
      if (state.pendingRequest === "workout-constraints") {
        state.pendingRequest = null;
        state.pendingFields = [];
      }
      rememberArtifact({ type: "workout", topic: "workout", group, durationMinutes: state.profile.durationMinutes || 35, variation: 0 }, { intent: "create-workout", text: answer });
      return answer;
    }
    if (asksCalories || state.pendingRequest === "calorie-estimate" || (state.lastTopic === "calories" && (suppliesProfile || asksToContinue))) {
      const answer = calorieAnswer(lang);
      const missing = ["age", "heightCm", "weightKg", "sex", "activity"].filter(key => !state.profile[key]);
      state.pendingRequest = missing.length ? "calorie-estimate" : null;
      state.pendingFields = missing;
      rememberArtifact({ type: "calorie-estimate", topic: "calories", profileSnapshot: { ...state.profile } }, { intent: "calculate-calories", text: answer });
      return answer;
    }
    if (isFollowUp && state.lastTopic === "protein") {
      const answer = restDayAnswer(lang, state.profile.weightKg);
      rememberArtifact({ ...(state.lastArtifact || {}), type: "protein-plan", topic: "protein", weightKg: state.profile.weightKg }, { intent: "protein-target", action: "reference", text: answer });
      return answer;
    }
    if (asksProteinAmount || (isFollowUp && state.lastTopic === "protein" && state.profile.weightKg)) {
      const answer = proteinAnswer(lang, state.profile.weightKg);
      state.pendingRequest = state.profile.weightKg ? null : "protein-target";
      state.pendingFields = state.profile.weightKg ? [] : ["weightKg"];
      rememberArtifact({ type: "protein-plan", topic: "protein", weightKg: state.profile.weightKg, variation: 0 }, { intent: "protein-target", text: answer });
      return answer;
    }
    const priorityKnowledge = [
      ["sleep", /\b(sono|dormir)\b/, "sono"],
      ["recovery", /\b(recuperar|recuperacao)\b/, "como melhorar a recuperação"],
      ["cardio", /\b(cardio|aerobico)\b/, "cardio e condicionamento"],
      ["hydration", /\b(hidratacao|agua|quantos litros)\b/, "hidratação e água"],
      ["creatine", /\bcreatina\b/, "creatina"],
      ["fiber", /\bfibras?\b/, "fibra"],
      ["supplements", /\bsuplementos?\b/, "suplementos"]
    ].find(([, pattern]) => pattern.test(t));
    if (priorityKnowledge) {
      const result = window.FitnessKnowledgeEngine?.answer({ text: priorityKnowledge[2], language: lang, profile: state.profile, lastTopic: priorityKnowledge[0] });
      if (result) {
        rememberArtifact({ type: "knowledge", topic: priorityKnowledge[0], variation: 0 }, { intent: priorityKnowledge[0], text: result.text });
        return result.text;
      }
    }
    const knowledgeResult = window.FitnessKnowledgeEngine?.answer({
      text,
      language: lang,
      profile: state.profile,
      lastTopic: state.lastTopic
    });
    if (knowledgeResult) {
      rememberArtifact({ type: "knowledge", topic: knowledgeResult.topic, variation: 0 }, { intent: knowledgeResult.topic, text: knowledgeResult.text });
      return knowledgeResult.text;
    }
    const catalogResult = window.FitnessCatalogEngine?.answer({
      text,
      language: lang,
      profile: state.profile,
      lastTopic: state.lastTopic
    });
    if (catalogResult) {
      return rememberCatalogResult(catalogResult, "create");
    }
    if (/javascript|python|programar|programmieren|programacion|api\b/.test(t)) {
      return {
        pt: "Sou especializado em fitness, treino, nutrição e esportes. Posso ajudar você com algum desses temas?",
        de: "Ich bin auf Fitness, Training, Ernährung und Sport spezialisiert. Kann ich dir bei einem dieser Themen helfen?",
        es: "Estoy especializado en fitness, entrenamiento, nutrición y deportes. ¿Puedo ayudarte con alguno de estos temas?",
        en: "I specialize in fitness, training, nutrition, and sports. Can I help you with one of those topics?"
      }[lang];
    }
    if (/lose weight|perder (peso|gordura)|abnehmen|perder grasa/.test(t)) {
      state.lastTopic = "weight-loss";
      return {
        pt: "Para perder gordura preservando massa muscular, use um déficit calórico moderado, mantenha proteína suficiente, faça musculação com progressão e durma bem. Uma perda gradual tende a ser mais sustentável. Se quiser, diga seu peso, rotina e frequência de treino para eu personalizar.",
        de: "Um Fett zu verlieren und Muskeln zu erhalten, nutze ein moderates Kaloriendefizit, ausreichend Protein, progressives Krafttraining und guten Schlaf. Ein langsamer, stetiger Gewichtsverlust ist meist nachhaltiger.",
        es: "Para perder grasa conservando músculo, usa un déficit calórico moderado, suficiente proteína, entrenamiento de fuerza progresivo y buen descanso. Una pérdida gradual suele ser más sostenible.",
        en: "To lose fat while preserving muscle, use a moderate calorie deficit, eat enough protein, keep progressive strength training, and prioritize sleep. A gradual rate of loss is usually more sustainable."
      }[lang];
    }
    if (/build muscle|muscle building|ganhar massa|hipertrofia|muskeln aufbauen|ganar musculo/.test(t)) {
      state.lastTopic = "muscle";
      return {
        pt: "Para ganhar massa, combine treino de força progressivo, volume recuperável, leve superávit calórico, proteína adequada e 7–9 horas de sono. Treine cada grupo muscular cerca de 2 vezes por semana e acompanhe cargas e repetições.",
        de: "Für Muskelaufbau kombiniere progressives Krafttraining, ein gut erholbares Trainingsvolumen, einen kleinen Kalorienüberschuss, genug Protein und 7–9 Stunden Schlaf. Trainiere jede Muskelgruppe ungefähr zweimal pro Woche.",
        es: "Para ganar músculo, combina fuerza progresiva, un volumen del que puedas recuperarte, un ligero superávit calórico, suficiente proteína y 7–9 horas de sueño. Entrena cada grupo muscular unas dos veces por semana.",
        en: "To build muscle, combine progressive strength training, recoverable volume, a small calorie surplus, enough protein, and 7–9 hours of sleep. Train each muscle group around twice per week and track loads and reps."
      }[lang];
    }
    if (/chest|peito|brust|pecho/.test(t)) {
      state.lastTopic = "chest";
      return {
        pt: "Um treino de peito simples: supino reto 3×6–10, supino inclinado com halteres 3×8–12 e crucifixo/crossover 2–3×10–15. Pare com 1–3 repetições na reserva, mantenha boa técnica e progrida aos poucos.",
        de: "Ein einfaches Brusttraining: Bankdrücken 3×6–10, Schrägbankdrücken mit Kurzhanteln 3×8–12 und Flys 2–3×10–15. Lass 1–3 Wiederholungen im Tank und steigere dich schrittweise.",
        es: "Una rutina simple de pecho: press banca 3×6–10, press inclinado con mancuernas 3×8–12 y aperturas 2–3×10–15. Deja 1–3 repeticiones en reserva y progresa poco a poco.",
        en: "A simple chest workout: bench press 3×6–10, incline dumbbell press 3×8–12, and flyes 2–3×10–15. Keep 1–3 reps in reserve, use good form, and progress gradually."
      }[lang];
    }
    if (/craving|compuls|vontade de comer|heisshunger|antojo/.test(t)) {
      return {
        pt: "Para controlar vontades, planeje refeições com proteína e fibras, mantenha alimentos saciantes disponíveis, durma bem e evite restrições extremas. Uma pequena porção planejada costuma funcionar melhor do que proibir completamente.",
        de: "Bei Heißhunger helfen protein- und ballaststoffreiche Mahlzeiten, sättigende Lebensmittel, guter Schlaf und weniger strenge Verbote. Eine geplante kleine Portion funktioniert oft besser als kompletter Verzicht.",
        es: "Para manejar los antojos, planifica comidas con proteína y fibra, ten alimentos saciantes, duerme bien y evita restricciones extremas. Una porción pequeña planificada suele funcionar mejor que prohibirla por completo.",
        en: "To manage cravings, plan meals with protein and fiber, keep filling foods available, sleep well, and avoid extreme restriction. A planned small portion often works better than banning a food completely."
      }[lang];
    }
    const profileOnlyStatement = suppliesProfile && !/\b(como|qual|quais|quanto|quanta|quantos|quantas|por que|porque|o que|onde|quando|posso|devo|preciso|calcule|monte|crie|gere)\b/.test(t);
    if (profileOnlyStatement) {
      const summary = profileSummary(lang);
      return {
        pt: `Atualizei este perfil com os dados informados${summary ? `: ${summary}` : ""}. Vou usá-los nas próximas respostas desta sessão e não os misturarei com outros visitantes.`,
        en: `I updated this profile with the information provided${summary ? `: ${summary}` : ""}. I will use it in this visitor's answers only.`,
        de: `Dieses Profil wurde mit den angegebenen Daten aktualisiert${summary ? `: ${summary}` : ""}. Die Daten werden nur für diesen Besucher verwendet.`,
        es: `Actualicé este perfil con los datos indicados${summary ? `: ${summary}` : ""}. Los usaré únicamente para este visitante.`
      }[lang];
    }
    return {
      pt: "Posso ajudar de forma mais específica com treino, nutrição, proteína, emagrecimento, hipertrofia, recuperação ou performance esportiva. Conte seu objetivo e um pouco da sua rotina.",
      de: "Ich kann dir gezielt bei Training, Ernährung, Protein, Fettabbau, Muskelaufbau, Regeneration oder sportlicher Leistung helfen. Erzähl mir dein Ziel und etwas über deinen Alltag.",
      es: "Puedo ayudarte de forma más específica con entrenamiento, nutrición, proteína, pérdida de grasa, ganancia muscular, recuperación o rendimiento deportivo. Cuéntame tu objetivo y tu rutina.",
      en: "I can help more specifically with training, nutrition, protein, fat loss, muscle building, recovery, or sports performance. Tell me your goal and a little about your routine."
    }[lang];
  }

  function localized(map, lang = state.lastLanguage || "pt") {
    return map[lang] || map.en || map.pt;
  }

  function consentSummary(lang = state.lastLanguage || "pt") {
    const current = consent.status();
    return localized({
      pt: `Privacidade atual: perfil ${current.profileStorage === "persistent" ? "autorizado para conversas futuras" : current.profileStorage === "session" ? "somente nesta sessão" : "ainda sem escolha"}; melhoria anônima ${current.anonymousImprovement === true ? "autorizada" : current.anonymousImprovement === false ? "não autorizada" : "ainda sem escolha"}; IA externa ${current.externalAI === true ? "autorizada" : current.externalAI === false ? "não autorizada" : "ainda sem escolha"}. Você pode alterar ou revogar essas escolhas a qualquer momento.`,
      en: `Current privacy: profile ${current.profileStorage === "persistent" ? "saved for future conversations" : current.profileStorage === "session" ? "session only" : "not chosen"}; anonymous improvement ${current.anonymousImprovement === true ? "allowed" : current.anonymousImprovement === false ? "not allowed" : "not chosen"}; external AI ${current.externalAI === true ? "allowed" : current.externalAI === false ? "not allowed" : "not chosen"}.`,
      es: `Privacidad actual: perfil ${current.profileStorage === "persistent" ? "guardado" : "solo durante la sesión"}; mejora anónima ${current.anonymousImprovement === true ? "autorizada" : "no autorizada"}; IA externa ${current.externalAI === true ? "autorizada" : current.externalAI === false ? "no autorizada" : "sin elección"}.`,
      de: `Aktueller Datenschutz: Profil ${current.profileStorage === "persistent" ? "gespeichert" : "nur in dieser Sitzung"}; anonyme Verbesserung ${current.anonymousImprovement === true ? "erlaubt" : "nicht erlaubt"}; externe KI ${current.externalAI === true ? "erlaubt" : current.externalAI === false ? "nicht erlaubt" : "noch nicht gewählt"}.`
    }, lang);
  }

  function renderConsentCard() {
    document.querySelector("#fitnessConsentCard")?.remove();
    const isManaging = Number.isInteger(privacyWizardStep);
    if (!consent.needsChoice() && !isManaging) return;
    const lang = state.lastLanguage || state.profile.preferredLanguage || browserLanguage();
    const current = consent.status();
    if (privacyWizardStep === null && current.wizardCompleted !== true) privacyWizardStep = 0;
    const stepIndex = Number.isInteger(privacyWizardStep)
      ? privacyWizardStep
      : current.profileStorage === null ? 0 : current.anonymousImprovement === null ? 1 : 2;
    const copy = ({
      pt: [
        { title:"Privacidade · etapa 1 de 3", question:"Como devo guardar os dados do seu perfil?", detail:"O perfil inclui dados como idade, altura, peso, objetivo e preferências. A conversa completa continua temporária.", labels:["Salvar para próximos acessos","Usar somente nesta sessão"] },
        { title:"Privacidade · etapa 2 de 3", question:"Podemos registrar perguntas não atendidas para melhorar o bot?", detail:"O registro de melhoria é anônimo e não inclui a conversa completa nem identifica o visitante.", labels:["Permitir melhoria anônima","Não permitir"] },
        { title:"Privacidade · etapa 3 de 3", question:"Você permite respostas com IA externa?", detail:"Quando autorizado, enviamos ao Groq ou Gemini a mensagem atual, até 10 mensagens recentes e somente os campos necessários do perfil. Se recusar, o motor offline continuará funcionando.", labels:["Permitir Groq e Gemini","Continuar somente offline"] }
      ],
      en: [
        { title:"Privacy · step 1 of 3", question:"How should your profile data be stored?", detail:"The profile may include age, height, weight, goals, and preferences. Full conversations remain temporary.", labels:["Save for future visits","Use this session only"] },
        { title:"Privacy · step 2 of 3", question:"May we log unanswered questions to improve the bot?", detail:"Improvement records are anonymous and do not include the complete conversation or identify the visitor.", labels:["Allow anonymous improvement","Do not allow"] },
        { title:"Privacy · step 3 of 3", question:"Do you allow external AI responses?", detail:"If allowed, the current message, up to 10 recent messages, and only necessary profile fields go to Groq or Gemini. The offline engine remains available if you decline.", labels:["Allow Groq and Gemini","Continue offline only"] }
      ],
      es: [
        { title:"Privacidad · paso 1 de 3", question:"¿Cómo debemos guardar los datos de tu perfil?", detail:"El perfil puede incluir edad, altura, peso, objetivo y preferencias. La conversación completa sigue siendo temporal.", labels:["Guardar para próximos accesos","Usar solo esta sesión"] },
        { title:"Privacidad · paso 2 de 3", question:"¿Podemos registrar preguntas no respondidas para mejorar el bot?", detail:"El registro es anónimo y no incluye la conversación completa ni identifica al visitante.", labels:["Permitir mejora anónima","No permitir"] },
        { title:"Privacidad · paso 3 de 3", question:"¿Permites respuestas con IA externa?", detail:"Con autorización, se envían a Groq o Gemini el mensaje actual, hasta 10 mensajes recientes y solo los campos necesarios. Si rechazas, continúa el motor offline.", labels:["Permitir Groq y Gemini","Continuar solo offline"] }
      ],
      de: [
        { title:"Datenschutz · Schritt 1 von 3", question:"Wie sollen deine Profildaten gespeichert werden?", detail:"Das Profil kann Alter, Größe, Gewicht, Ziel und Vorlieben enthalten. Der vollständige Chat bleibt temporär.", labels:["Für spätere Besuche speichern","Nur diese Sitzung"] },
        { title:"Datenschutz · Schritt 2 von 3", question:"Dürfen unbeantwortete Fragen anonym zur Verbesserung erfasst werden?", detail:"Der Eintrag ist anonym, enthält nicht den vollständigen Chat und identifiziert den Besucher nicht.", labels:["Anonyme Verbesserung erlauben","Nicht erlauben"] },
        { title:"Datenschutz · Schritt 3 von 3", question:"Erlaubst du Antworten durch externe KI?", detail:"Bei Zustimmung gehen die aktuelle Nachricht, bis zu 10 frühere Nachrichten und nur nötige Profilfelder an Groq oder Gemini. Bei Ablehnung bleibt der Offline-Motor aktiv.", labels:["Groq und Gemini erlauben","Nur offline fortfahren"] }
      ]
    })[lang] || ({
      pt: [],
      en: [
        { title:"Privacy · step 1 of 3", question:"How should your profile data be stored?", detail:"The profile may include age, height, weight, goals, and preferences. Full conversations remain temporary.", labels:["Save for future visits","Use this session only"] }
      ]
    }).en;
    const step = copy[stepIndex] || copy[0];
    const row = document.createElement("div");
    row.className = "message bot consent-card";
    row.id = "fitnessConsentCard";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const body = document.createElement("div");
    body.className = "message-text";
    const stepLabel = document.createElement("div");
    stepLabel.className = "consent-step-label";
    stepLabel.textContent = step.title;
    const question = document.createElement("div");
    question.textContent = step.question;
    const detail = document.createElement("div");
    detail.className = "consent-step-detail";
    detail.textContent = step.detail;
    body.append(stepLabel, question, detail);
    const actions = document.createElement("div");
    actions.className = "consent-actions";
    const savePersistent = () => {
        if (state.profile.age && state.profile.age < 18 && window.FITNESS_ASSISTANT_GUARDIAN_VERIFIED !== true) {
          consent.chooseProfileStorage("session");
          saveState();
          addMessage("bot", localized({
            pt: "Como o perfil informa idade menor de 18 anos, mantive os dados somente nesta sessão. O armazenamento futuro exige um fluxo específico de autorização do responsável, que ainda deve ser validado antes da produção.",
            en: "Because this profile is under 18, I kept the data in this session only. Persistent storage requires a verified guardian-consent flow before production.",
            es: "Como el perfil es menor de 18 años, mantuve los datos solo en esta sesión. El almacenamiento persistente requiere autorización verificada del responsable.",
            de: "Da dieses Profil minderjährig ist, bleiben die Daten nur in dieser Sitzung. Dauerhafte Speicherung erfordert eine geprüfte Einwilligung der Erziehungsberechtigten."
          }, lang));
          return;
        }
        consent.chooseProfileStorage("persistent");
        saveState();
      };
    const allowExternalAI = () => {
        if (state.profile.age && state.profile.age < 18 && window.FITNESS_ASSISTANT_GUARDIAN_VERIFIED !== true) {
          consent.chooseExternalAI(false);
          addMessage("bot", localized({pt:"Para este perfil menor de 18 anos, mantive o uso somente offline. A IA externa exige um fluxo de autorização verificada do responsável.",en:"For this under-18 profile, I kept offline-only mode. External AI requires verified guardian authorization.",es:"Para este perfil menor de 18 años, mantuve el modo solo offline. La IA externa requiere autorización verificada del responsable.",de:"Für dieses minderjährige Profil bleibt nur der Offline-Modus aktiv. Externe KI erfordert eine geprüfte Zustimmung der Erziehungsberechtigten."},lang));
          return;
        }
        consent.chooseExternalAI(true);
      };
    const choices = stepIndex === 0
      ? [[step.labels[0], savePersistent], [step.labels[1], () => { consent.chooseProfileStorage("session"); saveState(); }]]
      : stepIndex === 1
        ? [[step.labels[0], () => consent.chooseImprovement(true)], [step.labels[1], () => consent.chooseImprovement(false)]]
        : [[step.labels[0], allowExternalAI], [step.labels[1], () => consent.chooseExternalAI(false)]];
    choices.forEach(([label, action]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        action();
        if (stepIndex < 2) privacyWizardStep = stepIndex + 1;
        else {
          consent.completeWizard();
          privacyWizardStep = null;
        }
        renderConsentCard();
      });
      actions.append(button);
    });
    if (current.wizardCompleted === true) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = localized({ pt:"Cancelar", en:"Cancel" }, lang);
      cancel.addEventListener("click", () => { privacyWizardStep = null; renderConsentCard(); });
      actions.append(cancel);
    }
    bubble.append(body, actions);
    row.append(bubble);
    els.messages.append(row);
    scrollToLatest(false);
  }

  function updateMedicalNote(lang) {
    els.input.setAttribute("aria-describedby", "medicalNote");
    document.querySelector("#medicalNote").textContent = localized({
      pt: "Conteúdo educativo — não substitui avaliação, diagnóstico ou acompanhamento de profissionais qualificados.",
      en: "Educational information — not a substitute for evaluation, diagnosis, or follow-up by qualified professionals."
    }, lang);
    els.input.placeholder = localized({ pt:"Pergunte, por exemplo: como posso emagrecer?", en:"Ask me, e.g. How can I lose weight?", es:"Pregunta, por ejemplo: ¿cómo puedo adelgazar?", de:"Frage zum Beispiel: Wie kann ich gesund abnehmen?" }, lang);
    if (!isLoading) els.send.textContent = localized({ pt:"Enviar", en:"Send", es:"Enviar", de:"Senden" }, lang);
    if (els.managePrivacy) els.managePrivacy.textContent = localized({ pt:"Gerenciar privacidade", en:"Manage privacy" }, lang);
    if (els.deleteData) els.deleteData.textContent = localized({ pt:"Apagar meus dados", en:"Delete my data" }, lang);
  }

  function deleteVisitorData() {
    const lang = state.lastLanguage || state.profile.preferredLanguage || browserLanguage();
    const confirmed = window.confirm(localized({
      pt: "Apagar o perfil salvo, as escolhas de privacidade e a conversa temporária? Esta ação não pode ser desfeita.",
      en: "Delete this visitor's saved profile, privacy choices, and temporary conversation? This cannot be undone."
    }, lang));
    if (!confirmed) return;
    localStorage.removeItem(profileStorageKey);
    sessionStorage.removeItem(profileSessionKey);
    consent.clear();
    privacyWizardStep = null;
    state.profile = emptyProfile();
    state.messages = [];
    state.artifactHistory = [];
    state.lastArtifact = null;
    state.lastTopic = null;
    state.lastIntent = null;
    state.lastAction = null;
    state.pendingRequest = null;
    state.pendingFields = [];
    state.privacyConsent = consent.status();
    renderHistory();
    updateMedicalNote(lang);
    renderConsentCard();
    window.alert(localized({ pt:"Seus dados foram apagados.", en:"Your data has been deleted." }, lang));
  }

  function downloadJson(filename, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handlePrivacyRequest(lang, text) {
    const t = normalize(text);
    if (/use (?:somente|apenas) offline|nao (?:envie|mande).*(?:ia|groq|gemini)|sem ia|offline only|do not send.*(?:ai|groq|gemini)|solo sin ia|solo offline|no envies.*(?:ia|groq|gemini)|nur offline|nicht.*(?:ki|groq|gemini).*(?:senden|schicken)/.test(t)) {
      consent.chooseExternalAI(false); renderConsentCard();
      return localized({pt:"Certo. Desativei a IA externa para este visitante. As respostas continuarão pelo motor offline, sem enviar mensagens ou perfil ao Groq ou Gemini.",en:"Done. External AI is disabled for this visitor. The offline engine will continue without sending messages or profile data to Groq or Gemini.",es:"Listo. Desactivé la IA externa para este visitante. El motor offline continuará sin enviar mensajes ni perfil a Groq o Gemini.",de:"Erledigt. Externe KI ist für diesen Besucher deaktiviert. Der Offline-Motor läuft weiter, ohne Nachrichten oder Profildaten an Groq oder Gemini zu senden."},lang);
    }
    if (state.pendingConfirmation && /^(?:nao|cancelar|cancele|no|nein|abbrechen)$/.test(t)) {
      state.pendingConfirmation = null;
      return localized({ pt: "Operação cancelada. Nenhum dado foi apagado.", en: "Operation cancelled. No data was deleted.", es: "Operación cancelada. No se eliminó ningún dato.", de: "Vorgang abgebrochen. Es wurden keine Daten gelöscht." }, lang);
    }
    if (state.pendingConfirmation === "delete-profile" && /^(?:sim|confirmo|confirmar|apague|excluir|yes|si)$/.test(t)) {
      localStorage.removeItem(profileStorageKey); sessionStorage.removeItem(profileSessionKey); consent.clear();
      state.profile = emptyProfile(); state.pendingConfirmation = null; renderConsentCard();
      return localized({ pt: "Seu perfil local e os consentimentos foram removidos. A conversa atual continua sem perfil persistente.", en: "Your local profile and consent record were removed.", es: "Tu perfil local y los consentimientos fueron eliminados.", de: "Dein lokales Profil und die Einwilligungen wurden gelöscht." }, lang);
    }
    if (state.pendingConfirmation === "clear-conversation" && /^(?:sim|confirmo|confirmar|apague|yes|si)$/.test(t)) {
      state.messages = []; state.artifactHistory = []; state.lastArtifact = null; state.lastTopic = null; state.pendingConfirmation = null; renderHistory();
      return localized({ pt: "A conversa temporária foi apagada. Os dados do perfil não foram alterados.", en: "The temporary conversation was cleared; your profile was not changed.", es: "La conversación temporal fue eliminada.", de: "Der temporäre Gesprächsverlauf wurde gelöscht." }, lang);
    }
    if (/quais dados.*(?:tem|guarda)|mostre meus dados|meus dados armazenados|what data.*me|que datos.*(?:tiene|guarda)|meine daten|welche daten/.test(t)) {
      const values = Object.entries(state.profile).filter(([,value]) => value !== null && value !== "" && (!Array.isArray(value) || value.length)).map(([key,value]) => `• ${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join("\n");
      return `${consentSummary(lang)}\n\n${values || localized({pt:"Nenhum dado de perfil foi informado.",en:"No profile data has been provided."},lang)}`;
    }
    if (/exporte meus dados|baixar meus dados|download.*dados|export my data|exporta mis datos|descarga mis datos|meine daten exportieren/.test(t)) {
      downloadJson(`fitness-assistant-profile-${new Date().toISOString().slice(0,10)}.json`, { exportedAt:new Date().toISOString(), profile:state.profile, consent:consent.exportRecord() });
      return localized({pt:"Preparei um arquivo com seu perfil e suas escolhas de privacidade. A conversa completa não é incluída porque permanece temporária.",en:"I prepared an export of your profile and privacy choices."},lang);
    }
    if (/apague meu perfil|exclua meu perfil|delete my profile|elimina mi perfil|borra mi perfil|mein profil loschen/.test(t)) {
      state.pendingConfirmation = "delete-profile";
      return localized({pt:"Essa ação removerá o perfil persistente e os consentimentos locais. A conversa temporária atual também deixará de usar esses dados. Responda “confirmo” para continuar ou “não” para cancelar.",en:"This will remove your saved profile and local consent record. Reply “confirm” to continue."},lang);
    }
    if (/apague (?:esta|minha|a) conversa|limpe (?:esta|a) conversa|clear.*conversation|borra (?:esta|la) conversacion|elimina (?:esta|la) conversacion|diese unterhaltung loschen/.test(t)) {
      state.pendingConfirmation = "clear-conversation";
      return localized({pt:"Posso apagar as mensagens e o contexto temporário desta conversa sem excluir seu perfil. Responda “confirmo” para continuar.",en:"I can clear this temporary conversation without deleting your profile. Reply “confirm” to continue."},lang);
    }
    if (/nao (?:quero )?mais.*(?:salv|guard)|revog.*consent|use apenas nesta sessao|stop saving|no guardes mas|revoca.*consent|nicht mehr speichern|einwilligung widerrufen/.test(t)) {
      consent.revoke(); localStorage.removeItem(profileStorageKey); saveState(); renderConsentCard();
      return localized({pt:"A persistência e a melhoria anônima foram desativadas. Os dados atuais ficarão somente nesta sessão. Você pode solicitar a exclusão completa do perfil separadamente.",en:"Persistent storage and anonymous improvement were disabled; current data is session-only."},lang);
    }
    const forget = t.match(/(?:esqueca|apague|remova) (?:minha|meu) (idade|altura|peso|nome|objetivo|esporte)/);
    if (forget) {
      const keys={idade:"age",altura:"heightCm",peso:"weightKg",nome:"name",objetivo:"goal",esporte:"primarySport"}; state.profile[keys[forget[1]]]=null; saveState();
      return `Removi ${forget[1]} do perfil desta sessão${consent.canPersistProfile() ? " e do perfil persistente" : ""}.`;
    }
    if (/gerenciar privacidade|privacidade|consentimento|gestionar privacidad|privacidad|datenschutz|einwilligung/.test(t)) return `${consentSummary(lang)}\n\n${localized({
      pt: "No protótipo, o perfil autorizado fica neste navegador por até 180 dias. A melhoria anônima e o uso de IA externa são escolhas separadas. Quando a IA é autorizada, o servidor envia a mensagem atual, até 10 mensagens recentes e campos necessários do perfil ao Groq ou Gemini; as chaves ficam somente no servidor. Você pode continuar offline, exportar, corrigir, revogar ou excluir. O canal oficial de privacidade ainda deve ser definido antes da produção.",
      en: "In this prototype, an authorized profile stays in this browser for up to 180 days. Anonymous improvement and external AI are separate choices. When AI is allowed, the server sends the current message, up to 10 recent messages, and necessary profile fields to Groq or Gemini; keys remain server-side. You can stay offline, export, correct, revoke, or delete.",
      es: "En este prototipo, el perfil autorizado permanece en este navegador hasta 180 días. La mejora anónima y la IA externa son elecciones separadas. Con IA autorizada, el servidor envía el mensaje actual, hasta 10 mensajes recientes y los campos necesarios a Groq o Gemini; las claves permanecen en el servidor.",
      de: "In diesem Prototyp bleibt ein genehmigtes Profil bis zu 180 Tage im Browser. Anonyme Verbesserung und externe KI sind getrennte Entscheidungen. Bei Erlaubnis sendet der Server die aktuelle Nachricht, bis zu 10 frühere Nachrichten und notwendige Profilfelder an Groq oder Gemini; Schlüssel bleiben auf dem Server."
    }, lang)}`;
    return null;
  }

  function handleStructuredV2(lang, text, interpretation) {
    const t = interpretation?.rewritten || normalize(text);
    const weeksMatch = t.match(/\b(4|8|12)\s*(?:semanas?|weeks?|wochen)\b/);
    if (weeksMatch && /plano|plan|programa|program|treino|training|entrenamiento|periodiza|progress|progresiv/.test(t)) {
      const plan = window.FitnessPeriodizationEngine.build({ weeks:Number(weeksMatch[1]), days:state.profile.trainingDays || 3, durationMinutes:interpretation.entities.durationMinutes || state.profile.durationMinutes || 45, goal:state.profile.goal || "general", equipment:interpretation.entities.equipment || state.profile.equipment || "bodyweight", language:lang });
      rememberArtifact(plan, { intent:"periodized-plan", action:"create", text:plan.text }); return plan.text;
    }
    if (state.lastArtifact?.type === "periodized-workout") {
      const days = t.match(/\b([2-6])\s*(?:dias?|days?|tage)\b/)?.[1]; const duration = interpretation.entities.durationMinutes;
      const missedDay = /perdi|faltei|nao consegui|missed|could not train|perdi una sesion|verpasst/.test(t);
      if (missedDay || days || duration) {
        const plan = window.FitnessPeriodizationEngine.adapt(state.lastArtifact, { missedDay, newDays:days?Number(days):null, newDuration:duration });
        rememberArtifact(plan,{intent:"periodized-plan",action:"modify",text:plan.text}); return plan.text;
      }
    }
    if (/calcule|calculate|calcula|berechne|quantas calorias|how many calories|cuantas calorias|wie viele kalorien|macros|macronutrientes/.test(t) && /\d+\s*g/.test(t)) {
      const items=[]; const pattern=/(\d{1,4})\s*g(?:ramas?|rams?)?\s+(?:de\s+|of\s+)?([^,;]+?)(?=\s+(?:e|and|y|und)\s+\d+\s*g|,|;|$)/g; let match;
      while((match=pattern.exec(t))) items.push({name:match[2].trim(),grams:Number(match[1])});
      if(items.length){const calc=window.FitnessNutritionEngine.calculate(items); const totals=calc.totals; const values={kcal:Math.round(totals.kcal),protein:totals.protein,carbs:totals.carbs,fat:totals.fat,fiber:totals.fiber,missing:calc.missing.join(", ")}; return localized({
        pt:`Estimativa da refeição: ${values.kcal} kcal, ${values.protein} g de proteína, ${values.carbs} g de carboidratos, ${values.fat} g de gorduras e ${values.fiber} g de fibras.${values.missing?` Não encontrei: ${values.missing}.`:""} Valores médios educativos; marcas, preparo e peso cru ou cozido alteram o resultado.`,
        en:`Meal estimate: ${values.kcal} kcal, ${values.protein} g protein, ${values.carbs} g carbohydrate, ${values.fat} g fat, and ${values.fiber} g fiber.${values.missing?` Not found: ${values.missing}.`:""} Educational averages; brands, preparation, and raw versus cooked weight change the result.`,
        es:`Estimación de la comida: ${values.kcal} kcal, ${values.protein} g de proteína, ${values.carbs} g de carbohidratos, ${values.fat} g de grasa y ${values.fiber} g de fibra.${values.missing?` No encontré: ${values.missing}.`:""} Son promedios educativos; la marca, preparación y el peso crudo o cocido cambian el resultado.`,
        de:`Geschätzte Mahlzeit: ${values.kcal} kcal, ${values.protein} g Protein, ${values.carbs} g Kohlenhydrate, ${values.fat} g Fett und ${values.fiber} g Ballaststoffe.${values.missing?` Nicht gefunden: ${values.missing}.`:""} Bildungsbezogene Durchschnittswerte; Marke, Zubereitung und Roh- oder Kochgewicht verändern das Ergebnis.`
      },lang);}
    }
    const exercise = window.FitnessExerciseDB.find(t);
    if (exercise && /como faco|como executar|execucao|quais musculos|substitu/.test(t)) {
      if (/substitu|troque/.test(t)) { const alt=window.FitnessExerciseDB.alternatives(exercise,{equipment:interpretation.entities.equipment || state.profile.equipment})[0]; if(alt)return `Para manter o padrão ${exercise.pattern}, substitua ${exercise.name} por ${alt.name}. Comece com ${alt.sets[0]}–${Math.min(3,alt.sets[1])} séries de ${alt.reps[0]}–${alt.reps[1]} repetições e preserve amplitude sem dor.`; }
      return `${exercise.name}: trabalha principalmente ${exercise.primaryMuscles.join(" e ")}. ${exercise.instructions} Erros comuns: ${exercise.commonErrors.join(", ")}. Faixa inicial: ${exercise.sets[0]}–${exercise.sets[1]} séries de ${exercise.reps[0]}–${exercise.reps[1]}, com ${exercise.restSeconds[0]}–${exercise.restSeconds[1]} s de descanso.`;
    }
    return null;
  }

  async function probeExternalAI() {
    try {
      const status = await window.FitnessAIProvider.healthCheck();
      externalAI = { available: Boolean(status.available), providers: status.providers || [], order: status.order || [] };
    } catch (_) {
      externalAI = { available: false, providers: [], order: [] };
    }
  }

  async function askExternalAI(message, language) {
    const result = await window.FitnessAIProvider.generateResponse({
      message,
      language,
      profile: sanitizeProfile(state.profile),
      history: state.messages.slice(-11, -1).map(({ role, text }) => ({ role, text: String(text || "").slice(0, 5000) })),
      externalAIConsent: consent.canUseExternalAI()
    });
    if (!result.answer) throw new Error("Empty external AI response");
    const provider = result.provider === "gemini" ? "Gemini" : result.provider === "groq" ? "Groq" : "IA externa";
    return { text: result.answer, source: `IA · ${provider} · ${result.model || "modelo configurado"}`, confidence: "média" };
  }

  async function sendMessage(text, forcedOfferAction = null) {
    const clean = text.trim();
    if (!clean || isLoading) return;
    addMessage("user", clean);
    els.input.value = "";
    const interpretation = window.FitnessIntentEngine.analyze(clean, { lastTopic: state.lastTopic, lastLanguage: state.lastLanguage });
    setLoading(true);
    showTyping();

    const delay = 650 + Math.min(clean.length * 8, 900);
    await new Promise(resolve => setTimeout(resolve, delay));
    document.querySelector("#typingIndicator")?.remove();

    try {
      const interpretedText = interpretation.rewritten || clean;
      const language = detectLanguage(clean, interpretation.language || state.lastLanguage || state.profile.preferredLanguage || browserLanguage());
      const routingText = canonicalizeForRouting(interpretedText, language);
      state.lastLanguage = language;
      state.profile.preferredLanguage = language;
      extractProfile(routingText);
      saveState();
      updateMedicalNote(language);
      state.lastInterpretation = interpretation;
      state.privacyConsent = consent.status();
      const needsInterfaceMedia = /(fotos?|imagens?|photos?|pictures?|images?|bilder|imagenes?)/.test(normalize(routingText));
      let answer = null;
      const privacyAnswer = handlePrivacyRequest(language, routingText);
      const safety = window.FitnessSafetyEngine.classify(routingText, state.profile);
      const painWorkoutRequest = safety.level === "caution" && /(?:monte|gere|crie|faca|quero|create|make|build|crea|erstelle).*(?:treino|exercicio|workout|training|entrenamiento)|(?:posso|devo|can i|should i|puedo|kann ich).*(?:treinar|exercicio|train|entrenar)|(?:continuar|voltar|resume|return).*(?:trein|exerc)/.test(normalize(routingText));
      const safetyAnswer = ["emergency", "urgent", "unsafe"].includes(safety.level) || (safety.level === "professional" && !safety.profileCaution) || painWorkoutRequest
        ? { text: window.FitnessSafetyEngine.response(safety, language), suppressFollowUp: safety.blocksAnswer }
        : null;
      const structuredAnswer = !privacyAnswer && !safetyAnswer ? handleStructuredV2(language, routingText, interpretation) : null;
      if (!privacyAnswer && !safetyAnswer && !structuredAnswer && externalAI.available && consent.canUseExternalAI() && !needsInterfaceMedia) {
        try {
          answer = await askExternalAI(clean, language);
        } catch (_) {}
      }
      const forcedAnswer = forcedOfferAction ? executeBotOffer({ action: forcedOfferAction, data: { source: "clicked-followup" } }) : null;
      let rawAnswer = privacyAnswer || safetyAnswer || structuredAnswer || answer || forcedAnswer || generalAnswer(language, routingText);
      if (!privacyAnswer && !safetyAnswer && safety.profileCaution) {
        const caution = window.FitnessSafetyEngine.response(safety, language);
        rawAnswer = `${rawAnswer}\n\n${caution}`;
      }
      if (state.pendingPrivacyNotice === "minor-session-only") {
        const notice = localized({
          pt: "Privacidade: como a idade informada é menor de 18 anos, a autorização anterior foi alterada para uso somente nesta sessão; nenhum perfil permanente foi mantido.",
          en: "Privacy: because the stated age is under 18, the previous choice was changed to session-only use and no persistent profile was kept.",
          es: "Privacidad: como la edad indicada es menor de 18 años, la elección anterior cambió a uso solo durante esta sesión y no se guardó un perfil permanente.",
          de: "Datenschutz: Da das angegebene Alter unter 18 liegt, wurde die vorherige Auswahl auf diese Sitzung beschränkt und kein dauerhaftes Profil gespeichert."
        }, language);
        rawAnswer = typeof rawAnswer === "string" ? `${notice}\n\n${rawAnswer}` : { ...rawAnswer, text: `${notice}\n\n${rawAnswer.text}` };
        state.pendingPrivacyNotice = null;
      }
      const enriched = window.FitnessQualityEngine?.enrich(rawAnswer, { question: clean, language, state }) || rawAnswer;
      if (enriched?.quality?.followUpAction && !state.lastBotOffer) {
        setBotOffer(enriched.quality.followUpAction, { source: "quality-followup", label: enriched.quality.followUp });
      }
      addMessage("bot", enriched);
    } catch (_) {
      addMessage("bot", "Sorry, I could not prepare a response just now. Please try again.");
    } finally {
      setLoading(false);
      els.input.focus();
      saveState();
    }
  }

  els.form.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage(els.input.value);
  });
  els.chips.forEach(chip => chip.addEventListener("click", () => sendMessage(chip.dataset.prompt)));
  els.close.addEventListener("click", () => {
    els.modal.hidden = true;
    els.reopen.hidden = false;
  });
  els.reopen.addEventListener("click", () => {
    els.modal.hidden = false;
    els.reopen.hidden = true;
    els.input.focus();
    scrollToLatest(false);
  });
  els.deleteData?.addEventListener("click", deleteVisitorData);
  els.managePrivacy?.addEventListener("click", () => {
    privacyWizardStep = 0;
    renderConsentCard();
  });
  els.languageChoices.forEach(button => button.addEventListener("click", () => {
    els.languageGate.hidden = true;
    applyInterfaceLanguage(button.dataset.language, { persist: true, replaceWelcome: true });
    els.input.focus();
  }));
  els.languageButton?.addEventListener("click", () => {
    els.languageGate.hidden = false;
    els.languageGate.querySelector(`[data-language="${uiLanguage}"]`)?.focus();
  });
  els.howItWorks?.addEventListener("click", () => {
    els.projectInfo.hidden = false;
    els.closeProjectInfo.focus();
  });
  els.closeProjectInfo?.addEventListener("click", () => {
    els.projectInfo.hidden = true;
    els.howItWorks.focus();
  });
  els.projectInfo?.addEventListener("click", event => {
    if (event.target === els.projectInfo) els.closeProjectInfo.click();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.projectInfo.hidden) els.closeProjectInfo.click();
  });

  applyInterfaceLanguage(uiLanguage, { persist: Boolean(readUiLanguage()), replaceWelcome: true });
  els.languageGate.hidden = Boolean(readUiLanguage());
  // This same-origin status check consumes no provider quota and exposes no key.
  probeExternalAI();
  setTimeout(() => {
    if (!els.languageGate.hidden) els.languageGate.querySelector("[data-language]")?.focus();
    else els.input.focus();
  }, 250);
})();



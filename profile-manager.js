(function () {
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

  const emptyProfile = () => ({
    name: null, preferredLanguage: null, age: null, heightCm: null, weightKg: null, sex: null,
    activity: null, goal: null, targetLossKg: null, dietNotes: [], allergies: [], equipment: null,
    experience: null, limitations: [], durationMinutes: null, trainingDays: null, primarySport: null,
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

  window.FitnessProfileManager = {
    PROFILE_STORAGE_PREFIX, UI_LANGUAGE_KEY, readUiLanguage, initialMessageFor,
    emptyProfile, sanitizeProfile, stableId, resolveVisitorId,
  };
})();

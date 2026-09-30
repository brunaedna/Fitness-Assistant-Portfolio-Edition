const PROFILE_FIELDS = new Set([
  "preferredLanguage", "age", "heightCm", "weightKg", "sex", "activity", "goal",
  "targetLossKg", "dietNotes", "allergies", "equipment", "experience", "limitations",
  "durationMinutes", "trainingDays", "primarySport",
]);

export function validateChatInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("Request body must be an object", "invalid_request");
  }
  if (input.externalAIConsent !== true) {
    return invalid("External AI consent is required", "consent_required", 403);
  }

  const message = String(input.message || "").trim().slice(0, 5_000);
  if (!message) return invalid("Message is required", "message_required");

  return {
    ok: true,
    value: {
      message,
      language: String(input.language || "infer from the latest message").slice(0, 10),
      profile: sanitizeProfile(input.profile),
      history: sanitizeHistory(input.history),
    },
  };
}

export function sanitizeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => PROFILE_FIELDS.has(key))
      .map(([key, item]) => [key, sanitizeProfileValue(item)])
      .filter(([, item]) => item !== undefined),
  );
}

export function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-10)
    .map((item) => ({
      role: ["assistant", "bot"].includes(item?.role) ? "assistant" : "user",
      content: String(item?.text || item?.content || "").trim().slice(0, 5_000),
    }))
    .filter((item) => item.content);
}

function sanitizeProfileValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => String(item).slice(0, 100));
  if (typeof value === "string") return value.slice(0, 300);
  if (["number", "boolean"].includes(typeof value)) return value;
  return undefined;
}

function invalid(error, code, status = 400) {
  return { ok: false, error, code, status };
}

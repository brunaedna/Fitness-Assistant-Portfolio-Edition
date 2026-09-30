const SUPPORTED_PROVIDERS = new Set(["groq", "gemini"]);

export function providerOrder(env) {
  const configuredOrder = String(env.FITNESS_AI_PROVIDER_ORDER || "groq,gemini")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => SUPPORTED_PROVIDERS.has(value));
  const uniqueOrder = [...new Set(configuredOrder)];
  return uniqueOrder.length ? uniqueOrder : ["groq", "gemini"];
}

export function providerSettings(env) {
  return {
    groq: {
      name: "groq",
      configured: Boolean(env.GROQ_API_KEY),
      model: env.GROQ_MODEL || "openai/gpt-oss-120b",
    },
    gemini: {
      name: "gemini",
      configured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    },
  };
}

export function timeoutMs(env) {
  const configuredSeconds = Number(env.FITNESS_AI_TIMEOUT || 20);
  const seconds = Number.isFinite(configuredSeconds)
    ? Math.max(5, Math.min(60, configuredSeconds))
    : 20;
  return seconds * 1_000;
}

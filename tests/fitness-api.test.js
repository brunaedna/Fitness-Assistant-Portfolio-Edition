import assert from "node:assert/strict";
import test from "node:test";

import { createChatService } from "../lib/fitness-api/chat-service.js";
import { providerOrder, timeoutMs } from "../lib/fitness-api/config.js";
import { createRequestContext, json } from "../lib/fitness-api/http.js";
import { sanitizeHistory, sanitizeProfile, validateChatInput } from "../lib/fitness-api/input.js";
import { InMemoryRateLimiter } from "../lib/fitness-api/rate-limiter.js";

const context = { requestId: "test-request", startedAt: Date.now() };

test("valida consentimento e conteúdo antes de chamar provedores externos", () => {
  assert.equal(validateChatInput({ message: "Olá" }).code, "consent_required");
  assert.equal(validateChatInput({ message: "  ", externalAIConsent: true }).code, "message_required");
  assert.equal(validateChatInput({ message: "Olá", externalAIConsent: true }).ok, true);
});

test("limita e normaliza perfil e histórico recebidos pela API", () => {
  assert.deepEqual(sanitizeProfile({ goal: "muscle", secret: "remove", allergies: ["milk"] }), {
    goal: "muscle",
    allergies: ["milk"],
  });
  assert.deepEqual(sanitizeHistory([
    { role: "bot", text: "Resposta" },
    { role: "unknown", content: "Pergunta" },
    { role: "user", text: "" },
  ]), [
    { role: "assistant", content: "Resposta" },
    { role: "user", content: "Pergunta" },
  ]);
});

test("normaliza ordem de provedores e restringe timeout", () => {
  assert.deepEqual(providerOrder({ FITNESS_AI_PROVIDER_ORDER: "gemini,invalid,gemini,groq" }), ["gemini", "groq"]);
  assert.equal(timeoutMs({ FITNESS_AI_TIMEOUT: "1" }), 5_000);
  assert.equal(timeoutMs({ FITNESS_AI_TIMEOUT: "90" }), 60_000);
  assert.equal(timeoutMs({ FITNESS_AI_TIMEOUT: "invalid" }), 20_000);
});

test("usa o próximo provedor quando o primeiro falha", async () => {
  const attemptedMessages = [];
  const service = createChatService(
    {
      GROQ_API_KEY: "configured",
      GEMINI_API_KEY: "configured",
      FITNESS_AI_PROVIDER_ORDER: "groq,gemini",
    },
    {
      clients: {
        groq: { async generate() { throw Object.assign(new Error("unavailable"), { status: 503 }); } },
        gemini: { async generate(messages) { attemptedMessages.push(messages); return "Resposta segura"; } },
      },
    },
  );

  const result = await service.generate({
    message: "Monte um treino",
    language: "pt",
    profile: { goal: "muscle" },
    history: [],
    externalAIConsent: true,
  }, context);

  assert.equal(result.status, 200);
  assert.equal(result.body.provider, "gemini");
  assert.equal(result.body.fallbackUsed, true);
  assert.equal(result.body.providerAttempts[0].provider, "groq");
  assert.equal(attemptedMessages[0].at(-1).content, "Monte um treino");
});

test("retorna fallback local quando nenhum provedor está configurado", async () => {
  const service = createChatService({}, { clients: {} });
  const result = await service.generate({
    message: "Quero ajuda",
    externalAIConsent: true,
  }, context);

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "no_provider_configured");
  assert.equal(result.body.fallback, true);
});

test("rate limiter informa quando uma nova tentativa pode ser feita", () => {
  let now = 1_000;
  const limiter = new InMemoryRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });

  assert.equal(limiter.consume("visitor").allowed, true);
  assert.equal(limiter.consume("visitor").allowed, true);
  assert.deepEqual(limiter.consume("visitor"), { allowed: false, retryAfterSeconds: 60 });

  now += 60_000;
  assert.equal(limiter.consume("visitor").allowed, true);
});

test("correlaciona respostas com um identificador de requisição seguro", async () => {
  const validContext = createRequestContext(new Request("https://example.com", {
    headers: { "X-Request-Id": "browser-request_123" },
  }));
  const invalidContext = createRequestContext(new Request("https://example.com", {
    headers: { "X-Request-Id": "identificador com espaços" },
  }));
  const response = json({ ok: true }, { requestId: validContext.requestId });

  assert.equal(validContext.requestId, "browser-request_123");
  assert.notEqual(invalidContext.requestId, "identificador com espaços");
  assert.equal(response.headers.get("X-Fitness-Request-Id"), "browser-request_123");
  assert.equal((await response.json()).requestId, "browser-request_123");
});

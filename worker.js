import { createChatService } from "./lib/fitness-api/chat-service.js";
import { createRequestContext, json, logEvent } from "./lib/fitness-api/http.js";
import { InMemoryRateLimiter } from "./lib/fitness-api/rate-limiter.js";

const rateLimiter = new InMemoryRateLimiter({ limit: 12, windowMs: 60_000 });

export default {
  async fetch(request, env) {
    const context = createRequestContext(request);
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/status" && request.method === "GET") {
        return handleStatus(env, context);
      }

      if (url.pathname === "/api/chat" && request.method === "POST") {
        return await handleChat(request, env, context);
      }

      if (url.pathname === "/api/review" && request.method === "POST") {
        return json(
          { stored: false, reason: "Demo pública sem armazenamento de avaliações" },
          { status: 202, requestId: context.requestId },
        );
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Not found", code: "not_found" }, { status: 404, requestId: context.requestId });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      logEvent("request.failed", context, { errorType: error?.name || "Error" });
      return json(
        { error: "Unexpected server error", code: "internal_error", fallback: true },
        { status: 500, requestId: context.requestId },
      );
    }
  },
};

function handleStatus(env, context) {
  return json(createChatService(env).status(), { requestId: context.requestId });
}

async function handleChat(request, env, context) {
  if (!String(request.headers.get("content-type") || "").includes("application/json")) {
    return json(
      { error: "Content-Type must be application/json", code: "unsupported_media_type", fallback: true },
      { status: 415, requestId: context.requestId },
    );
  }

  const rateLimit = rateLimiter.consume(context.clientKey);
  if (!rateLimit.allowed) {
    logEvent("request.rate_limited", context);
    return json(
      { error: "Muitas solicitações. Aguarde um minuto e tente novamente.", code: "rate_limited", fallback: true },
      {
        status: 429,
        requestId: context.requestId,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const raw = await request.text();
  if (raw.length > 100_000) {
    return json(
      { error: "Request too large", code: "request_too_large", fallback: true },
      { status: 413, requestId: context.requestId },
    );
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(
      { error: "Invalid JSON request", code: "invalid_json", fallback: true },
      { status: 400, requestId: context.requestId },
    );
  }

  const result = await createChatService(env).generate(input, context);
  return json(result.body, {
    status: result.status,
    requestId: context.requestId,
    headers: { "Server-Timing": `total;dur=${Date.now() - context.startedAt}` },
  });
}

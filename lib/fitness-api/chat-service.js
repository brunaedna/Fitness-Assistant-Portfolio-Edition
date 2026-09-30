import { providerOrder, providerSettings } from "./config.js";
import { logEvent } from "./http.js";
import { validateChatInput } from "./input.js";
import { createProviderClients, SYSTEM_PROMPT } from "./provider-clients.js";

export function createChatService(env, dependencies = {}) {
  const clients = dependencies.clients || createProviderClients(env, dependencies.fetchImplementation);
  const settings = providerSettings(env);
  const order = providerOrder(env);

  return {
    status() {
      return {
        available: order.some((name) => settings[name].configured),
        providers: order.map((name) => settings[name]),
        order,
        fallback: "local-knowledge-engine",
      };
    },

    async generate(rawInput, context = defaultContext()) {
      const validation = validateChatInput(rawInput);
      if (!validation.ok) {
        return {
          status: validation.status,
          body: { error: validation.error, code: validation.code, fallback: true },
        };
      }

      const messages = buildMessages(validation.value);
      const providerAttempts = [];
      let attempted = 0;

      for (const providerName of order) {
        if (!settings[providerName].configured) continue;
        attempted += 1;
        const providerStartedAt = Date.now();
        try {
          const answer = await clients[providerName].generate(messages);
          logEvent("provider.succeeded", context, {
            provider: providerName,
            providerDurationMs: Date.now() - providerStartedAt,
            fallbackUsed: attempted > 1,
          });
          return {
            status: 200,
            body: {
              answer,
              provider: providerName,
              model: settings[providerName].model,
              fallbackUsed: attempted > 1,
              providerAttempts,
            },
          };
        } catch (error) {
          const safeFailure = safeProviderError(providerName, error, providerStartedAt);
          providerAttempts.push(safeFailure);
          logEvent("provider.failed", context, safeFailure);
        }
      }

      return {
        status: attempted ? 502 : 503,
        body: {
          error: "No external provider is currently available",
          code: attempted ? "all_providers_unavailable" : "no_provider_configured",
          fallback: true,
          providerAttempts,
        },
      };
    },
  };
}

function buildMessages(input) {
  const system = `${SYSTEM_PROMPT}\nActive language hint: ${input.language}.\nKnown user profile: ${JSON.stringify(input.profile)}`;
  const messages = [{ role: "system", content: system }, ...input.history];
  const lastMessage = input.history.at(-1);
  if (!lastMessage || lastMessage.role !== "user" || lastMessage.content !== input.message) {
    messages.push({ role: "user", content: input.message });
  }
  return messages;
}

function safeProviderError(provider, error, startedAt) {
  return {
    provider,
    type: error?.name || "Error",
    status: Number(error?.status || 0) || undefined,
    durationMs: Date.now() - startedAt,
  };
}

function defaultContext() {
  return { requestId: crypto.randomUUID(), startedAt: Date.now() };
}

export function createRequestContext(request) {
  const suppliedRequestId = request.headers.get("X-Request-Id") || "";
  const requestId = /^[a-zA-Z0-9._-]{1,100}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  return {
    requestId,
    clientKey: request.headers.get("CF-Connecting-IP") || "anonymous",
    startedAt: Date.now(),
  };
}

export function json(payload, { status = 200, requestId, headers = {} } = {}) {
  return new Response(JSON.stringify({ ...payload, requestId }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Fitness-Request-Id": requestId,
      ...headers,
    },
  });
}

export function logEvent(event, context, details = {}) {
  console.log(JSON.stringify({
    event,
    requestId: context.requestId,
    durationMs: Date.now() - context.startedAt,
    ...details,
  }));
}

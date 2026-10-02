// JSON responses and errors shared by every /api/ route.

/* An error that becomes a JSON response: { error, code?, ...extra }. */
export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const fail = (status, message, code, extra) => {
  throw new HttpError(status, message, code, extra);
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return json({ ...body, ...err.extra }, err.status);
  }
  // Anything unexpected: log it for `wrangler pages deployment tail`, but
  // don't echo internals to the browser.
  console.error(err && err.stack ? err.stack : err);
  return json({ error: "Something went wrong on the server.", code: "internal" }, 500);
}

/* The parsed JSON body, or 400. */
export async function readJson(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    fail(400, "The request body must be JSON.", "bad_request");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    fail(400, "The request body must be a JSON object.", "bad_request");
  }
  return body;
}

/* A route that answers only the given methods; anything else is a JSON 405. */
export const route = (handlers) => (context) => {
  const handler = handlers[context.request.method];
  if (!handler) {
    return json({ error: `${context.request.method} isn't allowed here.`, code: "method_not_allowed" }, 405, {
      allow: Object.keys(handlers).join(", "),
    });
  }
  return handler(context);
};

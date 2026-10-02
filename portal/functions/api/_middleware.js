// Runs before every /api/ route: authenticates the caller (see _lib/auth.js),
// puts their email on context.data.email, and turns any thrown error into a
// JSON response.

import { authenticate } from "../_lib/auth.js";
import { HttpError, errorResponse } from "../_lib/http.js";
import { GitHubError, gitHubHttpError } from "../_lib/github.js";

export async function onRequest(context) {
  const { request, env } = context;
  try {
    // A write must come from the portal's own pages. Browsers always send
    // Origin on a cross-site POST, so this stops a forged form submission
    // riding on the Access cookie.
    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) {
        throw new HttpError(403, "Cross-site request refused.", "forbidden");
      }
    }
    context.data.email = await authenticate(request, env);
    return await context.next();
  } catch (err) {
    return errorResponse(err instanceof GitHubError ? gitHubHttpError(err) : err);
  }
}

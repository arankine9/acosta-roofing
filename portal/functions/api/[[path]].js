// Any other /api/ path: a JSON 404 rather than the static site's.
import { json } from "../_lib/http.js";

export const onRequest = ({ request }) =>
  json({ error: `No such API endpoint: ${new URL(request.url).pathname}`, code: "not_found" }, 404);

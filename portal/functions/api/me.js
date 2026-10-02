// GET /api/me → { email }
import { json, route } from "../_lib/http.js";

export const onRequest = route({
  GET: ({ data }) => json({ email: data.email }),
});

// GET /api/content → { files, draft, live }: live content with the draft's
// changes laid over it (see _lib/repo.js).
import { json, route } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { readState, contentResponse } from "../_lib/repo.js";

export const onRequest = route({
  async GET({ env }) {
    const gh = github(env);
    return json(await contentResponse(gh, await readState(gh, env)));
  },
});

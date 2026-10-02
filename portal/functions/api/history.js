// GET /api/history → { commits: [{ sha, message, author, email, date }] }:
// the last 30 live commits that touched content or uploads, newest first.
import { json, route } from "../_lib/http.js";
import { github } from "../_lib/github.js";
import { settings } from "../_lib/repo.js";

const PATHS = ["src/content", "public/images/uploads"];
const LIMIT = 30;

export const onRequest = route({
  async GET({ env }) {
    const gh = github(env);
    const { base } = settings(env);
    const fields = PATHS.map(
      (p, i) => `h${i}: history(first: ${LIMIT}, path: ${JSON.stringify(p)}) { nodes { oid message committedDate author { name email } } }`,
    );
    const data = await gh.graphql(
      `query($owner: String!, $name: String!, $ref: String!) {
        repository(owner: $owner, name: $name) { object(expression: $ref) { ... on Commit { ${fields.join(" ")} } } }
      }`,
      { ref: `refs/heads/${base}` },
    );
    const target = data.repository.object || {};
    const seen = new Map();
    for (let i = 0; i < PATHS.length; i++) {
      for (const n of (target[`h${i}`] && target[`h${i}`].nodes) || []) seen.set(n.oid, n);
    }
    const commits = [...seen.values()]
      .sort((a, b) => Date.parse(b.committedDate) - Date.parse(a.committedDate))
      .slice(0, LIMIT)
      .map((n) => ({
        sha: n.oid,
        message: n.message,
        author: n.author.name,
        email: n.author.email,
        date: new Date(n.committedDate).toISOString().replace(/\.\d{3}Z$/, "Z"),
      }));
    return json({ commits });
  },
});

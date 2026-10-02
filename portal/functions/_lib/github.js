// A minimal GitHub client: REST and GraphQL over fetch, authenticated with
// GITHUB_TOKEN. Errors come back as GitHubError so routes can react to the
// statuses that mean something (404 missing ref, 422 not a fast-forward);
// anything they don't handle becomes a 502 in the middleware. The token never
// appears in an error message.

import { HttpError } from "./http.js";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* GitHubError → the response the browser sees. */
export function gitHubHttpError(err) {
  if (err.status === 401) {
    return new HttpError(502, "GitHub rejected the portal's token. Check GITHUB_TOKEN.", "github_auth");
  }
  if (err.status === 403 || err.status === 429) {
    return new HttpError(503, `GitHub refused the request (${err.message}). Try again in a minute.`, "github_unavailable");
  }
  return new HttpError(502, `GitHub request failed: ${err.message}`, "github");
}

const enc = (path) => path.split("/").map(encodeURIComponent).join("/");

export function github(env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "The portal isn't configured: GITHUB_TOKEN is missing.", "config");
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || "")) {
    throw new HttpError(500, "The portal isn't configured: GITHUB_REPO must be owner/name.", "config");
  }
  const [owner, name] = env.GITHUB_REPO.split("/");
  const repo = `/repos/${owner}/${name}`;
  const headers = {
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "acosta-portal",
  };

  async function send(method, path, body, accept) {
    const res = await fetch(API + path, {
      method,
      headers: { ...headers, ...(accept ? { accept } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = res.statusText || `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && data.message) message = data.message;
      } catch {}
      throw new GitHubError(res.status, message);
    }
    return res;
  }

  /* REST call on this repo; `path` is relative to /repos/{owner}/{name}. */
  async function rest(method, path, body) {
    const res = await send(method, repo + path, body);
    return res.status === 204 ? null : res.json();
  }

  async function graphql(query, variables = {}) {
    const res = await send("POST", "/graphql", { query, variables: { owner, name, ...variables } });
    const data = await res.json();
    if (data.errors && data.errors.length) {
      throw new GitHubError(502, data.errors.map((e) => e.message).join("; "));
    }
    return data.data;
  }

  return {
    owner,
    name,
    rest,
    graphql,

    /* A file's raw bytes at a ref, as a fetch Response; null when either is missing. */
    async raw(path, ref) {
      try {
        return await send("GET", `${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, null, "application/vnd.github.raw+json");
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return null;
        throw err;
      }
    },

    /* The sha a branch points at, or null when it doesn't exist. */
    async branchHead(branch) {
      try {
        return (await rest("GET", `/git/ref/heads/${enc(branch)}`)).object.sha;
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return null;
        throw err;
      }
    },

    /* Point a branch at `sha`: create it, or fast-forward it (never forced).
       Returns false when someone else got there first: the branch already
       exists (create), or moved or vanished (update). */
    async setBranch(branch, sha, { create = false } = {}) {
      try {
        if (create) await rest("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha });
        else await rest("PATCH", `/git/refs/heads/${enc(branch)}`, { sha, force: false });
        return true;
      } catch (err) {
        if (err instanceof GitHubError && err.status === 422) return false;
        throw err;
      }
    },

    async deleteBranch(branch) {
      try {
        await rest("DELETE", `/git/refs/heads/${enc(branch)}`);
      } catch (err) {
        // Already gone is fine.
        if (!(err instanceof GitHubError && (err.status === 404 || err.status === 422))) throw err;
      }
    },
  };
}

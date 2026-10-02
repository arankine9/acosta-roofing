// The portal API (portal/API.md). Every call returns parsed JSON or throws an
// ApiError carrying the server's message, status and code.

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Something went wrong (${status}).`);
    this.status = status;
    this.code = data?.code;
    this.data = data || {};
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    // An expired sign-in shows up as a failed fetch (the request is redirected
    // to the sign-in page on another site), not as a 401.
    throw new ApiError(0, {
      error: "Couldn't reach the editor's server. You may have been signed out, or the internet connection dropped. Reload the page to sign in again; your unsaved changes are kept in this browser.",
      code: "offline",
    });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const friendly = {
      401: "You've been signed out. Reload the page to sign in again; your unsaved changes are kept in this browser.",
      403: "This account isn't allowed to edit the website. Sign in with the email address the website was set up for.",
      413: "That's too much to save in one go (the photos are too big). Try saving after every few photos.",
    }[res.status];
    if (friendly) data = { ...data, error: friendly, code: data?.code || "status-" + res.status };
    else if (res.status >= 500 && !data?.error) data = { error: "The server had a problem. Try again in a minute." };
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  me: () => call("GET", "/api/me"),
  content: () => call("GET", "/api/content"),
  save: (body) => call("POST", "/api/save", body),
  publish: (body) => call("POST", "/api/publish", body),
  discard: (body) => call("POST", "/api/discard", body),
  history: () => call("GET", "/api/history"),
  restore: (body) => call("POST", "/api/restore", body),
};

export const fileUrl = (repoPath) => `/api/file?path=${encodeURIComponent(repoPath)}`;

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

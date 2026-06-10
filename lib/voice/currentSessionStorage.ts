export type CurrentSession = {
  clientName: string;
  sessionNote: string;
  updatedAt: string;
};

const CURRENT_SESSION_KEY = "pd-current-session";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getCurrentSession(): CurrentSession {
  if (!isBrowser()) {
    return {
      clientName: "",
      sessionNote: "",
      updatedAt: "",
    };
  }

  try {
    const raw = window.localStorage.getItem(CURRENT_SESSION_KEY);
    if (!raw) {
      return {
        clientName: "",
        sessionNote: "",
        updatedAt: "",
      };
    }

    const parsed = JSON.parse(raw);

    return {
      clientName: typeof parsed?.clientName === "string" ? parsed.clientName : "",
      sessionNote: typeof parsed?.sessionNote === "string" ? parsed.sessionNote : "",
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return {
      clientName: "",
      sessionNote: "",
      updatedAt: "",
    };
  }
}

export function saveCurrentSession(input: {
  clientName?: string;
  sessionNote?: string;
}) {
  if (!isBrowser()) return;

  const nextValue: CurrentSession = {
    clientName: (input.clientName ?? "").trim(),
    sessionNote: (input.sessionNote ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(nextValue));
  window.dispatchEvent(new Event("pd-current-session-updated"));
}

export function clearCurrentSession() {
  if (!isBrowser()) return;

  window.localStorage.removeItem(CURRENT_SESSION_KEY);
  window.dispatchEvent(new Event("pd-current-session-updated"));
}
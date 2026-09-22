const TOKEN_KEY = "dnd_display_token";
const API_KEY = "dnd_display_api";
const EMAIL_KEY = "dnd_display_email";

export function getApiBase() {
  return (
    localStorage.getItem(API_KEY) ||
    import.meta.env.VITE_API_BASE ||
    "http://localhost:3000/api"
  );
}

export function setApiBase(url: string) {
  localStorage.setItem(API_KEY, url.replace(/\/$/, ""));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getSavedEmail() {
  return localStorage.getItem(EMAIL_KEY) ?? "dm@example.com";
}

export function setSavedEmail(email: string) {
  localStorage.setItem(EMAIL_KEY, email);
}

export type ApiAdmin = {
  id: string;
  email: string;
  username: string;
  role: string;
  displayName: string | null;
};

export type Room = {
  id: string;
  name: string;
  campaignId: string | null;
  campaign?: { id: string; name: string } | null;
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
};

export type Material = {
  id: string;
  type: "IMAGE" | "EFFECT" | "SOUND";
  name: string;
  assetUrl: string;
};

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const text = await res.text();
  let body: { success?: boolean; data?: T; message?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (!res.ok || body.success === false) {
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return body.data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ admin: ApiAdmin; token: string }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  me: () => request<ApiAdmin>("/auth/me"),
  listRooms: () => request<Room[]>("/rooms"),
  getRoom: (id: string) => request<Room>(`/rooms/${id}`),
  createRoom: (name: string, campaignId?: string) =>
    request<Room>("/rooms", {
      method: "POST",
      json: { name, ...(campaignId ? { campaignId } : {}) },
    }),
  listCampaigns: () => request<Campaign[]>("/campaigns"),
  getMaterial: (id: string) => request<Material>(`/materials/${id}`),
};

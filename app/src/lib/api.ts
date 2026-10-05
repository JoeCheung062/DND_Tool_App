const TOKEN_KEY = "dnd_app_token";
const LEGACY_TOKEN_KEY = "dnd_display_token";
const API_KEY = "dnd_app_api";
const LEGACY_API_KEY = "dnd_display_api";
const API_LOCK_KEY = "dnd_app_api_lock";
const EMAIL_KEY = "dnd_app_email";
const LEGACY_EMAIL_KEY = "dnd_display_email";

function readStored(key: string, legacyKey: string) {
  return localStorage.getItem(key) || localStorage.getItem(legacyKey);
}

export function getApiBase() {
  return (
    readStored(API_KEY, LEGACY_API_KEY) ||
    import.meta.env.VITE_API_BASE ||
    "http://localhost:3000/api"
  );
}

export function setApiBase(url: string) {
  localStorage.setItem(API_KEY, url.replace(/\/$/, ""));
}

export function isApiBaseLocked() {
  return localStorage.getItem(API_LOCK_KEY) === "1";
}

export function setApiBaseLocked(locked: boolean) {
  if (locked) localStorage.setItem(API_LOCK_KEY, "1");
  else localStorage.removeItem(API_LOCK_KEY);
}

export function getToken() {
  return readStored(TOKEN_KEY, LEGACY_TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getSavedEmail() {
  return readStored(EMAIL_KEY, LEGACY_EMAIL_KEY) ?? "dm@example.com";
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
  /** Saved control layout. Present after the server has stored one. */
  session?: unknown;
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
  general?: boolean;
  assetUrl: string;
  npc?: boolean;
  characterArtUrl?: string | null;
  tagList?: Array<{ id: string; name: string }>;
};

export type Combination = {
  id: string;
  name: string;
  category?: "STANDARD" | "ENVIRONMENT_PACK";
  mainMaterialId?: string | null;
  mainMaterial?: { id: string; name: string; type: string };
  connectMaterialList?: Array<{ id: string; name: string; type: string }>;
  zone1MaterialId?: string | null;
  zone2MaterialId?: string | null;
  zone3MaterialId?: string | null;
  zone4MaterialId?: string | null;
  zone1Material?: { id: string; name: string; type: string } | null;
  zone2Material?: { id: string; name: string; type: string } | null;
  zone3Material?: { id: string; name: string; type: string } | null;
  zone4Material?: { id: string; name: string; type: string } | null;
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
  updateRoom: (
    id: string,
    body: { name?: string; campaignId?: string | null; session?: unknown }
  ) =>
    request<Room>(`/rooms/${id}`, {
      method: "PATCH",
      json: body,
    }),
  listCampaigns: () => request<Campaign[]>("/campaigns"),
  listCampaignMaterials: (campaignId: string) =>
    request<Material[]>(
      `/materials?campaignId=${encodeURIComponent(campaignId)}&includeGeneral=1`
    ),
  getMaterial: (id: string) => request<Material>(`/materials/${id}`),
  listCombinations: () => request<Combination[]>("/combinations"),
};

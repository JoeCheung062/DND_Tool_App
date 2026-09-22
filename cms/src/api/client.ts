const TOKEN_KEY = "dnd_cms_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; message: string; details?: unknown };

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function apiUrl(path: string): string {
  const normalized = path.startsWith("/api") ? path : `/api${path}`;
  const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
  return `${base}${normalized}`;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      res.status,
      `Server returned non-JSON (HTTP ${res.status}). Is the API running on port 3000?`
    );
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown; formData?: FormData } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  // Do not set Content-Type for FormData — browser sets multipart boundary

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      headers,
      body:
        options.formData !== undefined
          ? options.formData
          : options.json !== undefined
            ? JSON.stringify(options.json)
            : options.body,
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the API. Start it with `npm run dev` in the repo root (port 3000), then retry."
    );
  }

  const payload = (await parseBody(res)) as ApiOk<T> | ApiErr | null;

  if (payload == null) {
    throw new ApiError(
      res.status,
      res.ok
        ? "Empty response from API"
        : `API error (HTTP ${res.status}). Start the server with \`npm run dev\` on port 3000.`
    );
  }

  if (!res.ok || !("success" in payload) || !payload.success) {
    const message =
      payload && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `Request failed (HTTP ${res.status})`;
    throw new ApiError(
      res.status,
      message,
      payload && "details" in payload ? payload.details : undefined
    );
  }

  return payload.data;
}

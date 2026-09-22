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

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const payload = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || !payload.success) {
    const message =
      !payload.success && "message" in payload
        ? payload.message
        : `Request failed (${res.status})`;
    throw new ApiError(
      res.status,
      message,
      !payload.success ? payload.details : undefined
    );
  }
  return payload.data;
}

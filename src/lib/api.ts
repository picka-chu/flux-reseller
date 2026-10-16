import { tg } from "./telegram";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const PUBLIC_CACHE_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const publicCache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const cacheablePublicPath = (path: string) =>
  ["/api/products", "/api/feed", "/api/config"].includes(path.split("?")[0]);

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const canCache = method === "GET" && cacheablePublicPath(path);
  const cacheKey = path;
  if (canCache) {
    const cached = publicCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const pending = inFlight.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const run = async (): Promise<T> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {})
    };
    if (tg?.initData) headers.Authorization = "tma " + tg.initData;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(path, { ...options, headers, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Request timed out. Please try again.", 0);
      }
      throw new ApiError("Network error. Check your connection and try again.", 0);
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : "Request failed";
      throw new ApiError(detail, res.status);
    }
    if (canCache) publicCache.set(cacheKey, { expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS, value: data });
    return data as T;
  };

  if (!canCache) return run();
  const promise = run().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

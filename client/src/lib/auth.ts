const STORAGE_KEY = "mizan_token";

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, token);
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

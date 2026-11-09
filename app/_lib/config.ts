export function apiUrl(): string {
  const raw = process.env.API_URL || "http://localhost:8080";
  return raw.replace(/\/+$/, "");
}

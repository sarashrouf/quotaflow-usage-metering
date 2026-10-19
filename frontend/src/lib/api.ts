export async function apiRequest<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
      `Request failed: HTTP ${response.status}`
    );
  }

  return data as T;
}
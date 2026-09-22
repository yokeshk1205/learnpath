export type ServiceState = "checking" | "online" | "offline";

export interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  version: string;
}

export async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health/live`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health request failed with ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}


const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export type Challenge = { slug: string; title: string; difficulty: string; description: string; live: boolean };
export type FixOption = { key: string; label: string };
export type IncidentSummary = {
  incidentId: string;
  status: string;
  challenge: { slug: string; title: string; difficulty: string; description: string; fixOptions: FixOption[] };
  elapsedSeconds: number;
  hintsUsed: number;
  services: { name: string; status: "healthy" | "degraded" | "down" }[];
  metrics: { cpu: number; latencyMs: number; errorRatePct: number; dbConnections: number; dbMaxConnections: number };
};
export type LogLine = { t: number; level: string; service: string; message: string };

export const api = {
  listChallenges: () => req<Challenge[]>("/challenges"),
  startIncident: (challengeSlug: string, displayName?: string, userId?: string) =>
    req<{ incidentId: string; userId: string; challenge: any }>("/incidents/start", {
      method: "POST",
      body: JSON.stringify({ challengeSlug, displayName, userId }),
    }),
  getIncident: (id: string) => req<IncidentSummary>(`/incidents/${id}`),
  getLogs: (id: string) => req<LogLine[]>(`/incidents/${id}/logs`),
  getMetrics: (id: string) => req<IncidentSummary["metrics"]>(`/incidents/${id}/metrics`),
  runCommand: (id: string, command: string) =>
    req<{ output: string }>(`/incidents/${id}/command`, { method: "POST", body: JSON.stringify({ command }) }),
  getHint: (id: string) => req<{ hint: string; hintsUsed: number }>(`/incidents/${id}/hint`, { method: "POST" }),
  submitFix: (id: string, actionKey: string) =>
    req<any>(`/incidents/${id}/fix`, { method: "POST", body: JSON.stringify({ actionKey }) }),
  getReplay: (id: string) => req<any>(`/incidents/${id}/replay`),
  getLeaderboard: () => req<{ rank: number; player: string; score: number }[]>("/leaderboard"),
};

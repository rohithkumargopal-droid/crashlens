import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export const keys = {
  state: (incidentId: string) => `incident:${incidentId}:state`,
  logs: (incidentId: string) => `incident:${incidentId}:logs`,
  metrics: (incidentId: string) => `incident:${incidentId}:metrics`,
  leaderboard: () => "leaderboard:global",
};

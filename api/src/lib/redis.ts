import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is not configured");
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 20,
});

redis.on("connect", () => {
  console.log("[Redis] Connected successfully");
});

redis.on("ready", () => {
  console.log("[Redis] Ready");
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

export const keys = {
  state: (incidentId: string) => `incident:${incidentId}:state`,
  logs: (incidentId: string) => `incident:${incidentId}:logs`,
  metrics: (incidentId: string) => `incident:${incidentId}:metrics`,
  leaderboard: () => "leaderboard:global",
};
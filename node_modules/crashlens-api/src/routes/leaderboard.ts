import { Router } from "express";
import { redis, keys } from "../lib/redis.js";
import { query } from "../lib/db.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/leaderboard", async (_req, res) => {
  const raw = await redis.zrevrange(keys.leaderboard(), 0, 9, "WITHSCORES");
  const entries: { userId: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ userId: raw[i], score: Number(raw[i + 1]) });
  }
  if (entries.length === 0) return res.json([]);

  const userIds = entries.map((e) => e.userId);
  const rows = await query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id = ANY($1)`,
    [userIds]
  );
  const nameById = new Map(rows.map((r) => [r.id, r.display_name]));

  res.json(
    entries.map((e, i) => ({
      rank: i + 1,
      player: nameById.get(e.userId) || "unknown",
      score: e.score,
    }))
  );
});

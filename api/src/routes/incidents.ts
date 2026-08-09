import { Router } from "express";
import { v4 as uuid } from "uuid";

import {
  startIncident,
  getIncidentSummary,
  getLogs,
  getMetrics,
  runCommand,
  getHint,
  submitFix,
  getReplay,
  listChallenges,
} from "../incidents/engine.js";

import { generatePostmortem } from "../lib/ai.js";
import { query } from "../lib/db.js";
import { redis, keys } from "../lib/redis.js";

export const incidentsRouter = Router();

incidentsRouter.get("/challenges", async (_req, res) => {
  const challenges = await listChallenges();
  res.json(
    challenges.map((c) => ({
      slug: c.slug,
      title: c.title,
      difficulty: c.difficulty,
      description: c.description,
      live: c.slug === "db-outage",
    }))
  );
});

incidentsRouter.post("/incidents/start", async (req, res) => {
  try {
    const { challengeSlug, displayName } = req.body as { challengeSlug: string; displayName?: string };
    let userId = req.body.userId as string | undefined;
    if (!userId) {
      const rows = await query<{ id: string }>(
        "INSERT INTO users (display_name) VALUES ($1) RETURNING id",
        [displayName || `player-${uuid().slice(0, 6)}`]
      );
      userId = rows[0].id;
    }
    const { incidentId, challenge } = await startIncident(userId, challengeSlug);
    res.json({ incidentId, userId, challenge: { slug: challenge.slug, title: challenge.title, description: challenge.description, fixOptions: challenge.fix_options } });
  } catch (err: any) {
    const status = err.code === "NOT_IMPLEMENTED" ? 501 : 400;
    res.status(status).json({ error: err.message });
  }
});

incidentsRouter.get("/incidents/:id", async (req, res) => {
  try {
    res.json(await getIncidentSummary(req.params.id));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.get("/incidents/:id/logs", async (req, res) => {
  try {
    res.json(await getLogs(req.params.id));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.get("/incidents/:id/metrics", async (req, res) => {
  try {
    res.json(await getMetrics(req.params.id));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.post("/incidents/:id/command", async (req, res) => {
  try {
    const { command } = req.body as { command: string };
    const output = await runCommand(req.params.id, command);
    res.json({ output });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.post("/incidents/:id/hint", async (req, res) => {
  try {
    res.json(await getHint(req.params.id));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.post("/incidents/:id/fix", async (req, res) => {
  try {
    const { actionKey } = req.body as { actionKey: string };
    const result = await submitFix(req.params.id, actionKey);
    if (result.correct && !("alreadyResolved" in result)) {
      const userId = (await redis.hget(keys.state(req.params.id), "userId")) || undefined;
      if (userId) {
        await redis.zadd(keys.leaderboard(), (result as any).score.overall, userId);
      }
    }
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

incidentsRouter.get("/incidents/:id/replay", async (req, res) => {
  try {
    const replay = await getReplay(req.params.id);
    const logs = await getLogs(req.params.id);
    const postmortem = replay.score
      ? await generatePostmortem({
          title: "Database Outage",
          rootCause: replay.rootCause || "unknown",
          timeSeconds: replay.score.time_seconds,
          hintsUsed: replay.score.hints_used,
          logs: logs.map((l) => `[${l.level}] ${l.service}: ${l.message}`),
        })
      : null;
    res.json({ ...replay, postmortem });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

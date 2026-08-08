# CrashLens

Vertical slice implementation. Source of truth for product decisions is the PRD
(`CrashLens_PRD.md`, shared earlier); this README only covers what's actually built
and where it deviates from the PRD.

## What's implemented (Database Outage vertical slice)

- Landing → Challenge Picker → Incident (metrics, service graph, logs, terminal,
  hint, fix) → Score → Replay + Postmortem → Leaderboard — the full loop from
  today's spec.
- `db-outage` is fully wired end-to-end. The other 4 challenges are seeded in the
  DB (so the picker shows them) but return `501` from `/incidents/start` until
  their scenario scripts are written — the picker greys them out as "coming soon."
- Fix action is deterministic and multiple-choice, exactly as decided:
  `DB_OUTAGE_FIX = "clear_idle_connections"`, presented alongside 4 plausible
  wrong options. No dangerous free-form config editing.
- AI is isolated to `api/src/lib/ai.ts` — it only generates postmortem text after
  resolution. It cannot see or touch incident state, and the app works fine with
  `ANTHROPIC_API_KEY` unset (falls back to a templated postmortem). Hints for the
  MVP come from the deterministic `hint_ladder` in the DB, not live generation —
  matches the "AI never controls game state" rule and removes an LLM-latency
  dependency from the P0 critical path.

## One deliberate deviation from the PRD: no standalone worker service

The PRD's architecture has a separate `worker` service driving the incident state
machine. In the actual implementation, the `db-outage` scenario's logs and metrics
are **pure functions of elapsed time** (`metricsAt(elapsedSeconds)`), computed on
each API request rather than pushed by a ticking background process. That means:

- No separate worker to deploy, monitor, or keep alive during judging.
- No drift between a background writer and what the API reads — there's only one
  source of truth (time since `incident.started_at`).
- Reset is free: since scripted mode never mutates the real `db`/`cache` services,
  a new incident is just a new UUID with `t=0`. Nothing to clean up between players.

This trades away the "worker as a distinct Zerops service" story from the pitch,
but it's a straight reliability win for a judged-live, no-slide-deck hackathon —
one fewer moving part that could go down mid-demo. **If you want the literal
"Zerops is where the failure happens" story** (the AI Production Playground framing
from the second doc), the next step is having the worker actually degrade the real
`db` service's `max_connections` setting and having `metricsAt` read real
`pg_stat_activity` counts instead of a script. That's a good P1/P2 upgrade once the
scripted version is confirmed reliable — flagged in the code with comments at the
relevant spots in `engine.ts` and `dbOutage.ts`.

## Local dev

```bash
# 1. Postgres + Redis running locally (or point at a Zerops dev environment)
cp api/.env.example api/.env
cd api && npm install && npm run migrate && npm run seed && npm run dev
# in a second terminal
cd web && npm install && NEXT_PUBLIC_API_BASE=http://localhost:3001 npm run dev
```

Open `http://localhost:3000`.

## Deploying to Zerops

1. Push this repo to GitHub.
2. In `zerops-project-import.yml`, replace `YOUR_USERNAME/crashlens` with your repo.
3. Import the YAML in the Zerops dashboard — this creates `db`, `cache`, `api`, `web`.
4. **Deploy `api` first** and note its subdomain — `web`'s build needs
   `NEXT_PUBLIC_API_BASE` set to it (Next.js inlines this at build time, so `web`
   must be (re)built after `api`'s URL is known).
5. `api`'s `initCommands` run `npm run migrate && npm run seed` automatically on
   first deploy — no manual DB setup step.
6. Optionally set `ANTHROPIC_API_KEY` on `api` for LLM-generated postmortems;
   leave blank to use the templated fallback (fully functional either way).

## Next steps toward P1/P2

- Write `apiLatency`, `redisFailure`, `envVar`, `memoryLeak` scenario scripts
  (same `Scenario` shape as `dbOutage.ts` — that's the whole point of the
  vertical-slice approach).
- Swap deterministic hints for LLM-generated ones once `db-outage` is confirmed
  stable (canned ladder stays as the guaranteed fallback).
- Real Zerops-backed metrics (see deviation note above) if there's time left
  after all 5 scenarios work.

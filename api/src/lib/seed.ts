import "dotenv/config";
import { pool } from "./db";

const challenges = [
  {
    slug: "db-outage",
    title: "Database Outage",
    difficulty: "easy",
    description:
      "The Payment API is returning 502s. Something is wrong between the API and its database.",
    root_cause:
      "Postgres has run out of available connections — too many idle connections from a leaky pool are holding slots open.",
    fix_action_key: "clear_idle_connections",
    hint_ladder: [
      "The API process itself is healthy. Look at what it's waiting on.",
      "Requests are timing out while trying to open a new database connection — the pool looks maxed out.",
      "Root cause: Postgres max_connections is exhausted by idle connections that were never released.",
    ],
    fix_options: [
      { key: "restart_api", label: "Restart API" },
      { key: "increase_traffic", label: "Increase application traffic" },
      { key: "clear_idle_connections", label: "Clear idle database connections" },
      { key: "flush_redis", label: "Flush Redis" },
      { key: "rollback_deploy", label: "Roll back deployment" },
    ],
  },
  {
    slug: "bad-env-var",
    title: "Broken Environment Variable",
    difficulty: "easy",
    description: "A deploy just went out and the API can't reach its database.",
    root_cause: "DATABASE_URL was changed to point at the wrong host during the last deploy.",
    fix_action_key: "revert_env_var",
    hint_ladder: [
      "The database itself reports healthy when checked directly.",
      "The API's connection string doesn't match the database's actual address.",
      "Root cause: DATABASE_URL points at a stale host from the last deploy.",
    ],
    fix_options: [
      { key: "restart_api", label: "Restart API" },
      { key: "revert_env_var", label: "Revert DATABASE_URL to the correct host" },
      { key: "scale_up_db", label: "Scale up the database" },
      { key: "rollback_deploy", label: "Roll back deployment" },
    ],
  },
  {
    slug: "api-latency",
    title: "API Latency Spike",
    difficulty: "medium",
    description: "Response times have crept from 80ms to 4.8s over the last deploy.",
    root_cause: "A new code path introduced an N+1 query against the orders table.",
    fix_action_key: "rollback_deploy",
    hint_ladder: [
      "CPU and memory both look normal — this isn't a resource problem.",
      "Query volume against the database jumped sharply right after the last deploy.",
      "Root cause: an N+1 query was introduced in the last deploy.",
    ],
    fix_options: [
      { key: "flush_redis", label: "Flush Redis" },
      { key: "rollback_deploy", label: "Roll back deployment" },
      { key: "restart_api", label: "Restart API" },
      { key: "add_db_index", label: "Add a database index" },
    ],
  },
  {
    slug: "redis-failure",
    title: "Redis Failure",
    difficulty: "medium",
    description: "Cache reads are failing intermittently and error rates are climbing.",
    root_cause: "Redis hit its memory limit because cache keys were never given a TTL.",
    fix_action_key: "flush_and_set_eviction",
    hint_ladder: [
      "The API and database both report healthy.",
      "Redis memory usage is pinned at 100% with no keys expiring.",
      "Root cause: unbounded cache keys with no TTL filled Redis to its memory limit.",
    ],
    fix_options: [
      { key: "restart_api", label: "Restart API" },
      { key: "flush_and_set_eviction", label: "Flush Redis and set an eviction policy" },
      { key: "rollback_deploy", label: "Roll back deployment" },
      { key: "scale_up_db", label: "Scale up the database" },
    ],
  },
  {
    slug: "memory-leak",
    title: "Memory / CPU Leak",
    difficulty: "hard",
    description: "The worker's memory usage has been climbing steadily for an hour.",
    root_cause: "An unbounded background job queue is holding references and growing without limit.",
    fix_action_key: "restart_worker_cap_queue",
    hint_ladder: [
      "The leak is isolated to the worker process, not the API.",
      "Memory grows in proportion to queue depth and never comes back down.",
      "Root cause: an unbounded job queue in the worker is leaking memory.",
    ],
    fix_options: [
      { key: "restart_api", label: "Restart API" },
      { key: "restart_worker_cap_queue", label: "Restart worker and cap queue size" },
      { key: "flush_redis", label: "Flush Redis" },
      { key: "rollback_deploy", label: "Roll back deployment" },
    ],
  },
];

async function main() {
  for (const c of challenges) {
    await pool.query(
      `INSERT INTO challenges (slug, title, difficulty, description, root_cause, fix_action_key, hint_ladder, fix_options)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         difficulty = EXCLUDED.difficulty,
         description = EXCLUDED.description,
         root_cause = EXCLUDED.root_cause,
         fix_action_key = EXCLUDED.fix_action_key,
         hint_ladder = EXCLUDED.hint_ladder,
         fix_options = EXCLUDED.fix_options`,
      [
        c.slug,
        c.title,
        c.difficulty,
        c.description,
        c.root_cause,
        c.fix_action_key,
        JSON.stringify(c.hint_ladder),
        JSON.stringify(c.fix_options),
      ]
    );
  }
  console.log(`Seeded ${challenges.length} challenges.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

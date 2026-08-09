const MAX_CONNECTIONS = 100;
const TIME_TO_BROKEN = 8; // seconds — compressed for a live demo
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function metricsAt(elapsed) {
    const ramp = clamp(elapsed / TIME_TO_BROKEN, 0, 1);
    return {
        t: elapsed,
        cpu: Math.round(20 + ramp * 61), // -> 81
        latencyMs: Math.round(200 + ramp * 4600), // -> 4800
        errorRatePct: Math.round(ramp * 37), // -> 37
        dbConnections: Math.round(20 + ramp * 80), // -> 100
        dbMaxConnections: MAX_CONNECTIONS,
    };
}
function serviceGraph(broken) {
    return [
        { name: "frontend", status: "healthy" },
        { name: "payment-api", status: broken ? "degraded" : "healthy" },
        { name: "redis", status: "healthy" },
        { name: "postgres", status: broken ? "down" : "healthy" },
    ];
}
export const dbOutageScenario = {
    slug: "db-outage",
    timeToBrokenSeconds: TIME_TO_BROKEN,
    metricsAt,
    serviceGraph,
    logScript: [
        { t: 0, level: "INFO", service: "payment-api", message: "handling request POST /api/payment" },
        { t: 1, level: "WARN", service: "payment-api", message: "connection pool at 82% capacity" },
        { t: 3, level: "ERROR", service: "payment-api", message: "database connection timeout" },
        { t: 4, level: "ERROR", service: "payment-api", message: "retry attempt 1/3" },
        { t: 6, level: "ERROR", service: "payment-api", message: "retry attempt 2/3" },
        { t: 8, level: "ERROR", service: "payment-api", message: "retry attempt 3/3 — giving up" },
        { t: 8, level: "ERROR", service: "payment-api", message: "502 Bad Gateway returned to client" },
    ],
    repeatingLogs: [
        "database connection timeout",
        "502 Bad Gateway returned to client",
        "connection pool exhausted (100/100 in use)",
    ],
    repeatEverySeconds: 3,
    commands: {
        "curl /api/health": ({ broken, metricsAt: m, elapsed }) => {
            if (!broken)
                return "200 OK\n{\"status\":\"healthy\"}";
            const metrics = m(elapsed);
            return `502 Bad Gateway\nlatency=${metrics.latencyMs}ms error_rate=${metrics.errorRatePct}%`;
        },
        "logs tail": () => "run GET /api/incidents/:id/logs to see the live feed",
        "describe service payment-api": ({ broken }) => broken
            ? "payment-api: DEGRADED\n  depends_on: postgres (DOWN), redis (healthy)\n  last_error: database connection timeout"
            : "payment-api: HEALTHY\n  depends_on: postgres (healthy), redis (healthy)",
        "show config": () => [
            "DATABASE_URL=postgres://***:***@db.internal:5432/crashlens",
            "DB_POOL_MAX=20",
            "DB_POOL_IDLE_TIMEOUT_MS=0   <-- idle connections never expire",
        ].join("\n"),
        netstat: ({ elapsed, metricsAt: m }) => {
            const metrics = m(elapsed);
            return `postgres connections: ${metrics.dbConnections}/${metrics.dbMaxConnections} in use\n  most are idle (state=idle, held > 5m)`;
        },
        help: () => ["available commands:", "curl /api/health", "logs tail", "describe service payment-api", "show config", "netstat"].join("\n"),
    },
};

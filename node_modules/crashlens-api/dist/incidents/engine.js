import { query } from "../lib/db.js";
import { redis, keys } from "../lib/redis.js";
import { dbOutageScenario } from "./scenarios/dbOutage.js";
const SCENARIOS = {
    "db-outage": dbOutageScenario,
};
const TIME_SCORE_TARGET_SECONDS = 300; // 5 minutes -> 100 time score if resolved at/under this
export function scenarioFor(slug) {
    return SCENARIOS[slug];
}
export async function getChallenge(slug) {
    const rows = await query("SELECT * FROM challenges WHERE slug = $1", [slug]);
    if (!rows[0])
        throw new Error(`Unknown challenge: ${slug}`);
    return rows[0];
}
export async function getChallengeById(id) {
    const rows = await query("SELECT * FROM challenges WHERE id = $1", [id]);
    if (!rows[0])
        throw new Error(`Unknown challenge id: ${id}`);
    return rows[0];
}
export async function listChallenges() {
    return query("SELECT * FROM challenges ORDER BY difficulty, title");
}
export async function startIncident(userId, challengeSlug) {
    const scenario = scenarioFor(challengeSlug);
    if (!scenario) {
        throw Object.assign(new Error(`"${challengeSlug}" is not live yet — only db-outage is wired.`), {
            code: "NOT_IMPLEMENTED",
        });
    }
    const challenge = await getChallenge(challengeSlug);
    const rows = await query(`INSERT INTO incidents (user_id, challenge_id, status) VALUES ($1, $2, 'active') RETURNING id`, [userId, challenge.id]);
    const incidentId = rows[0].id;
    const startedAtMs = Date.now();
    await redis.hset(keys.state(incidentId), {
        status: "active",
        challengeSlug,
        userId,
        startedAtMs: String(startedAtMs),
        hintsUsed: "0",
        wrongGuesses: "0",
    });
    await redis.del(keys.logs(incidentId));
    await redis.del(keys.metrics(incidentId));
    await logEvent(incidentId, "state_change", { status: "active", challengeSlug });
    return { incidentId, challenge };
}
function elapsedSeconds(startedAtMs) {
    return (Date.now() - startedAtMs) / 1000;
}
async function logEvent(incidentId, eventType, payload) {
    await query(`INSERT INTO incident_events (incident_id, event_type, payload) VALUES ($1, $2, $3)`, [
        incidentId,
        eventType,
        JSON.stringify(payload),
    ]);
}
export async function getIncidentSummary(incidentId) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    const scenario = scenarioFor(state.challengeSlug);
    const elapsed = elapsedSeconds(Number(state.startedAtMs));
    const broken = state.status === "active" && elapsed >= 0;
    const challenge = await getChallenge(state.challengeSlug);
    return {
        incidentId,
        status: state.status,
        challenge: {
            slug: challenge.slug,
            title: challenge.title,
            difficulty: challenge.difficulty,
            description: challenge.description,
            fixOptions: challenge.fix_options,
        },
        elapsedSeconds: Math.round(elapsed),
        hintsUsed: Number(state.hintsUsed || 0),
        services: scenario.serviceGraph(state.status === "active"),
        metrics: scenario.metricsAt(Math.min(elapsed, scenario.timeToBrokenSeconds)),
    };
}
/** Materializes log lines up to "now" — scripted lines first, then rotating filler once broken. */
export async function getLogs(incidentId) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    const scenario = scenarioFor(state.challengeSlug);
    const elapsed = elapsedSeconds(Number(state.startedAtMs));
    const lines = scenario.logScript
        .filter((l) => l.t <= elapsed)
        .map((l) => ({ t: l.t, level: l.level, service: l.service, message: l.message }));
    if (state.status === "active" && elapsed > scenario.timeToBrokenSeconds) {
        const extraSeconds = elapsed - scenario.timeToBrokenSeconds;
        const repeatCount = Math.floor(extraSeconds / scenario.repeatEverySeconds);
        for (let i = 0; i < repeatCount; i++) {
            const t = scenario.timeToBrokenSeconds + (i + 1) * scenario.repeatEverySeconds;
            const msg = scenario.repeatingLogs[i % scenario.repeatingLogs.length];
            lines.push({ t: Math.round(t), level: "ERROR", service: "payment-api", message: msg });
        }
    }
    return lines;
}
export async function getMetrics(incidentId) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    const scenario = scenarioFor(state.challengeSlug);
    const elapsed = elapsedSeconds(Number(state.startedAtMs));
    const clampedElapsed = state.status === "active" ? Math.min(elapsed, scenario.timeToBrokenSeconds) : 0;
    return scenario.metricsAt(clampedElapsed);
}
export async function runCommand(incidentId, command) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    const scenario = scenarioFor(state.challengeSlug);
    const elapsed = elapsedSeconds(Number(state.startedAtMs));
    const broken = state.status === "active" && elapsed >= scenario.timeToBrokenSeconds;
    const normalized = command.trim().toLowerCase();
    const handler = scenario.commands[normalized];
    const output = handler
        ? handler({ elapsed, broken, metricsAt: scenario.metricsAt, services: scenario.serviceGraph })
        : `command not recognized. try: ${Object.keys(scenario.commands).join(", ")}`;
    await query(`INSERT INTO commands (incident_id, command, response) VALUES ($1, $2, $3)`, [
        incidentId,
        command,
        output,
    ]);
    return output;
}
export async function getHint(incidentId) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    const challenge = await getChallenge(state.challengeSlug);
    const hintsUsed = Number(state.hintsUsed || 0);
    if (hintsUsed >= challenge.hint_ladder.length) {
        return { hint: "No more hints available — trust your instincts.", hintsUsed };
    }
    const hint = challenge.hint_ladder[hintsUsed];
    const newCount = hintsUsed + 1;
    await redis.hset(keys.state(incidentId), "hintsUsed", String(newCount));
    await logEvent(incidentId, "hint", { hint, hintIndex: hintsUsed });
    return { hint, hintsUsed: newCount };
}
export async function submitFix(incidentId, actionKey) {
    const state = await redis.hgetall(keys.state(incidentId));
    if (!state.startedAtMs)
        throw new Error("Incident not found");
    if (state.status !== "active") {
        return { correct: true, alreadyResolved: true, status: state.status };
    }
    const challenge = await getChallenge(state.challengeSlug);
    const correct = actionKey === challenge.fix_action_key;
    if (!correct) {
        const wrongGuesses = Number(state.wrongGuesses || 0) + 1;
        await redis.hset(keys.state(incidentId), "wrongGuesses", String(wrongGuesses));
        await logEvent(incidentId, "fix_attempt", { actionKey, correct: false });
        return { correct: false, wrongGuesses };
    }
    await redis.hset(keys.state(incidentId), "status", "resolved");
    const resolvedAtMs = Date.now();
    const timeSeconds = Math.round(elapsedSeconds(Number(state.startedAtMs)));
    const hintsUsed = Number(state.hintsUsed || 0);
    const wrongGuesses = Number(state.wrongGuesses || 0);
    await query(`UPDATE incidents SET status = 'resolved', resolved_at = now(), hints_used = $2, wrong_guesses = $3 WHERE id = $1`, [
        incidentId,
        hintsUsed,
        wrongGuesses,
    ]);
    await logEvent(incidentId, "fix_attempt", { actionKey, correct: true });
    await logEvent(incidentId, "state_change", { status: "resolved" });
    const score = computeScore({ timeSeconds, hintsUsed, wrongGuesses });
    await query(`INSERT INTO scores (incident_id, diagnosis_score, time_seconds, hints_used, fix_quality, overall_score)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (incident_id) DO UPDATE SET
       diagnosis_score = EXCLUDED.diagnosis_score,
       time_seconds = EXCLUDED.time_seconds,
       hints_used = EXCLUDED.hints_used,
       fix_quality = EXCLUDED.fix_quality,
       overall_score = EXCLUDED.overall_score`, [incidentId, score.diagnosisScore, timeSeconds, hintsUsed, score.fixQuality, score.overall]);
    return { correct: true, status: "resolved", score, resolvedAtMs, rootCause: challenge.root_cause };
}
function computeScore({ timeSeconds, hintsUsed, wrongGuesses, }) {
    const diagnosisScore = Math.max(0, 100 - wrongGuesses * 15);
    const timeScore = Math.max(0, 100 - (timeSeconds / TIME_SCORE_TARGET_SECONDS) * 100);
    const hintPenalty = hintsUsed * 10;
    const fixQuality = wrongGuesses === 0 ? 100 : 70;
    const overall = Math.round(0.35 * diagnosisScore + 0.25 * timeScore + 0.25 * fixQuality - hintPenalty * 0.5);
    return { diagnosisScore, timeScore: Math.round(timeScore), fixQuality, overall: Math.max(0, overall) };
}
export async function getReplay(incidentId) {
    const events = await query(`SELECT event_type, payload, occurred_at FROM incident_events WHERE incident_id = $1 ORDER BY occurred_at ASC`, [incidentId]);
    const scoreRows = await query(`SELECT * FROM scores WHERE incident_id = $1`, [incidentId]);
    const state = await redis.hgetall(keys.state(incidentId));
    const challenge = state.challengeSlug ? await getChallenge(state.challengeSlug) : null;
    return {
        events,
        score: scoreRows[0] || null,
        rootCause: challenge?.root_cause,
        // postmortem text generation (LLM) is wired in the AI module, not here — engine stays deterministic
    };
}

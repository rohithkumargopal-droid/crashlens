/**
 * AI is restricted to generating TEXT ONLY — hint phrasing (P1 stretch, the
 * deterministic hint_ladder in the DB is what P0 actually uses) and the
 * post-incident postmortem narrative. It never reads or writes incident
 * state, never decides whether a fix is correct, and never controls the
 * scenario timeline. If ANTHROPIC_API_KEY is unset, callers should fall back
 * to a canned/templated string — the app must keep working without it.
 */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
export function aiAvailable() {
    return Boolean(ANTHROPIC_API_KEY);
}
async function callClaude(system, userMessage) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 400,
            system,
            messages: [{ role: "user", content: userMessage }],
        }),
    });
    if (!res.ok)
        throw new Error(`Anthropic API error: ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).find((b) => b.type === "text")?.text;
    return text || "";
}
export async function generatePostmortem(input) {
    const fallback = [
        "INCIDENT POSTMORTEM",
        `What happened      — ${input.title} caused elevated errors and latency.`,
        `Why it happened     — ${input.rootCause}`,
        `How it was detected — Error rate and latency metrics crossed alert thresholds.`,
        `How it was fixed    — The on-call engineer applied the correct remediation.`,
        `How to prevent it   — Add alerting on the leading indicator before it becomes customer-visible.`,
    ].join("\n");
    if (!aiAvailable())
        return fallback;
    try {
        const system = "You write short, factual incident postmortems for a production-incident training game. " +
            "Output exactly 5 lines in this format, no preamble: " +
            "'What happened', 'Why it happened', 'How it was detected', 'How it was fixed', 'How to prevent it'. " +
            "Each line under 20 words. Plain, direct, no dramatization.";
        const user = `Incident: ${input.title}\nRoot cause: ${input.rootCause}\nResolution time: ${input.timeSeconds}s\nHints used: ${input.hintsUsed}\nLog excerpt:\n${input.logs.slice(-6).join("\n")}`;
        const text = await callClaude(system, user);
        return text || fallback;
    }
    catch {
        return fallback;
    }
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, IncidentSummary, LogLine } from "@/lib/api";
import { PulseStrip } from "@/components/PulseStrip";

function metricClass(kind: "cpu" | "latencyMs" | "errorRatePct" | "conn", v: number, max?: number) {
  if (kind === "cpu") return v > 70 ? "crit" : v > 45 ? "warn" : "ok";
  if (kind === "latencyMs") return v > 2000 ? "crit" : v > 600 ? "warn" : "ok";
  if (kind === "errorRatePct") return v > 15 ? "crit" : v > 3 ? "warn" : "ok";
  if (kind === "conn" && max) return v / max > 0.85 ? "crit" : v / max > 0.5 ? "warn" : "ok";
  return "ok";
}

export default function IncidentView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<IncidentSummary | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [termLines, setTermLines] = useState<string[]>(["type `help` to see available commands"]);
  const [termInput, setTermInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [fixResult, setFixResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const [s, l] = await Promise.all([api.getIncident(id), api.getLogs(id)]);
        if (stopped) return;
        setSummary(s);
        setLogs(l);
        if (s.status === "resolved" && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch {
        /* incident may not exist yet on first tick */
      }
    }
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  async function runCommand() {
    if (!termInput.trim()) return;
    const cmd = termInput;
    setTermInput("");
    setTermLines((prev) => [...prev, `$ ${cmd}`]);
    try {
      const { output } = await api.runCommand(id, cmd);
      setTermLines((prev) => [...prev, output]);
    } catch (e: any) {
      setTermLines((prev) => [...prev, `error: ${e.message}`]);
    }
  }

  async function askHint() {
    setBusy(true);
    try {
      const res = await api.getHint(id);
      setHint(res.hint);
      setHintsUsed(res.hintsUsed);
    } finally {
      setBusy(false);
    }
  }

  async function applyFix(actionKey: string) {
    setBusy(true);
    try {
      const res = await api.submitFix(id, actionKey);
      setFixResult(res);
    } finally {
      setBusy(false);
    }
  }

  if (!summary) {
    return (
      <main className="shell">
        <div className="mono" style={{ color: "var(--text-muted)" }}>connecting to incident…</div>
      </main>
    );
  }

  const broken = summary.status === "active";
  const resolved = summary.status === "resolved";

  return (
    <main className="shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <div className="eyebrow">{summary.challenge.difficulty} · incident</div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: 24, margin: "4px 0" }}>{summary.challenge.title}</h1>
        </div>
        <div className="mono" style={{ color: "var(--text-muted)", fontSize: 13 }}>
          t+{summary.elapsedSeconds}s · hints used: {hintsUsed}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <PulseStrip broken={broken} />
      </div>

      {resolved && fixResult?.score ? (
        <ScoreCard incidentId={id} fixResult={fixResult} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <Metric label="CPU" value={`${summary.metrics.cpu}%`} cls={metricClass("cpu", summary.metrics.cpu)} />
            <Metric
              label="Latency"
              value={`${summary.metrics.latencyMs}ms`}
              cls={metricClass("latencyMs", summary.metrics.latencyMs)}
            />
            <Metric
              label="Error rate"
              value={`${summary.metrics.errorRatePct}%`}
              cls={metricClass("errorRatePct", summary.metrics.errorRatePct)}
            />
            <Metric
              label="DB connections"
              value={`${summary.metrics.dbConnections}/${summary.metrics.dbMaxConnections}`}
              cls={metricClass("conn", summary.metrics.dbConnections, summary.metrics.dbMaxConnections)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div className="panel">
              <div className="metric-label" style={{ marginBottom: 10 }}>service graph</div>
              {summary.services.map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                  <span className={`status-dot status-${s.status}`} />
                  <span className="mono" style={{ fontSize: 13 }}>{s.name}</span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="metric-label" style={{ marginBottom: 10 }}>logs</div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {logs.slice(-10).map((l, i) => (
                  <div key={i} className={`log-line log-${l.level}`}>
                    [t+{l.t}s] {l.level} {l.service}: {l.message}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="metric-label" style={{ marginBottom: 10 }}>terminal</div>
            <div className="terminal">
              {termLines.map((l, i) => (
                <div key={i} style={{ whiteSpace: "pre-wrap" }}>{l}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runCommand()}
                placeholder="curl /api/health"
                style={{
                  flex: 1,
                  background: "#0a0f0d",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "10px 12px",
                  color: "var(--cyan)",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                }}
              />
              <button className="btn-ghost btn" onClick={runCommand}>run</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="panel">
              <div className="metric-label" style={{ marginBottom: 10 }}>ai mentor</div>
              {hint && <div className="mono" style={{ fontSize: 13, marginBottom: 12, color: "var(--amber)" }}>{hint}</div>}
              <button className="btn-ghost btn" onClick={askHint} disabled={busy}>
                {hint ? "get another hint" : "ask for a hint"}
              </button>
            </div>

            <div className="panel">
              <div className="metric-label" style={{ marginBottom: 10 }}>apply fix</div>
              {fixResult && !fixResult.correct && (
                <div className="mono" style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>
                  not it — try again ({fixResult.wrongGuesses} wrong so far)
                </div>
              )}
              {summary.challenge.fixOptions.map((opt) => (
                <button
                  key={opt.key}
                  className="fix-option"
                  disabled={busy}
                  onClick={() => applyFix(opt.key)}
                >
                  ○ {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="panel">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${cls}`}>{value}</div>
    </div>
  );
}

function ScoreCard({ incidentId, fixResult }: { incidentId: string; fixResult: any }) {
  const s = fixResult.score;
  return (
    <div className="panel" style={{ textAlign: "center", padding: 40 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>incident resolved</div>
      <div className="mono" style={{ fontSize: 48, fontWeight: 700, color: "var(--cyan)", marginBottom: 24 }}>
        {s.overall}/100
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 420, margin: "0 auto 28px" }}>
        <ScoreRow label="Diagnosis" value={s.diagnosisScore} />
        <ScoreRow label="Fix quality" value={s.fixQuality} />
        <ScoreRow label="Time score" value={s.timeScore} />
      </div>
      <div className="mono" style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>
        root cause: {fixResult.rootCause}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <a href={`/incident/${incidentId}/replay`}><button className="btn">view replay + postmortem</button></a>
        <a href="/leaderboard"><button className="btn-ghost btn">leaderboard</button></a>
        <a href="/challenges"><button className="btn-ghost btn">next incident</button></a>
      </div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className="mono" style={{ fontSize: 20 }}>{value}</div>
    </div>
  );
}

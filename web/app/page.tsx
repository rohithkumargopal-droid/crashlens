import Link from "next/link";

export default function Landing() {
  return (
    <main className="shell" style={{ paddingTop: "18vh" }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>
        03:14 · payment-api · error rate climbing
      </div>
      <h1
        style={{
          fontFamily: "var(--mono)",
          fontSize: "clamp(32px, 6vw, 56px)",
          lineHeight: 1.1,
          margin: "0 0 20px",
          maxWidth: 780,
        }}
      >
        It&rsquo;s 2AM. Production is down.
        <br />
        You&rsquo;re the only engineer awake.
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: 17, maxWidth: 560, marginBottom: 36 }}>
        CrashLens drops you into a live, Zerops-hosted incident — real logs, real metrics, a real
        broken service graph. Diagnose the root cause, apply the fix, and see how you score.
      </p>
      <Link href="/challenges">
        <button className="btn" style={{ fontSize: 16, padding: "16px 28px" }}>
          START INCIDENT
        </button>
      </Link>

      <div style={{ marginTop: 64, display: "flex", gap: 32 }}>
        <Link href="/leaderboard" style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-muted)" }}>
          → leaderboard
        </Link>
      </div>
    </main>
  );
}

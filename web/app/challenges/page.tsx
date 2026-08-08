"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Challenge } from "@/lib/api";

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.listChallenges().then(setChallenges).catch((e) => setError(e.message));
  }, []);

  async function start(slug: string) {
    setStarting(slug);
    setError(null);
    try {
      const res = await api.startIncident(slug);
      localStorage.setItem("crashlens_user_id", res.userId);
      router.push(`/incident/${res.incidentId}`);
    } catch (e: any) {
      setError(e.message);
      setStarting(null);
    }
  }

  return (
    <main className="shell">
      <div className="eyebrow" style={{ marginBottom: 12 }}>choose an incident</div>
      <h1 style={{ fontFamily: "var(--mono)", fontSize: 28, marginBottom: 32 }}>Challenge Picker</h1>

      {error && (
        <div className="panel" style={{ borderColor: "var(--red)", color: "var(--red)", marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {challenges.map((c) => (
          <div key={c.slug} className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {c.difficulty}
                </span>
                {!c.live && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>coming soon</span>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 480 }}>{c.description}</div>
            </div>
            <button
              className="btn"
              disabled={!c.live || starting !== null}
              onClick={() => start(c.slug)}
            >
              {starting === c.slug ? "spinning up…" : "start"}
            </button>
          </div>
        ))}
        {challenges.length === 0 && !error && (
          <div className="mono" style={{ color: "var(--text-muted)" }}>loading challenges…</div>
        )}
      </div>
    </main>
  );
}

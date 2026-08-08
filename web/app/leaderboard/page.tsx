"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Leaderboard() {
  const [rows, setRows] = useState<{ rank: number; player: string; score: number }[]>([]);

  useEffect(() => {
    api.getLeaderboard().then(setRows);
  }, []);

  return (
    <main className="shell">
      <div className="eyebrow" style={{ marginBottom: 12 }}>crashlens global</div>
      <h1 style={{ fontFamily: "var(--mono)", fontSize: 24, marginBottom: 28 }}>Leaderboard</h1>

      <div className="panel">
        {rows.length === 0 && <div className="mono" style={{ color: "var(--text-muted)" }}>no scores yet — be the first.</div>}
        {rows.map((r) => (
          <div
            key={r.rank}
            className="mono"
            style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
          >
            <span>#{r.rank} {r.player}</span>
            <span style={{ color: "var(--cyan)" }}>{r.score}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function Replay() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.getReplay(id).then(setData);
  }, [id]);

  if (!data) {
    return (
      <main className="shell">
        <div className="mono" style={{ color: "var(--text-muted)" }}>loading replay…</div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="eyebrow" style={{ marginBottom: 12 }}>replay</div>
      <h1 style={{ fontFamily: "var(--mono)", fontSize: 24, marginBottom: 28 }}>Incident Timeline</h1>

      <div className="panel" style={{ marginBottom: 24 }}>
        {data.events.map((e: any, i: number) => (
          <div key={i} className="log-line mono" style={{ fontSize: 13 }}>
            [{new Date(e.occurred_at).toLocaleTimeString()}] {e.event_type} — {JSON.stringify(e.payload)}
          </div>
        ))}
      </div>

      {data.postmortem && (
        <div className="panel">
          <div className="metric-label" style={{ marginBottom: 12 }}>postmortem</div>
          <pre className="mono" style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: 0, color: "var(--text)" }}>
            {data.postmortem}
          </pre>
        </div>
      )}
    </main>
  );
}

"use client";

export function PulseStrip({ broken }: { broken: boolean }) {
  // A steady heartbeat when healthy; a flat, occasionally spiking line when broken.
  const healthyPath =
    "M0,20 L60,20 L70,20 L78,4 L86,36 L94,20 L104,20 L200,20 L210,20 L218,4 L226,36 L234,20 L244,20 L340,20";
  const brokenPath =
    "M0,20 L120,20 L128,20 L132,32 L136,8 L140,20 L400,20";

  return (
    <div className="panel" style={{ padding: "10px 20px", overflow: "hidden" }}>
      <svg viewBox="0 0 400 40" width="100%" height="36" preserveAspectRatio="none">
        <path
          d={broken ? brokenPath : healthyPath}
          fill="none"
          stroke={broken ? "var(--red)" : "var(--cyan)"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 4px ${broken ? "#e5484d" : "#4fd1c5"})`,
          }}
        >
          <animate
            attributeName="stroke-dasharray"
            values={broken ? "400,0" : "0,900;900,0"}
            dur={broken ? "0s" : "2.4s"}
            repeatCount="indefinite"
          />
        </path>
      </svg>
    </div>
  );
}

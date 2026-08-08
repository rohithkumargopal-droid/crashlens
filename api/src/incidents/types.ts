export type MetricTick = {
  t: number; // seconds since incident start
  cpu: number; // percent
  latencyMs: number;
  errorRatePct: number;
  dbConnections: number;
  dbMaxConnections: number;
};

export type LogLine = {
  t: number; // seconds since incident start
  level: "INFO" | "WARN" | "ERROR";
  service: string;
  message: string;
};

export type ServiceNode = {
  name: string;
  status: "healthy" | "degraded" | "down";
};

export type CommandHandler = (ctx: {
  elapsed: number;
  broken: boolean;
  metricsAt: (t: number) => MetricTick;
  services: (broken: boolean) => ServiceNode[];
}) => string;

export type Scenario = {
  slug: string;
  serviceGraph: (broken: boolean) => ServiceNode[];
  timeToBrokenSeconds: number; // ramp time before the incident plateaus at "fully broken"
  metricsAt: (elapsedSeconds: number) => MetricTick;
  logScript: LogLine[];
  /** extra rotating log lines appended every `repeatEverySeconds` once broken, to keep the feed alive */
  repeatingLogs: string[];
  repeatEverySeconds: number;
  commands: Record<string, CommandHandler>;
};

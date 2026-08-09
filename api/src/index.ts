import "dotenv/config";
import express from "express";
import cors from "cors";
import { incidentsRouter } from "./routes/incidents.js";
import { leaderboardRouter } from "./routes/leaderboard.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", incidentsRouter);
app.use("/api", leaderboardRouter);

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`CrashLens API listening on :${PORT}`);
});

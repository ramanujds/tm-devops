// Builds the Express app but does NOT start listening — kept separate from
// src/index.js so tests can import the app directly (via supertest) without
// binding a port or starting the background worker.
const express = require("express");
const { pool } = require("./db");
const { requireApiKey } = require("./middleware/auth");
const ordersRouter = require("./routes/orders");

const app = express();

app.use(express.json());

// Liveness probe: process is up and able to respond. Deliberately does NOT
// touch the database — a slow/down DB should not cause Kubernetes to kill
// and restart this pod, only /ready should reflect that.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness probe: checks the app can actually talk to the database before
// Kubernetes sends it traffic.
app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  } catch (err) {
    console.error("[ready] database check failed", err);
    res.status(503).json({ status: "not ready" });
  }
});

// All /orders routes require a valid x-api-key header.
app.use("/orders", requireApiKey, ordersRouter);

module.exports = app;

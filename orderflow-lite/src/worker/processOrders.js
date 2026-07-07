// Internal background worker.
//
// This is NOT a separate process — it's a setInterval loop that runs inside
// the same Node.js process as the Express server. That's intentional for
// this training course: it's a simple, visible way to demonstrate a
// long-running background task whose logs show up alongside the API logs
// in `kubectl logs`.
const crypto = require("crypto");
const { pool } = require("../db");

const BATCH_SIZE = 5; // how many pending orders we grab per poll, to simulate real-world batching
const SUCCESS_RATE = 0.9; // 90% of processed orders succeed, 10% fail (simulated)

// Small helper to simulate work taking real time (e.g. calling a downstream
// service, running a calculation, etc). Random delay between 1s and 2s.
function simulatedProcessingDelay() {
  const delayMs = 1000 + Math.floor(Math.random() * 1000);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Process a single order: mark it as started, simulate work, then resolve
// it to completed or failed, writing an order_events row at each step.
//
// `delayFn` is injectable so tests can skip the real 1-2s wait — production
// code always uses the default (simulatedProcessingDelay).
async function processOrder(order, { delayFn = simulatedProcessingDelay } = {}) {
  console.log(`[worker] order ${order.id} - processing started`);

  await pool.query(
    `INSERT INTO order_events (id, order_id, event_type, detail)
     VALUES (?, ?, 'processing_started', ?)`,
    [crypto.randomUUID(), order.id, "Worker picked up order for processing"]
  );

  await delayFn();

  const succeeded = Math.random() < SUCCESS_RATE;
  const newStatus = succeeded ? "completed" : "failed";

  await pool.query(`UPDATE orders SET status = ? WHERE id = ?`, [newStatus, order.id]);

  await pool.query(
    `INSERT INTO order_events (id, order_id, event_type, detail)
     VALUES (?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      order.id,
      newStatus,
      succeeded ? "Order processed successfully" : "Order processing failed (simulated failure)",
    ]
  );

  console.log(`[worker] order ${order.id} - outcome: ${newStatus}`);
}

// One poll cycle: grab a small batch of pending orders and process them
// one at a time. Any error on a single order is logged and swallowed so
// one bad order doesn't take down the whole poll cycle.
async function pollOnce() {
  let pendingOrders;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      [BATCH_SIZE]
    );
    pendingOrders = rows;
  } catch (err) {
    console.error("[worker] failed to fetch pending orders", err);
    return;
  }

  if (pendingOrders.length === 0) {
    return; // nothing to do this cycle
  }

  console.log(`[worker] picked up ${pendingOrders.length} pending order(s)`);

  for (const order of pendingOrders) {
    try {
      await processOrder(order);
    } catch (err) {
      console.error(`[worker] error processing order ${order.id}`, err);
    }
  }
}

// Starts the polling loop. Returns the interval handle so the caller
// (src/index.js) could clearInterval() it during a graceful shutdown.
function startOrderProcessingWorker(pollIntervalMs) {
  console.log(`[worker] starting order processing worker, polling every ${pollIntervalMs}ms`);

  const intervalHandle = setInterval(() => {
    pollOnce().catch((err) => {
      console.error("[worker] unexpected error during poll cycle", err);
    });
  }, pollIntervalMs);

  return intervalHandle;
}

module.exports = { startOrderProcessingWorker, processOrder };

const app = require("./app");
const { startOrderProcessingWorker } = require("./worker/processOrders");

const PORT = process.env.PORT || 3000;
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 5000;

app.listen(PORT, () => {
  console.log(`[index] OrderFlow-Lite listening on port ${PORT}`);

  // Start the internal background worker loop alongside the HTTP server.
  startOrderProcessingWorker(WORKER_POLL_INTERVAL_MS);
});

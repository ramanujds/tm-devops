-- OrderFlow-Lite schema (MySQL 8.0+)
-- Run this once against a fresh database to create the tables the app needs.
--
-- MySQL has no native UUID column type, so ids are stored as CHAR(36) and
-- generated application-side (crypto.randomUUID() in src/routes and
-- src/worker) rather than with a SQL default.

CREATE TABLE IF NOT EXISTS orders (
  id            CHAR(36) PRIMARY KEY,
  customer_name TEXT NOT NULL,
  item          TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  -- plain enum-like text (not a MySQL ENUM type) so it's easy to inspect/alter in a training context
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_events (
  id         CHAR(36) PRIMARY KEY,
  order_id   CHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- e.g. "created", "processing_started", "completed", "failed"
  detail     TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_events_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_events_order_id ON order_events(order_id);

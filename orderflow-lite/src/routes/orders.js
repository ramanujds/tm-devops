const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");

const router = express.Router();

// POST /orders — create a new order (starts life as "pending")
router.post("/", async (req, res) => {
  const { customer_name, item, quantity } = req.body || {};

  if (!customer_name || !item || !quantity) {
    return res.status(400).json({ error: "customer_name, item, and quantity are required" });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity must be a positive integer" });
  }

  // MySQL has no RETURNING clause, so we generate the id here and read the
  // row back after inserting.
  const orderId = crypto.randomUUID();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO orders (id, customer_name, item, quantity, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [orderId, customer_name, item, quantity]
    );

    await conn.query(
      `INSERT INTO order_events (id, order_id, event_type, detail)
       VALUES (?, ?, 'created', ?)`,
      [crypto.randomUUID(), orderId, `Order created for ${customer_name}`]
    );

    await conn.commit();

    const [rows] = await conn.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error("[orders] failed to create order", err);
    res.status(500).json({ error: "failed to create order" });
  } finally {
    conn.release();
  }
});

// GET /orders — list all orders, newest first
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("[orders] failed to list orders", err);
    res.status(500).json({ error: "failed to list orders" });
  }
});

// GET /orders/:id — a single order plus its full event history
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [id]);

    if (orderRows.length === 0) {
      return res.status(404).json({ error: "order not found" });
    }

    const [eventRows] = await pool.query(
      "SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC",
      [id]
    );

    res.json({
      ...orderRows[0],
      events: eventRows,
    });
  } catch (err) {
    console.error("[orders] failed to fetch order", err);
    res.status(500).json({ error: "failed to fetch order" });
  }
});

module.exports = router;

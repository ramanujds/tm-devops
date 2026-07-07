process.env.API_KEY = "test-api-key";

// Mock the db module before requiring the app/routes so nothing in this
// file ever touches a real database.
jest.mock("../src/db", () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const request = require("supertest");
const { pool } = require("../src/db");
const app = require("../src/app");

const API_KEY_HEADER = { "x-api-key": "test-api-key" };

// Helper: build a fake pooled connection (as returned by pool.getConnection())
// with jest.fn() stand-ins for the transaction methods the create-order
// route uses.
function makeFakeConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: jest.fn(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("auth middleware on /orders routes", () => {
  it("rejects requests with no x-api-key header", async () => {
    const res = await request(app).get("/orders");

    expect(res.status).toBe(401);
  });

  it("rejects requests with an incorrect x-api-key header", async () => {
    const res = await request(app).get("/orders").set("x-api-key", "wrong-key");

    expect(res.status).toBe(401);
  });
});

describe("POST /orders", () => {
  it("creates an order and returns 201", async () => {
    const fakeOrder = {
      id: "11111111-1111-1111-1111-111111111111",
      customer_name: "Ada Lovelace",
      item: "Widget",
      quantity: 2,
      status: "pending",
    };

    const conn = makeFakeConnection();
    conn.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT INTO orders
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT INTO order_events
      .mockResolvedValueOnce([[fakeOrder]]); // SELECT * FROM orders WHERE id = ?
    pool.getConnection.mockResolvedValue(conn);

    const res = await request(app)
      .post("/orders")
      .set(API_KEY_HEADER)
      .send({ customer_name: "Ada Lovelace", item: "Widget", quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(fakeOrder);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it("rejects a request missing a required field with 400", async () => {
    const res = await request(app)
      .post("/orders")
      .set(API_KEY_HEADER)
      .send({ customer_name: "Ada Lovelace", item: "Widget" }); // missing quantity

    expect(res.status).toBe(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

describe("GET /orders", () => {
  it("returns the list of orders", async () => {
    const fakeOrders = [
      { id: "1", customer_name: "Ada Lovelace", item: "Widget", quantity: 2, status: "pending" },
      { id: "2", customer_name: "Alan Turing", item: "Gadget", quantity: 1, status: "completed" },
    ];
    pool.query.mockResolvedValueOnce([fakeOrders]);

    const res = await request(app).get("/orders").set(API_KEY_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeOrders);
  });
});

describe("GET /orders/:id", () => {
  it("returns 404 when the order does not exist", async () => {
    pool.query.mockResolvedValueOnce([[]]); // SELECT * FROM orders WHERE id = ?

    const res = await request(app).get("/orders/does-not-exist").set(API_KEY_HEADER);

    expect(res.status).toBe(404);
  });

  it("returns the order along with its event history", async () => {
    const fakeOrder = {
      id: "11111111-1111-1111-1111-111111111111",
      customer_name: "Ada Lovelace",
      item: "Widget",
      quantity: 2,
      status: "completed",
    };
    const fakeEvents = [
      { id: "e1", order_id: fakeOrder.id, event_type: "created", detail: null },
      { id: "e2", order_id: fakeOrder.id, event_type: "processing_started", detail: null },
      { id: "e3", order_id: fakeOrder.id, event_type: "completed", detail: "Order processed successfully" },
    ];

    pool.query
      .mockResolvedValueOnce([[fakeOrder]]) // SELECT * FROM orders WHERE id = ?
      .mockResolvedValueOnce([fakeEvents]); // SELECT * FROM order_events WHERE order_id = ?

    const res = await request(app).get(`/orders/${fakeOrder.id}`).set(API_KEY_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...fakeOrder, events: fakeEvents });
  });
});

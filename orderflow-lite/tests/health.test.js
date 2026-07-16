// Mock the db module before requiring the app, so /ready never touches a
// real database connection.
jest.mock("../src/db", () => ({
  pool: { query: jest.fn() },
}));

const request = require("supertest");
const { pool } = require("../src/db");
const app = require("../src/app");

describe("GET /health", () => {
  it("always returns 200, regardless of DB state", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    // expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /ready", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 when the DB check succeeds", async () => {
    pool.query.mockResolvedValueOnce([[{ 1: 1 }]]);

    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns 503 when the DB check throws", async () => {
    pool.query.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not ready" });
  });
});

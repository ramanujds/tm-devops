// Mock the db module so the worker never touches a real database.
jest.mock("../src/db", () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require("../src/db");
const { processOrder } = require("../src/worker/processOrders");

const fakeOrder = { id: "22222222-2222-2222-2222-222222222222", status: "pending" };

// Skip the real 1-2s simulated delay in tests.
const instantDelay = () => Promise.resolve();

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("processOrder", () => {
  it("marks the order completed and writes matching order_events on success", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.05); // 0.05 < 0.9 success rate -> success
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    await processOrder(fakeOrder, { delayFn: instantDelay });

    // First call: "processing_started" event
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("processing_started"),
      expect.arrayContaining([expect.any(String), fakeOrder.id, expect.any(String)])
    );

    // Second call: status update to completed
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE orders"),
      ["completed", fakeOrder.id]
    );

    // Third call: final "completed" order_events row
    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO order_events"),
      expect.arrayContaining([expect.any(String), fakeOrder.id, "completed", expect.any(String)])
    );
  });

  it("marks the order failed and writes matching order_events on failure", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.95); // 0.95 >= 0.9 success rate -> failure
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    await processOrder(fakeOrder, { delayFn: instantDelay });

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE orders"),
      ["failed", fakeOrder.id]
    );

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO order_events"),
      expect.arrayContaining([expect.any(String), fakeOrder.id, "failed", expect.any(String)])
    );
  });
});

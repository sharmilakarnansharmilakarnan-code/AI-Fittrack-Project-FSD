const test = require("node:test");
const assert = require("node:assert");
const d = require("../utils/dateUtils");

test("startOfUtcDay / toDayKey ignore the time of day", () => {
  assert.strictEqual(d.toDayKey(d.startOfUtcDay("2026-09-18T23:59:59Z")), "2026-09-18");
  assert.strictEqual(d.startOfUtcDay("2026-09-18").toISOString(), "2026-09-18T00:00:00.000Z");
});

test("addDays moves by whole days (also across a month end)", () => {
  assert.strictEqual(d.toDayKey(d.addDays("2026-09-30", 1)), "2026-10-01");
  assert.strictEqual(d.toDayKey(d.addDays("2026-03-01", -1)), "2026-02-28");
});

test("startOfIsoWeek returns the Monday", () => {
  assert.strictEqual(d.toDayKey(d.startOfIsoWeek("2026-09-20")), "2026-09-14"); // Sunday
  assert.strictEqual(d.toDayKey(d.startOfIsoWeek("2026-09-14")), "2026-09-14"); // Monday
  assert.strictEqual(d.toDayKey(d.startOfIsoWeek("2026-09-16")), "2026-09-14"); // Wednesday
});

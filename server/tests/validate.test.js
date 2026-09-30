const test = require("node:test");
const assert = require("node:assert");
const { validateBody, validateQuery, validateObjectId } = require("../middleware/validate");

const run = (mw, input) => {
  const req = { body: {}, query: {}, params: {}, ...input };
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  let nexted = false;
  mw(req, res, () => (nexted = true));
  return { res, nexted, req };
};

const schema = {
  name: { type: "string", required: true, min: 2, max: 10 },
  password: { type: "string", trim: false, min: 3 },
  goal: { type: "string", collapse: true },
  email: { type: "string", lowercase: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  capacity: { type: "integer", required: true, min: 1, max: 500 },
  price: { type: "number", exclusiveMin: 0 },
  day: { type: "dateOnly" },
  when: { type: "date" },
  kind: { type: "enum", enum: ["Beginner", "Advanced"], ci: true },
};

test("valid body passes, is trimmed and coerced", () => {
  const { nexted, req } = run(validateBody(schema), {
    body: { name: "  Yoga ", capacity: "20", day: "2026-09-18T10:00:00Z", price: "9.5", kind: "advanced", goal: "  lose   weight ", email: "A@B.CO" },
  });
  assert.ok(nexted);
  assert.strictEqual(req.body.name, "Yoga");
  assert.strictEqual(req.body.capacity, 20);
  assert.strictEqual(req.body.price, 9.5);
  assert.strictEqual(req.body.day.toISOString(), "2026-09-18T00:00:00.000Z");
  assert.strictEqual(req.body.kind, "Advanced"); // case-insensitive enum -> canonical value
  assert.strictEqual(req.body.goal, "lose weight");
  assert.strictEqual(req.body.email, "a@b.co");
});

test("passwords (trim:false) keep their spaces", () => {
  const { req } = run(validateBody(schema), { body: { name: "Yoga", capacity: 1, password: "  pw  " } });
  assert.strictEqual(req.body.password, "  pw  ");
});

test("unknown fields are dropped (mass-assignment protection)", () => {
  const { req } = run(validateBody(schema), { body: { name: "Yoga", capacity: 5, role: "admin", user: "x", progress: 100 } });
  assert.deepStrictEqual(Object.keys(req.body).sort(), ["capacity", "name"]);
});

test("required / type / range errors -> 400 with messages", () => {
  const bad = [
    {},
    { name: "Y", capacity: 5 },
    { name: "Yoga", capacity: 0 },
    { name: "Yoga", capacity: 2.5 },
    { name: "Yoga", capacity: "abc" },
    { name: "Yoga", capacity: 501 },
    { name: { $ne: 1 }, capacity: 5 },
    { name: "Yoga", capacity: 5, price: 0 },
    { name: "Yoga", capacity: 5, kind: "z" },
    { name: "Yoga", capacity: 5, day: "not-a-date" },
    { name: "Yoga", capacity: 5, when: "not-a-date" },
    { name: "Yoga", capacity: 5, email: "nope" },
    { name: "Yoga", capacity: 5, password: "ab" },
    { name: "Yoga", capacity: true },
    { name: "Yoga", capacity: Infinity },
  ];
  bad.forEach((body) => {
    const { res, nexted } = run(validateBody(schema), { body });
    assert.strictEqual(res.statusCode, 400, JSON.stringify(body));
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors) && res.body.errors.length > 0);
  });
});

test("partial + requireOne: empty update is rejected, single field accepted", () => {
  assert.strictEqual(run(validateBody(schema, { partial: true, requireOne: true }), { body: {} }).res.statusCode, 400);
  assert.strictEqual(run(validateBody(schema, { partial: true, requireOne: true }), { body: { capacity: 10 } }).nexted, true);
});

test("query validation: coerces numbers, rejects arrays/objects, drops unknown keys", () => {
  const q = { page: { type: "integer", min: 1 }, category: { type: "string", max: 5 } };
  const { req: ok } = run(validateQuery(q), { query: { page: "2", category: "Yoga", evil: "x" } });
  assert.deepStrictEqual(ok.query, { page: 2, category: "Yoga" });
  assert.strictEqual(run(validateQuery(q), { query: { category: ["a", "b"] } }).res.statusCode, 400);
  assert.strictEqual(run(validateQuery(q), { query: { category: { $ne: "x" } } }).res.statusCode, 400);
  assert.strictEqual(run(validateQuery(q), { query: { page: "0" } }).res.statusCode, 400);
});

test("validateObjectId accepts only 24-hex ids", () => {
  const mw = validateObjectId("id");
  assert.strictEqual(run(mw, { params: { id: "64b7f0c2a1b2c3d4e5f60718" } }).nexted, true);
  ["abcdefghijkl", "not-an-id", "", "64b7f0c2a1b2c3d4e5f6071"].forEach((id) => assert.strictEqual(run(mw, { params: { id } }).res.statusCode, 400, id));
});

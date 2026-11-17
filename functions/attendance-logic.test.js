const assert = require("node:assert/strict");
const { test } = require("node:test");
const { prepareAttendance } = require("./attendance-logic");

const profile = { employeeId: "TL-A", name: "Test Leader", role: "teamleader", status: "active" };
const roster = [
  { id: "worker-a", name: "Worker A", role: "Mason", rate: 100, site: "Sastri", active: true },
  { id: "worker-b", name: "Worker B", role: "Helper", rate: 80, site: "Kaveri", active: true },
];
const input = {
  employeeId: "TL-A",
  date: "2026-11-13",
  totalPayment: 0,
  overtimeCount: 999,
  siteTotals: [{ site: "Fake", amount: 999999 }],
  note: "Test run",
  workers: [
    { id: "worker-a", name: "Spoofed Name", rate: 999999, payment: 999999, site: "Sastri", status: "Present", ot: 2 },
    { id: "worker-b", rate: -10, site: "Kaveri", status: "Half Day", ot: 0 },
  ],
};

test("trusted submission uses the current roster and computes pay and site totals", () => {
  const result = prepareAttendance({ profile, activeWorkers: roster, data: input });
  assert.equal(result.id, "TL-A_2026-11-13");
  assert.equal(result.payload.employeeName, "Test Leader");
  assert.equal(result.payload.totalPayment, 240);
  assert.equal(result.payload.overtimeCount, 2);
  assert.deepEqual(result.payload.workers.map(({ name, rate, payment }) => ({ name, rate, payment })), [
    { name: "Worker A", rate: 100, payment: 200 },
    { name: "Worker B", rate: 80, payment: 40 },
  ]);
  assert.deepEqual(result.payload.siteTotals, [
    { site: "Sastri", amount: 200, workers: 1 },
    { site: "Kaveri", amount: 40, workers: 1 },
  ]);
  assert.equal(result.payload.reviewStatus, "Pending");
  assert.equal(result.payload.editAllowed, false);
});

test("trusted submission rejects foreign, duplicated, missing, and invalid workers", () => {
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [{ ...input.workers[0], id: "worker-other" }, input.workers[1]] },
  }), /missing, duplicated, or not assigned/);
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [input.workers[0], input.workers[0]] },
  }), /missing, duplicated, or not assigned/);
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [input.workers[0]] },
  }), /every active worker/);
});

test("trusted submission rejects identity, date, status, site, and overtime tampering", () => {
  assert.throws(() => prepareAttendance({ profile, activeWorkers: roster, data: { ...input, employeeId: "TL-B" } }), /does not match/);
  assert.throws(() => prepareAttendance({ profile, activeWorkers: roster, data: { ...input, date: "2026-02-30" } }), /valid attendance date/);
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [{ ...input.workers[0], status: "Approved" }, input.workers[1]] },
  }), /Invalid attendance status/);
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [{ ...input.workers[0], site: "Fake Site" }, input.workers[1]] },
  }), /Invalid work site/);
  assert.throws(() => prepareAttendance({
    profile,
    activeWorkers: roster,
    data: { ...input, workers: [{ ...input.workers[0], ot: 1.5 }, input.workers[1]] },
  }), /Invalid overtime/);
});

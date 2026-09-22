/**
 * Logic self-test for screen routing + process verification helpers
 * (no Electron GUI required).
 */
import assert from "node:assert/strict";

function routeAssignments(openScreenIds, assignments) {
  const results = [];
  for (const a of assignments) {
    if (typeof a.screenId !== "number") {
      for (const id of openScreenIds) {
        results.push({ screenId: id, targeted: true, materialId: a.materialId });
      }
      continue;
    }
    if (!openScreenIds.includes(a.screenId)) {
      results.push({
        screenId: a.screenId,
        targeted: false,
        error: `No live display window for screen ${a.screenId}`,
      });
      continue;
    }
    results.push({
      screenId: a.screenId,
      targeted: true,
      materialId: a.materialId,
    });
  }
  return results;
}

function verifyProcesses(processes) {
  return {
    ok: processes.length > 0 && processes.every((p) => p.alive),
    dead: processes.filter((p) => !p.alive).map((p) => p.screenId),
  };
}

const routed = routeAssignments(
  [1, 2],
  [
    { screenId: 1, materialId: "m1" },
    { screenId: 99, materialId: "m2" },
    { materialId: "m3" },
  ]
);

assert.equal(routed.length, 4);
assert.equal(routed[0].targeted, true);
assert.equal(routed[1].targeted, false);
assert.equal(routed.filter((r) => r.materialId === "m3").length, 2);

const healthy = verifyProcesses([
  { screenId: 1, alive: true },
  { screenId: 2, alive: true },
]);
assert.equal(healthy.ok, true);

const unhealthy = verifyProcesses([
  { screenId: 1, alive: true },
  { screenId: 2, alive: false },
]);
assert.equal(unhealthy.ok, false);
assert.deepEqual(unhealthy.dead, [2]);

console.log("display selftest: ok");

/**
 * Logic self-test for screen routing + process verification helpers
 * (no Electron GUI required).
 */
import assert from "node:assert/strict";
import { containRect, layoutCanvasLayers } from "../src/lib/canvasLayers.ts";

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

const layers = layoutCanvasLayers([
  { id: "img", type: "IMAGE", name: "Map", localUrl: "local-material://img" },
  { id: "fx", type: "effect", name: "Smoke", localUrl: "local-material://fx" },
  { id: "snd", type: "SOUND", name: "Fire", localUrl: "local-material://snd" },
]);
assert.deepEqual(
  layers.map((layer) => [layer.kind, layer.alpha]),
  [
    ["image", 1],
    ["effect", 0.65],
    ["sound", 0],
  ]
);

const fitted = containRect(200, 100, 100, 100);
assert.equal(fitted.width, 100);
assert.equal(fitted.height, 50);
assert.equal(fitted.x, 0);
assert.equal(fitted.y, 25);

console.log("display selftest: ok");

/**
 * Logic self-test for screen routing + process verification helpers
 * (no Electron GUI required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { assignmentPlaysOnce, containRect, expandPlacedMaterials, isGifBytes, isVideoBytes, isVideoClip, layoutCanvasLayers, placedRect, placementFromCornerDrag, shouldHoldPreviousScene, shouldPlayOnce } from "../src/lib/canvasLayers.ts";
import { buildPlayAssignments, combinationMaterialIds, filterCombinations } from "../src/lib/controlPlay.ts";
import {
  belongsInAssetLibrary,
  libraryKind,
  matchesLibraryQuery,
  soundGroup,
} from "../src/lib/controlLibrary.ts";
import { addMapMaterial, assignmentsForMap, cellFromPoint, clampMapZoom, emptyMapScreen, gridCount, mapCamera, mapFocusRect, mapGridLines, panByPixels, withGridSize, zoomMap, zoomMapToward } from "../src/lib/controlMap.ts";
import { MEASURE_STROKE, cellDistance, measureLabel, measureShape } from "../src/lib/mapMeasure.ts";
import { ZONE_NPC_Y, defaultSceneLabels, placementInsideLabel, pointInPolygon, snapScenePoint, syncNpcZones } from "../src/lib/sceneMode.ts";
import { addEntry, emptyInitiative, setEntryHealth, setEntryHpVisible, setEntryVisible, sortedEntries, stepTurn, visibleEntries } from "../src/lib/initiative.ts";
import { parseRoomSession, rememberColor, rememberText } from "../src/lib/roomSession.ts";
import {
  addLayer,
  applyEnvironmentPack,
  assignmentsForZone,
  assignOpenScreens,
  emptyZones,
  reorderLayers,
  shiftLayer,
} from "../src/lib/controlZones.ts";
import {
  allSpeakers,
  bindOneShot,
  clampVolume,
  advanceLoop,
  filterSoundEffects,
  formatClock,
  partitionSoundDeck,
  withoutScreen,
} from "../src/lib/soundDeck.ts";
import { isServerUnreachable, serverDownloadMissed } from "../src/lib/materialSource.ts";
import {
  discoverControlSource,
  downloadControlMaterials,
  startControlPublisher,
} from "../electron/materialPeer.ts";
import { discoverApiServer } from "../electron/serverDiscovery.ts";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { decodeGif } from "../src/lib/gif.ts";
import { tmpdir } from "node:os";
import path from "node:path";

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
    ["effect", 1],
    ["sound", 0],
  ]
);

const fitted = containRect(200, 100, 100, 100);
assert.equal(fitted.width, 100);
assert.equal(fitted.height, 50);
assert.equal(fitted.x, 0);
assert.equal(fitted.y, 25);
assert.equal(isVideoClip("local-material://clip.webm"), true);
assert.equal(isVideoClip("local-material://smoke.png"), false);
assert.equal(isGifBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), true);
assert.equal(isVideoBytes(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])), true);
assert.equal(isGifBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), false);
assert.equal(shouldPlayOnce({ combinationId: "combo-1" }), true);
assert.equal(shouldPlayOnce({ once: true }), true);
assert.equal(shouldPlayOnce({}), false);
assert.equal(assignmentPlaysOnce({}, [{ type: "EFFECT" }, { type: "SOUND" }]), true);
assert.equal(assignmentPlaysOnce({ once: false }, [{ type: "EFFECT" }]), false);
const zoomed = placedRect(200, 100, 100, 100, { x: 0.25, y: 0, scale: 2 });
assert.equal(zoomed.width, 200);
assert.equal(zoomed.height, 100);
assert.equal(zoomed.x, -25);
assert.equal(zoomed.y, 0);
const resized = placementFromCornerDrag({
  stageWidth: 100,
  stageHeight: 100,
  anchorX: 30,
  anchorY: 40,
  pointerX: 110,
  pointerY: 80,
  originDistance: Math.hypot(40, 20),
  originScale: 1,
  originWidth: 40,
  originHeight: 20,
  corner: "se",
});
assert.equal(Math.round(resized.scale * 100), 200);
assert.equal(Math.round(resized.x * 100), 20);
assert.equal(Math.round(resized.y * 100), 10);
assert.equal(assignmentPlaysOnce({}, [{ type: "SOUND" }]), false);
assert.equal(assignmentPlaysOnce({}, [{ type: "IMAGE" }]), false);
const slashGif = path.resolve(
  import.meta.dirname,
  "../../server/uploads/1790141585170-a7f93b53-395a-4c2e-8e9f-6694631ed87a.gif"
);
if (existsSync(slashGif)) {
  const slash = decodeGif(new Uint8Array(readFileSync(slashGif)));
  assert.equal(slash.frames.length, 7);
  const first = slash.frames[0].rgba;
  let transparent = 0;
  let opaque = 0;
  for (let i = 3; i < first.length; i += 4) {
    if (first[i] === 0) transparent += 1;
    else opaque += 1;
  }
  assert.ok(transparent > opaque);
}

const play = buildPlayAssignments({
  screens: [
    { clientId: "display-a", screenId: 1 },
    { clientId: "display-a", screenId: 2 },
  ],
  materialIds: ["map", "smoke"],
  combinationId: "combo-1",
});
assert.equal(play.length, 2);
assert.equal(play[0].clientId, "display-a");
assert.equal(play[1].screenId, 2);
assert.deepEqual(play[0].materialIds, ["map", "smoke"]);
assert.equal(play[0].combinationId, "combo-1");
assert.equal(play[0].once, undefined);
const oncePlay = buildPlayAssignments({
  screens: [
    { clientId: "a", screenId: 1 },
    { clientId: "a", screenId: 2 },
    { clientId: "b", screenId: 1 },
    { clientId: "b", screenId: 2 },
  ],
  materialIds: ["map", "smoke"],
  combinationId: "combo-1",
  once: true,
});
assert.equal(oncePlay.length, 4);
assert.ok(oncePlay.every((item) => item.once === true && item.combinationId === "combo-1"));
assert.deepEqual(
  oncePlay.map((item) => `${item.clientId}:${item.screenId}`),
  ["a:1", "a:2", "b:1", "b:2"]
);

const tavern = {
  id: "tavern",
  name: "Tavern Ambience Pack",
  mainMaterialId: "map",
  mainMaterial: { id: "map", name: "Town Map", type: "IMAGE" },
  connectMaterialList: [
    { id: "smoke", name: "Smoke", type: "EFFECT" },
    { id: "fire", name: "Fireplace", type: "SOUND" },
  ],
};
const libraryForCombos = [
  { id: "map", name: "Town Map", type: "IMAGE", tags: [{ id: "t1", name: "location" }] },
  { id: "smoke", name: "Smoke", type: "EFFECT", tags: [{ id: "t3", name: "ambience" }] },
  { id: "fire", name: "Fireplace", type: "SOUND", tags: [{ id: "t3", name: "ambience" }] },
];
assert.deepEqual(
  filterCombinations([tavern], libraryForCombos, { query: "tavern" }).map((item) => item.id),
  ["tavern"]
);
assert.deepEqual(
  filterCombinations([tavern], libraryForCombos, { query: "location" }).map((item) => item.id),
  ["tavern"]
);
assert.deepEqual(
  filterCombinations([tavern], libraryForCombos, { query: "", tagId: "t1" }).map((item) => item.id),
  ["tavern"]
);
assert.deepEqual(
  filterCombinations([tavern], libraryForCombos, { query: "", kind: "image" }).map((item) => item.id),
  ["tavern"]
);
assert.deepEqual(
  filterCombinations([tavern], libraryForCombos, { query: "missing" }).map((item) => item.id),
  []
);

assert.deepEqual(
  combinationMaterialIds({
    mainMaterialId: "map",
    connectMaterialList: [{ id: "smoke" }, { id: "fire" }],
  }),
  ["map", "smoke", "fire"]
);

const map = {
  id: "map",
  name: "Town Map",
  type: "IMAGE",
  tags: [{ id: "t1", name: "location" }],
};
const bgm = {
  id: "bgm",
  name: "Tavern Theme",
  type: "SOUND",
  tags: [{ id: "t2", name: "BGM" }],
};
const crackle = {
  id: "fire",
  name: "Fireplace",
  type: "SOUND",
  general: true,
  tags: [{ id: "t3", name: "ambience" }],
};
assert.equal(libraryKind(map), "image");
assert.equal(libraryKind({ id: "slash", name: "Slash01", type: "EFFECT", tags: [] }), "animation");
assert.equal(libraryKind({ ...map, name: "Dragon Model", type: "IMAGE", tags: [] }), "model");
assert.equal(soundGroup(bgm), "bgm");
assert.equal(soundGroup(crackle), "general");
assert.equal(
  soundGroup({
    id: "shared-bgm",
    name: "BGM01",
    type: "SOUND",
    general: true,
    tags: [{ id: "t4", name: "bgm" }],
  }),
  "bgm"
);
assert.equal(belongsInAssetLibrary(map), true);
assert.equal(belongsInAssetLibrary(bgm), false);
assert.equal(belongsInAssetLibrary(crackle), false);
assert.equal(matchesLibraryQuery(map, "location"), true);
assert.equal(matchesLibraryQuery(map, "missing"), false);

const zones = assignOpenScreens(emptyZones(), ["client-a:1", "client-a:2"]);
assert.equal(zones[0].screenKey, "client-a:1");
assert.equal(zones[0].speakerKey, "client-a:1");
assert.equal(zones[1].screenKey, "client-a:2");
assert.equal(zones[3].screenKey, "");

const goblins = addLayer(addLayer([], "goblin"), "goblin");
assert.equal(goblins.length, 2);
assert.equal(goblins[0].materialId, "goblin");
assert.equal(goblins[1].materialId, "goblin");
assert.notEqual(goblins[0].id, goblins[1].id);
assert.equal(goblins[0].x, 0.08);
assert.equal(goblins[1].x, 0);
const layered = addLayer(addLayer([], "map"), "smoke");
assert.deepEqual(
  layered.map((layer) => layer.materialId),
  ["smoke", "map"]
);
assert.deepEqual(
  reorderLayers(layered, layered[1].id, layered[0].id).map((layer) => layer.materialId),
  ["map", "smoke"]
);
assert.deepEqual(
  shiftLayer(layered, layered[1].id, -1).map((layer) => layer.materialId),
  ["map", "smoke"]
);
assert.equal(shiftLayer(layered, layered[0].id, -1), layered);

const packed = applyEnvironmentPack(emptyZones(), {
  zone1MaterialId: "forest",
  zone2MaterialId: "cave",
  zone3MaterialId: "town",
  zone4MaterialId: "dungeon",
});
assert.deepEqual(
  packed.map((zone) => zone.layers.map((layer) => layer.materialId)),
  [["forest"], ["cave"], ["town"], ["dungeon"]]
);
const packedAgain = applyEnvironmentPack(packed, {
  zone1MaterialId: "forest",
  zone2MaterialId: "cave",
  zone3MaterialId: "town",
  zone4MaterialId: "dungeon",
});
assert.equal(packedAgain[0].layers.length, 1);

const types = new Map([
  ["map", "IMAGE"],
  ["smoke", "EFFECT"],
  ["fire", "SOUND"],
]);
const sent = assignmentsForZone(
  {
    number: 1,
    layers: [
      { id: "a", materialId: "map" },
      { id: "b", materialId: "smoke" },
      { id: "c", materialId: "fire" },
    ],
    screenKey: "client-a:1",
    speakerKey: "client-b:9",
  },
  types
);
assert.equal(sent.length, 2);
assert.equal(sent[0].once, false);
assert.deepEqual(sent[0].placements, [
  { materialId: "map", instanceId: "a", x: 0, y: 0, scale: 1 },
  { materialId: "smoke", instanceId: "b", x: 0, y: 0, scale: 1 },
]);
assert.deepEqual(sent[0].materialIds, ["map", "smoke"]);
assert.equal(sent[0].screenId, 1);
assert.deepEqual(sent[1].materialIds, ["fire"]);
assert.equal(sent[1].screenId, 9);
assert.equal(sent[1].clientId, "client-b");
const copies = assignmentsForZone(
  {
    number: 1,
    layers: [
      { id: "g1", materialId: "goblin", x: 0, y: 0, scale: 1 },
      { id: "g2", materialId: "goblin", x: 0.1, y: 0.2, scale: 1.5 },
    ],
    screenKey: "client-a:1",
    speakerKey: "client-a:1",
  },
  new Map([["goblin", "IMAGE"]])
);
assert.deepEqual(copies[0].materialIds, ["goblin", "goblin"]);
assert.equal(copies[0].placements?.[1].x, 0.1);
assert.equal(copies[0].placements?.[1].scale, 1.5);
const shown = expandPlacedMaterials(
  ["goblin", "goblin"],
  [
    { materialId: "goblin", x: 0, y: 0, scale: 1 },
    { materialId: "goblin", x: 0.1, y: 0.2, scale: 1.5 },
  ],
  new Map([["goblin", { id: "goblin", name: "Goblin", localUrl: "local-material://goblin" }]])
);
assert.equal(shown.length, 2);
assert.notEqual(shown[0].id, shown[1].id);
assert.equal(shown[0].localUrl, shown[1].localUrl);
assert.equal(shown[1].x, 0.1);
const kept = expandPlacedMaterials(
  ["goblin"],
  [{ materialId: "goblin", instanceId: "g2", x: 0.1, y: 0.2, scale: 1.5 }],
  new Map([["goblin", { id: "goblin", name: "Goblin", localUrl: "local-material://goblin" }]])
);
assert.equal(kept[0].id, "g2");
assert.equal(kept[0].x, 0.1);
assert.equal(shouldHoldPreviousScene(["a", "b"], ["a"]), false);
assert.equal(shouldHoldPreviousScene(["a"], ["a"]), false);
assert.equal(shouldHoldPreviousScene(["a", "b"], []), false);
assert.equal(shouldHoldPreviousScene(["a"], ["b"]), true);
const cleared = assignmentsForZone(
  { number: 1, layers: [], screenKey: "client-a:1", speakerKey: "client-a:1" },
  types
);
assert.deepEqual(cleared[0].materialIds, []);
assert.equal(cleared[0].once, false);
assert.equal(cleared[0].screenId, 1);
const mapCopies = addMapMaterial(addMapMaterial(emptyMapScreen(), "goblin"), "goblin");
assert.equal(mapCopies.layers.length, 2);
assert.equal(mapCopies.layers[0].id, "goblin-2");
assert.equal(mapCopies.layers[1].id, "goblin-1");
assert.equal(mapCopies.layers[0].scale, 1);
assert.equal(mapCopies.layers[0].x, 0);
assert.equal(mapCopies.layers[0].y, 0);
assert.notEqual(mapCopies.layers[0].id, mapCopies.layers[1].id);
const focusedMap = addMapMaterial(
  { ...emptyMapScreen(), zoom: 4, focusCol: 25, focusRow: 25 },
  "goblin"
);
assert.ok(Math.abs((focusedMap.layers[0].x ?? 0) - (25.5 / 50 - 0.5)) < 0.001);
assert.ok(Math.abs((focusedMap.layers[0].y ?? 0) - (25.5 / 50 - 0.5)) < 0.001);

const order = addEntry(
  addEntry(addEntry(emptyInitiative(), { id: "a", name: "Goblin", speed: 12, visible: true }), {
    id: "b",
    name: "Fighter",
    speed: 18,
    visible: true,
  }),
  { id: "c", name: "Rogue", speed: 18, visible: true }
);
assert.deepEqual(
  sortedEntries(order.entries).map((entry) => entry.name),
  ["Fighter", "Rogue", "Goblin"]
);
assert.equal(order.turnId, "a");
assert.equal(stepTurn(order, 1).turnId, "b");
const hidden = setEntryVisible(order, "a", false);
assert.equal(hidden.turnId, "b");
assert.deepEqual(
  visibleEntries(hidden).map((entry) => entry.id),
  ["b", "c"]
);
assert.equal(stepTurn(hidden, 1).turnId, "c");
const healed = addEntry(emptyInitiative(), {
  id: "d",
  name: "AA",
  speed: 10,
  visible: true,
  maxHp: 20,
  hp: 30,
  hpVisible: true,
});
assert.equal(healed.entries[0].maxHp, 20);
assert.equal(healed.entries[0].hp, 20);
assert.equal(setEntryHpVisible(healed, "d", false).entries[0].hpVisible, false);
assert.equal(setEntryHealth(healed, "d", { hp: 4 }).entries[0].hp, 4);
assert.equal(setEntryHealth(healed, "d", { maxHp: 12, hp: 40 }).entries[0].hp, 12);
assert.equal(setEntryHealth(healed, "d", { maxHp: 12, hp: 40 }).entries[0].maxHp, 12);
const quiet = addEntry(emptyInitiative(), { id: "e", name: "BB", speed: 8, visible: true });
assert.equal(quiet.entries[0].hpVisible, false);
assert.equal(quiet.entries[0].maxHp, 0);
assert.equal(quiet.entries[0].hp, 0);

const panned = panByPixels({ columns: 50, rows: 50, focusCol: 10, focusRow: 10, zoom: 4 }, 1600, 900, 36, -18);
assert.ok(panned.focusCol < 10);
assert.ok(panned.focusRow > 10);
const zoomFrame = { columns: 80, rows: 80, focusCol: 40, focusRow: 40, zoom: 6 };
const zoomView = { width: 1600, height: 900 };
const beforeZoom = mapCamera(zoomFrame, zoomView.width, zoomView.height);
const pointerX = 420;
const pointerY = 260;
const anchorCol = (pointerX - beforeZoom.originX) / beforeZoom.cell - 0.5;
const anchorRow = (pointerY - beforeZoom.originY) / beforeZoom.cell - 0.5;
const toward = zoomMapToward(zoomFrame, zoomView.width, zoomView.height, 1.12, pointerX, pointerY);
const afterZoom = mapCamera({ ...zoomFrame, ...toward }, zoomView.width, zoomView.height);
assert.ok(Math.abs(anchorCol - ((pointerX - afterZoom.originX) / afterZoom.cell - 0.5)) < 0.05);
assert.ok(Math.abs(anchorRow - ((pointerY - afterZoom.originY) / afterZoom.cell - 0.5)) < 0.05);
const marked = rememberText(rememberText({ texts: ["Boss"], colors: [] }, "boss"), "Minion");
assert.deepEqual(marked.texts, ["Boss", "Minion"]);
const colored = rememberColor(rememberColor({ texts: [], colors: [] }, "#F87171"), "#f87171");
assert.deepEqual(colored.colors, ["#f87171"]);

const savedRoom = parseRoomSession({
  zones: [1, 2, 3, 4].map((number) => ({
    number,
    layers: number === 1 ? [{ id: "map-1", materialId: "tavern", x: 0.1, y: 0.2, scale: 1 }] : [],
    screenKey: number === 1 ? "display:1" : "",
    speakerKey: "",
  })),
  activeZone: 2,
  zoneView: "map",
  map: {
    layers: [{ id: "layer-1", materialId: "testing-map", name: "North wall", hidden: true, x: 0, y: 0, scale: 1, markText: "Boss", markColor: "#F87171" }],
    screenKey: "display:2",
    speakerKey: "display:2",
    columns: 40,
    rows: 30,
    focusCol: 4.5,
    focusRow: 2,
    zoom: 2,
  },
  initiative: {
    entries: [{ id: "a", name: "Goblin", speed: 12, visible: true }],
    turnId: "a",
    barVisible: true,
  },
  marks: { texts: ["Boss", "boss"], colors: ["#60a5fa", "#60A5FA"] },
});
assert.equal(savedRoom?.zoneView, "map");
assert.equal(savedRoom?.activeZone, 2);
assert.equal(savedRoom?.map.zoom, 2);
assert.equal(savedRoom?.map.zonesVisible, true);
assert.equal(parseRoomSession({ ...savedRoom, map: { ...savedRoom.map, zonesVisible: false } })?.map.zonesVisible, false);
assert.deepEqual(snapScenePoint({ x: 0.011, y: 0.49 }, 50, 50), { x: 0.02, y: 0.5 });
assert.deepEqual(snapScenePoint({ x: 1.4, y: -0.2 }, 10, 8), { x: 1, y: 0 });
assert.deepEqual(snapScenePoint({ x: 0.33, y: 0.62 }, 4, 4), { x: 0.25, y: 0.5 });
assert.equal(savedRoom?.map.focusCol, 4.5);
assert.equal(savedRoom?.zones[0].layers[0].materialId, "tavern");
assert.equal(savedRoom?.map.layers[0].name, "North wall");
assert.equal(savedRoom?.map.layers[0].hidden, true);
assert.equal(savedRoom?.map.layers[0].markText, "Boss");
assert.equal(savedRoom?.map.layers[0].markColor, "#f87171");
assert.deepEqual(savedRoom?.marks.texts, ["Boss"]);
assert.deepEqual(savedRoom?.marks.colors, ["#60a5fa"]);
assert.equal(savedRoom?.initiative.entries[0].name, "Goblin");
assert.equal(savedRoom?.initiative.entries[0].hpVisible, false);
assert.equal(savedRoom?.initiative.entries[0].maxHp, 0);
assert.equal(parseRoomSession({ zones: [] }), null);

const camera = mapCamera({ columns: 50, rows: 50, focusCol: 0, focusRow: 0 }, 1600, 900);
assert.equal(camera.cell, 18);
assert.equal(camera.worldWidth, 900);
assert.equal(camera.worldHeight, 900);
assert.equal(camera.originX, 350);
assert.equal(camera.originY, 0);
assert.equal(mapGridLines({ columns: 50, rows: 50, focusCol: 4, focusRow: 6 }, 1600, 900).length, 102);
assert.deepEqual(mapFocusRect({ columns: 50, rows: 50, focusCol: 4, focusRow: 6 }, 1600, 900), {
  x: 422,
  y: 108,
  width: 18,
  height: 18,
});
const mapZoomed = mapCamera({ columns: 50, rows: 50, focusCol: 4, focusRow: 6, zoom: 50 }, 1600, 900);
assert.equal(mapZoomed.cell, 900);
assert.equal(mapZoomed.zoom, 50);
const mapZoomedFocus = mapFocusRect({ columns: 50, rows: 50, focusCol: 4, focusRow: 6, zoom: 50 }, 1600, 900);
assert.equal(mapZoomedFocus.height, 900);
assert.equal(mapZoomedFocus.y, 0);
assert.equal(mapGridLines({ columns: 50, rows: 50, focusCol: 4, focusRow: 6, zoom: 50 }, 1600, 900).length, 4);
assert.equal(clampMapZoom(80, 50, 50), 50);
assert.equal(zoomMap(1, 2, 50, 50), 2);
assert.equal(gridCount(50), 50);
assert.equal(gridCount(0), 1);
assert.equal(gridCount(400), 100);
assert.deepEqual(
  cellFromPoint({ x: 25, y: 35, width: 100, height: 100, columns: 10, rows: 10 }),
  { col: 2, row: 3 }
);
const shrunk = withGridSize({ ...emptyMapScreen(), focusCol: 40, focusRow: 40 }, 10, 8);
assert.equal(shrunk.columns, 10);
assert.equal(shrunk.focusCol, 9);
assert.equal(shrunk.focusRow, 7);
const mapSent = assignmentsForMap(
  {
    ...emptyMapScreen(),
    layers: [{ id: "a", materialId: "map", x: 0, y: 0, scale: 0.02 }],
    screenKey: "client-a:3",
    focusCol: 4,
    focusRow: 6,
  },
  new Map([["map", "IMAGE"]])
);
assert.equal(mapSent.length, 1);
assert.equal(mapSent[0].once, false);
assert.equal(mapSent[0].screenId, 3);
assert.deepEqual(mapSent[0].map, { columns: 50, rows: 50, focusCol: 4, focusRow: 6, zoom: 1 });
assert.equal(mapSent[0].placements?.[0].scale, 0.02);
const emptyMapSent = assignmentsForMap(
  { ...emptyMapScreen(), screenKey: "client-a:3", focusCol: 4, focusRow: 6 },
  new Map()
);
assert.equal(emptyMapSent[0].map?.columns, 50);
const zoneSent = assignmentsForZone(
  { ...emptyZones()[0], layers: [{ id: "z", materialId: "goblin", x: 0, y: 0, scale: 1 }], screenKey: "client-a:3" },
  new Map([["goblin", "IMAGE"]])
);
assert.equal(zoneSent[0].map, undefined);

const deck = partitionSoundDeck([
  { id: "theme", name: "Tavern BGM", type: "SOUND", tags: [{ id: "b", name: "bgm" }] },
  { id: "door", name: "Door", type: "SOUND", tags: [{ id: "e", name: "combat" }] },
  { id: "map", name: "Map", type: "IMAGE", tags: [] },
  { id: "frame", name: "Frame", type: "SOUND", general: true, tags: [] },
]);
assert.equal(measureLabel(1), "1");
assert.equal(measureLabel(29), "29");
assert.equal(cellDistance(2, 4, 5, 6), 3);
assert.equal(cellDistance(0, 0, 0, 4), 4);
const line = measureShape({ mode: "line", startCol: 1, startRow: 1, endCol: 4, endRow: 1 }, 10);
assert.equal(line.kind, "line");
assert.equal(line.distance, 3);
const circle = measureShape({ mode: "circle", startCol: 0, startRow: 0, endCol: 0, endRow: 2 }, 10);
assert.equal(circle.kind, "circle");
assert.equal(circle.distance, 2);
if (circle.kind === "circle") assert.equal(circle.radius, 25 - MEASURE_STROKE / 2);
const square = measureShape({ mode: "square", startCol: 2, startRow: 3, endCol: 5, endRow: 4 }, 10);
assert.equal(square.kind, "square");
assert.equal(square.distance, 3);
if (square.kind === "square") {
  assert.equal(square.x, 25 - 35 + MEASURE_STROKE / 2);
  assert.equal(square.y, 35 - 35 + MEASURE_STROKE / 2);
  assert.equal(square.size, (35 - MEASURE_STROKE / 2) * 2);
  assert.equal(square.x + square.size + MEASURE_STROKE / 2, 60);
  assert.equal(square.labelX, 25);
  assert.equal(square.labelY, 35);
}
const squareAcross = measureShape({ mode: "square", startCol: 0, startRow: 0, endCol: 0, endRow: 2 }, 10);
if (squareAcross.kind === "square") {
  assert.equal(squareAcross.y + squareAcross.size + MEASURE_STROKE / 2, 30);
  assert.equal(squareAcross.x + squareAcross.size + MEASURE_STROKE / 2, 30);
}
assert.equal(formatClock(65), "1:05");
assert.equal(formatClock(0), "0:00");
assert.equal(advanceLoop(8, 1, 10), 9);
assert.equal(advanceLoop(9.5, 1, 10), 0.5);
assert.deepEqual(deck.bgm.map((item) => item.id), ["theme"]);
assert.deepEqual(deck.effects.map((item) => item.id), ["door", "frame"]);
const sharedBgm = {
  id: "bgm01",
  name: "BGM01",
  type: "SOUND",
  general: true,
  tags: [{ id: "b2", name: "bgm" }],
};
const withShared = partitionSoundDeck([...deck.bgm, ...deck.effects, sharedBgm]);
assert.deepEqual(withShared.bgm.map((item) => item.id), ["theme", "bgm01"]);
assert.deepEqual(withShared.effects.map((item) => item.id), ["door", "frame"]);
assert.deepEqual(
  filterSoundEffects(withShared.effects, { query: "door" }).map((item) => item.id),
  ["door"]
);
assert.deepEqual(
  filterSoundEffects(withShared.effects, { query: "", group: "general" }).map((item) => item.id),
  ["frame"]
);
assert.deepEqual(
  filterSoundEffects(withShared.effects, { query: "", tagId: "e" }).map((item) => item.id),
  ["door"]
);
assert.equal(clampVolume(2), 1);
assert.equal(clampVolume(-1), 0);

const playing = [];
const first = {
  loop: true,
  volume: 0,
  listeners: {},
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  },
};
const second = {
  loop: true,
  volume: 0,
  listeners: {},
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  },
};
bindOneShot(playing, first);
bindOneShot(playing, second);
assert.equal(first.loop, false);
assert.equal(first.volume, 1);
assert.equal(playing.length, 2);
first.listeners.ended();
assert.deepEqual(playing, [second]);
let done = 0;
const third = {
  loop: true,
  volume: 0,
  src: "local-material://slash",
  listeners: {},
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  },
};
bindOneShot(playing, third, () => {
  done += 1;
});
third.listeners.ended();
assert.equal(done, 1);
assert.equal(third.src, "");
assert.deepEqual(playing, [second]);
second.listeners.error();
assert.deepEqual(playing, []);
assert.deepEqual(
  withoutScreen(
    [
      { clientId: "a", screenId: 1 },
      { clientId: "a", screenId: 2 },
      { clientId: "b", screenId: 1 },
    ],
    { clientId: "a", screenId: 2 }
  ),
  [
    { clientId: "a", screenId: 1 },
    { clientId: "b", screenId: 1 },
  ]
);
assert.equal(withoutScreen([{ clientId: "a", screenId: 1 }], null).length, 1);
assert.deepEqual(
  allSpeakers([
    { clientId: "a", screens: [{ id: 1 }, { id: 2 }] },
    { clientId: "b", screens: [{ id: 1 }] },
  ]),
  [
    { clientId: "a", screenId: 1 },
    { clientId: "a", screenId: 2 },
    { clientId: "b", screenId: 1 },
  ]
);

assert.equal(isServerUnreachable(new TypeError("Failed to fetch")), true);
assert.equal(isServerUnreachable(new Error("net::ERR_CONNECTION_REFUSED")), true);
assert.equal(isServerUnreachable(new Error("HTTP 404")), false);
assert.equal(
  serverDownloadMissed(0, [{ error: "net::ERR_NAME_NOT_RESOLVED" }]),
  true
);
assert.equal(serverDownloadMissed(1, [{ error: "Failed to fetch" }]), false);
assert.equal(serverDownloadMissed(0, [{ error: "HTTP 404" }]), false);

const sourceDir = await mkdtemp(path.join(tmpdir(), "dnd-control-"));
const destDir = await mkdtemp(path.join(tmpdir(), "dnd-display-"));
const mapPath = path.join(sourceDir, "map.bin");
await writeFile(mapPath, Buffer.from("map-bytes"));
const publisher = await startControlPublisher({
  roomId: "room-test",
  discoveryPort: 0,
  materials: [{ id: "map", name: "Town Map", type: "IMAGE", filePath: mapPath }],
});
try {
  const missing = await discoverControlSource("other-room", {
    discoveryPort: publisher.discoveryPort,
    timeoutMs: 400,
  });
  assert.equal(missing, null);
  const found = await discoverControlSource("room-test", {
    discoveryPort: publisher.discoveryPort,
    timeoutMs: 2000,
  });
  assert.ok(found);
  const pack = await downloadControlMaterials({
    baseUrl: found.baseUrl,
    token: found.token,
    directory: destDir,
  });
  assert.equal(pack.saved.length, 1);
  assert.equal(pack.saved[0].name, "Town Map");
  assert.equal(await readFile(pack.saved[0].filePath, "utf8"), "map-bytes");
  const denied = await fetch(`${found.baseUrl}/catalog`);
  assert.equal(denied.status, 401);
} finally {
  await publisher.close();
  await rm(sourceDir, { recursive: true, force: true });
  await rm(destDir, { recursive: true, force: true });
}

const beacon = createSocket({ type: "udp4", reuseAddr: true });
await new Promise((resolve, reject) => {
  beacon.once("error", reject);
  beacon.bind(0, () => resolve());
});
const boundUdp = beacon.address();
const beaconPort = typeof boundUdp === "object" && boundUdp ? boundUdp.port : 0;
const beaconServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { service: "dnd-app-server" } }));
});
await new Promise((resolve) => beaconServer.listen(0, "0.0.0.0", () => resolve()));
const boundHttp = beaconServer.address();
const beaconHttp = typeof boundHttp === "object" && boundHttp ? boundHttp.port : 0;
beacon.on("message", (message, rinfo) => {
  const body = JSON.parse(message.toString("utf8"));
  if (body.role !== "client" || body.kind !== "discover") return;
  beacon.send(
    Buffer.from(
      JSON.stringify({
        v: 1,
        role: "server",
        kind: "announce",
        port: beaconHttp,
        service: "dnd-app-server",
      })
    ),
    rinfo.port,
    rinfo.address
  );
});
try {
  const server = await discoverApiServer({ discoveryPort: beaconPort, timeoutMs: 2000 });
  assert.ok(server);
  assert.equal(server.port, beaconHttp);
  assert.equal(server.apiBase, `http://${server.host}:${beaconHttp}/api`);
} finally {
  beacon.close();
  await new Promise((resolve) => beaconServer.close(() => resolve()));
}

const scene = defaultSceneLabels();
const zoneUp = scene.find((label) => label.zone === 1);
const zoneLeft = scene.find((label) => label.zone === 2);
const zoneRight = scene.find((label) => label.zone === 3);
const zoneDown = scene.find((label) => label.zone === 4);
assert.ok(zoneUp && zoneLeft && zoneRight && zoneDown);
const centroid = (label) => {
  const sum = label.corners.reduce((point, corner) => ({ x: point.x + corner.x, y: point.y + corner.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / 4, y: sum.y / 4 };
};
assert.ok(centroid(zoneUp).y < centroid(zoneLeft).y);
assert.ok(centroid(zoneLeft).x < centroid(zoneUp).x);
assert.ok(centroid(zoneRight).x > centroid(zoneUp).x);
assert.ok(centroid(zoneDown).y > centroid(zoneLeft).y);
const avatar = { x: 0.12, y: 0.4 };
assert.equal(pointInPolygon(avatar, zoneLeft.corners), true);
assert.equal(pointInPolygon({ x: 0.5, y: 0.2 }, zoneUp.corners), true);
assert.equal(pointInPolygon({ x: 0.99, y: 0.99 }, zoneLeft.corners), false);
const inside = placementInsideLabel(avatar, zoneLeft);
assert.ok(inside && inside.x < 0);
assert.equal(placementInsideLabel({ x: 0.99, y: 0.99 }, zoneLeft), null);
const npcLibrary = new Map([["goblin", { npc: true, characterArtUrl: "/uploads/goblin-art.png" }]]);
const npcLayers = [{ id: "map-goblin", materialId: "goblin", x: avatar.x - 0.5, y: avatar.y - 0.5 }];
const npcZones = syncNpcZones(emptyZones(), npcLayers, scene, npcLibrary);
const placed = npcZones.flatMap((zone) => zone.layers);
assert.equal(placed.length, 1);
assert.equal(placed[0].useCharacterArt, true);
assert.equal(placed[0].sourceMapLayerId, "map-goblin");
assert.equal(placed[0].y, ZONE_NPC_Y);
assert.equal(placed[0].scale, 1);
const sizedZones = npcZones.map((zone) => ({
  ...zone,
  layers: zone.layers.map((layer) => ({ ...layer, scale: 1.4 })),
}));
const keptSize = syncNpcZones(
  sizedZones,
  [{ ...npcLayers[0], scale: 2.5 }],
  scene,
  npcLibrary
);
assert.equal(keptSize, sizedZones);
assert.equal(keptSize.flatMap((zone) => zone.layers)[0].scale, 1.4);
assert.equal(npcZones.find((zone) => zone.layers.length > 0)?.number, 2);
assert.ok((placed[0].x ?? 0) > 0);
assert.ok(Math.abs(placed[0].x ?? 1) <= 0.5);
assert.ok(Math.abs(placed[0].y ?? 1) <= 0.5);
const look = { x: 0.5, y: 0.5 };
const level = placementInsideLabel({ x: 0.2, y: 0.5 }, zoneLeft, look);
const above = placementInsideLabel({ x: 0.2, y: 0.28 }, zoneLeft, look);
assert.ok(level && above);
assert.ok(Math.abs(level.x) < 0.08);
assert.ok(above.x > level.x + 0.1);
assert.ok(Math.abs(above.y - level.y) < Math.abs(above.x - level.x));
assert.equal(syncNpcZones(npcZones, npcLayers, scene, npcLibrary), npcZones);
const onCenter = placementInsideLabel(avatar, zoneLeft, avatar);
assert.ok(onCenter);
assert.ok(Math.abs(onCenter.x) < 1e-9);
assert.ok(Math.abs(onCenter.y) < 1e-9);
const centeredZones = syncNpcZones(emptyZones(), npcLayers, scene, npcLibrary, avatar);
const centered = centeredZones.flatMap((zone) => zone.layers);
assert.equal(centered.length, 1);
assert.ok(Math.abs(centered[0].x ?? 1) < 1e-9);
assert.equal(centered[0].y, ZONE_NPC_Y);
const avatarChoice = syncNpcZones(
  emptyZones(),
  [{ ...npcLayers[0], useCharacterArt: false }],
  scene,
  npcLibrary
);
assert.equal(avatarChoice.flatMap((zone) => zone.layers)[0].useCharacterArt, false);
const keptAvatar = syncNpcZones(
  avatarChoice,
  [{ ...npcLayers[0], useCharacterArt: false, scale: 3 }],
  scene,
  npcLibrary
);
assert.equal(keptAvatar, avatarChoice);

console.log("display selftest: ok");

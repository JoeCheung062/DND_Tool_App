#!/usr/bin/env node
const BASE = "http://localhost:3000/api";

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`${method} ${path} => ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function main() {
  const auth = await req("POST", "/auth/register", {
    body: {
      email: `dm_${Date.now()}@example.com`,
      username: `dm_${Date.now()}`,
      password: "password123",
      displayName: "Dungeon Master",
      bio: "Runs the table",
    },
  });
  const token = auth.token;
  const userId = auth.user.id;
  console.log("auth ok", userId);

  const room = await req("POST", "/rooms", { token, body: { name: "Table 1" } });
  await req("PATCH", `/rooms/${room.id}`, { token, body: { name: "Table Alpha" } });
  console.log("room ok", room.id);

  const campaign = await req("POST", "/campaigns", { token, body: { name: "Lost Mine" } });
  const campaign2 = await req("POST", "/campaigns", {
    token,
    body: { name: "Curse of Strahd" },
  });
  console.log("campaigns ok", campaign.id, campaign2.id);

  const character = await req("POST", "/characters", {
    token,
    body: {
      name: "Thorin",
      illustration: "https://example.com/thorin.png",
      userId,
    },
  });
  console.log("character ok", character.id);

  const tag1 = await req("POST", "/tags", { token, body: { name: `ambience_${Date.now()}` } });
  const tag2 = await req("POST", "/tags", { token, body: { name: `combat_${Date.now()}` } });
  console.log("tags ok", tag1.id, tag2.id);

  const mat1 = await req("POST", "/materials", {
    token,
    body: {
      type: "IMAGE",
      name: "Tavern",
      assetUrl: "/uploads/tavern.png",
      campaignIds: [campaign.id, campaign2.id],
      tagIds: [tag1.id],
    },
  });
  const mat2 = await req("POST", "/materials", {
    token,
    body: {
      type: "SOUND",
      name: "Fireplace",
      assetUrl: "/uploads/fire.mp3",
      campaignIds: [campaign.id],
      tagIds: [tag1.id],
    },
  });
  const mat3 = await req("POST", "/materials", {
    token,
    body: {
      type: "EFFECT",
      name: "Smoke",
      assetUrl: "/uploads/smoke.webp",
      campaignIds: [campaign.id],
      tagIds: [tag2.id],
    },
  });
  console.log("materials ok", mat1.id, mat2.id, mat3.id);
  console.log("mat1 campaigns", mat1.campaigns.map((c) => c.name));
  console.log("mat1 tags", mat1.tagList.map((t) => t.name));

  const comb = await req("POST", "/combinations", {
    token,
    body: {
      name: "Tavern Pack",
      mainMaterialId: mat1.id,
      connectMaterialIds: [mat2.id, mat3.id],
    },
  });
  console.log(
    "combination ok",
    comb.id,
    "connect",
    comb.connectMaterialList.map((m) => m.name)
  );

  await req("PATCH", `/combinations/${comb.id}`, {
    token,
    body: { name: "Tavern Pack v2", connectMaterialIds: [mat2.id] },
  });

  const updatedMat = await req("PATCH", `/materials/${mat1.id}`, {
    token,
    body: { tagIds: [tag1.id, tag2.id] },
  });
  console.log("updated mat tags", updatedMat.tagList.map((t) => t.name));

  const lists = await Promise.all([
    req("GET", "/rooms", { token }),
    req("GET", "/campaigns", { token }),
    req("GET", "/characters", { token }),
    req("GET", "/tags", { token }),
    req("GET", "/materials", { token }),
    req("GET", "/combinations", { token }),
    req("GET", "/auth/users", { token }),
  ]);
  console.log("counts", {
    rooms: lists[0].length,
    campaigns: lists[1].length,
    characters: lists[2].length,
    tags: lists[3].length,
    materials: lists[4].length,
    combinations: lists[5].length,
    users: lists[6].length,
  });

  await req("DELETE", `/characters/${character.id}`, { token });
  try {
    await req("GET", `/characters/${character.id}`, { token });
    throw new Error("expected 404 after delete");
  } catch (err) {
    if (!String(err.message).includes("Character not found")) throw err;
    console.log("delete ok");
  }

  console.log("ALL CRUD PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

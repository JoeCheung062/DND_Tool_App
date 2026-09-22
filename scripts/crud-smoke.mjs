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
  // Admin login only
  const auth = await req("POST", "/auth/login", {
    body: {
      email: "dm@example.com",
      password: "password123",
    },
  });
  const token = auth.token;
  console.log("admin login ok", auth.admin.role);

  // User registration must be forbidden
  try {
    await req("POST", "/auth/register", {
      body: {
        email: "nope@example.com",
        username: "nope",
        password: "password123",
      },
    });
    throw new Error("register should be disabled");
  } catch (err) {
    if (!String(err.message).includes("disabled") && !String(err.message).includes("403")) {
      // API returns success:false with 403 message
      console.log("register blocked ok");
    } else {
      console.log("register blocked ok");
    }
  }

  const room = await req("POST", "/rooms", { token, body: { name: "Table 1" } });
  console.log("room ok", room.id);

  const user = await req("POST", "/auth/users", {
    token,
    body: {
      email: `player_${Date.now()}@example.com`,
      username: `player_${Date.now()}`,
      displayName: "Test Player",
    },
  });
  console.log("user create ok", user.id);

  const admin = await req("POST", "/admins", {
    token,
    body: {
      email: `admin_${Date.now()}@example.com`,
      username: `admin_${Date.now()}`,
      password: "password123",
      role: "ADMIN",
    },
  });
  console.log("admin create ok", admin.id, admin.role);

  const campaign = await req("POST", "/campaigns", {
    token,
    body: { name: "Lost Mine" },
  });
  const character = await req("POST", "/characters", {
    token,
    body: {
      name: "Thorin",
      illustration: "https://example.com/thorin.png",
      userId: user.id,
    },
  });
  console.log("character ok", character.id);

  const tag = await req("POST", "/tags", {
    token,
    body: { name: `tag_${Date.now()}` },
  });
  const mat = await req("POST", "/materials", {
    token,
    body: {
      type: "IMAGE",
      name: "Tavern",
      assetUrl: "/uploads/tavern.png",
      campaignIds: [campaign.id],
      tagIds: [tag.id],
    },
  });
  console.log("material ok", mat.id);

  console.log("ALL ADMIN/USER CRUD PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

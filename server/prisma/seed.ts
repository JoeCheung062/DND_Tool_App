import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding DND database...");

  await prisma.combinationConnect.deleteMany();
  await prisma.combination.deleteMany();
  await prisma.materialTag.deleteMany();
  await prisma.materialCampaignPreset.deleteMany();
  await prisma.material.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.character.deleteMany();
  await prisma.room.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();
  await prisma.admin.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 12);

  const [superAdmin, admin, dm] = await Promise.all([
    prisma.admin.create({
      data: {
        email: "super@example.com",
        username: "super_admin",
        passwordHash,
        role: "SUPER_ADMIN",
        displayName: "Super Admin",
        bio: "Full system access",
      },
    }),
    prisma.admin.create({
      data: {
        email: "admin@example.com",
        username: "admin",
        passwordHash,
        role: "ADMIN",
        displayName: "Admin",
      },
    }),
    prisma.admin.create({
      data: {
        email: "dm@example.com",
        username: "dungeon_master",
        passwordHash,
        role: "DM",
        displayName: "Dungeon Master",
        bio: "Runs the table",
      },
    }),
  ]);

  const player = await prisma.user.create({
    data: {
      email: "player@example.com",
      username: "adventurer",
      displayName: "Aria",
      bio: "Loves rolling nat 20s",
    },
  });

  const room = await prisma.room.create({ data: { name: "Friday Night Table" } });

  const [campaign1, campaign2] = await Promise.all([
    prisma.campaign.create({ data: { name: "Lost Mine of Phandelver" } }),
    prisma.campaign.create({ data: { name: "Curse of Strahd" } }),
  ]);

  await prisma.character.createMany({
    data: [
      {
        name: "Thorin Ironfist",
        illustration: "https://example.com/thorin.png",
        userId: player.id,
      },
      {
        name: "Elara Moonwhisper",
        illustration: "https://example.com/elara.png",
        userId: player.id,
      },
    ],
  });

  const [tagAmbience, tagCombat, tagNpc] = await Promise.all([
    prisma.tag.create({ data: { name: "ambience" } }),
    prisma.tag.create({ data: { name: "combat" } }),
    prisma.tag.create({ data: { name: "npc" } }),
  ]);

  const tavern = await prisma.material.create({
    data: {
      type: "IMAGE",
      name: "Tavern Interior",
      assetUrl: "/uploads/tavern.png",
      campaignPresets: {
        create: [{ campaignId: campaign1.id }, { campaignId: campaign2.id }],
      },
      tags: { create: [{ tagId: tagAmbience.id }] },
    },
  });

  const fireplace = await prisma.material.create({
    data: {
      type: "SOUND",
      name: "Fireplace Crackling",
      assetUrl: "/uploads/fireplace.mp3",
      campaignPresets: { create: [{ campaignId: campaign1.id }] },
      tags: { create: [{ tagId: tagAmbience.id }] },
    },
  });

  const smoke = await prisma.material.create({
    data: {
      type: "EFFECT",
      name: "Smoke Overlay",
      assetUrl: "/uploads/smoke.webp",
      campaignPresets: { create: [{ campaignId: campaign1.id }] },
      tags: { create: [{ tagId: tagCombat.id }] },
    },
  });

  await prisma.combination.create({
    data: {
      name: "Tavern Ambience Pack",
      mainMaterialId: tavern.id,
      connectMaterials: {
        create: [{ materialId: fireplace.id }, { materialId: smoke.id }],
      },
    },
  });

  console.log("Seed complete:");
  console.log({
    admins: [
      { email: superAdmin.email, role: superAdmin.role },
      { email: admin.email, role: admin.role },
      { email: dm.email, role: dm.role },
    ],
    password: "password123",
    users: [player.email],
    note: "Only Admin accounts can sign in to the CMS",
    room: room.name,
    campaigns: [campaign1.name, campaign2.name],
    tags: [tagAmbience.name, tagCombat.name, tagNpc.name],
    materials: [tavern.name, fireplace.name, smoke.name],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

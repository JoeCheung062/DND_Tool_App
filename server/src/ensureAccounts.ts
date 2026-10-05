import bcrypt from "bcryptjs";
import { prisma } from "./config/prisma.js";

const DEFAULT_ACCOUNTS = [
  {
    email: "super@example.com",
    username: "super_admin",
    role: "SUPER_ADMIN" as const,
    displayName: "Super Admin",
  },
  {
    email: "admin@example.com",
    username: "admin",
    role: "ADMIN" as const,
    displayName: "Admin",
  },
  {
    email: "dm@example.com",
    username: "dungeon_master",
    role: "DM" as const,
    displayName: "Dungeon Master",
  },
];

/**
 * Creates the default CMS logins only when the admin table is empty.
 * Existing campaigns, materials, and accounts are left in place.
 */
export async function ensureDefaultAccounts() {
  const existing = await prisma.admin.count();
  if (existing > 0) {
    console.log(`Keeping ${existing} existing admin account(s).`);
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 12);
  await prisma.admin.createMany({
    data: DEFAULT_ACCOUNTS.map((account) => ({ ...account, passwordHash })),
  });
  console.log("Created default admin accounts (password123).");
}

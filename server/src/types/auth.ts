import type { AdminRole } from "@prisma/client";

/** Authenticated CMS/admin principal (never a User) */
export type AuthAdmin = {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
  accountType: "admin";
};

/** @deprecated use AuthAdmin */
export type AuthUser = AuthAdmin;

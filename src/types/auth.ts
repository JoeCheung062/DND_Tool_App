import type { Role } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: Role;
};

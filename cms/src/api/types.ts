export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "DM";

export type Admin = {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt?: string;
};

/** Player profile — cannot log in */
export type User = {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt?: string;
};

export type MaterialType = "IMAGE" | "EFFECT" | "SOUND";

export type Room = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Campaign = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { materialPresets: number };
};

export type Character = {
  id: string;
  name: string;
  illustration: string | null;
  userId: string;
  user?: Pick<User, "id" | "username" | "displayName" | "avatarUrl">;
};

export type Tag = {
  id: string;
  name: string;
  _count?: { materials: number };
};

export type Material = {
  id: string;
  type: MaterialType;
  name: string;
  assetUrl: string;
  campaigns?: { id: string; name: string }[];
  tagList?: { id: string; name: string }[];
};

export type Combination = {
  id: string;
  name: string;
  mainMaterialId: string;
  mainMaterial?: Material;
  connectMaterialList?: Material[];
};

export type Overview = {
  counts: {
    rooms: number;
    campaigns: number;
    users: number;
    admins: number;
    characters: number;
    tags: number;
    materials: number;
    combinations: number;
  };
  materialsByType: Record<string, number>;
};

export type SqlTable = { table: string; rows: number };
export type SqlColumn = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

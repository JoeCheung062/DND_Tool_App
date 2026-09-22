export type Role = "USER" | "DM" | "ADMIN";
export type MaterialType = "IMAGE" | "EFFECT" | "SOUND";

export type User = {
  id: string;
  email: string;
  username: string;
  role: Role;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt?: string;
};

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

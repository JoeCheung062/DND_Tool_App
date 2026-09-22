import { api } from "./client";
import type {
  Campaign,
  Character,
  Combination,
  Material,
  MaterialType,
  Overview,
  Room,
  SqlColumn,
  SqlTable,
  Tag,
  User,
} from "./types";

export const authApi = {
  login: (email: string, password: string) =>
    api<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  me: () => api<User>("/auth/me"),
};

export const adminApi = {
  overview: () => api<Overview>("/admin/overview"),
  tables: () => api<SqlTable[]>("/admin/tables"),
  describe: (table: string) =>
    api<{ table: string; columns: SqlColumn[] }>(`/admin/tables/${table}`),
};

export const roomsApi = {
  list: () => api<Room[]>("/rooms"),
  create: (name: string) =>
    api<Room>("/rooms", { method: "POST", json: { name } }),
  update: (id: string, name: string) =>
    api<Room>(`/rooms/${id}`, { method: "PATCH", json: { name } }),
  remove: (id: string) => api<{ id: string }>(`/rooms/${id}`, { method: "DELETE" }),
};

export const campaignsApi = {
  list: () => api<Campaign[]>("/campaigns"),
  create: (name: string) =>
    api<Campaign>("/campaigns", { method: "POST", json: { name } }),
  update: (id: string, name: string) =>
    api<Campaign>(`/campaigns/${id}`, { method: "PATCH", json: { name } }),
  remove: (id: string) =>
    api<{ id: string }>(`/campaigns/${id}`, { method: "DELETE" }),
};

export const charactersApi = {
  list: () => api<Character[]>("/characters"),
  create: (body: { name: string; illustration?: string; userId?: string }) =>
    api<Character>("/characters", { method: "POST", json: body }),
  update: (
    id: string,
    body: { name?: string; illustration?: string | null; userId?: string }
  ) => api<Character>(`/characters/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/characters/${id}`, { method: "DELETE" }),
};

export const tagsApi = {
  list: () => api<Tag[]>("/tags"),
  create: (name: string) =>
    api<Tag>("/tags", { method: "POST", json: { name } }),
  update: (id: string, name: string) =>
    api<Tag>(`/tags/${id}`, { method: "PATCH", json: { name } }),
  remove: (id: string) => api<{ id: string }>(`/tags/${id}`, { method: "DELETE" }),
};

export const materialsApi = {
  list: () => api<Material[]>("/materials"),
  create: (body: {
    type: MaterialType;
    name: string;
    assetUrl: string;
    campaignIds?: string[];
    tagIds?: string[];
  }) => api<Material>("/materials", { method: "POST", json: body }),
  update: (
    id: string,
    body: {
      type?: MaterialType;
      name?: string;
      assetUrl?: string;
      campaignIds?: string[];
      tagIds?: string[];
    }
  ) => api<Material>(`/materials/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/materials/${id}`, { method: "DELETE" }),
};

export const combinationsApi = {
  list: () => api<Combination[]>("/combinations"),
  create: (body: {
    name: string;
    mainMaterialId: string;
    connectMaterialIds?: string[];
  }) => api<Combination>("/combinations", { method: "POST", json: body }),
  update: (
    id: string,
    body: {
      name?: string;
      mainMaterialId?: string;
      connectMaterialIds?: string[];
    }
  ) => api<Combination>(`/combinations/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/combinations/${id}`, { method: "DELETE" }),
};

export const usersApi = {
  list: () => api<User[]>("/auth/users"),
  update: (
    id: string,
    body: {
      displayName?: string | null;
      avatarUrl?: string | null;
      bio?: string | null;
      username?: string;
    }
  ) => api<User>(`/auth/users/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/auth/users/${id}`, { method: "DELETE" }),
};

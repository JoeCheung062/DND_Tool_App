import { api } from "./client";
import type {
  Admin,
  AdminRole,
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
    api<{ admin: Admin; token: string }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  me: () => api<Admin>("/auth/me"),
};

export const adminApi = {
  overview: () => api<Overview>("/admin/overview"),
  tables: () => api<SqlTable[]>("/admin/tables"),
  describe: (table: string) =>
    api<{ table: string; columns: SqlColumn[] }>(`/admin/tables/${table}`),
};

export const adminsApi = {
  list: () => api<Admin[]>("/admins"),
  create: (body: {
    email: string;
    username: string;
    password: string;
    role: AdminRole;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
  }) => api<Admin>("/admins", { method: "POST", json: body }),
  update: (
    id: string,
    body: {
      email?: string;
      username?: string;
      password?: string;
      role?: AdminRole;
      displayName?: string | null;
      avatarUrl?: string | null;
      bio?: string | null;
    }
  ) => api<Admin>(`/admins/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/admins/${id}`, { method: "DELETE" }),
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
  create: (body: { name: string; userId: string; file?: File }) => {
    const formData = new FormData();
    formData.append("name", body.name);
    formData.append("userId", body.userId);
    if (body.file) formData.append("file", body.file);
    return api<Character>("/characters", { method: "POST", formData });
  },
  update: (
    id: string,
    body: { name?: string; userId?: string; file?: File; clearIllustration?: boolean }
  ) => {
    const formData = new FormData();
    if (body.name) formData.append("name", body.name);
    if (body.userId) formData.append("userId", body.userId);
    if (body.file) formData.append("file", body.file);
    if (body.clearIllustration) formData.append("illustration", "");
    return api<Character>(`/characters/${id}`, { method: "PATCH", formData });
  },
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
    file: File;
    general?: boolean;
    campaignIds?: string[];
    tagIds?: string[];
  }) => {
    const formData = new FormData();
    formData.append("type", body.type);
    formData.append("name", body.name);
    formData.append("file", body.file);
    formData.append("general", body.general ? "true" : "false");
    formData.append("campaignIds", JSON.stringify(body.campaignIds ?? []));
    formData.append("tagIds", JSON.stringify(body.tagIds ?? []));
    return api<Material>("/materials", { method: "POST", formData });
  },
  update: (
    id: string,
    body: {
      type?: MaterialType;
      name?: string;
      file?: File;
      general?: boolean;
      campaignIds?: string[];
      tagIds?: string[];
    }
  ) => {
    const formData = new FormData();
    if (body.type) formData.append("type", body.type);
    if (body.name) formData.append("name", body.name);
    if (body.file) formData.append("file", body.file);
    if (body.general !== undefined) {
      formData.append("general", body.general ? "true" : "false");
    }
    if (body.campaignIds) {
      formData.append("campaignIds", JSON.stringify(body.campaignIds));
    }
    if (body.tagIds) {
      formData.append("tagIds", JSON.stringify(body.tagIds));
    }
    return api<Material>(`/materials/${id}`, { method: "PATCH", formData });
  },
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
  create: (body: {
    email: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
  }) => api<User>("/auth/users", { method: "POST", json: body }),
  update: (
    id: string,
    body: {
      email?: string;
      displayName?: string | null;
      avatarUrl?: string | null;
      bio?: string | null;
      username?: string;
    }
  ) => api<User>(`/auth/users/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    api<{ id: string }>(`/auth/users/${id}`, { method: "DELETE" }),
};

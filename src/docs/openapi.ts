export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "DND App API",
    version: "1.1.0",
    description:
      "Data management CRUD API for Room, Campaign, User, Character, Tag, Material Slide (Image/Effect/Sound), and Combination. Admin table inspect at `/api/admin`. Socket.IO at `/socket.io`.",
  },
  servers: [{ url: "/api", description: "API base" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          details: {},
        },
      },
      Room: {
        type: "object",
        required: ["name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      Campaign: {
        type: "object",
        required: ["name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      UserProfile: {
        type: "object",
        properties: {
          displayName: { type: "string" },
          avatarUrl: { type: "string" },
          bio: { type: "string" },
        },
      },
      Character: {
        type: "object",
        required: ["name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          illustration: { type: "string", description: "Character illustration URL" },
          userId: { type: "string" },
        },
      },
      Tag: {
        type: "object",
        required: ["name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      Material: {
        type: "object",
        required: ["type", "name", "assetUrl"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["IMAGE", "EFFECT", "SOUND"] },
          name: { type: "string" },
          assetUrl: { type: "string" },
          campaignIds: {
            type: "array",
            items: { type: "string" },
            description: "Presets In Campaign (multiple)",
          },
          tagIds: {
            type: "array",
            items: { type: "string" },
            description: "Tags (multiple)",
          },
        },
      },
      Combination: {
        type: "object",
        required: ["name", "mainMaterialId"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mainMaterialId: { type: "string", description: "Main material ID" },
          connectMaterialIds: {
            type: "array",
            items: { type: "string" },
            description: "Connect materials (multiple)",
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/overview": {
      get: {
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        summary: "Entity counts for data management dashboard",
        responses: { "200": { description: "Counts" } },
      },
    },
    "/admin/tables": {
      get: {
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        summary: "List PostgreSQL tables and row counts",
        responses: { "200": { description: "Tables" } },
      },
    },
    "/admin/tables/{table}": {
      get: {
        tags: ["Admin"],
        security: [{ bearerAuth: [] }],
        summary: "Describe columns of a SQL table",
        parameters: [
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Columns" } },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register",
        responses: { "201": { description: "Created" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        responses: { "200": { description: "JWT" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        summary: "Current user profile",
        responses: { "200": { description: "Profile" } },
      },
    },
    "/auth/users": {
      get: {
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        summary: "List users",
        responses: { "200": { description: "Users" } },
      },
      post: {
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        summary: "Create user",
        responses: { "201": { description: "Created" } },
      },
    },
    "/auth/users/{id}": {
      get: {
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        summary: "Get user",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "User" } },
      },
      patch: {
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        summary: "Update user profile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["User"],
        security: [{ bearerAuth: [] }],
        summary: "Delete user",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/rooms": {
      get: {
        tags: ["Room"],
        security: [{ bearerAuth: [] }],
        summary: "List rooms",
        responses: { "200": { description: "Rooms" } },
      },
      post: {
        tags: ["Room"],
        security: [{ bearerAuth: [] }],
        summary: "Create room",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Room" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/rooms/{id}": {
      get: {
        tags: ["Room"],
        security: [{ bearerAuth: [] }],
        summary: "Get room",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Room" } },
      },
      patch: {
        tags: ["Room"],
        security: [{ bearerAuth: [] }],
        summary: "Update room",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Room"],
        security: [{ bearerAuth: [] }],
        summary: "Delete room",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/campaigns": {
      get: {
        tags: ["Campaign"],
        security: [{ bearerAuth: [] }],
        summary: "List campaigns",
        responses: { "200": { description: "Campaigns" } },
      },
      post: {
        tags: ["Campaign"],
        security: [{ bearerAuth: [] }],
        summary: "Create campaign",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Campaign" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/campaigns/{id}": {
      get: {
        tags: ["Campaign"],
        security: [{ bearerAuth: [] }],
        summary: "Get campaign",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Campaign" } },
      },
      patch: {
        tags: ["Campaign"],
        security: [{ bearerAuth: [] }],
        summary: "Update campaign",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Campaign"],
        security: [{ bearerAuth: [] }],
        summary: "Delete campaign",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/characters": {
      get: {
        tags: ["Character"],
        security: [{ bearerAuth: [] }],
        summary: "List characters",
        responses: { "200": { description: "Characters" } },
      },
      post: {
        tags: ["Character"],
        security: [{ bearerAuth: [] }],
        summary: "Create character",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Character" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/characters/{id}": {
      get: {
        tags: ["Character"],
        security: [{ bearerAuth: [] }],
        summary: "Get character",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Character" } },
      },
      patch: {
        tags: ["Character"],
        security: [{ bearerAuth: [] }],
        summary: "Update character",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Character"],
        security: [{ bearerAuth: [] }],
        summary: "Delete character",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/tags": {
      get: {
        tags: ["Tag"],
        security: [{ bearerAuth: [] }],
        summary: "List tags",
        responses: { "200": { description: "Tags" } },
      },
      post: {
        tags: ["Tag"],
        security: [{ bearerAuth: [] }],
        summary: "Create tag",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Tag" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/tags/{id}": {
      get: {
        tags: ["Tag"],
        security: [{ bearerAuth: [] }],
        summary: "Get tag",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Tag" } },
      },
      patch: {
        tags: ["Tag"],
        security: [{ bearerAuth: [] }],
        summary: "Update tag",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Tag"],
        security: [{ bearerAuth: [] }],
        summary: "Delete tag",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/materials": {
      get: {
        tags: ["Material"],
        security: [{ bearerAuth: [] }],
        summary: "List materials (filter by type, campaignId, tagId)",
        responses: { "200": { description: "Materials" } },
      },
      post: {
        tags: ["Material"],
        security: [{ bearerAuth: [] }],
        summary: "Create material slide (IMAGE / EFFECT / SOUND)",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Material" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/materials/{id}": {
      get: {
        tags: ["Material"],
        security: [{ bearerAuth: [] }],
        summary: "Get material",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Material" } },
      },
      patch: {
        tags: ["Material"],
        security: [{ bearerAuth: [] }],
        summary: "Update material (incl. campaign presets & tags)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Material"],
        security: [{ bearerAuth: [] }],
        summary: "Delete material",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/combinations": {
      get: {
        tags: ["Combination"],
        security: [{ bearerAuth: [] }],
        summary: "List combinations",
        responses: { "200": { description: "Combinations" } },
      },
      post: {
        tags: ["Combination"],
        security: [{ bearerAuth: [] }],
        summary: "Create combination (main + connect materials)",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Combination" } } },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/combinations/{id}": {
      get: {
        tags: ["Combination"],
        security: [{ bearerAuth: [] }],
        summary: "Get combination",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Combination" } },
      },
      patch: {
        tags: ["Combination"],
        security: [{ bearerAuth: [] }],
        summary: "Update combination",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Combination"],
        security: [{ bearerAuth: [] }],
        summary: "Delete combination",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/uploads/image": {
      post: {
        tags: ["Uploads"],
        security: [{ bearerAuth: [] }],
        summary: "Upload image (local or optional S3)",
        responses: { "201": { description: "Uploaded" } },
      },
    },
  },
  tags: [
    { name: "System" },
    { name: "Admin" },
    { name: "Auth" },
    { name: "User" },
    { name: "Room" },
    { name: "Campaign" },
    { name: "Character" },
    { name: "Tag" },
    { name: "Material" },
    { name: "Combination" },
    { name: "Uploads" },
    {
      name: "Socket.IO",
      description:
        "Auth via `auth.token`. Events: `room:join`, `room:leave`, `chat:message`, `dice:roll`, `material:play`.",
    },
  ],
} as const;

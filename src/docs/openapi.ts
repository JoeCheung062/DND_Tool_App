export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "DND App API",
    version: "1.0.0",
    description:
      "Express + Prisma + JWT API for DND_APP. Realtime features are available via Socket.IO at `/socket.io` (JWT in `auth.token`).",
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
      RegisterBody: {
        type: "object",
        required: ["email", "username", "password"],
        properties: {
          email: { type: "string", format: "email" },
          username: { type: "string", minLength: 3, maxLength: 32 },
          password: { type: "string", minLength: 8 },
        },
      },
      LoginBody: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      CampaignBody: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
      CharacterBody: {
        type: "object",
        required: ["name", "className"],
        properties: {
          name: { type: "string" },
          className: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 20 },
          race: { type: "string" },
          avatarUrl: { type: "string", format: "uri" },
          campaignId: { type: "string" },
          stats: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": { description: "Service is healthy" },
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterBody" },
            },
          },
        },
        responses: {
          "201": { description: "User created with JWT" },
          "409": { description: "Email or username taken" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and receive JWT",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginBody" },
            },
          },
        },
        responses: {
          "200": { description: "JWT issued" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user profile",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Profile" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/campaigns": {
      get: {
        tags: ["Campaigns"],
        summary: "List campaigns for current user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Campaign list" } },
      },
      post: {
        tags: ["Campaigns"],
        summary: "Create a campaign",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CampaignBody" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/campaigns/{id}": {
      get: {
        tags: ["Campaigns"],
        summary: "Get campaign details",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Campaign" },
          "404": { description: "Not found" },
        },
      },
      patch: {
        tags: ["Campaigns"],
        summary: "Update owned campaign",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Updated" } },
      },
    },
    "/campaigns/characters": {
      post: {
        tags: ["Characters"],
        summary: "Create a character",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CharacterBody" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/campaigns/characters/mine": {
      get: {
        tags: ["Characters"],
        summary: "List my characters",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Characters" } },
      },
    },
    "/uploads/storage": {
      get: {
        tags: ["Uploads"],
        summary: "Show active storage mode (local or s3)",
        responses: { "200": { description: "Storage info" } },
      },
    },
    "/uploads/image": {
      post: {
        tags: ["Uploads"],
        summary: "Upload an image (local disk, or S3 when configured)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Upload created" },
          "400": { description: "Invalid file" },
        },
      },
    },
  },
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Campaigns" },
    { name: "Characters" },
    { name: "Uploads" },
    {
      name: "Socket.IO",
      description:
        "Connect with `io(url, { auth: { token } })`. Events: `campaign:join`, `campaign:leave`, `chat:message`, `dice:roll`, `session:update`. Server emits `connected`, `campaign:presence`, `chat:message`, `dice:result`, `session:update`.",
    },
  ],
} as const;

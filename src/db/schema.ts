import { pgTable, text, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Atelier schema. Phase 1 carries the auth tables plus the model registry and
 * usage ledger foundations so later phases extend rather than rework.
 *
 * Conventions: snake_case columns, uuid primary keys with defaults generated in
 * the database, created_at always, and enums as pg enums so the database itself
 * rejects invalid states.
 */

export const providers = ["anthropic", "openai", "google", "mock"] as const;
export const modalities = ["text", "image", "video", "embedding"] as const;

export const providerEnum = pgEnum("provider", providers);
export const modalityEnum = pgEnum("modality", modalities);
export const usageKindEnum = pgEnum("usage_kind", ["text", "image", "video", "embedding"]);

// ---------------------------------------------------------------------------
// Auth (better-auth owns these tables; shape follows its drizzle adapter)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  issuer: text("issuer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Model registry: models are rows, not code (phase 2 fills this out; the table
// lands now so migrations stay additive)
// ---------------------------------------------------------------------------

export const models = pgTable("models", {
  id: text("id").primaryKey(), // slug, e.g. "openai/gpt-image-1"
  displayName: text("display_name").notNull(),
  provider: providerEnum("provider").notNull(),
  modality: modalityEnum("modality").notNull(),
  modelName: text("model_name").notNull(), // the provider API's model identifier
  capabilities: jsonb("capabilities").notNull().default(sql`'[]'::jsonb`),
  contextWindow: integer("context_window"),
  enabled: boolean("enabled").notNull().default(true),
  isMock: boolean("is_mock").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelPrices = pgTable(
  "model_prices",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    inputPerMtok: numeric("input_per_mtok", { precision: 12, scale: 6 }),
    outputPerMtok: numeric("output_per_mtok", { precision: 12, scale: 6 }),
    perImage: numeric("per_image", { precision: 12, scale: 6 }),
    perVideoSecond: numeric("per_video_second", { precision: 12, scale: 6 }),
  },
  // One price row per model per effective instant: repricing is append-only,
  // and the seed's fixed effective dates make re-runs no-ops.
  (table) => [uniqueIndex("model_prices_model_effective_idx").on(table.modelId, table.effectiveFrom)],
);

// ---------------------------------------------------------------------------
// Chat (phase 3): conversations with lossless UIMessage parts persistence
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    parts: jsonb("parts").notNull(), // UIMessage parts, stored losslessly
    modelId: text("model_id").references(() => models.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Usage ledger: append-only, every row pins the price it was charged at
// ---------------------------------------------------------------------------

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    priceId: text("price_id").references(() => modelPrices.id),
    kind: usageKindEnum("kind").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    imageCount: integer("image_count").notNull().default(0),
    videoSeconds: numeric("video_seconds", { precision: 10, scale: 2 }).notNull().default("0"),
    cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("usage_events_user_created_idx").on(table.userId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Budget: one row per user, enforced before every provider call (phase 4)
// ---------------------------------------------------------------------------

export const budgetSettings = pgTable("budget_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  dailyCapUsd: numeric("daily_cap_usd", { precision: 10, scale: 2 }).notNull().default("5"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Files and attachments (phase 5): uploads live in blob storage, extracted
// text lives on the row, and attachments bind files to chat turns with an
// explicit mode (context now, retrieval in phase 6)
// ---------------------------------------------------------------------------

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    kind: text("kind").notNull(), // image | document
    extractedText: text("extracted_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("files_user_idx").on(table.userId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    mode: text("mode").notNull().default("context"), // context | retrieval
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("attachments_conversation_idx").on(table.conversationId)],
);

// ---------------------------------------------------------------------------
// Retrieval (phase 6): document chunks with pgvector embeddings. Full-text
// search runs against the chunk text directly at query time; exact scan is
// honest at portfolio scale, and an index is a migration away past ~50k chunks
// ---------------------------------------------------------------------------

export const fileChunks = pgTable(
  "file_chunks",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    content: text("content").notNull(),
    charCount: integer("char_count").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("file_chunks_file_idx").on(table.fileId, table.ord)],
);

// ---------------------------------------------------------------------------
// The passes studio (phase 7): projects hold passes, passes emit assets,
// references point at specific assets. Append-only regenerate: superseded
// assets stay for history and comparison; is_active marks the current set.
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled project"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_user_idx").on(table.userId, table.updatedAt)],
);

export const passKinds = ["generate", "inpaint", "outpaint", "upscale"] as const;
export const passKindEnum = pgEnum("pass_kind", passKinds);
export const passStatuses = ["draft", "running", "completed", "failed"] as const;
export const passStatusEnum = pgEnum("pass_status", passStatuses);

export const passes = pgTable(
  "passes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: passKindEnum("kind").notNull().default("generate"),
    status: passStatusEnum("status").notNull().default("draft"),
    prompt: text("prompt").notNull().default(""),
    modelId: text("model_id").references(() => models.id),
    batchSize: integer("batch_size").notNull().default(1),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("passes_project_seq_idx").on(table.projectId, table.seq)],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    passId: text("pass_id")
      .notNull()
      .references(() => passes.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull().default("image/png"),
    width: integer("width"),
    height: integer("height"),
    seed: integer("seed"),
    isActive: boolean("is_active").notNull().default(true),
    reviewStatus: text("review_status").notNull().default("pending"), // pending | approved | rejected
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assets_pass_idx").on(table.passId, table.createdAt)],
);

export const assetReferences = pgTable(
  "asset_references",
  {
    id: text("id").primaryKey(),
    passId: text("pass_id")
      .notNull()
      .references(() => passes.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // base | style
  },
  (table) => [uniqueIndex("asset_references_pass_asset_role_idx").on(table.passId, table.assetId, table.role)],
);

// ---------------------------------------------------------------------------
// Activity and exports (phase 9): the project's append-only story. Exports are
// log records, never passes or assets; activity records every run, decision,
// and export with enough detail to reconstruct the work afterward.
// ---------------------------------------------------------------------------

export const exports = pgTable(
  "exports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // png | jpeg | webp
    storageKey: text("storage_key").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("exports_project_idx").on(table.projectId, table.createdAt)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // operator | system
    action: text("action").notNull(), // pass.run | tool.upscale | export | review | ...
    detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activity_project_idx").on(table.projectId, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Video (phase 10): jobs behind a provider port with a zero-key mock adapter.
// Videos are project-level capabilities, not passes: the job row carries the
// prompt, optional first frame, provider bookkeeping, and the stored result.
// ---------------------------------------------------------------------------

export const videoJobs = pgTable(
  "video_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelId: text("model_id").references(() => models.id),
    prompt: text("prompt").notNull(),
    seconds: integer("seconds").notNull().default(4),
    firstFrameAssetId: text("first_frame_asset_id").references(() => assets.id),
    externalId: text("external_id"),
    status: text("status").notNull().default("running"), // running | completed | failed
    error: text("error"),
    storageKey: text("storage_key"),
    bytes: integer("bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("video_jobs_project_idx").on(table.projectId, table.createdAt)],
);

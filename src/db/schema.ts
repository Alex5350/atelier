import { pgTable, text, timestamp, integer, boolean, numeric, jsonb, index } from "drizzle-orm/pg-core";
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

export const modelPrices = pgTable("model_prices", {
  id: text("id").primaryKey(),
  modelId: text("model_id")
    .notNull()
    .references(() => models.id, { onDelete: "cascade" }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  inputPerMtok: numeric("input_per_mtok", { precision: 12, scale: 6 }),
  outputPerMtok: numeric("output_per_mtok", { precision: 12, scale: 6 }),
  perImage: numeric("per_image", { precision: 12, scale: 6 }),
  perVideoSecond: numeric("per_video_second", { precision: 12, scale: 6 }),
});

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

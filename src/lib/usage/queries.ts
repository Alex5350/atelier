import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeCost, priceEffectiveAt, type PriceRow } from "@/lib/models/registry";

/**
 * The usage ledger's server side: append-only writes that pin the price row in
 * effect when the call ran, and the aggregates the dashboard reads. Cost is an
 * estimate computed from registry prices, never a billing truth.
 */

export async function writeUsageEvent(input: {
  userId: string;
  modelId: string;
  kind: "text" | "image" | "video" | "embedding";
  inputTokens: number;
  outputTokens: number;
  imageCount?: number;
  videoSeconds?: number;
  conversationId?: string;
}): Promise<number> {
  const prices: PriceRow[] = (
    await db.select().from(schema.modelPrices).where(eq(schema.modelPrices.modelId, input.modelId))
  ).map((row) => ({
    modelId: row.modelId,
    effectiveFrom: row.effectiveFrom,
    inputPerMtok: row.inputPerMtok,
    outputPerMtok: row.outputPerMtok,
    perImage: row.perImage,
    perVideoSecond: row.perVideoSecond,
  }));
  const price = priceEffectiveAt(prices, new Date());

  const cost =
    input.kind === "image"
      ? price
        ? computeCost(price, { kind: "image", imageCount: input.imageCount ?? 1 })
        : 0
      : price
        ? computeCost(price, { kind: "text", inputTokens: input.inputTokens, outputTokens: input.outputTokens })
        : 0;

  await db.insert(schema.usageEvents).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    modelId: input.modelId,
    priceId: price ? await priceRowId(price) : null,
    kind: input.kind,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    imageCount: input.imageCount ?? 0,
    videoSeconds: String(input.videoSeconds ?? 0),
    cost: cost.toFixed(6),
    conversationId: input.conversationId ?? null,
  });
  return cost;
}

async function priceRowId(price: PriceRow): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.modelPrices.id })
    .from(schema.modelPrices)
    .where(
      and(
        eq(schema.modelPrices.modelId, price.modelId),
        eq(schema.modelPrices.effectiveFrom, price.effectiveFrom),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function spendTodayUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text` })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        gte(schema.usageEvents.createdAt, sql`date_trunc('day', now())`),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function budgetCapUsd(userId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(schema.budgetSettings)
    .where(eq(schema.budgetSettings.userId, userId))
    .limit(1);
  return row ? Number(row.dailyCapUsd) : 5;
}

export async function setBudgetCapUsd(userId: string, capUsd: number) {
  await db
    .insert(schema.budgetSettings)
    .values({ userId, dailyCapUsd: capUsd.toFixed(2) })
    .onConflictDoUpdate({
      target: schema.budgetSettings.userId,
      set: { dailyCapUsd: capUsd.toFixed(2), updatedAt: new Date() },
    });
}

export async function spendByModelToday(userId: string) {
  return db
    .select({
      modelId: schema.usageEvents.modelId,
      displayName: schema.models.displayName,
      isMock: schema.models.isMock,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageEvents.outputTokens}), 0)::int`,
      cost: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text`,
    })
    .from(schema.usageEvents)
    .innerJoin(schema.models, eq(schema.models.id, schema.usageEvents.modelId))
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        gte(schema.usageEvents.createdAt, sql`date_trunc('day', now())`),
      ),
    )
    .groupBy(schema.usageEvents.modelId, schema.models.displayName, schema.models.isMock)
    .orderBy(desc(sql`sum(${schema.usageEvents.cost})`));
}

export async function recentUsageEvents(userId: string, limit = 20) {
  return db
    .select({
      id: schema.usageEvents.id,
      modelId: schema.usageEvents.modelId,
      displayName: schema.models.displayName,
      isMock: schema.models.isMock,
      kind: schema.usageEvents.kind,
      inputTokens: schema.usageEvents.inputTokens,
      outputTokens: schema.usageEvents.outputTokens,
      cost: schema.usageEvents.cost,
      createdAt: schema.usageEvents.createdAt,
    })
    .from(schema.usageEvents)
    .innerJoin(schema.models, eq(schema.models.id, schema.usageEvents.modelId))
    .where(eq(schema.usageEvents.userId, userId))
    .orderBy(desc(schema.usageEvents.createdAt))
    .limit(limit);
}

export async function spendLast7DaysUsd(userId: string): Promise<Array<{ day: string; cost: number }>> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${schema.usageEvents.createdAt}), 'YYYY-MM-DD')`,
      cost: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text`,
    })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        gte(schema.usageEvents.createdAt, sql`date_trunc('day', now()) - interval '7 days'`),
      ),
    )
    .groupBy(sql`date_trunc('day', ${schema.usageEvents.createdAt})`)
    .orderBy(sql`date_trunc('day', ${schema.usageEvents.createdAt})`);
  return rows.map((row) => ({ day: row.day, cost: Number(row.cost) }));
}

export async function spendByConversationToday(userId: string) {
  return db
    .select({
      conversationId: schema.usageEvents.conversationId,
      cost: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text`,
      calls: sql<number>`count(*)::int`,
    })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        gte(schema.usageEvents.createdAt, sql`date_trunc('day', now())`),
        sql`${schema.usageEvents.conversationId} is not null`,
      ),
    )
    .groupBy(schema.usageEvents.conversationId)
    .orderBy(desc(sql`sum(${schema.usageEvents.cost})`))
    .limit(6);
}

export async function conversationTitles(ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, string>();
  }
  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title })
    .from(schema.conversations)
    .where(inArray(schema.conversations.id, ids));
  return new Map(rows.map((row) => [row.id, row.title]));
}

export async function spendLast30DaysUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text` })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        gte(schema.usageEvents.createdAt, sql`now() - interval '30 days'`),
      ),
    );
  return Number(row?.total ?? 0);
}

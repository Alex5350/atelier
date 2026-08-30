import "dotenv/config";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { seedModels } from "./seed-models";

/**
 * Seeds the single operator account and its budget row from the environment.
 * Idempotent: re-running with the same email is a no-op. Demo credentials by
 * default (see .env.example); a real deployment sets real ones.
 *
 *   bun run db:seed
 */
async function main() {
  const email = (process.env.ATELIER_ADMIN_EMAIL ?? "alex@atelier.local").toLowerCase();
  const password = process.env.ATELIER_ADMIN_PASSWORD ?? "atelier-demo";
  const name = process.env.ATELIER_ADMIN_NAME ?? "Alex";

  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  const existingAccount = existing.length
    ? await db.select().from(schema.account).where(eq(schema.account.userId, existing[0].id)).limit(1)
    : [];

  if (existing.length > 0 && existingAccount.length === 0) {
    // Partial state from an interrupted seed (user row without a credential
    // account): remove and rebuild rather than leaving an unusable login.
    await db.delete(schema.user).where(eq(schema.user.id, existing[0].id));
    console.log(`removed partial user ${email} (no credential account); recreating`);
  }

  if (existingAccount.length === 0) {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
    console.log(`seeded operator ${email}`);
  } else {
    console.log(`operator ${email} already exists`);
  }

  const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  await db.insert(schema.budgetSettings).values({ userId: user.id }).onConflictDoNothing();
  await seedModels();
  console.log("budget row ensured; seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("seed failed:", error);
    process.exit(1);
  });

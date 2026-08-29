import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db";
import { nextCookies } from "better-auth/next-js";

/**
 * Single-operator auth: email and password, sessions in Postgres. The account
 * is seeded from the environment on first boot (src/db/seed.ts); there is no
 * public sign-up surface by design.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

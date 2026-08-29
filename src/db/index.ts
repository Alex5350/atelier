import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * One postgres.js client per process; server-only (never imported from client
 * components). Connection failures surface loudly at first use rather than at
 * boot so the app container can start before the database in compose setups.
 */
const client = postgres(process.env.DATABASE_URL ?? "postgres://atelier:atelier-dev@localhost:5433/atelier", {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };

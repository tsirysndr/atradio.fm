import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../env";
import * as schema from "./schema";

// TLS only when the URL asks for it (Xata uses `?sslmode=require`; local
// docker Postgres has no TLS).
const sql = postgres(env.DATABASE_URL, {
  max: 5,
  ssl: /sslmode=require/i.test(env.DATABASE_URL) ? "require" : undefined,
});

export const db = drizzle(sql, { schema });
export { schema, sql };

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../env";
import * as schema from "./schema";

/** Xata/Postgres requires TLS (`sslmode=require`). */
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 5 });

export const db = drizzle(sql, { schema });
export { schema, sql };

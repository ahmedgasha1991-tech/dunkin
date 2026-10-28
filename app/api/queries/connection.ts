import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;
let client: ReturnType<typeof postgres>;

export function getDb() {
  if (!instance) {
    client = postgres(env.databaseUrl, {
      prepare: false,
      connect_timeout: 3,
      idle_timeout: 10,
    });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}

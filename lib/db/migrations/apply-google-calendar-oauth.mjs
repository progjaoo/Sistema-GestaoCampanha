import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "Set DATABASE_URL to a direct Neon connection before applying this migration.",
  );
}

const databaseUrl = new URL(connectionString);
if (databaseUrl.hostname.includes("-pooler.")) {
  throw new Error("Use the direct (unpooled) Neon connection for migrations.");
}

const sql = await readFile(
  new URL("./20260918_google_calendar_oauth.sql", import.meta.url),
  "utf8",
);
const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
  process.stdout.write("Google Calendar OAuth schema applied successfully.\n");
} finally {
  await pool.end();
}

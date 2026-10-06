// Applies db/schema.sql to DATABASE_URL. Every statement in it is safe to run
// again, so this is run before each production build: a deploy never lands on
// a database missing a column its code reads. Without a database (previews,
// local work with none set up) there is nothing to apply.
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("db: no DATABASE_URL, skipping schema");
  process.exit(0);
}

// The transaction pooler, as the app uses: no prepared statements.
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(await readFile(new URL("schema.sql", import.meta.url), "utf8")).simple();
  console.log("db: schema applied");
} finally {
  await sql.end();
}

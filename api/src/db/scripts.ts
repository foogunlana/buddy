// Database helpers for local development.
//   npm run db:migrate   apply migrations in api/drizzle/
//   npm run db:seed      create a demo programme and print a giver chat link
import { existsSync } from "node:fs";
import { connect, migrate } from "./client.js";
import { seedDemo } from "./seed.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const command = process.argv[2];
if (command === "migrate") {
  await migrate();
  console.log("Migrations applied.");
} else if (command === "seed") {
  const db = await connect();
  const id = await seedDemo(db);
  console.log(`Sam's chat about Alex: http://localhost:5173/chat/${id}`);
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
} else {
  console.error("Usage: tsx src/db/scripts.ts migrate|seed");
  process.exit(1);
}

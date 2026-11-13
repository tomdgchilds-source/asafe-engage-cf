/**
 * Seeds `global_offices` from shared/offices.ts (the single source for every
 * office; see that file). Upserts by id, so it is safe to re-run and brings
 * an existing row back in line with its record.
 *
 *   DATABASE_URL=... npx tsx scripts/seedOffices.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { globalOffices } from "../shared/schema";
import { A_SAFE_OFFICES, officeRowValues } from "../shared/offices";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  console.log("Seeding global offices...");

  for (const office of A_SAFE_OFFICES) {
    const { id, ...values } = officeRowValues(office);
    const [saved] = await db
      .insert(globalOffices)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: globalOffices.id, set: { ...values, updatedAt: new Date() } })
      .returning({ id: globalOffices.id, companyName: globalOffices.companyName });
    console.log(`  Saved: ${saved.companyName} (${saved.id})`);
  }

  console.log(`\nDone! Seeded ${A_SAFE_OFFICES.length} offices.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

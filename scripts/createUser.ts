import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [, , email, password, firstName, lastName] = process.argv;
  if (!email || !password) {
    console.error(
      "Usage: DATABASE_URL=... npx tsx scripts/createUser.ts <email> <password> [firstName] [lastName]"
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  const normalized = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized));

  if (existing) {
    console.error(`User ${normalized} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      email: normalized,
      passwordHash,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role: "customer",
      profileCompleted: false,
      mustCompleteProfile: true,
    })
    .returning({ id: users.id, email: users.email });

  console.log(`Created: ${user.email} (${user.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

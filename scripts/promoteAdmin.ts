import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users, adminUsers } from "../shared/schema";
import { eq, or } from "drizzle-orm";

// Promote an existing user to admin.
//
// Sets `users.role = 'admin'` and upserts a matching `admin_users` row so
// both the homepage login and the dedicated /admin/login form work.
// The admin_users password hash mirrors the users row, so the operator
// signs in to either with the same password (username = email).
//
// Replaces the removed GET /api/admin/promote-user and
// GET /api/bootstrap-admin endpoints (2026-09-11).

async function main() {
  const [, , email] = process.argv;
  if (!email) {
    console.error(
      "Usage: DATABASE_URL=... npx tsx scripts/promoteAdmin.ts <email>"
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
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, normalized));

  if (!user) {
    console.error(
      `User ${normalized} not found. Create it first with scripts/createUser.ts.`
    );
    process.exit(1);
  }

  if (user.role !== "admin") {
    await db
      .update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(users.id, user.id));
    console.log(`users: ${normalized} role ${user.role} -> admin`);
  } else {
    console.log(`users: ${normalized} already admin`);
  }

  // admin_users.password_hash is NOT NULL. Mirror the users hash when
  // present; OAuth-only users get an unguessable placeholder so
  // /admin/login stays closed for them until a password is set.
  let passwordHash = user.passwordHash;
  if (!passwordHash) {
    passwordHash = await bcrypt.hash(crypto.randomUUID(), 12);
    console.warn(
      `warning: ${normalized} has no password; /admin/login will not work for this account until one is set.`
    );
  }
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Admin User";

  // Username defaults to the email. Match on either column (both are
  // UNIQUE) so a re-run is idempotent whichever one was set first.
  const [existingAdmin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(or(eq(adminUsers.email, normalized), eq(adminUsers.username, normalized)));

  if (existingAdmin) {
    await db
      .update(adminUsers)
      .set({
        username: normalized,
        email: normalized,
        passwordHash,
        fullName,
        role: "admin",
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, existingAdmin.id));
    console.log(`admin_users: updated ${normalized}`);
  } else {
    await db.insert(adminUsers).values({
      username: normalized,
      email: normalized,
      passwordHash,
      fullName,
      role: "admin",
      isActive: true,
    });
    console.log(`admin_users: created ${normalized}`);
  }

  console.log(`Promoted: ${normalized} (${user.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

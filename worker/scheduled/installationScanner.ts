/**
 * Daily overdue-installation scanner.
 *
 * Flags any phase whose endDate has passed while still in not_started
 * or in_progress as "delayed", then emails the install's creator (and
 * ADMIN_NOTIFICATION_EMAILS) with a digest. Triggered by the cron
 * `0 6 * * *` in wrangler.toml (06:00 UTC daily).
 *
 * Idempotent: a phase that's already marked delayed isn't re-flagged,
 * and the summary email is only sent when at least one phase has been
 * newly flagged on this pass.
 */

import { and, eq, inArray, lt, or } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { Env } from "../types";
import { sendEmail } from "../services/email";
import * as schema from "../../shared/schema";

const { installations, installationPhases } = schema;

export async function scanOverdueInstallations(env: Env): Promise<void> {
  if (!env.DATABASE_URL) {
    console.warn("[installs/overdue] DATABASE_URL missing — skipping scan");
    return;
  }

  const sqlClient = neon(env.DATABASE_URL);
  const db = drizzle(sqlClient, { schema });
  const now = new Date();

  console.log(`[installs/overdue] starting scan at ${now.toISOString()}`);

  // Find phases with endDate < now and status in (not_started, in_progress)
  const stalePhases = await db
    .select()
    .from(installationPhases)
    .where(
      and(
        lt(installationPhases.endDate, now),
        or(
          eq(installationPhases.status, "not_started"),
          eq(installationPhases.status, "in_progress"),
        ),
      ),
    );

  if (stalePhases.length === 0) {
    console.log("[installs/overdue] no overdue phases");
    return;
  }

  // Flip to delayed in one batch
  await db
    .update(installationPhases)
    .set({ status: "delayed", updatedAt: new Date() })
    .where(
      inArray(
        installationPhases.id,
        stalePhases.map((p) => p.id),
      ),
    );

  // Group by installation for the digest
  const byInstall = new Map<string, typeof stalePhases>();
  for (const p of stalePhases) {
    const arr = byInstall.get(p.installationId) || [];
    arr.push(p);
    byInstall.set(p.installationId, arr);
  }

  const installIds = Array.from(byInstall.keys());
  const installRows = await db
    .select()
    .from(installations)
    .where(inArray(installations.id, installIds));
  const installById = new Map(installRows.map((r) => [r.id, r]));

  const adminRecipients = (env.ADMIN_NOTIFICATION_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let sent = 0;
  for (const [installId, phases] of Array.from(byInstall.entries())) {
    const install = installById.get(installId);
    if (!install) continue;

    const rows = phases
      .map(
        (p: typeof phases[number]) =>
          `<tr><td style="padding:6px;border:1px solid #ddd;">${escapeHtml(
            p.name,
          )}</td><td style="padding:6px;border:1px solid #ddd;">${
            p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : "—"
          }</td></tr>`,
      )
      .join("");

    const html = `
<h2 style="color:#111">Installation phases are overdue</h2>
<p><strong>${escapeHtml(install.title)}</strong>${
      install.customerName ? ` — ${escapeHtml(install.customerName)}` : ""
    }</p>
<p>${phases.length} phase${phases.length === 1 ? "" : "s"} past their planned end date have been flagged as <em>delayed</em>.</p>
<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
  <thead>
    <tr style="background:#f5f5f5;">
      <th style="padding:6px;border:1px solid #ddd;text-align:left;">Phase</th>
      <th style="padding:6px;border:1px solid #ddd;text-align:left;">Planned end</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin-top:16px;"><a href="${
      env.APP_URL || ""
    }/installation-timeline">Open installation timeline</a></p>
`;

    const recipients = new Set<string>([...adminRecipients]);
    if (install.contactEmail) recipients.add(install.contactEmail);

    for (const to of Array.from(recipients)) {
      try {
        await sendEmail(env, to, `Installation delayed — ${install.title}`, html);
        sent += 1;
      } catch (err) {
        console.error(`[installs/overdue] email to ${to} failed:`, err);
      }
    }
  }

  console.log(
    `[installs/overdue] flagged ${stalePhases.length} phase(s) across ${installIds.length} installation(s); sent ${sent} email(s)`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

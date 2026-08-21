import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deletionState } from "@/lib/account-lifecycle";
import { readRestoreTicket } from "@/lib/restore-ticket";
import { RestoreClient } from "./restore-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "رجّع حسابك" };

/**
 * Where a refused sign-in lands.
 *
 * The account is real, the password was right, and nothing here is a session:
 * the ticket in the URL is the only thing saying which account this is, and it
 * was issued moments ago by the sign-in that refused to open one. Resolved on
 * the server so the screen can name the account without the client ever being
 * trusted to say who it is.
 */
export default async function RestorePage({ searchParams }: { searchParams: { t?: string } }) {
  const ticket = searchParams.t;
  const userId = await readRestoreTicket(ticket);
  // No ticket at all is not an error state worth a screen — it is someone who
  // typed the address, or came back to a stale tab. Send them to sign in.
  if (!userId) redirect("/login?error=restore_expired");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, avatarUrl: true, email: true, deletionRequestedAt: true }
  });
  if (!user) redirect("/login?error=restore_erased");

  // Restored from another tab in the meantime: there is nothing to offer, and
  // signing in now simply works.
  if (!user.deletionRequestedAt) redirect("/login?restored=1");

  const state = deletionState(user.deletionRequestedAt)!;

  return (
    <RestoreClient
      ticket={ticket!}
      name={user.name}
      avatarUrl={user.avatarUrl}
      emailHint={user.email ? maskEmail(user.email) : null}
      daysLeft={state.daysLeft}
      erasesAt={new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeZone: "UTC" }).format(state.erasesAt)}
    />
  );
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

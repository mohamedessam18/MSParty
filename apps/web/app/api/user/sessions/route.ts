import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { revokeAllSessions } from "@/lib/account-recovery";

export const dynamic = "force-dynamic";

/**
 * Ends every session of this account — including the one that asked, which is
 * the point: the browser making this request may not be the one to worry about,
 * and there is no way to tell them apart from here.
 */
export async function DELETE() {
  try {
    const user = await requireDbUser();
    await revokeAllSessions(user.id);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return authError(error);
  }
}

import { NextResponse } from "next/server";
import { GRACE_DAYS } from "./account-lifecycle";

/**
 * Turns the guard errors from lib/current-user into responses.
 *
 * The one that matters is PENDING_DELETION. It used to be swallowed into a bare
 * 401, which the client could only read as "you are signed out" — so an account
 * in its grace period looked like a broken app rather than an account that is
 * on its way out. It gets its own status and a `code` the client can switch on,
 * because there is a specific thing to offer: bring it back.
 */
export function authError(error: unknown) {
  const code = error instanceof Error ? error.message : "";

  if (code === "PENDING_DELETION") {
    return NextResponse.json(
      {
        code,
        message: `حسابك متجدول للحذف، ومخفي لحد ما يتمسح خلال ${GRACE_DAYS} يوم. رجّعه عشان تكمّل.`
      },
      { status: 403 }
    );
  }

  if (code === "FORBIDDEN") {
    return NextResponse.json({ code, message: "مش من حقك تعمل ده." }, { status: 403 });
  }

  return NextResponse.json({ code: "UNAUTHORIZED", message: "لازم تسجّل الدخول." }, { status: 401 });
}

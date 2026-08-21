import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, googleEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";

/**
 * Showing a sign-in form to someone who is already signed in reads as a session
 * that was silently lost. Send them where they were going instead.
 */
export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as { id?: string } | undefined)?.id) {
    const next = searchParams.next;
    // Same-origin only: a crafted ?next= must not bounce anyone off the site.
    redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  }
  return <LoginForm googleEnabled={googleEnabled} />;
}

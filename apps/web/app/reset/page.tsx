import { ResetForm } from "./reset-form";

export const metadata = { title: "كلمة مرور جديدة" };
export const dynamic = "force-dynamic";

/**
 * The token stays in the URL and is never resolved here: this page has nothing
 * to show about the account, so looking it up would only put a name on screen
 * for whoever is holding the link.
 */
export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetForm token={searchParams.token ?? ""} />;
}

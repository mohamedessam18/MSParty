import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { TvLinkClient } from "./link-client";

export const metadata = { title: "وصّل تليفزيون" };

export default async function TvLinkPage() {
  const session = await getServerSession(authOptions);
  if (!((session?.user as { id?: string } | undefined)?.id)) redirect("/login?next=/tv/link");
  return <TvLinkClient />;
}

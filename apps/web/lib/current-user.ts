import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
export async function requireUser() { const session = await getServerSession(authOptions); if (!session?.user?.email) throw new Error("UNAUTHORIZED"); return session.user; }

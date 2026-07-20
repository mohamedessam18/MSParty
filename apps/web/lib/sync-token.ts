import { SignJWT } from "jose";
export async function createSyncToken(user: { id: string; name: string }) { const secret = new TextEncoder().encode(process.env.SYNC_TOKEN_SECRET || process.env.NEXTAUTH_SECRET); return new SignJWT({ name: user.name }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("12h").sign(secret); }

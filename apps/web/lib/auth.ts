import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || "17cf1d3748766f64b349f9e711409363fda5f12c7a65d91514ff76edd37bbd00",
  session: { strategy: "jwt" }, pages: { signIn: "/login" },
  providers: [CredentialsProvider({ name: "Email and password", credentials: { email: {}, password: {} }, async authorize(credentials) {
    if (!credentials?.email || !credentials.password) return null;
    const cleanEmail = credentials.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user?.passwordHash || !(await bcrypt.compare(credentials.password, user.passwordHash))) return null;
    return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl };
  } })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
        session.user.image = token.picture as string | null;
      }
      return session;
    }
  }
};

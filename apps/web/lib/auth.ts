import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        try {
          const user = await prisma.user.findUnique({ where: { email: credentials.email.trim().toLowerCase() } });
          if (!user?.passwordHash) return null;
          if (!(await bcrypt.compare(credentials.password, user.passwordHash))) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl };
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      }
    }),
    // Joining a friend's watch party should not require inventing a password.
    // A guest is a real row with no email, so memberships, chat, and the queue
    // all work unchanged; it just cannot be signed into from another device.
    CredentialsProvider({
      id: "guest",
      name: "Guest",
      credentials: { name: {} },
      async authorize(credentials) {
        const name = credentials?.name?.trim().slice(0, 40);
        if (!name) return null;
        try {
          const user = await prisma.user.create({ data: { name, isGuest: true } });
          return { id: user.id, email: null, name: user.name, image: null };
        } catch (error) {
          console.error("Guest authorize error:", error);
          return null;
        }
      }
    })
  ],
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

import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";
import { rateLimit, releaseAttempt } from "./rate-limit";
import { resolveGoogleUser } from "./google-account";
import { issueRestoreTicket } from "./restore-ticket";
import { siteUrl } from "./site-url";

/**
 * Google is only offered when it is actually configured. An empty client id
 * would still render a button, and pressing it would land on Google's own error
 * page — a worse outcome than the button not being there.
 */
export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Sign-in attempts allowed from one address per window, and the window. */
const LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const GUEST_ACCOUNTS = 5;
const GUEST_WINDOW_SECONDS = 60 * 60;
/** How long a session may run before it has to prove it was not revoked. */
const REVALIDATE_SECONDS = 5 * 60;

/**
 * The address of whoever is signing in.
 *
 * `authorize` gets the raw request, not a NextRequest, so the header has to be
 * read by hand. Only the first entry of x-forwarded-for is trusted — the rest
 * are client-supplied, and treating those as identity would hand an attacker a
 * fresh limit on every attempt.
 */
function ipOf(req: { headers?: Record<string, string> | Headers } | undefined) {
  const headers = req?.headers;
  const raw =
    headers instanceof Headers
      ? headers.get("x-forwarded-for")
      : (headers as Record<string, string> | undefined)?.["x-forwarded-for"];
  return raw?.split(",")[0]?.trim() || "unknown";
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null;
        const email = credentials.email.trim().toLowerCase();

        // Two counters, because they stop different things: the address limit
        // stops one machine working through a password list, and the email
        // limit stops a spread-out attempt on one specific account.
        const ipKey = `login:ip:${ipOf(req)}`;
        const emailKey = `login:email:${email}`;
        const [byIp, byEmail] = await Promise.all([
          rateLimit(ipKey, LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS),
          rateLimit(emailKey, LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS)
        ]);
        if (!byIp.ok || !byEmail.ok) throw new Error("RATE_LIMITED");

        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user?.passwordHash) return null;
          if (!(await bcrypt.compare(credentials.password, user.passwordHash))) return null;

          // A correct password is not an attack, so it should not count against
          // the person who typed it — otherwise signing in on several devices
          // in one evening looks the same as guessing.
          await Promise.all([releaseAttempt(ipKey), releaseAttempt(emailKey)]);

          return { id: user.id, email: user.email, name: user.name, image: user.avatarUrl };
        } catch (error) {
          if (error instanceof Error && error.message === "RATE_LIMITED") throw error;
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
      credentials: { name: {}, party: {} },
      async authorize(credentials, req) {
        const name = credentials?.name?.trim().slice(0, 40);
        if (!name) return null;

        // A guest row is a real account created by an unauthenticated request,
        // which is the one place here where a stranger can write to the users
        // table. It is tied to a party that exists and capped per address, so
        // the door stays open for people with an invite and shut for a script.
        // Either form of the invite is accepted: the join-by-code screen has a
        // code, an invite link has the party's id, and neither should have to
        // resolve the other before a guest can type their name.
        const reference = credentials?.party?.trim();
        if (!reference) return null;
        const party = await prisma.party.findFirst({
          where: { OR: [{ code: reference.toUpperCase() }, { id: reference }] },
          select: { id: true }
        });
        if (!party) return null;

        const limit = await rateLimit(`guest:ip:${ipOf(req)}`, GUEST_ACCOUNTS, GUEST_WINDOW_SECONDS);
        if (!limit.ok) throw new Error("RATE_LIMITED");

        try {
          const user = await prisma.user.create({ data: { name, isGuest: true } });
          return { id: user.id, email: null, name: user.name, image: null };
        } catch (error) {
          console.error("Guest authorize error:", error);
          return null;
        }
      }
    }),
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Linking is done in signIn() against a verified address, so
            // next-auth's own blunt version of it stays off.
            allowDangerousEmailAccountLinking: false,
            authorization: { params: { prompt: "select_account" } }
          })
        ]
      : [])
  ],
  callbacks: {
    /**
     * The gate. Everything that decides whether a proven identity may actually
     * open a session lives here, once, for every provider — rather than in each
     * provider's authorize(), where Google has none to put it in.
     */
    async signIn({ user, account, profile }) {
      let userId = user.id;

      if (account?.provider === "google") {
        const resolved = await resolveGoogleUser(account, profile);
        if (!resolved.ok) return `${siteUrl()}/login?error=google_${resolved.reason}`;
        userId = resolved.userId;
      }

      const record = await prisma.user.findUnique({
        where: { id: userId },
        select: { deletionRequestedAt: true }
      });
      if (!record) return false;

      // An account in its grace period is genuinely gone, so no session is
      // opened for it. Returning a URL sends them to the one screen that account
      // is still allowed to reach — the offer to bring it back — carrying a
      // signed, short-lived ticket that says the sign-in itself succeeded.
      //
      // Absolute, and it has to be: next-auth's own client runs
      // `new URL(data.url)` on whatever this returns, with no base to resolve
      // against, so a path throws there and the refusal surfaces to the person
      // as "could not sign in" instead of as the offer to come back.
      if (record.deletionRequestedAt) {
        const ticket = encodeURIComponent(await issueRestoreTicket(userId));
        return `${siteUrl()}/account/restore?t=${ticket}`;
      }

      return true;
    },
    /**
     * Sessions here are JWTs, which cannot be recalled once handed out — so
     * "sign out everywhere" can only work by giving the token something to keep
     * matching. The account carries a version; the token carries the value it
     * was issued with; bumping the account's ends every token in existence.
     *
     * The check here runs on a timer, because this callback fires on every
     * session lookup and a query per lookup would put a round trip in front of
     * every page. That would leave a revoked session usable for the length of
     * the timer — so it is not what actually enforces revocation. requireDbUser
     * compares the same two numbers on every API request, using the row it was
     * already loading, which costs nothing and takes effect immediately. This
     * is the slower half: it eventually empties the cookie itself, so a revoked
     * browser stops looking signed in rather than merely failing at everything.
     */
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        // The id from Google is Google's, not ours. The link row written during
        // signIn is what maps one to the other, and it is the only thing that
        // may decide which account this session belongs to.
        const linked = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId
            }
          },
          select: { userId: true, user: { select: { name: true, avatarUrl: true } } }
        });
        if (!linked) return {};
        token.sub = linked.userId;
        token.name = linked.user.name;
        token.picture = linked.user.avatarUrl;
        // Falls through to the revocation stamp below rather than returning,
        // so a Google session is as revocable as a password one.

      } else if (user) {
        token.sub = user.id;
        token.picture = user.image;
      }

      if (token.sub) {
        const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
        const stale = Date.now() - checkedAt > REVALIDATE_SECONDS * 1000;
        if (user || stale) {
          const record = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { tokenVersion: true }
          });
          // The account is gone, or every session of it was ended. An empty
          // token has no sub, which the session callback reads as signed out.
          if (!record) return {};
          if (typeof token.version === "number" && token.version !== record.tokenVersion) return {};
          token.version = record.tokenVersion;
          token.checkedAt = Date.now();
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
        // Carried through so the guards can compare it against the account
        // without a query of their own — see requireDbUser in current-user.ts.
        (session.user as any).tokenVersion = token.version;
        session.user.image = token.picture as string | null;
      }
      return session;
    }
  }
};

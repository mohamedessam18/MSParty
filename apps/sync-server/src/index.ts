import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import { AbortMultipartUploadCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { jwtVerify } from "jose";
import { Server, Socket } from "socket.io";
import { normalisePlatformUrl, platformForUrl } from "./platforms";

const prisma = new PrismaClient();
const secret = new TextEncoder().encode(process.env.SYNC_TOKEN_SECRET || process.env.NEXTAUTH_SECRET);
const origin = process.env.SYNC_SERVER_ORIGIN || "http://localhost:3000";

const internalSecret = process.env.NEXTAUTH_SECRET || "";

const httpServer = createServer((request, response) => {
  cors({ origin })(request, response, () => {
    if (request.url === "/health") { response.statusCode = 200; response.end("ok"); return; }

    // The web app writes the notification, then asks us to hand it to whoever
    // is connected. Shared-secret authorised: this must never be callable from
    // a browser.
    if (request.url === "/internal/notify" && request.method === "POST") {
      if (!internalSecret || request.headers.authorization !== `Bearer ${internalSecret}`) {
        response.statusCode = 401;
        return response.end();
      }
      let body = "";
      request.on("data", chunk => { body += chunk; if (body.length > 64_000) request.destroy(); });
      request.on("end", () => {
        try {
          const { userId, notification } = JSON.parse(body);
          if (userId) io.to(userRoom(userId)).emit("notification", notification);
        } catch {}
        response.statusCode = 204;
        response.end();
      });
      return;
    }

    response.statusCode = 404;
    response.end();
  });
});
const io = new Server(httpServer, {
  cors: { origin, methods: ["GET", "POST"] },
  // Defaults take ~45s to notice a client that vanished without closing its
  // socket (a killed network, a slept phone). This halves that.
  pingInterval: 15000,
  pingTimeout: 10000
});

const roomFor = (partyId: string) => `party:${partyId}`;
const userRoom = (userId: string) => `user:${userId}`;
const voiceRoom = (partyId: string) => `voice:${partyId}`;

type PartySocket = Socket & {
  userId?: string;
  userName?: string;
  partyId?: string;
  lastChatAt?: number;
  lastReactionAt?: number;
};

/**
 * Who is actually connected, per party, with a socket count per person. This is
 * presence, not membership: PartyMember rows persist forever, so a list built
 * from the database shows everyone who ever joined as though they were still
 * in the room.
 */
type Present = { count: number; name: string; avatarUrl: string | null; role: string; isGuest: boolean };
const presence = new Map<string, Map<string, Present>>();

function publishPresence(partyId: string) {
  const party = presence.get(partyId);
  io.to(roomFor(partyId)).emit("party:presence", {
    members: party
      ? [...party.entries()].map(([id, entry]) => ({
          id,
          name: entry.name,
          avatarUrl: entry.avatarUrl,
          role: entry.role,
          isGuest: entry.isGuest
        }))
      : []
  });
}

function addPresence(partyId: string, userId: string, who: Omit<Present, "count">) {
  const party = presence.get(partyId) ?? new Map<string, Present>();
  presence.set(partyId, party);
  const existing = party.get(userId);
  // A second tab must not announce the person twice.
  party.set(userId, { ...who, count: (existing?.count ?? 0) + 1 });
  publishPresence(partyId);
}

function dropPresence(partyId: string, userId: string) {
  const party = presence.get(partyId);
  const existing = party?.get(userId);
  if (!party || !existing) return;
  // Closing one tab of several is not leaving.
  if (existing.count > 1) party.set(userId, { ...existing, count: existing.count - 1 });
  else party.delete(userId);
  if (!party.size) presence.delete(partyId);
  publishPresence(partyId);
}

function setPresenceRole(partyId: string, userId: string, role: string) {
  const entry = presence.get(partyId)?.get(userId);
  if (entry) entry.role = role;
}

/**
 * Presence across the whole site, not just inside one room. Friends need to
 * know you are around before there is a party to be in.
 */
type Online = { sockets: number; partyId: string | null; partyName: string | null; invisible: boolean };
const online = new Map<string, Online>();

/** Tells a user's friends what changed about them. */
async function publishOnline(userId: string) {
  const entry = online.get(userId);
  const friends = await prisma.friendship.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true }
  });
  const friendIds = friends.map(row => (row.requesterId === userId ? row.addresseeId : row.requesterId));
  // Invisible reads exactly like offline to everyone else; the difference is
  // only that this user still receives their own friends' updates.
  const payload = entry && !entry.invisible
    ? { userId, online: true, partyId: entry.partyId, partyName: entry.partyName }
    : { userId, online: false, partyId: null, partyName: null };
  for (const id of friendIds) io.to(userRoom(id)).emit("friend:presence", payload);
}

/** Cameras currently open per party, so the mesh cap can be enforced centrally. */
const cameras = new Map<string, Set<string>>();
const MAX_CAMERAS = 6;

/** Who in each party is still loading video, and since when. */
const buffering = new Map<string, Map<string, { name: string; since: number }>>();

/**
 * "Wait for everyone" lives here rather than in the host's tab. The server owns
 * isPlaying, so it can hold and release the room without depending on a
 * browser that may be backgrounded or offline.
 */
type Hold = { enabled: boolean; heldAt: number | null; ignoreUntil: number };
const holds = new Map<string, Hold>();
const holdFor = (partyId: string) => {
  const existing = holds.get(partyId);
  if (existing) return existing;
  const created: Hold = { enabled: false, heldAt: null, ignoreUntil: 0 };
  holds.set(partyId, created);
  return created;
};

// A blip shorter than this is not worth stopping a film for.
const STALL_GRACE = 2500;
// Nobody gets to hold the room hostage; a wedged client must not freeze it.
const MAX_HOLD = 20000;
// Players report buffering as a matter of course right after a seek or a
// content swap. Treating that as a stall made every host seek pause the room.
const IGNORE_AFTER_JUMP = 4000;

function stalledIn(partyId: string, now = Date.now()) {
  const party = buffering.get(partyId);
  if (!party) return [];
  return [...party.entries()]
    .filter(([, entry]) => now - entry.since >= STALL_GRACE)
    .map(([userId, entry]) => ({ userId, name: entry.name }));
}

function publishReadiness(partyId: string) {
  const party = buffering.get(partyId);
  io.to(roomFor(partyId)).emit("party:readiness", {
    buffering: party ? [...party.entries()].map(([userId, entry]) => ({ userId, name: entry.name })) : [],
    holding: !!holdFor(partyId).heldAt,
    waitForAll: holdFor(partyId).enabled
  });
}

function setBuffering(partyId: string, userId: string, name: string, isBuffering: boolean) {
  const party = buffering.get(partyId) ?? new Map<string, { name: string; since: number }>();
  buffering.set(partyId, party);
  const had = party.has(userId);
  // Keep the original `since` so a repeated report does not reset the grace timer.
  if (isBuffering && !had) party.set(userId, { name, since: Date.now() });
  if (!isBuffering) party.delete(userId);
  if (!party.size) buffering.delete(partyId);
  if (had !== isBuffering) publishReadiness(partyId);
}

/** Pauses while someone is genuinely stuck, and lets go on its own. */
async function evaluateHold(partyId: string) {
  const hold = holds.get(partyId);
  if (!hold?.enabled) return;
  const now = Date.now();
  if (now < hold.ignoreUntil) return;

  const stalled = stalledIn(partyId, now);
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  if (!hold.heldAt && party.isPlaying && stalled.length) {
    hold.heldAt = now;
    // Bank the live position before pausing, or the resume would rewind to
    // wherever the last explicit control message left currentTimestamp.
    const updated = await prisma.party.update({
      where: { id: partyId },
      data: { isPlaying: false, currentTimestamp: getLiveTimestamp(party) }
    });
    emitState(partyId, updated, true);
    publishReadiness(partyId);
  } else if (hold.heldAt && (!stalled.length || now - hold.heldAt > MAX_HOLD)) {
    hold.heldAt = null;
    if (!party.isPlaying) {
      const updated = await prisma.party.update({ where: { id: partyId }, data: { isPlaying: true } });
      emitState(partyId, updated, true);
    }
    publishReadiness(partyId);
  }
}

async function tokenUser(token: string) {
  const { payload } = await jwtVerify(token, secret);
  if (typeof payload.sub !== "string" || typeof payload.name !== "string") throw new Error("Invalid token");
  return { id: payload.sub, name: payload.name };
}

const memberFor = (socket: PartySocket, partyId: string) =>
  prisma.partyMember.findUnique({ where: { partyId_userId: { partyId, userId: socket.userId! } } });

async function requireHost(socket: PartySocket, partyId: string) {
  const member = await memberFor(socket, partyId);
  if (member?.role !== "host") {
    socket.emit("error:unauthorized", { message: "الهوست بس اللي يقدر يعمل ده" });
    return false;
  }
  return true;
}

function getLiveTimestamp(party: { isPlaying: boolean; currentTimestamp: number; updatedAt: Date }) {
  if (!party.isPlaying) return party.currentTimestamp;
  const elapsed = (Date.now() - new Date(party.updatedAt).getTime()) / 1000;
  return Math.max(0, party.currentTimestamp + elapsed);
}

function emitState(
  partyId: string,
  party: {
    isPlaying: boolean;
    currentTimestamp: number;
    contentType?: string;
    contentUrl?: string | null;
    platform?: string | null;
  },
  /**
   * Marks a change the server made on its own. The host ignores ordinary
   * broadcasts because it is the one causing them, but it has to obey this or
   * an automatic hold would pause everyone except the host.
   */
  authoritative = false
) {
  io.to(roomFor(partyId)).emit("sync:state", {
    isPlaying: party.isPlaying,
    timestamp: party.currentTimestamp,
    serverTime: Date.now(),
    ...(authoritative ? { authoritative: true } : {}),
    ...(party.contentType
      ? { contentType: party.contentType, contentUrl: party.contentUrl, platform: party.platform ?? null }
      : {})
  });
}

async function emitQueue(partyId: string) {
  const items = await prisma.queueItem.findMany({
    where: { partyId },
    orderBy: [{ position: "asc" }],
    include: { addedBy: { select: { id: true, name: true } }, _count: { select: { votes: true } } }
  });
  io.to(roomFor(partyId)).emit("queue:updated", {
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      contentType: item.contentType,
      contentUrl: item.contentUrl,
      addedBy: item.addedBy,
      votes: item._count.votes
    }))
  });
}

async function control(
  socket: PartySocket,
  partyId: string,
  update: { isPlaying?: boolean; currentTimestamp?: number }
) {
  if (!(await requireHost(socket, partyId))) return;
  const hold = holdFor(partyId);
  // An explicit decision by the host outranks an automatic hold: drop the hold
  // so it cannot later "resume" a video the host deliberately paused. The
  // ignore window covers the buffering every player reports after a jump.
  hold.heldAt = null;
  hold.ignoreUntil = Date.now() + IGNORE_AFTER_JUMP;
  const party = await prisma.party.update({ where: { id: partyId }, data: update });
  emitState(partyId, party);
}

/** Detaches whatever was playing (scheduling its cleanup) and swaps in new content. */
async function applyVideo(
  partyId: string,
  contentType: string,
  contentUrl: string,
  options: { uploadedVideoId?: string; uploaderId?: string; platform?: string | null } = {}
) {
  const hold = holdFor(partyId);
  hold.heldAt = null;
  hold.ignoreUntil = Date.now() + IGNORE_AFTER_JUMP;
  return prisma.$transaction(async transaction => {
    // Detaching returns the video to its owner's library rather than scheduling
    // it for deletion; reusing a film should not mean uploading it twice.
    await transaction.uploadedVideo.updateMany({ where: { partyId }, data: { partyId: null } });
    if (contentType === "upload") {
      // Prisma drops `undefined` filters, so an absent id would match every
      // unattached upload the user owns. Refuse rather than attach the wrong one.
      if (!options.uploadedVideoId) throw new Error("Missing upload id");
      const attached = await transaction.uploadedVideo.updateMany({
        where: {
          id: options.uploadedVideoId,
          uploaderId: options.uploaderId,
          partyId: null,
          // Half-uploaded files must never reach a room.
          status: "ready"
        },
        data: { partyId }
      });
      if (attached.count !== 1) throw new Error("Invalid upload");
    }
    return transaction.party.update({
      where: { id: partyId },
      // A subtitle track belongs to one film. Carrying it over to the next one
      // leaves the room reading lines from the wrong movie. The service is
      // cleared too, so switching away from a platform party does not leave a
      // stale badge pointing at Netflix over a YouTube video.
      data: {
        contentType,
        contentUrl,
        platform: contentType === "platform" ? options.platform ?? null : null,
        isPlaying: false,
        currentTimestamp: 0,
        subtitlesUrl: null
      }
    });
  });
}

async function changeVideo(
  socket: PartySocket,
  partyId: string,
  contentType: string,
  contentUrl: string,
  uploadedVideoId?: string
) {
  if (!(await requireHost(socket, partyId))) return;
  if (!["youtube", "upload", "platform"].includes(contentType) || !contentUrl) {
    return socket.emit("error:unauthorized", { message: "فيديو غير صالح" });
  }

  // Worked out here rather than taken from the client: the service decides
  // where the extension sends everyone, so it has to come from the URL itself.
  let platform: string | null = null;
  let url = contentUrl;
  if (contentType === "platform") {
    platform = platformForUrl(contentUrl);
    if (!platform) return socket.emit("error:unauthorized", { message: "الرابط ده مش من منصة مدعومة" });
    url = normalisePlatformUrl(contentUrl);
  }

  try {
    const party = await applyVideo(partyId, contentType, url, { uploadedVideoId, uploaderId: socket.userId, platform });
    emitState(partyId, party);
  } catch {
    socket.emit("error:unauthorized", { message: "تعذر تغيير الفيديو" });
  }
}

/** Moves the host role in the database — both a grant and a deliberate handover. */
async function transferHost(partyId: string, fromUserId: string, toUserId: string) {
  const target = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId, userId: toUserId } },
    include: { user: { select: { name: true, isGuest: true } } }
  });
  if (!target) throw new Error("Not a member");
  // Creating a party already requires a real account, for the same reason:
  // a guest session cannot be signed back into, so handing them the room
  // would strand it with a host nobody can reach again.
  if (target.user.isGuest) throw new Error("Guest cannot host");

  await prisma.$transaction([
    prisma.partyMember.update({ where: { partyId_userId: { partyId, userId: fromUserId } }, data: { role: "viewer" } }),
    prisma.partyMember.update({ where: { partyId_userId: { partyId, userId: toUserId } }, data: { role: "host" } }),
    prisma.party.update({ where: { id: partyId }, data: { hostId: toUserId } })
  ]);

  setPresenceRole(partyId, fromUserId, "viewer");
  setPresenceRole(partyId, toUserId, "host");
  publishPresence(partyId);
  io.to(roomFor(partyId)).emit("party:hostChanged", { hostId: toUserId, name: target.user.name });
}

async function cleanupExpiredUploads() {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) return;
  const expired = await prisma.uploadedVideo.findMany({ where: { cleanupAt: { lte: new Date() } }, take: 100 });
  if (!expired.length) return;
  const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
  });
  for (const video of expired) {
    try {
      // An upload that never finished has no object yet — only stored parts,
      // which DeleteObject does not touch and R2 keeps charging for.
      if (video.multipartId) {
        await r2.send(
          new AbortMultipartUploadCommand({
            Bucket: process.env.R2_BUCKET,
            Key: video.storageKey,
            UploadId: video.multipartId
          })
        );
      } else {
        await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: video.storageKey }));
      }
      await prisma.uploadedVideo.delete({ where: { id: video.id } });
    } catch {}
  }
}

io.use(async (socket, next) => {
  try {
    const { userToken } = socket.handshake.auth as { userToken?: string };
    if (!userToken) throw new Error("Missing user token");
    const user = await tokenUser(userToken);
    (socket as PartySocket).userId = user.id;
    (socket as PartySocket).userName = user.name;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", rawSocket => {
  const socket = rawSocket as PartySocket;
  socket.join(userRoom(socket.userId!));

  // Being connected at all is enough to count as online — a person browsing
  // their dashboard is as present as one sitting in a room.
  (async () => {
    const me = await prisma.user.findUnique({ where: { id: socket.userId }, select: { invisible: true } });
    const existing = online.get(socket.userId!);
    online.set(socket.userId!, {
      sockets: (existing?.sockets ?? 0) + 1,
      partyId: existing?.partyId ?? null,
      partyName: existing?.partyName ?? null,
      invisible: !!me?.invisible
    });
    await publishOnline(socket.userId!);
  })().catch(() => undefined);

  /** Answers a dashboard asking which of its friends are around right now. */
  socket.on("friends:watch", async () => {
    const friends = await prisma.friendship.findMany({
      where: { status: "accepted", OR: [{ requesterId: socket.userId }, { addresseeId: socket.userId }] },
      select: { requesterId: true, addresseeId: true }
    });
    const friendIds = friends.map(row => (row.requesterId === socket.userId ? row.addresseeId : row.requesterId));
    socket.emit("friends:presence", {
      friends: friendIds
        .map(id => ({ id, entry: online.get(id) }))
        .filter(item => item.entry && !item.entry.invisible)
        .map(item => ({
          userId: item.id,
          online: true,
          partyId: item.entry!.partyId,
          partyName: item.entry!.partyName
        }))
    });
  });

  socket.on("presence:invisible", async ({ invisible }) => {
    const entry = online.get(socket.userId!);
    if (entry) entry.invisible = !!invisible;
    await prisma.user.update({ where: { id: socket.userId }, data: { invisible: !!invisible } }).catch(() => undefined);
    await publishOnline(socket.userId!);
  });

  socket.on("join-party", async ({ partyId }: { partyId: string }) => {
    try {
      const member = await memberFor(socket, partyId);
      const party = await prisma.party.findUnique({ where: { id: partyId } });
      if (!member || !party) return socket.emit("error:unauthorized", { message: "مش عضو في البارتي ده" });

      const dbUser = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { avatarUrl: true, isGuest: true }
      });
      socket.join(roomFor(partyId));
      socket.partyId = partyId;

      socket.emit("sync:state", {
        isPlaying: party.isPlaying,
        timestamp: getLiveTimestamp(party),
        serverTime: Date.now(),
        contentType: party.contentType,
        contentUrl: party.contentUrl,
        platform: party.platform,
        role: member.role,
        isLocked: party.isLocked,
        subtitlesUrl: party.subtitlesUrl,
        rate: party.playbackRate
      });
      await emitQueue(partyId);
      publishReadiness(partyId);
      const entry = online.get(socket.userId!);
      if (entry) {
        entry.partyId = partyId;
        entry.partyName = party.name;
        publishOnline(socket.userId!).catch(() => undefined);
      }
      addPresence(partyId, socket.userId!, {
        name: socket.userName || "",
        avatarUrl: dbUser?.avatarUrl ?? null,
        role: member.role,
        isGuest: !!dbUser?.isGuest
      });
    } catch {
      socket.emit("error:unauthorized", { message: "تعذر الدخول للبارتي" });
    }
  });

  socket.on("control:play", ({ partyId, timestamp }) =>
    control(socket, partyId, { isPlaying: true, currentTimestamp: Number(timestamp) || 0 })
  );
  socket.on("control:pause", ({ partyId, timestamp }) =>
    control(socket, partyId, { isPlaying: false, currentTimestamp: Number(timestamp) || 0 })
  );
  socket.on("control:seek", ({ partyId, timestamp }) =>
    control(socket, partyId, { currentTimestamp: Number(timestamp) || 0 })
  );
  socket.on("control:changeVideo", ({ partyId, contentType, contentUrl, uploadedVideoId }) =>
    changeVideo(socket, partyId, contentType, contentUrl, uploadedVideoId)
  );

  socket.on("chat:send", async ({ partyId, message }) => {
    const clean = typeof message === "string" ? message.trim().slice(0, 1000) : "";
    if (!clean) return;
    if ((socket.lastChatAt || 0) > Date.now() - 800) return;
    socket.lastChatAt = Date.now();
    const member = await memberFor(socket, partyId);
    if (!member) return socket.emit("error:unauthorized", { message: "مش عضو في البارتي ده" });
    const saved = await prisma.chatMessage.create({ data: { partyId, userId: socket.userId!, message: clean } });
    const dbUser = await prisma.user.findUnique({ where: { id: socket.userId }, select: { avatarUrl: true } });
    io.to(roomFor(partyId)).emit("chat:message", {
      userId: socket.userId,
      name: socket.userName,
      avatarUrl: dbUser?.avatarUrl,
      message: clean,
      sentAt: saved.sentAt
    });
  });

  socket.on("chat:typing", async ({ partyId }) => {
    if (socket.partyId !== partyId) return;
    socket.to(roomFor(partyId)).emit("chat:typing", { userId: socket.userId, name: socket.userName });
  });

  // Reactions are ephemeral by design — broadcasting only, never persisted, so
  // a busy room does not turn into a write storm.
  socket.on("reaction:send", async ({ partyId, emoji }) => {
    if (socket.partyId !== partyId) return;
    if (!["😂", "😮", "❤️", "🔥", "👏", "😢"].includes(emoji)) return;
    if ((socket.lastReactionAt || 0) > Date.now() - 500) return;
    socket.lastReactionAt = Date.now();
    io.to(roomFor(partyId)).emit("reaction:received", {
      userId: socket.userId,
      name: socket.userName,
      emoji,
      at: Date.now()
    });
  });

  socket.on("queue:add", async ({ partyId, title, contentType, contentUrl }) => {
    const member = await memberFor(socket, partyId);
    if (!member) return;
    // Queue is YouTube-only: uploads are deleted 30 minutes after they stop
    // playing, so a queued upload would usually be gone by its turn.
    if (contentType !== "youtube" || !contentUrl) {
      return socket.emit("error:unauthorized", { message: "القائمة بتقبل روابط YouTube بس" });
    }
    const last = await prisma.queueItem.findFirst({ where: { partyId }, orderBy: { position: "desc" } });
    await prisma.queueItem.create({
      data: {
        partyId,
        addedById: socket.userId!,
        title: String(title || contentUrl).trim().slice(0, 120),
        contentType,
        contentUrl,
        position: (last?.position ?? 0) + 1
      }
    });
    await emitQueue(partyId);
  });

  socket.on("queue:vote", async ({ partyId, itemId }) => {
    const member = await memberFor(socket, partyId);
    if (!member) return;
    const item = await prisma.queueItem.findFirst({ where: { id: itemId, partyId } });
    if (!item) return;
    const existing = await prisma.queueVote.findUnique({
      where: { queueItemId_userId: { queueItemId: itemId, userId: socket.userId! } }
    });
    // A second press takes the vote back.
    if (existing) await prisma.queueVote.delete({ where: { id: existing.id } });
    else await prisma.queueVote.create({ data: { queueItemId: itemId, userId: socket.userId! } });
    await emitQueue(partyId);
  });

  socket.on("queue:remove", async ({ partyId, itemId }) => {
    const member = await memberFor(socket, partyId);
    if (!member) return;
    const item = await prisma.queueItem.findFirst({ where: { id: itemId, partyId } });
    if (!item) return;
    if (item.addedById !== socket.userId && member.role !== "host") {
      return socket.emit("error:unauthorized", { message: "مش من حقك تشيل الاقتراح ده" });
    }
    await prisma.queueItem.delete({ where: { id: item.id } });
    await emitQueue(partyId);
  });

  socket.on("queue:playNext", async ({ partyId, itemId }) => {
    if (!(await requireHost(socket, partyId))) return;
    const next = itemId
      ? await prisma.queueItem.findFirst({ where: { id: itemId, partyId } })
      : await prisma.queueItem.findFirst({ where: { partyId }, orderBy: { position: "asc" } });
    if (!next) return socket.emit("error:unauthorized", { message: "القائمة فاضية" });
    try {
      const party = await applyVideo(partyId, next.contentType, next.contentUrl);
      await prisma.queueItem.delete({ where: { id: next.id } });
      emitState(partyId, party);
      await emitQueue(partyId);
    } catch {
      socket.emit("error:unauthorized", { message: "تعذر تشغيل الفيديو التالي" });
    }
  });

  socket.on("control:request", async ({ partyId }) => {
    const member = await memberFor(socket, partyId);
    if (!member || member.role === "host") return;
    const party = await prisma.party.findUnique({ where: { id: partyId }, select: { hostId: true } });
    if (!party) return;
    io.to(userRoom(party.hostId)).emit("control:requested", {
      partyId,
      userId: socket.userId,
      name: socket.userName
    });
  });

  socket.on("control:grant", async ({ partyId, userId }) => {
    if (!(await requireHost(socket, partyId))) return;
    try {
      await transferHost(partyId, socket.userId!, userId);
    } catch (error) {
      const isGuest = error instanceof Error && error.message === "Guest cannot host";
      socket.emit("error:unauthorized", {
        message: isGuest ? "الضيف لازم يعمل حساب الأول عشان يمسك التحكم" : "تعذر نقل التحكم"
      });
    }
  });

  socket.on("control:deny", async ({ partyId, userId }) => {
    if (!(await requireHost(socket, partyId))) return;
    io.to(userRoom(userId)).emit("control:denied", { partyId });
  });

  socket.on("host:transfer", async ({ partyId, userId }) => {
    if (!(await requireHost(socket, partyId))) return;
    try {
      await transferHost(partyId, socket.userId!, userId);
    } catch (error) {
      const isGuest = error instanceof Error && error.message === "Guest cannot host";
      socket.emit("error:unauthorized", {
        message: isGuest ? "الضيف لازم يعمل حساب الأول عشان يستضيف" : "تعذر نقل الاستضافة"
      });
    }
  });

  socket.on("member:kick", async ({ partyId, userId }) => {
    if (!(await requireHost(socket, partyId))) return;
    if (userId === socket.userId) return;
    await prisma.partyMember.deleteMany({ where: { partyId, userId } });
    io.to(userRoom(userId)).emit("party:kicked", { partyId });
    presence.get(partyId)?.delete(userId);
    publishPresence(partyId);
    // Pull every tab that user has open out of the room.
    for (const client of await io.in(userRoom(userId)).fetchSockets()) client.leave(roomFor(partyId));
  });

  socket.on("party:lock", async ({ partyId, isLocked }) => {
    if (!(await requireHost(socket, partyId))) return;
    await prisma.party.update({ where: { id: partyId }, data: { isLocked: !!isLocked } });
    io.to(roomFor(partyId)).emit("party:lockChanged", { isLocked: !!isLocked });
  });

  socket.on("viewer:buffering", ({ partyId, isBuffering }) => {
    if (socket.partyId !== partyId) return;
    setBuffering(partyId, socket.userId!, socket.userName || "", !!isBuffering);
  });

  socket.on("control:rate", async ({ partyId, rate }) => {
    if (!(await requireHost(socket, partyId))) return;
    const clean = Number(rate);
    if (![0.5, 0.75, 1, 1.25, 1.5, 2].includes(clean)) return;
    const party = await prisma.party.update({ where: { id: partyId }, data: { playbackRate: clean } });
    io.to(roomFor(partyId)).emit("party:rateChanged", { rate: party.playbackRate });
  });

  socket.on("party:subtitles", async ({ partyId, url }) => {
    if (!(await requireHost(socket, partyId))) return;
    const clean = typeof url === "string" && /^https?:\/\//.test(url) ? url.slice(0, 512) : null;
    await prisma.party.update({ where: { id: partyId }, data: { subtitlesUrl: clean } });
    io.to(roomFor(partyId)).emit("party:subtitlesChanged", { url: clean });
  });

  socket.on("party:waitForAll", async ({ partyId, enabled }) => {
    if (!(await requireHost(socket, partyId))) return;
    const hold = holdFor(partyId);
    hold.enabled = !!enabled;
    // Turning it off must also release anything it is currently holding.
    if (!hold.enabled && hold.heldAt) {
      hold.heldAt = null;
      const party = await prisma.party.update({ where: { id: partyId }, data: { isPlaying: true } });
      emitState(partyId, party, true);
    }
    publishReadiness(partyId);
  });

  // --- Voice chat signalling -------------------------------------------------
  // The server only relays; audio travels peer to peer. Peers are keyed by
  // socket id rather than user id so two tabs never collapse into one peer.
  socket.on("voice:join", async ({ partyId }) => {
    const member = await memberFor(socket, partyId);
    if (!member) return;
    const peers = (await io.in(voiceRoom(partyId)).fetchSockets()).map(client => ({
      socketId: client.id,
      userId: (client.data as any).userId,
      name: (client.data as any).userName
    }));
    socket.data.userId = socket.userId;
    socket.data.userName = socket.userName;
    socket.join(voiceRoom(partyId));
    socket.emit("voice:peers", { peers });
    socket.to(voiceRoom(partyId)).emit("voice:peerJoined", {
      socketId: socket.id,
      userId: socket.userId,
      name: socket.userName
    });
  });

  socket.on("voice:leave", ({ partyId }) => {
    socket.leave(voiceRoom(partyId));
    socket.to(voiceRoom(partyId)).emit("voice:peerLeft", { socketId: socket.id });
  });

  socket.on("voice:signal", ({ toSocketId, data }) => {
    io.to(toSocketId).emit("voice:signal", { fromSocketId: socket.id, data });
  });

  // Cameras are capped because the mesh cost is quadratic: every extra camera
  // adds an upstream copy for every other participant.
  socket.on("camera:on", ({ partyId }) => {
    if (socket.partyId !== partyId) return;
    const open = cameras.get(partyId) ?? new Set<string>();
    cameras.set(partyId, open);
    if (!open.has(socket.userId!) && open.size >= MAX_CAMERAS) {
      return socket.emit("camera:blocked", { message: `أقصى عدد كاميرات مفتوحة ${MAX_CAMERAS}.` });
    }
    open.add(socket.userId!);
    io.to(roomFor(partyId)).emit("camera:list", { userIds: [...open] });
  });

  socket.on("camera:off", ({ partyId }) => {
    const open = cameras.get(partyId);
    if (!open) return;
    open.delete(socket.userId!);
    if (!open.size) cameras.delete(partyId);
    io.to(roomFor(partyId)).emit("camera:list", { userIds: [...open] });
  });

  socket.on("camera:disable", async ({ partyId, userId }) => {
    if (!(await requireHost(socket, partyId))) return;
    cameras.get(partyId)?.delete(userId);
    io.to(userRoom(userId)).emit("camera:blocked", { message: "الهوست قفل كاميرتك." });
    io.to(roomFor(partyId)).emit("camera:list", { userIds: [...(cameras.get(partyId) ?? [])] });
  });

  socket.on("voice:speaking", ({ partyId, speaking }) => {
    socket.to(roomFor(partyId)).emit("voice:speaking", { userId: socket.userId, speaking: !!speaking });
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      const entry = online.get(socket.userId);
      if (entry) {
        entry.sockets -= 1;
        // Another tab still open means still here.
        if (entry.sockets <= 0) online.delete(socket.userId);
        else if (entry.partyId === socket.partyId) entry.partyId = null;
        publishOnline(socket.userId).catch(() => undefined);
      }
    }
    if (!socket.partyId || !socket.userId) return;
    socket.to(voiceRoom(socket.partyId)).emit("voice:peerLeft", { socketId: socket.id });
    setBuffering(socket.partyId, socket.userId, socket.userName || "", false);
    const open = cameras.get(socket.partyId);
    if (open?.delete(socket.userId)) {
      if (!open.size) cameras.delete(socket.partyId);
      io.to(roomFor(socket.partyId)).emit("camera:list", { userIds: [...open] });
    }
    dropPresence(socket.partyId, socket.userId);
  });
});

setInterval(async () => {
  const rooms = [...io.sockets.adapter.rooms.keys()].filter(key => key.startsWith("party:"));
  for (const room of rooms) {
    const party = await prisma.party.findUnique({ where: { id: room.slice(6) } });
    if (!party) continue;
    io.to(room).emit("sync:heartbeat", {
      isPlaying: party.isPlaying,
      timestamp: getLiveTimestamp(party),
      serverTime: Date.now()
    });
  }
}, 5000);

// Held rooms need re-checking on a clock, not only when a report arrives: the
// grace period and the maximum hold both elapse without any client saying so.
setInterval(() => {
  for (const [partyId, hold] of holds) {
    if (hold.enabled && (hold.heldAt || buffering.has(partyId))) {
      evaluateHold(partyId).catch(() => undefined);
    }
  }
}, 1000);

setInterval(() => { cleanupExpiredUploads().catch(() => undefined); }, 5 * 60 * 1000);
cleanupExpiredUploads().catch(() => undefined);

httpServer.listen(Number(process.env.PORT || 4000), () => console.log("MSParty sync server listening"));

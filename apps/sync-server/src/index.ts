import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { jwtVerify } from "jose";
import { Server, Socket } from "socket.io";

const prisma = new PrismaClient();
const secret = new TextEncoder().encode(process.env.SYNC_TOKEN_SECRET || process.env.NEXTAUTH_SECRET);
const origin = process.env.SYNC_SERVER_ORIGIN || "http://localhost:3000";
const httpServer = createServer((request, response) => {
  cors({ origin })(request, response, () => {
    response.statusCode = 404;
    response.end();
  });
});
const io = new Server(httpServer, { cors: { origin, methods: ["GET", "POST"] } });
const roomFor = (partyId: string) => `party:${partyId}`;
type PartySocket = Socket & { userId?: string; userName?: string; partyId?: string; lastChatAt?: number };

async function tokenUser(token: string) { const { payload } = await jwtVerify(token, secret); if (typeof payload.sub !== "string" || typeof payload.name !== "string") throw new Error("Invalid token"); return { id: payload.sub, name: payload.name }; }
async function memberFor(socket: PartySocket, partyId: string) { return prisma.partyMember.findUnique({ where: { partyId_userId: { partyId, userId: socket.userId! } } }); }
function emitState(partyId: string, party: { isPlaying: boolean; currentTimestamp: number; contentType?: string; contentUrl?: string | null }) { io.to(roomFor(partyId)).emit("sync:state", { isPlaying: party.isPlaying, timestamp: party.currentTimestamp, serverTime: Date.now(), ...(party.contentType ? { contentType: party.contentType, contentUrl: party.contentUrl } : {}) }); }
async function control(socket: PartySocket, partyId: string, update: { isPlaying?: boolean; currentTimestamp?: number; contentType?: string; contentUrl?: string }) { const member = await memberFor(socket, partyId); if (member?.role !== "host") return socket.emit("error:unauthorized", { message: "Only host can control playback" }); const party = await prisma.party.update({ where: { id: partyId }, data: update }); emitState(partyId, party); }
async function changeVideo(socket: PartySocket, partyId: string, contentType: string, contentUrl: string, uploadedVideoId?: string) {
  const member = await memberFor(socket, partyId);
  if (member?.role !== "host") return socket.emit("error:unauthorized", { message: "Only host can control playback" });
  if (!["youtube", "upload"].includes(contentType) || !contentUrl) return socket.emit("error:unauthorized", { message: "Invalid video" });
  try {
    const party = await prisma.$transaction(async (transaction) => {
      await transaction.uploadedVideo.updateMany({ where: { partyId }, data: { partyId: null, cleanupAt: new Date(Date.now() + 30 * 60 * 1000) } });
      if (contentType === "upload") {
        const attached = await transaction.uploadedVideo.updateMany({ where: { id: uploadedVideoId, uploaderId: socket.userId, partyId: null }, data: { partyId, cleanupAt: null } });
        if (attached.count !== 1) throw new Error("Invalid upload");
      }
      return transaction.party.update({ where: { id: partyId }, data: { contentType, contentUrl, isPlaying: false, currentTimestamp: 0 } });
    });
    emitState(partyId, party);
  } catch { socket.emit("error:unauthorized", { message: "Unable to change video" }); }
}
async function cleanupExpiredUploads() {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) return;
  const expired = await prisma.uploadedVideo.findMany({ where: { cleanupAt: { lte: new Date() } }, take: 100 });
  const r2 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  for (const video of expired) { try { await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: video.storageKey })); await prisma.uploadedVideo.delete({ where: { id: video.id } }); } catch {} }
}

io.use(async (socket, next) => { try { const { userToken } = socket.handshake.auth as { userToken?: string }; if (!userToken) throw new Error("Missing user token"); const user = await tokenUser(userToken); (socket as PartySocket).userId = user.id; (socket as PartySocket).userName = user.name; next(); } catch { next(new Error("Unauthorized")); } });
io.on("connection", (rawSocket) => {
  const socket = rawSocket as PartySocket;
  socket.on("join-party", async ({ partyId, userToken }: { partyId: string; userToken?: string }) => { try {
    if (userToken) { const user = await tokenUser(userToken); if (user.id !== socket.userId) throw new Error("Identity mismatch"); }
    const member = await memberFor(socket, partyId); const party = await prisma.party.findUnique({ where: { id: partyId } }); if (!member || !party) return socket.emit("error:unauthorized", { message: "Not a party member" });
    socket.join(roomFor(partyId)); socket.partyId = partyId; socket.emit("sync:state", { isPlaying: party.isPlaying, timestamp: party.currentTimestamp, serverTime: Date.now(), contentType: party.contentType, contentUrl: party.contentUrl, role: member.role }); socket.to(roomFor(partyId)).emit("party:memberJoined", { userId: socket.userId, name: socket.userName });
  } catch { socket.emit("error:unauthorized", { message: "Invalid party access" }); } });
  socket.on("control:play", ({ partyId, timestamp }) => control(socket, partyId, { isPlaying: true, currentTimestamp: Number(timestamp) || 0 }));
  socket.on("control:pause", ({ partyId, timestamp }) => control(socket, partyId, { isPlaying: false, currentTimestamp: Number(timestamp) || 0 }));
  socket.on("control:seek", ({ partyId, timestamp }) => control(socket, partyId, { currentTimestamp: Number(timestamp) || 0 }));
  socket.on("control:changeVideo", ({ partyId, contentType, contentUrl, uploadedVideoId }) => changeVideo(socket, partyId, contentType, contentUrl, uploadedVideoId));
  socket.on("chat:send", async ({ partyId, message }) => { const clean = typeof message === "string" ? message.trim().slice(0, 1000) : ""; if (!clean) return; if ((socket.lastChatAt || 0) > Date.now() - 800) return; socket.lastChatAt = Date.now(); const member = await memberFor(socket, partyId); if (!member) return socket.emit("error:unauthorized", { message: "Not a party member" }); const saved = await prisma.chatMessage.create({ data: { partyId, userId: socket.userId!, message: clean } }); io.to(roomFor(partyId)).emit("chat:message", { userId: socket.userId, name: socket.userName, message: clean, sentAt: saved.sentAt }); });
  socket.on("disconnect", () => { if (socket.partyId) socket.to(roomFor(socket.partyId)).emit("party:memberLeft", { userId: socket.userId }); });
});
setInterval(async () => { const partyIds = [...io.sockets.adapter.rooms.keys()].filter((key) => key.startsWith("party:")); for (const room of partyIds) { const partyId = room.slice(6); const party = await prisma.party.findUnique({ where: { id: partyId } }); if (party) io.to(room).emit("sync:heartbeat", { isPlaying: party.isPlaying, timestamp: party.currentTimestamp, serverTime: Date.now() }); } }, 5000);
setInterval(() => { cleanupExpiredUploads().catch(() => undefined); }, 5 * 60 * 1000);
cleanupExpiredUploads().catch(() => undefined);
httpServer.listen(Number(process.env.PORT || 4000), () => console.log("MSParty sync server listening"));

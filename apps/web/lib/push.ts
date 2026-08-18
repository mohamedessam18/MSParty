import webpush from "web-push";
import { prisma } from "./prisma";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const contact = process.env.VAPID_CONTACT || "mailto:support@msparty.app";

export const pushConfigured = !!(publicKey && privateKey);
if (pushConfigured) webpush.setVapidDetails(contact, publicKey!, privateKey!);

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

/**
 * Delivers to every browser the user has registered. Failures are expected and
 * normal — a subscription dies when its browser data is cleared — so a gone
 * endpoint is deleted rather than retried forever.
 */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!pushConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          },
          body,
          { TTL: 60 * 30 }
        );
      } catch (error: any) {
        // 404/410 is the push service saying this endpoint is permanently gone.
        if (error?.statusCode === 404 || error?.statusCode === 410) dead.push(subscription.id);
      }
    })
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => undefined);
  }
}

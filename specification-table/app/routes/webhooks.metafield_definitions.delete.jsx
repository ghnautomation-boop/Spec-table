import { createHmac, timingSafeEqual } from "node:crypto";
import { publishWebhookByTopic } from "../models/pubsub.server.js";
import { logWebhookEvent } from "../models/webhook-logger.server.js";

function safeCompareBase64(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const action = async ({ request }) => {
  const startTime = performance.now();

  // IMPORTANT: raw body pentru HMAC
  const rawBody = await request.text();

  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shop = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic");

  if (!hmac || !shop || !topic) {
    console.warn("[webhook] Missing headers", { hasHmac: !!hmac, shop, topic });
    return new Response("Ignored", { status: 200 });
  }

  const secret = process.env.SHOPIFY_API_SECRET || "";
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  if (!safeCompareBase64(digest, hmac)) {
    console.warn("[webhook] Invalid HMAC", { shop, topic });
    return new Response("Invalid", { status: 200 });
  }

  // parse după validare
  let payload = null;
  try { payload = rawBody ? JSON.parse(rawBody) : null; } catch {}

  try {
    const messageId = await publishWebhookByTopic(shop, topic, payload);

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "queued", null, {
      id: payload?.id,
      pubsubMessageId: messageId,
    }, responseTime);

    return new Response("OK", { status: 200 });
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "error", error.message || "Unknown error", { id: payload?.id }, responseTime);
    return new Response("Publish error", { status: 200 });
  }
};

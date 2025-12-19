import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { logWebhookEvent } from "../models/webhook-logger.server.js";

export const action = async ({ request }) => {
  const startTime = performance.now();

  let payload = null;
  try {
    const requestClone = request.clone();
    payload = await requestClone.json();
  } catch {
    // ignore
  }

  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });

    if (shopRecord) {
      // Payload-ul de delete poate conține namespace/key/owner_type sau id; păstrăm fallback safe.
      const namespace = payload?.namespace;
      const key = payload?.key;
      const ownerTypeRaw = payload?.owner_type || payload?.ownerType;
      const normalizedOwnerType =
        ownerTypeRaw === "PRODUCTVARIANT" || ownerTypeRaw === "PRODUCT_VARIANT"
          ? "VARIANT"
          : ownerTypeRaw === "PRODUCT"
            ? "PRODUCT"
            : null;

      if (namespace && key && normalizedOwnerType) {
        await prisma.metafieldDefinition.deleteMany({
          where: {
            shopId: shopRecord.id,
            namespace,
            key,
            ownerType: normalizedOwnerType,
          },
        });
      } else if (payload?.id) {
        // Dacă payload are id, încercăm să ștergem după id (best-effort).
        await prisma.metafieldDefinition.deleteMany({
          where: {
            shopId: shopRecord.id,
            id: String(payload.id),
          },
        });
      }
    }

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "success", null, { id: payload?.id }, responseTime);
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMessage = error.message || "Unknown error";
    console.error("Error processing webhook:", error);
    await logWebhookEvent(shop, topic, "error", errorMessage, { id: payload?.id }, responseTime);
    return new Response("Error processing webhook", { status: 200 });
  }

  return new Response();
};



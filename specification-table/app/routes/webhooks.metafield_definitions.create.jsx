import { authenticate } from "../shopify.server";
import { syncSingleMetafieldDefinition } from "../models/sync.server";
import { logWebhookEvent } from "../models/webhook-logger.server.js";

export const action = async ({ request }) => {
  const startTime = performance.now();

  // Citește payload-ul înainte de autentificare (request-ul este consumat de authenticate.webhook)
  let payload = null;
  try {
    const requestClone = request.clone();
    payload = await requestClone.json();
  } catch {
    // ignore
  }

  const { shop, topic, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Pentru metafield definition webhook, payload-ul conține definition data.
    if (payload) {
      await syncSingleMetafieldDefinition(admin, shop, payload);
    }

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "success", null, { id: payload?.id }, responseTime);
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMessage = error.message || "Unknown error";
    console.error("Error processing webhook:", error);
    await logWebhookEvent(shop, topic, "error", errorMessage, { id: payload?.id }, responseTime);
    // Returnăm 200 ca să evităm retry în buclă (procesarea o putem repara prin reconcile).
    return new Response("Error processing webhook", { status: 200 });
  }

  return new Response();
};



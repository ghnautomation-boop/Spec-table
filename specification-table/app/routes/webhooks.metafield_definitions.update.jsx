import { authenticate } from "../shopify.server";
import { syncSingleMetafieldDefinition } from "../models/sync.server";
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

  const { shop, topic, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
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
    return new Response("Error processing webhook", { status: 200 });
  }

  return new Response();
};



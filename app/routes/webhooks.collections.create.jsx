import { authenticate } from "../shopify.server";
import { syncSingleCollection } from "../models/sync.server";
import { logWebhookEvent } from "../models/webhook-logger.server.js";
import { normalizeShopifyId } from "../models/template-lookup.server.js";

export const action = async ({ request }) => {
  const startTime = performance.now();
  
  // Citește payload-ul înainte de autentificare (request-ul este consumat de authenticate.webhook)
  let payload = null;
  try {
    const requestClone = request.clone();
    payload = await requestClone.json();
  } catch (e) {
    // Ignoră eroarea dacă nu poate fi citit
  }
  
  const { shop, topic, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Obține collection ID din payload
    const collectionIdRaw = payload?.admin_graphql_api_id || payload?.id;
    const normalized = collectionIdRaw ? normalizeShopifyId(String(collectionIdRaw)) : null;
    // syncSingleCollection așteaptă un ID Shopify valid (GID). Dacă primim numeric, îl convertim.
    const collectionId = normalized ? `gid://shopify/Collection/${normalized}` : null;

    if (collectionId) {
      // Sincronizează colecția în DB
      await syncSingleCollection(admin, shop, collectionId);
      console.log(`Successfully synced collection ${collectionId} after creation`);
    }

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "success", null, { collectionId: collectionIdRaw }, responseTime);
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMessage = error.message || "Unknown error";
    console.error("Error processing webhook:", error);
    await logWebhookEvent(shop, topic, "error", errorMessage, null, responseTime);
    // Returnăm totuși 200 pentru a nu retrigger webhook-ul
    return new Response("Error processing webhook", { status: 200 });
  }

  return new Response();
};


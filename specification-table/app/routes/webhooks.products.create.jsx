import { authenticate } from "../shopify.server";
import { publishWebhookByTopic } from "../models/pubsub.server.js";
import { logWebhookEvent } from "../models/webhook-logger.server.js";

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
  
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[webhook] Received ${topic} webhook for ${shop}`);

  try {
    // Publică webhook-ul în Pub/Sub pentru procesare asincronă cu debouncing
    const messageId = await publishWebhookByTopic(shop, topic, payload);
    
    console.log(`[webhook] Published to Pub/Sub: ${messageId} for ${shop}`);
    
    // Log event-ul (doar recepția, procesarea se face în worker)
    const responseTime = Math.round(performance.now() - startTime);
    const productId = payload?.admin_graphql_api_id || payload?.id;
    await logWebhookEvent(shop, topic, "queued", null, { 
      productId,
      pubsubMessageId: messageId 
    }, responseTime);
    
    // Returnează 200 imediat - worker-ul va procesa webhook-ul cu debouncing
    return new Response();
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMessage = error.message || "Unknown error";
    console.error(`[webhook] Error publishing to Pub/Sub:`, error);
    
    // Log eroarea
    const productId = payload?.admin_graphql_api_id || payload?.id;
    await logWebhookEvent(shop, topic, "error", errorMessage, { 
      productId 
    }, responseTime);
    
    // Returnăm totuși 200 pentru a nu retrigger webhook-ul
    // (putem procesa manual sau prin reconcile job)
    return new Response("Error publishing webhook", { status: 200 });
  }
};






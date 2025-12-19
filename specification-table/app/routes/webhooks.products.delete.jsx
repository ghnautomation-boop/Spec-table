import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
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
    // Obține product ID din payload
    const productId = payload?.admin_graphql_api_id || payload?.id;

    if (productId) {
      // Șterge produsul din DB
      const shopRecord = await prisma.shop.findUnique({
        where: { shopDomain: shop },
        select: { id: true },
      });

      if (shopRecord) {
        // IMPORTANT: În DB `Product.shopifyId` este stocat ca GID (ex: gid://shopify/Product/123),
        // dar uneori payload-ul poate conține și ID numeric. Ștergem folosind ambele variante.
        const candidates = new Set();
        const raw = String(productId);
        candidates.add(raw);

        const normalizedId = normalizeShopifyId(raw);
        if (normalizedId) {
          candidates.add(normalizedId);
          candidates.add(`gid://shopify/Product/${normalizedId}`);
        }

        const deleteResult = await prisma.product.deleteMany({
          where: {
            shopId: shopRecord.id,
            shopifyId: { in: Array.from(candidates) },
          },
        });

        // Curăță lookup-urile care referă produsul (TemplateLookup stochează ID-ul normalizat numeric).
        if (normalizedId) {
          await prisma.templateLookup.deleteMany({
            where: {
              shopId: shopRecord.id,
              productId: normalizedId,
            },
          });
        }

        // Curăță target-urile din assignment-uri care referă produsul șters (altfel rămân "dangling").
        await prisma.templateAssignmentTarget.deleteMany({
          where: {
            targetType: "PRODUCT",
            targetShopifyId: { in: Array.from(candidates) },
            assignment: { shopId: shopRecord.id },
          },
        });

        console.log(
          `Deleted ${deleteResult.count} product row(s) for ${raw} (candidates=${Array.from(
            candidates
          ).join(", ")})`
        );
      }
    }

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "success", null, { productId }, responseTime);
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






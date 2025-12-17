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
    // Obține collection ID din payload
    const collectionId = payload?.admin_graphql_api_id || payload?.id;

    if (collectionId) {
      // Șterge colecția din DB
      const shopRecord = await prisma.shop.findUnique({
        where: { shopDomain: shop },
        select: { id: true },
      });

      if (shopRecord) {
        // IMPORTANT: În DB `Collection.shopifyId` este stocat ca GID (ex: gid://shopify/Collection/123),
        // dar payload-ul poate conține și ID numeric. Ștergem folosind ambele variante.
        const raw = String(collectionId);
        const candidates = new Set();
        candidates.add(raw);

        const normalizedId = normalizeShopifyId(raw);
        if (normalizedId) {
          candidates.add(normalizedId);
          candidates.add(`gid://shopify/Collection/${normalizedId}`);
        }

        const deleteResult = await prisma.collection.deleteMany({
          where: {
            shopId: shopRecord.id,
            shopifyId: { in: Array.from(candidates) },
          },
        });

        // Curăță target-urile din assignment-uri care referă colecția ștearsă.
        await prisma.templateAssignmentTarget.deleteMany({
          where: {
            targetType: "COLLECTION",
            targetShopifyId: { in: Array.from(candidates) },
            assignment: { shopId: shopRecord.id },
          },
        });

        // IMPORTANT:
        // - `TemplateLookup.collectionId` stochează ID-ul normalizat numeric
        // - pentru assignment-uri de tip COLLECTION, rebuild-ul poate introduce rânduri cu `productId` și `collectionId=null`
        //   (fără să păstreze "originea" colecției). Din cauza asta, NU putem curăța complet doar prin deleteMany.
        // Soluția corectă: rebuild lookup table după ce ștergem target-ul colecției.
        if (normalizedId) {
          await prisma.templateLookup.deleteMany({
            where: {
              shopId: shopRecord.id,
              collectionId: normalizedId,
            },
          });
        }

        try {
          const { rebuildTemplateLookup } = await import("../models/template-lookup.server.js");
          await rebuildTemplateLookup(shopRecord.id, shop, admin);
        } catch (e) {
          console.error("Error rebuilding template lookup after collection delete:", e);
        }

        console.log(
          `Deleted ${deleteResult.count} collection row(s) for ${raw} (candidates=${Array.from(
            candidates
          ).join(", ")})`
        );
      }
    }

    const responseTime = Math.round(performance.now() - startTime);
    await logWebhookEvent(shop, topic, "success", null, { collectionId }, responseTime);
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


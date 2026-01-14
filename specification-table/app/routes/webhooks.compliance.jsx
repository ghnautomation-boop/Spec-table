import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "../db.server";
import { invalidateShopIdCache } from "../models/template.server";

function safeCompareBase64(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Handles mandatory compliance webhooks for privacy law compliance:
 * - customers/data_request: Requests to view stored customer data
 * - customers/redact: Requests to delete customer data
 * - shop/redact: Requests to delete shop data (sent 48 hours after uninstall)
 * 
 * See: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 */
export const action = async ({ request }) => {
  // IMPORTANT: raw body pentru HMAC
  const rawBody = await request.text();

  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shop = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic");

  if (!hmac || !shop || !topic) {
    console.warn("[compliance webhook] Missing headers", { hasHmac: !!hmac, shop, topic });
    // Return 401 for invalid HMAC as required by Shopify
    return new Response("Unauthorized", { status: 401 });
  }

  const secret = process.env.SHOPIFY_API_SECRET || "";
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  if (!safeCompareBase64(digest, hmac)) {
    console.warn("[compliance webhook] Invalid HMAC", { shop, topic });
    // Return 401 for invalid HMAC as required by Shopify
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse payload after HMAC validation
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (error) {
    console.error("[compliance webhook] Failed to parse payload", { shop, topic, error });
    return new Response("Bad Request", { status: 400 });
  }

  console.log(`[compliance webhook] Received ${topic} webhook for ${shop}`);

  try {
    switch (topic) {
      case "customers/data_request":
        await handleDataRequest(shop, payload);
        break;

      case "customers/redact":
        await handleCustomerRedact(shop, payload);
        break;

      case "shop/redact":
        await handleShopRedact(shop, payload);
        break;

      default:
        console.warn(`[compliance webhook] Unknown topic: ${topic}`, { shop });
        // Still return 200 to acknowledge receipt
        return new Response("OK", { status: 200 });
    }

    // Return 200 to confirm receipt (required by Shopify)
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(`[compliance webhook] Error processing ${topic}`, { shop, error });
    // Still return 200 to acknowledge receipt, but log the error
    // The action should be completed within 30 days as per Shopify requirements
    return new Response("OK", { status: 200 });
  }
};

/**
 * Handles customers/data_request webhook
 * 
 * Payload structure:
 * {
 *   "shop_id": 954889,
 *   "shop_domain": "{shop}.myshopify.com",
 *   "orders_requested": [299938, 280263, 220458],
 *   "customer": {
 *     "id": 191167,
 *     "email": "john@example.com",
 *     "phone": "555-625-1199"
 *   },
 *   "data_request": {
 *     "id": 9999
 *   }
 * }
 * 
 * Note: This app does not store customer-specific data.
 * We acknowledge the request but have no customer data to provide.
 */
async function handleDataRequest(shop, payload) {
  const customerId = payload?.customer?.id;
  const customerEmail = payload?.customer?.email;
  const ordersRequested = payload?.orders_requested || [];
  const dataRequestId = payload?.data_request?.id;

  console.log(`[customers/data_request] Processing data request for shop ${shop}`, {
    customerId,
    customerEmail,
    ordersRequested,
    dataRequestId,
  });

  // This app does not store customer-specific data.
  // If we did, we would need to:
  // 1. Query the database for all customer-related data
  // 2. Provide this data to the store owner directly (not via API)
  // 3. Complete the action within 30 days

  // For now, we just log and acknowledge
  console.log(`[customers/data_request] No customer data stored for this app`);
}

/**
 * Handles customers/redact webhook
 * 
 * Payload structure:
 * {
 *   "shop_id": 954889,
 *   "shop_domain": "{shop}.myshopify.com",
 *   "customer": {
 *     "id": 191167,
 *     "email": "john@example.com",
 *     "phone": "555-625-1199"
 *   },
 *   "orders_to_redact": [299938, 280263, 220458]
 * }
 * 
 * Note: This app does not store customer-specific data.
 * We acknowledge the request but have no customer data to delete.
 */
async function handleCustomerRedact(shop, payload) {
  const customerId = payload?.customer?.id;
  const customerEmail = payload?.customer?.email;
  const ordersToRedact = payload?.orders_to_redact || [];

  console.log(`[customers/redact] Processing redaction request for shop ${shop}`, {
    customerId,
    customerEmail,
    ordersToRedact,
  });

  // This app does not store customer-specific data.
  // If we did, we would need to:
  // 1. Delete or redact all customer-related data from the database
  // 2. Complete the action within 30 days (unless legally required to retain)

  // For now, we just log and acknowledge
  console.log(`[customers/redact] No customer data to redact for this app`);
}

/**
 * Handles shop/redact webhook
 * 
 * Payload structure:
 * {
 *   "shop_id": 954889,
 *   "shop_domain": "{shop}.myshopify.com"
 * }
 * 
 * This webhook is sent 48 hours after a store owner uninstalls the app.
 * We should delete all shop-related data from the database.
 * 
 * Note: This is idempotent - safe to run multiple times.
 */
async function handleShopRedact(shop, payload) {
  const shopId = payload?.shop_id;
  const shopDomain = payload?.shop_domain || shop;

  console.log(`[shop/redact] Processing shop redaction for ${shopDomain}`, {
    shopId,
    shopDomain,
  });

  // Invalidă cache-ul pentru shop ID înainte de a șterge shop-ul
  invalidateShopIdCache(shopDomain);

  // Șterge toate datele asociate cu acest shop
  // This is idempotent - if the shop was already deleted by app/uninstalled,
  // this will simply not find the shop and return gracefully
  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (shopRecord) {
      // Deleting the shop will cascade delete all related data
      // (products, collections, templates, assignments, etc.)
      await prisma.shop.delete({
        where: { id: shopRecord.id },
      });
      console.log(`[shop/redact] Shop ${shopDomain} and all associated data deleted successfully`);
    } else {
      console.log(`[shop/redact] Shop ${shopDomain} not found (may have been already deleted)`);
    }
  } catch (error) {
    console.error(`[shop/redact] Error deleting shop data for ${shopDomain}:`, error);
    // Don't throw - we still want to return 200 to acknowledge receipt
  }
}

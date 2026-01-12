import "@shopify/shopify-api/adapters/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import prisma from "../db.server.js";
import { syncAll } from "../models/sync.server.js";

function safeCompareBase64(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// Inițializează shopifyApi (similar cu worker-ul)
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(",") || [],
  hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, "") || "",
  isEmbeddedApp: true,
});

function createAdminClient(session) {
  const sessionObj = {
    shop: session.shop,
    accessToken: session.accessToken,
  };
  
  if (!shopify.clients || !shopify.clients.Graphql) {
    throw new Error(`shopify.clients.Graphql is not available`);
  }
  
  const graphqlClient = new shopify.clients.Graphql({ session: sessionObj });
  
  return {
    graphql: async (query, options = {}) => {
      const { variables } = options;
      const response = await graphqlClient.request(query, { variables });
      return {
        json: async () => response,
      };
    },
  };
}

export const action = async ({ request }) => {
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

  // Obține session-ul din DB pentru a crea admin client
  const session = await prisma.session.findFirst({
    where: { shop },
    orderBy: { expires: "desc" },
  });

  if (!session || !session.accessToken) {
    console.error(`[webhook] No valid session found for shop ${shop}`);
    return new Response("No session", { status: 200 });
  }

  // Creează admin client
  const admin = createAdminClient(session);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Payload-ul conține informații despre subscription
    // Pentru app_subscriptions/create și app_subscriptions/update
    const appSubscription = payload.app_subscription || payload;

    if (!appSubscription) {

      return new Response();
    }

    // Log payload pentru debugging


    // Obține plan key din name sau id al subscription-ului
    // Planurile din Managed Pricing au nume precum "Starter", "Growth", "Scale", "Unlimited"
    // Poate fi în app_subscription.name, app_subscription.line_items[0].plan.name, sau app_subscription.current_plan.name
    const planName = 
      appSubscription.name || 
      appSubscription.current_plan?.name ||
      appSubscription.line_items?.[0]?.plan?.name || 
      appSubscription.line_items?.[0]?.name ||
      "";
    
    const planKey = planName.toLowerCase();

    if (!planName) {
      console.warn("[webhooks.app_subscription] Could not extract plan name from payload");
      return new Response();
    }

    // Verifică dacă subscription-ul este activ
    // Status poate fi: ACTIVE, PENDING, CANCELLED, EXPIRED, etc.
    const status = appSubscription.status || appSubscription.current_plan?.status || "";
    const isActive = status === "ACTIVE" || status === "active";

    if (!isActive) {
     
      return new Response();
    }

  

    // Găsește sau creează shop-ul
    const shopRecord = await prisma.shop.upsert({
      where: { shopDomain: shop },
      update: {},
      create: { shopDomain: shop },
      select: { id: true },
    });

    // Obține productsCount pentru a-l salva
    let productsCount = 0;
    try {
      const query = `
        query {
          productsCount { count }
        }
      `;
      const res = await admin.graphql(query);
      const data = await res.json();
      productsCount = data?.data?.productsCount?.count ?? 0;
    } catch (error) {
      console.warn("[webhooks.app_subscription] Could not fetch products count:", error.message);
    }

    // Salvează planul în DB
    await prisma.$executeRaw`
      INSERT INTO "ShopPlan" ("id", "shopId", "planKey", "productsCountAtSelection", "selectedAt", "updatedAt")
      VALUES (gen_random_uuid(), ${shopRecord.id}, ${planKey}, ${productsCount}, NOW(), NOW())
      ON CONFLICT ("shopId") 
      DO UPDATE SET 
        "planKey" = EXCLUDED."planKey",
        "productsCountAtSelection" = EXCLUDED."productsCountAtSelection",
        "selectedAt" = EXCLUDED."selectedAt",
        "updatedAt" = NOW()
    `;

    console.log(`[webhooks.app_subscription] Saved plan ${planKey} for shop ${shop}`);

    // Rulează syncAll pentru a popula metafield definitions în DB (fire-and-forget)
    // NOUA LOGICĂ: Doar metafield definitions (nu mai populăm products și collections la instalare)
    Promise.resolve().then(async () => {
      try {
        console.log(`[webhooks.app_subscription] Starting syncAll for metafield definitions...`);
        await syncAll(admin, shop);
        console.log(`[webhooks.app_subscription] Successfully synced metafield definitions for shop ${shop}`);
      } catch (error) {
        console.error(`[webhooks.app_subscription] Error syncing metafield definitions:`, error);
      }
    });

  } catch (error) {
    console.error("[webhooks.app_subscription] Error processing webhook:", error);
    // Returnăm totuși 200 pentru a nu retrigger webhook-ul
  }

  return new Response();
};


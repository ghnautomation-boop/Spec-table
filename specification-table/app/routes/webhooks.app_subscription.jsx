import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { syncAll } from "../models/sync.server.js";

export const action = async ({ request }) => {
  const { payload, shop, admin, topic } = await authenticate.webhook(request);

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
        await syncAll(admin, shop);
      } catch (error) {
      }
    });

  } catch (error) {
    console.error("[webhooks.app_subscription] Error processing webhook:", error);
    // Returnăm totuși 200 pentru a nu retrigger webhook-ul
  }

  return new Response();
};


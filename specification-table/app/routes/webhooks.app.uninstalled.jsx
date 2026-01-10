import "@shopify/shopify-api/adapters/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import prisma from "../db.server";
import { invalidateShopIdCache } from "../models/template.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // IMPORTANT: La uninstall, token-ul este invalidat imediat de Shopify
  // Trebuie să obținem session-ul din DB și să creăm manual admin client-ul înainte de a-l șterge
  // Notă: Token-ul poate fi deja invalidat, dar încercăm oricum
  let admin = null;
  
  // Încearcă să obțină session-ul direct din DB (înainte de a-l șterge)
  try {
    const dbSession = await db.session.findFirst({
      where: { shop },
      orderBy: { expires: "desc" },
    });
    
    if (dbSession && dbSession.accessToken) {
      try {
        // Creează manual un admin client folosind session-ul din DB
        // Folosim aceeași metodă ca în worker
        const { shopifyApi, ApiVersion } = await import("@shopify/shopify-api");
        
        // Inițializează shopifyApi similar cu worker-ul
        const shopify = shopifyApi({
          apiKey: process.env.SHOPIFY_API_KEY,
          apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
          apiVersion: ApiVersion.October25,
          scopes: process.env.SCOPES?.split(",") || [],
          hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, "") || "",
          isEmbeddedApp: true,
        });
        
        // Creează session object pentru admin client (format simplificat)
        const sessionForAdmin = {
          shop: dbSession.shop,
          accessToken: dbSession.accessToken,
        };
        
        // Verifică dacă există clients.Graphql
        if (!shopify.clients || !shopify.clients.Graphql) {
          throw new Error(`shopify.clients.Graphql is not available. shopify.clients: ${Object.keys(shopify.clients || {}).join(", ")}`);
        }
        
        // Creează admin client folosind shopify API (similar cu worker-ul)
        const graphqlClient = new shopify.clients.Graphql({ session: sessionForAdmin });
        
        // Creează wrapper pentru compatibilitate cu funcțiile existente
        admin = {
          graphql: async (query, options = {}) => {
            const { variables } = options;
            const response = await graphqlClient.request(query, { variables });
            return {
              json: async () => response,
            };
          },
        };
        
        console.log(`[app/uninstalled] Created admin client from DB session for cleanup`);
      } catch (error) {
        console.warn(`[app/uninstalled] Failed to create admin client from DB session:`, error.message);
        console.warn(`[app/uninstalled] Error details:`, error);
      }
    } else {
      console.warn(`[app/uninstalled] No valid session found in DB for shop ${shop}`);
    }
  } catch (error) {
    console.warn(`[app/uninstalled] Failed to get session from DB:`, error.message);
  }

  // Șterge metaobject-urile și metafield-urile create de aplicație înainte de a șterge datele din DB
  if (admin) {
    try {
      console.log(`[app/uninstalled] Cleaning up metaobjects and metafields for ${shop}...`);
      
      const { deleteAllMetaobjects, deleteAllMetafields } = await import("../utils/metaobject.server.js");
      
      // Șterge toate metaobject-urile de tip specification_template
      const metaobjectsDeleted = await deleteAllMetaobjects(admin);
      if (metaobjectsDeleted) {
        console.log(`[app/uninstalled] Metaobjects deletion initiated successfully`);
      } else {
        console.warn(`[app/uninstalled] Failed to delete metaobjects`);
      }
      
      // Șterge toate metafield-urile de pe produse și colecții
      const metafieldsResult = await deleteAllMetafields(admin);
      console.log(`[app/uninstalled] Deleted ${metafieldsResult.productsDeleted} product metafields and ${metafieldsResult.collectionsDeleted} collection metafields`);
    } catch (error) {
      console.error(`[app/uninstalled] Error cleaning up metaobjects and metafields:`, error);
      // Continuă cu ștergerea datelor din DB chiar dacă cleanup-ul eșuează
    }
  } else {
    console.warn(`[app/uninstalled] Admin client not available, skipping metaobjects and metafields cleanup`);
  }

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Invalidă cache-ul pentru shop ID înainte de a șterge shop-ul
  invalidateShopIdCache(shop);

  // Șterge toate datele asociate cu acest shop
  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (shopRecord) {
      await prisma.shop.delete({
        where: { id: shopRecord.id },
      });
      console.log(`[app/uninstalled] Shop ${shop} deleted successfully`);
    }
  } catch (error) {
    console.error("Error deleting shop data:", error);
  }

  return new Response();
};

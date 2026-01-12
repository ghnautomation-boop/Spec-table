import "@shopify/shopify-api/adapters/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import db from "../db.server";
import { syncAll } from "../models/sync.server";
import prisma from "../db.server.js";

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

  // Obține session-ul din DB
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
  const current = payload.current;

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  // Sincronizează metafield definitions când scopes-urile sunt actualizate (la reinstalare)
  // NOUA LOGICĂ: Doar metafield definitions (nu mai populăm products și collections la instalare)
  try {
    console.log(`Syncing metafield definitions for shop ${shop} after scopes update`);
    await syncAll(admin, shop);
    console.log(`Successfully synced metafield definitions for shop ${shop}`);
  } catch (error) {
    console.error("Error syncing metafield definitions on scopes update:", error);
  }

  // Cleanup: Șterge metaobject-urile și metafield-urile vechi care ar putea fi rămase de la o instalare anterioară
  // Acest cleanup se face la reinstalare când avem un admin client valid
  if (admin) {
    try {
      console.log(`[app/scopes_update] Cleaning up old metaobjects and metafields for ${shop}...`);
      
      const { deleteAllMetaobjects, deleteAllMetafields } = await import("../utils/metaobject.server.js");
      
      // Șterge toate metaobject-urile vechi de tip specification_template
      const metaobjectsDeleted = await deleteAllMetaobjects(admin);
      if (metaobjectsDeleted) {
        console.log(`[app/scopes_update] Old metaobjects deletion initiated successfully`);
      }
      
      // Șterge toate metafield-urile vechi de pe produse și colecții
      const metafieldsResult = await deleteAllMetafields(admin);
      console.log(`[app/scopes_update] Cleaned up ${metafieldsResult.productsDeleted} old product metafields and ${metafieldsResult.collectionsDeleted} old collection metafields`);
    } catch (error) {
      console.error(`[app/scopes_update] Error cleaning up old metaobjects and metafields:`, error);
      // Nu aruncăm eroarea - cleanup-ul este opțional
    }
  }

  return new Response();
};

import { createHmac, timingSafeEqual } from "node:crypto";
import db from "../db.server";
import prisma from "../db.server";
import { invalidateShopIdCache } from "../models/template.server";

function safeCompareBase64(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
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

  console.log(`Received ${topic} webhook for ${shop}`);

  // IMPORTANT: La uninstall, Shopify invalidează imediat token-ul de acces
  // Nu mai putem face request-uri API pentru a șterge metaobjects și metafields
  // Shopify va șterge automat metaobjects și metafields-urile create de aplicație
  // Deci nu mai încercăm cleanup-ul - doar ștergem datele din baza noastră de date

  // Obține session-ul din DB pentru a-l șterge
  const session = await db.session.findFirst({
    where: { shop },
    orderBy: { expires: "desc" },
  });

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

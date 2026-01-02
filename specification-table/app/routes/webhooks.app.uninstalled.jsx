import { authenticate } from "../shopify.server";
import db from "../db.server";
import prisma from "../db.server";
import { invalidateShopIdCache } from "../models/template.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

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

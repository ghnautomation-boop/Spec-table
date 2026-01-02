import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncAll } from "../models/sync.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop, admin } = await authenticate.webhook(request);

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

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

  return new Response();
};

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

  // Sincronizează datele când scopes-urile sunt actualizate (la reinstalare)
  try {
    console.log(`Syncing data for shop ${shop} after scopes update`);
    await syncAll(admin, shop);
    console.log(`Successfully synced data for shop ${shop}`);
  } catch (error) {
    console.error("Error syncing data on scopes update:", error);
  }

  return new Response();
};

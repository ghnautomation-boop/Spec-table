import { authenticate } from "../shopify.server";
import { syncMetafieldDefinitions } from "../models/sync.server";

export const action = async ({ request }) => {
  const { shop, topic, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Când se actualizează un produs, sincronizează metafield definitions
    // pentru a se asigura că toate definițiile sunt actualizate
    // (metafield definitions pot fi adăugate sau modificate când se actualizează produsele)
    await syncMetafieldDefinitions(admin, shop);
    console.log(`Successfully synced metafield definitions after product update`);
  } catch (error) {
    console.error("Error syncing metafield definitions:", error);
    // Returnăm totuși 200 pentru a nu retrigger webhook-ul
    return new Response("Error processing webhook", { status: 200 });
  }

  return new Response();
};



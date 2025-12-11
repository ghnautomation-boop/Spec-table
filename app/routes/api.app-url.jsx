/**
 * Endpoint API public pentru a obține URL-ul aplicației
 * Accesibil din theme extension prin request HTTP
 * Returnează URL-ul din process.env.SHOPIFY_APP_URL (din shopify.app.toml)
 */
export async function loader({ request }) {
  // Obține URL-ul aplicației din variabila de mediu (setat automat de Shopify CLI)
  const appUrl = process.env.SHOPIFY_APP_URL || null;

  const response = Response.json({
    appUrl,
  });

  // Adaugă CORS headers pentru a permite request-uri din theme extension
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");

  return response;
}

export async function options() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}



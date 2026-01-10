import prisma from "../db.server.js";

/**
 * Loggează un eveniment webhook în baza de date pentru monitorizare
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {string} topic - Topic-ul webhook-ului
 * @param {string} status - Status-ul ("success", "error", "failed_permanently")
 * @param {string|null} errorMessage - Mesajul de eroare dacă există
 * @param {object|null} payload - Payload-ul webhook-ului (va fi serializat ca JSON)
 * @param {number|null} responseTime - Timpul de răspuns în ms
 * @param {number} retryCount - Numărul de încercări de retry (default 0)
 */
export async function logWebhookEvent(shopDomain, topic, status, errorMessage = null, payload = null, responseTime = null, retryCount = 0) {
  try {
    // Găsește shop-ul
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });

    if (!shop) {
      console.error(`[Webhook Logger] Shop not found: ${shopDomain}`);
      return;
    }

    // Loggează evenimentul
    await prisma.webhookEvent.create({
      data: {
        shopId: shop.id,
        topic,
        status, // "success", "error", "failed_permanently"
        errorMessage,
        payload: payload ? JSON.stringify(payload) : null,
        responseTime,
        retryCount,
        lastRetryAt: retryCount > 0 ? new Date() : null,
      },
    });


  } catch (error) {
    // Nu vrem să blocheze webhook-ul dacă logging-ul eșuează
    console.error(`[Webhook Logger] Error logging webhook event:`, error);
  }
}

/**
 * Obține statisticile webhook-urilor pentru un shop
 */
export async function getWebhookStats(shopDomain, limit = 100) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    return { events: [], stats: {} };
  }

  const events = await prisma.webhookEvent.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      topic: true,
      status: true,
      errorMessage: true,
      responseTime: true,
      createdAt: true,
    },
  });

  // Calculează statistici
  const stats = {
    total: events.length,
    success: events.filter(e => e.status === "success").length,
    error: events.filter(e => e.status === "error").length,
    byTopic: {},
    avgResponseTime: 0,
  };

  // Statistici per topic
  events.forEach(event => {
    if (!stats.byTopic[event.topic]) {
      stats.byTopic[event.topic] = { total: 0, success: 0, error: 0 };
    }
    stats.byTopic[event.topic].total++;
    if (event.status === "success") {
      stats.byTopic[event.topic].success++;
    } else {
      stats.byTopic[event.topic].error++;
    }
  });

  // Calculare timp mediu de răspuns
  const responseTimes = events.filter(e => e.responseTime !== null).map(e => e.responseTime);
  if (responseTimes.length > 0) {
    stats.avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
  }

  return { events, stats };
}




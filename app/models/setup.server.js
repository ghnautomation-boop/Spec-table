import prisma from "../db.server.js";

/**
 * Obține lista de teme din Shopify
 */
export async function getThemes(admin) {
  const query = `
    query getThemes {
      themes(first: 50) {
        edges {
          node {
            id
            name
            role
            createdAt
            updatedAt
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    
    // Verifică dacă răspunsul este un redirect (302) - autentificarea nu este completă
    if (response.status === 302 || response.redirected) {
      console.warn("[getThemes] GraphQL request was redirected, authentication may not be complete");
      return []; // Returnează array gol în loc să arunce eroare
    }

    const data = await response.json();

    if (data.errors) {
      console.error("[getThemes] GraphQL errors:", JSON.stringify(data.errors, null, 2));
      return []; // Returnează array gol în loc să arunce eroare
    }

    if (!data.data || !data.data.themes) {
      console.error("[getThemes] Invalid response structure:", JSON.stringify(data, null, 2));
      return []; // Returnează array gol în loc să arunce eroare
    }

    return data.data.themes.edges.map((edge) => ({
      id: edge.node.id,
      name: edge.node.name,
      role: edge.node.role, // "MAIN", "UNPUBLISHED", "DEVELOPMENT"
      createdAt: edge.node.createdAt,
      updatedAt: edge.node.updatedAt,
    }));
  } catch (error) {
    console.error("[getThemes] Error fetching themes:", error);
    // Returnează array gol în loc să arunce eroare pentru a nu bloca aplicația
    return [];
  }
}

/**
 * Obține sau creează SetupProgress pentru un shop
 */
export async function getSetupProgress(shopDomain) {
  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  let progress = await prisma.setupProgress.findUnique({
    where: { shopId: shop.id },
  });

  if (!progress) {
    progress = await prisma.setupProgress.create({
      data: { shopId: shop.id },
    });
  }

  return progress;
}

/**
 * Actualizează progresul setup-ului
 */
export async function updateSetupProgress(shopDomain, updates) {
  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // Obține progresul actual pentru a verifica dacă toți pașii sunt completați
  const currentProgress = await prisma.setupProgress.findUnique({
    where: { shopId: shop.id },
  });

  const updatedProgress = {
    ...(currentProgress || {}),
    ...updates,
  };

  // Verifică dacă toți pașii sunt completați
  const allStepsCompleted =
    updatedProgress.step1_themeSelected === true &&
    updatedProgress.step2_extensionApplied === true &&
    updatedProgress.step3_extensionActivated === true &&
    updatedProgress.step4_templateCreated === true &&
    updatedProgress.step5_assignmentConfigured === true &&
    updatedProgress.step6_tested === true;

  const progress = await prisma.setupProgress.upsert({
    where: { shopId: shop.id },
    update: {
      ...updates,
      updatedAt: new Date(),
      ...(allStepsCompleted && !currentProgress?.completedAt
        ? { completedAt: new Date() }
        : {}),
    },
    create: {
      shopId: shop.id,
      ...updates,
      ...(allStepsCompleted ? { completedAt: new Date() } : {}),
    },
  });

  return progress;
}

/**
 * Verifică dacă extension-ul este aplicat pe o temă
 * Notă: Acest lucru necesită verificarea manuală sau folosirea Theme API
 */
export async function checkExtensionApplied(admin, themeId) {
  // Pentru moment, returnăm false - va trebui implementat cu Theme API
  // sau verificând manual dacă block-ul este în temă
  return false;
}

/**
 * Generează URL-ul pentru theme editor cu extension-ul
 */
export function getThemeEditorUrl(shopDomain, themeId) {
  const shop = shopDomain.replace(".myshopify.com", "");
  // Extension ID-ul nostru din shopify.extension.toml
  const blockId = "a2a64ce7-0525-dcbb-185b-b30ce28ac0e5764e8e4b";
  return `https://admin.shopify.com/store/${shop}/themes/${themeId}/editor?template=product&addAppBlockId=${blockId}`;
}

/**
 * Extrage ID-ul numeric din GID-ul Shopify
 */
export function extractNumericId(gid) {
  const match = gid.match(/\d+$/);
  return match ? match[0] : null;
}


import prisma from "../db.server.js";

/**
 * Helper function pentru a normaliza ID-urile Shopify
 * Exportat pentru a fi folosit în alte module
 */
export function normalizeShopifyId(id) {
  if (!id || typeof id !== 'string') return null;
  const gidMatch = id.match(/gid:\/\/shopify\/(?:Product|Collection|Variant)\/(\d+)/);
  if (gidMatch) {
    return gidMatch[1];
  }
  return String(id).trim() || null;
}

/**
 * Reconstruiește lookup table-ul pentru un shop
 * Această funcție recalculează toate mapping-urile bazate pe assignment-urile curente
 */
export async function rebuildTemplateLookup(shopId) {
  // Șterge toate lookup-urile existente pentru acest shop
  await prisma.templateLookup.deleteMany({
    where: { shopId },
  });

  // Obține toate assignment-urile active pentru acest shop
  const assignments = await prisma.templateAssignment.findMany({
    where: {
      shopId,
      template: { isActive: true },
    },
    include: {
      template: {
        select: { id: true, isActive: true },
      },
      targets: true,
    },
  });

  if (assignments.length === 0) {
    return { rebuilt: 0 };
  }

  // Obține toate produsele și colecțiile din shop (pentru DEFAULT și EXCEPT)
  const [allProducts, allCollections] = await Promise.all([
    prisma.product.findMany({
      where: { shopId },
      select: { shopifyId: true },
    }),
    prisma.collection.findMany({
      where: { shopId },
      select: { shopifyId: true },
    }),
  ]);

  const normalizedProducts = allProducts.map(p => normalizeShopifyId(p.shopifyId)).filter(Boolean);
  const normalizedCollections = allCollections.map(c => normalizeShopifyId(c.shopifyId)).filter(Boolean);

  const lookupEntries = [];

  for (const assignment of assignments) {
    const templateId = assignment.templateId;
    const assignmentType = assignment.assignmentType;
    const targets = assignment.targets || [];

    // Determină dacă toate target-urile sunt excluse (EXCEPT logic)
    const allExcluded = targets.length > 0 && targets.every(t => t.isExcluded);
    const excludedIds = targets.filter(t => t.isExcluded).map(t => normalizeShopifyId(t.targetShopifyId));

    if (assignmentType === "PRODUCT") {
      if (allExcluded) {
        // PRODUCT_EXCEPT: toate produsele EXCEPT cele excluse
        for (const productId of normalizedProducts) {
          if (!excludedIds.includes(productId)) {
            lookupEntries.push({
              shopId,
              productId,
              collectionId: null,
              templateId,
              priority: 1, // PRODUCT priority
            });
          }
        }
      } else {
        // PRODUCT direct: doar produsele specificate
        for (const target of targets) {
          if (!target.isExcluded) {
            const productId = normalizeShopifyId(target.targetShopifyId);
            if (productId) {
              lookupEntries.push({
                shopId,
                productId,
                collectionId: null,
                templateId,
                priority: 1, // PRODUCT priority
              });
            }
          }
        }
      }
    } else if (assignmentType === "COLLECTION") {
      if (allExcluded) {
        // COLLECTION_EXCEPT: toate colecțiile EXCEPT cele excluse
        for (const collectionId of normalizedCollections) {
          if (!excludedIds.includes(collectionId)) {
            lookupEntries.push({
              shopId,
              productId: null,
              collectionId,
              templateId,
              priority: 2, // COLLECTION priority
            });
          }
        }
      } else {
        // COLLECTION direct: doar colecțiile specificate
        for (const target of targets) {
          if (!target.isExcluded) {
            const collectionId = normalizeShopifyId(target.targetShopifyId);
            if (collectionId) {
              lookupEntries.push({
                shopId,
                productId: null,
                collectionId,
                templateId,
                priority: 2, // COLLECTION priority
              });
            }
          }
        }
      }
    } else if (assignmentType === "DEFAULT") {
      // DEFAULT: toate produsele și colecțiile
      for (const productId of normalizedProducts) {
        lookupEntries.push({
          shopId,
          productId,
          collectionId: null,
          templateId,
          priority: 3, // DEFAULT priority
        });
      }
      for (const collectionId of normalizedCollections) {
        lookupEntries.push({
          shopId,
          productId: null,
          collectionId,
          templateId,
          priority: 3, // DEFAULT priority
        });
      }
    }
  }

  // Inserează lookup-urile în batch-uri pentru performanță
  if (lookupEntries.length > 0) {
    // Folosim createMany pentru performanță, dar trebuie să gestionăm duplicate-urile
    // PostgreSQL va ignora duplicate-urile datorită unique constraint
    const batchSize = 1000;
    for (let i = 0; i < lookupEntries.length; i += batchSize) {
      const batch = lookupEntries.slice(i, i + batchSize);
      await prisma.templateLookup.createMany({
        data: batch,
        skipDuplicates: true, // Ignoră duplicate-urile (datorită unique constraint)
      });
    }
  }

  return { rebuilt: lookupEntries.length };
}

/**
 * Obține template-ul pentru un produs sau colecție folosind lookup table-ul
 * Aceasta este versiunea optimizată care folosește lookup table-ul
 * 
 * Logica de prioritate:
 * 1. PRODUCT (priority=1) - cel mai prioritar
 * 2. COLLECTION (priority=2) - prioritate medie
 * 3. DEFAULT (priority=3) - prioritate minimă
 * 
 * OPTIMIZARE: Un singur query cu OR în loc de 2 query-uri separate
 */
export async function getTemplateFromLookup(shopId, productId = null, collectionId = null) {
  const normalizedProductId = normalizeShopifyId(productId);
  const normalizedCollectionId = normalizeShopifyId(collectionId);

  // Construiește condițiile WHERE pentru un singur query optimizat
  const whereConditions = {
    shopId,
    OR: [],
  };

  // Adaugă condiția pentru productId dacă există
  if (normalizedProductId) {
    whereConditions.OR.push({
      AND: [
        { productId: normalizedProductId },
        { productId: { not: null } },
      ],
    });
  }

  // Adaugă condiția pentru collectionId dacă există
  if (normalizedCollectionId) {
    whereConditions.OR.push({
      AND: [
        { collectionId: normalizedCollectionId },
        { collectionId: { not: null } },
      ],
    });
  }

  // Adaugă condiția pentru DEFAULT (isDefault = true)
  whereConditions.OR.push({
    isDefault: true,
  });

  // Un singur query optimizat cu OR pentru toate cazurile
  const lookup = await prisma.templateLookup.findFirst({
    where: whereConditions,
    orderBy: {
      priority: "asc", // Prioritatea cea mai mică (PRODUCT=1) este cea mai importantă
    },
    select: {
      templateId: true,
    },
  });

  return lookup?.templateId || null;
}

/**
 * Reconstruiește lookup table-ul pentru toate shop-urile
 * Util pentru migrare sau reparații
 */
export async function rebuildAllTemplateLookups() {
  const shops = await prisma.shop.findMany({
    select: { id: true, shopDomain: true },
  });

  const results = [];
  for (const shop of shops) {
    try {
      const result = await rebuildTemplateLookup(shop.id);
      results.push({
        shopId: shop.id,
        shopDomain: shop.shopDomain,
        rebuilt: result.rebuilt,
        success: true,
      });
    } catch (error) {
      results.push({
        shopId: shop.id,
        shopDomain: shop.shopDomain,
        error: error.message,
        success: false,
      });
    }
  }

  return results;
}


import prisma from "../db.server.js";

// Debounce pentru rebuild - evită rebuild-uri multiple simultane pentru același shop
const rebuildDebounceMap = new Map();

/**
 * Helper function pentru a normaliza ID-urile Shopify
 * Exportat pentru a fi folosit în alte module
 */
export function normalizeShopifyId(id) {
  if (!id) return null;
  // Convertește la string pentru a putea lucra cu el (poate fi number sau string)
  const idStr = String(id).trim();
  if (!idStr) return null;
  
  // Dacă este în format GID (gid://shopify/Product/123), extrage doar partea numerică
  const gidMatch = idStr.match(/gid:\/\/shopify\/(?:Product|Collection|Variant)\/(\d+)/);
  if (gidMatch) {
    return gidMatch[1];
  }
  
  // Dacă este deja numeric (doar cifre), returnează-l
  if (/^\d+$/.test(idStr)) {
    return idStr;
  }
  
  // Altfel, returnează string-ul trimis (poate fi deja normalizat)
  return idStr || null;
}

/**
 * Reconstruiește lookup table-ul pentru un shop
 * OPTIMIZAT: Nu mai stochează produsele din colecții - doar colecțiile în sine
 * Collection.id vine din Shopify context (Liquid), nu din DB
 * 
 * Folosește debounce pentru a evita rebuild-uri multiple simultane pentru același shop
 * 
 * @param {string} shopId - ID-ul shop-ului
 * @param {string} shopDomain - Domain-ul shop-ului (opțional, nu mai folosit pentru produse din colecții)
 * @param {object} admin - Shopify Admin API client (opțional, nu mai folosit pentru produse din colecții)
 */
export async function rebuildTemplateLookup(shopId, shopDomain = null, admin = null) {
  // Debounce: dacă există deja un rebuild în curs pentru acest shop, așteaptă puțin și reîncearcă
  const debounceKey = `rebuild-${shopId}`;
  const existingRebuild = rebuildDebounceMap.get(debounceKey);
  
  if (existingRebuild) {
    console.log(`[rebuildTemplateLookup] Debounce: Found existing rebuild for shop ${shopId}, waiting 200ms...`);
    // Așteaptă puțin pentru ca assignment-urile să fie salvate
    await new Promise(resolve => setTimeout(resolve, 200));
    // Reîncearcă rebuild-ul
    return rebuildTemplateLookup(shopId, shopDomain, admin);
  }
  
  // Marchează că rebuild-ul este în curs
  rebuildDebounceMap.set(debounceKey, true);
  
  try {
    return await _rebuildTemplateLookupInternal(shopId, shopDomain, admin);
  } finally {
    // Elimină flag-ul după un mic delay pentru a permite rebuild-uri ulterioare
    setTimeout(() => {
      rebuildDebounceMap.delete(debounceKey);
    }, 300);
  }
}

async function _rebuildTemplateLookupInternal(shopId, shopDomain = null, admin = null) {
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
      targets: {
        orderBy: {
          id: "asc", // Ordine consistentă pentru a evita duplicate-uri
        },
      },
    },
    orderBy: {
      createdAt: "asc", // Ordine consistentă pentru procesare
    },
  });
  
  console.log(`[rebuildTemplateLookup] Found ${assignments.length} active assignments for shop ${shopId}`);
  assignments.forEach((assignment, index) => {
    console.log(`[rebuildTemplateLookup] Assignment ${index + 1}:`, {
      templateId: assignment.templateId,
      assignmentType: assignment.assignmentType,
      targetsCount: assignment.targets?.length || 0,
      targets: assignment.targets?.map(t => ({
        id: t.id,
        targetShopifyId: t.targetShopifyId,
        targetType: t.targetType,
        isExcluded: t.isExcluded,
      })) || [],
    });
  });

  if (assignments.length === 0) {
    return { rebuilt: 0 };
  }

  // NOUA LOGICĂ: Nu mai folosim PRODUCT_EXCEPT sau COLLECTION_EXCEPT
  // Folosim doar produsele/colecțiile din DB (cele assignate)
  const lookupEntries = [];

  for (const assignment of assignments) {
    const templateId = assignment.templateId;
    const assignmentType = assignment.assignmentType;
    const targets = assignment.targets || [];

    if (assignmentType === "PRODUCT") {
      // PRODUCT direct: doar produsele specificate (care sunt deja în DB)
      for (const target of targets) {
        const productId = normalizeShopifyId(target.targetShopifyId);
        if (productId) {
          // Verifică dacă produsul există în DB (a fost sincronizat când s-a făcut assignment)
          // Folosim normalizeShopifyId pentru a converti productId la format GID dacă e necesar
          const productGid = productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`;
          const productExists = await prisma.product.findFirst({
            where: {
              shopId,
              OR: [
                { shopifyId: productGid },
                { shopifyId: productId },
              ],
            },
          });
          
          if (productExists) {
            lookupEntries.push({
              shopId,
              productId,
              collectionId: null,
              templateId,
              priority: 1, // PRODUCT priority
            });
          } else {
            console.warn(`[rebuildTemplateLookup] Product ${productId} not found in DB, skipping`);
          }
        }
      }
    } else if (assignmentType === "COLLECTION") {
      // COLLECTION direct: doar colecțiile specificate (care sunt deja în DB)
      // Elimină duplicate-urile din targets înainte de procesare
      const uniqueTargets = [];
      const seenTargetIds = new Set();
      for (const target of targets) {
        const normalizedTargetId = normalizeShopifyId(target.targetShopifyId);
        if (normalizedTargetId && !seenTargetIds.has(normalizedTargetId)) {
          seenTargetIds.add(normalizedTargetId);
          uniqueTargets.push(target);
        }
      }
      
      console.log(`[rebuildTemplateLookup] Processing ${uniqueTargets.length} unique collection targets (from ${targets.length} total)`);
      
      for (const target of uniqueTargets) {
        const collectionId = normalizeShopifyId(target.targetShopifyId);
        
        if (collectionId) {
          // Verifică dacă colecția există în DB (a fost sincronizată când s-a făcut assignment)
          // Folosim normalizeShopifyId pentru a converti collectionId la format GID dacă e necesar
          const collectionGid = collectionId.startsWith("gid://") ? collectionId : `gid://shopify/Collection/${collectionId}`;
          const collectionExists = await prisma.collection.findFirst({
            where: {
              shopId,
              OR: [
                { shopifyId: collectionGid },
                { shopifyId: collectionId },
              ],
            },
          });
          
          if (collectionExists) {
            // Asigură-te că collectionId este string pentru consistență în DB
            const collectionIdStr = String(collectionId).trim();
            
            // Adaugă doar intrarea pentru colecție (fără produsele din ea)
            lookupEntries.push({
              shopId,
              productId: null,
              collectionId: collectionIdStr,
              templateId,
              priority: 2, // COLLECTION priority
            });
          } else {
            console.warn(`[rebuildTemplateLookup] Collection ${collectionId} not found in DB, skipping`);
          }
        } else {
          console.warn(`[rebuildTemplateLookup] Failed to normalize collectionId:`, {
            targetShopifyId: target.targetShopifyId,
            targetType: target.targetType,
          });
        }
      }
    } else if (assignmentType === "DEFAULT") {
      // OPTIMIZAT: DEFAULT este doar 1 linie per shop cu isDefault=true
      // Nu mai stocăm toate produsele și colecțiile - se aplică automat dacă nu găsești PRODUCT sau COLLECTION
      lookupEntries.push({
        shopId,
        productId: null,
        collectionId: null,
        templateId,
        priority: 3, // DEFAULT priority
        isDefault: true, // Marchează ca DEFAULT pentru lookup rapid
      });
    }
  }

  // Inserează lookup-urile în batch-uri pentru performanță
  if (lookupEntries.length > 0) {
    // Elimină duplicate-urile înainte de salvare
    // NOTĂ: Unique constraint este pe [shopId, productId, collectionId, priority] (FĂRĂ templateId)
    // Asta înseamnă că pot exista doar UN template per combinație shopId/productId/collectionId/priority
    // Dacă există duplicate-uri, păstrăm ultimul (cel mai recent procesat)
    const uniqueEntriesMap = new Map();
    for (const entry of lookupEntries) {
      // Creează o cheie unică bazată pe unique constraint (FĂRĂ templateId)
      const key = `${entry.shopId}|${entry.productId || 'null'}|${entry.collectionId || 'null'}|${entry.priority}`;
      
      if (!uniqueEntriesMap.has(key)) {
        uniqueEntriesMap.set(key, entry);
      } else {
        // Dacă există deja o intrare cu aceeași cheie, înseamnă că avem un conflict
        // Păstrăm ultimul (cel mai recent procesat) - asta înseamnă că ultimul template asignat va fi folosit
        const existing = uniqueEntriesMap.get(key);
        if (existing.templateId !== entry.templateId) {
          console.warn(`[rebuildTemplateLookup] Duplicate entry found with different templateId (keeping latest):`, {
            existing: existing.templateId,
            new: entry.templateId,
            key: key,
            priority: entry.priority,
          });
        }
        // Păstrăm ultimul (cel mai recent)
        uniqueEntriesMap.set(key, entry);
      }
    }
    
    const uniqueEntries = Array.from(uniqueEntriesMap.values());
    
    // Debug: afișează ce se va salva în DB
    console.log(`[rebuildTemplateLookup] About to save ${uniqueEntries.length} unique lookup entries (from ${lookupEntries.length} total)`);
    
    // Debug: afișează toate entry-urile pentru debugging
    const defaultEntries = uniqueEntries.filter(e => e.isDefault === true);
    const collectionEntries = uniqueEntries.filter(e => e.collectionId !== null && e.isDefault !== true);
    const productEntries = uniqueEntries.filter(e => e.productId !== null && e.isDefault !== true);
    
    if (defaultEntries.length > 0) {
      console.log(`[rebuildTemplateLookup] DEFAULT entries to save:`, defaultEntries.map(e => ({
        templateId: e.templateId,
        priority: e.priority,
        isDefault: e.isDefault,
      })));
    }
    if (collectionEntries.length > 0) {
      console.log(`[rebuildTemplateLookup] Collection entries to save:`, collectionEntries.map(e => ({
        collectionId: e.collectionId,
        collectionIdType: typeof e.collectionId,
        templateId: e.templateId,
        priority: e.priority,
      })));
    }
    if (productEntries.length > 0) {
      console.log(`[rebuildTemplateLookup] Product entries to save:`, productEntries.map(e => ({
        productId: e.productId,
        templateId: e.templateId,
        priority: e.priority,
      })));
    }
    
    // Folosim createMany pentru performanță
    // Nu mai avem nevoie de skipDuplicates pentru că am șters toate entry-urile vechi la începutul funcției
    const batchSize = 1000;
    let totalSaved = 0;
    for (let i = 0; i < uniqueEntries.length; i += batchSize) {
      const batch = uniqueEntries.slice(i, i + batchSize);
      const result = await prisma.templateLookup.createMany({
        data: batch,
        skipDuplicates: false, // Nu mai avem nevoie de skipDuplicates
      });
      totalSaved += result.count;
      console.log(`[rebuildTemplateLookup] Saved batch ${i / batchSize + 1}: ${result.count} entries`);
    }
    console.log(`[rebuildTemplateLookup] Total saved: ${totalSaved} entries`);
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

  // OPTIMIZAT: Query-uri separate în ordinea priorității (mai eficient decât OR)
  // 1. Caută după productId (priority 1) - PRODUCT assignment direct
  if (normalizedProductId) {
    const lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId,
        productId: normalizedProductId,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
      },
    });
    
    if (lookup) {
      return lookup.templateId;
    }
  }

  // 2. Dacă nu s-a găsit, caută după collectionId (priority 2)
  // NOTĂ: collectionId vine din parametru (Shopify context), nu din DB
  if (normalizedCollectionId) {
    const lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId,
        collectionId: normalizedCollectionId,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
      },
    });
    
    if (lookup) {
      return lookup.templateId;
    }
  }

  // 3. Dacă nu s-a găsit, caută DEFAULT (priority 3) - 1 linie per shop
  const lookup = await prisma.templateLookup.findFirst({
    where: {
      shopId,
      isDefault: true,
    },
    orderBy: {
      priority: "asc",
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


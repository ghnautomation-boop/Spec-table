import prisma from "../db.server.js";

/**
 * Obține toate template-urile pentru un shop
 */
// Cache pentru shop ID (evită query repetat pentru același shopDomain)
const shopIdCache = new Map();

export async function getTemplates(shopDomain) {
  const perfStart = performance.now();
  
  // Verifică cache pentru shop ID
  let shopId = shopIdCache.get(shopDomain);
  if (!shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) {
      return [];
    }
    shopId = shop.id;
    shopIdCache.set(shopDomain, shopId);
  }
  
  const shopQueryTime = performance.now() - perfStart;

  // Query optimizat: folosește select în loc de include pentru a aduce doar câmpurile necesare
  const queryStart = performance.now();
  const result = await prisma.specificationTemplate.findMany({
    where: { shopId: shopId },
    select: {
      id: true,
      name: true,
      isActive: true,
      isAccordion: true,
      seeMoreEnabled: true,
      styling: true,
      createdAt: true,
      updatedAt: true,
      sections: {
        select: {
          id: true,
          heading: true,
          order: true,
          metafields: {
            select: {
              id: true,
              order: true,
              customName: true,
              tooltipEnabled: true,
              tooltipText: true,
              hideFromPC: true,
              hideFromMobile: true,
              metafieldDefinition: {
                select: {
                  id: true,
                  namespace: true,
                  key: true,
                  name: true,
                  type: true,
                  ownerType: true,
                },
              },
            },
            orderBy: {
              order: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
      assignments: {
        select: {
          id: true,
          assignmentType: true,
          targets: {
            select: {
              id: true,
              targetShopifyId: true,
              targetType: true,
              isExcluded: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  
  const queryTime = performance.now() - queryStart;
  if (process.env.NODE_ENV === "development") {
    console.log(`[PERF] getTemplates - Shop query: ${shopQueryTime.toFixed(2)}ms, Main query: ${queryTime.toFixed(2)}ms, Total: ${(performance.now() - perfStart).toFixed(2)}ms`);
  }
  
  return result;
}

/**
 * Obține un template specific
 */
export async function getTemplate(templateId, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return null;
  }

  return await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
    include: {
      sections: {
        include: {
          metafields: {
            include: {
              metafieldDefinition: true,
            },
            orderBy: {
              order: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
      assignments: {
        include: {
          targets: true,
        },
      },
    },
  });
}

/**
 * Creează un template nou
 */
export async function createTemplate(data, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const { name, styling, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, sections } = data;

  return await prisma.specificationTemplate.create({
    data: {
      name,
      styling: JSON.stringify(styling || {}),
      isActive: isActive !== undefined ? isActive : true,
      isAccordion: isAccordion !== undefined ? isAccordion : false,
      isAccordionHideFromPC: isAccordionHideFromPC !== undefined ? isAccordionHideFromPC : false,
      isAccordionHideFromMobile: isAccordionHideFromMobile !== undefined ? isAccordionHideFromMobile : false,
      seeMoreEnabled: seeMoreEnabled !== undefined ? seeMoreEnabled : false,
      seeMoreHideFromPC: seeMoreHideFromPC !== undefined ? seeMoreHideFromPC : false,
      seeMoreHideFromMobile: seeMoreHideFromMobile !== undefined ? seeMoreHideFromMobile : false,
      shopId: shop.id,
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => {
              const customName = metafield.customName && metafield.customName.trim() !== "" ? metafield.customName.trim() : null;
              const tooltipText = metafield.tooltipText && metafield.tooltipText.trim() !== "" ? metafield.tooltipText.trim() : null;
              
              return {
                metafieldDefinitionId: metafield.metafieldDefinitionId,
                order: metafieldIndex,
                customName,
                tooltipEnabled: metafield.tooltipEnabled || false,
                tooltipText,
                hideFromPC: metafield.hideFromPC || false,
                hideFromMobile: metafield.hideFromMobile || false,
              };
            }) || [],
          },
        })) || [],
      },
    },
    include: {
      sections: {
        include: {
          metafields: {
            include: {
              metafieldDefinition: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Duplică un template (fără assignments)
 */
export async function duplicateTemplate(templateId, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  // Obține template-ul original cu toate secțiunile și metafields
  const originalTemplate = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
    include: {
      sections: {
        include: {
          metafields: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  if (!originalTemplate) {
    throw new Error("Template not found");
  }

  // Parse styling
  const styling = originalTemplate.styling ? JSON.parse(originalTemplate.styling) : {};

  // Creează noul template cu numele "original name + duplicate"
  const newName = `${originalTemplate.name} duplicate`;

  return await prisma.specificationTemplate.create({
    data: {
      name: newName,
      styling: JSON.stringify(styling),
      isActive: false, // Template-ul duplicat este inactiv by default
      isAccordion: originalTemplate.isAccordion,
      isAccordionHideFromPC: originalTemplate.isAccordionHideFromPC,
      isAccordionHideFromMobile: originalTemplate.isAccordionHideFromMobile,
      seeMoreEnabled: originalTemplate.seeMoreEnabled,
      seeMoreHideFromPC: originalTemplate.seeMoreHideFromPC,
      seeMoreHideFromMobile: originalTemplate.seeMoreHideFromMobile,
      shopId: shop.id,
      sections: {
        create: originalTemplate.sections.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields.map((metafield, metafieldIndex) => ({
              metafieldDefinitionId: metafield.metafieldDefinitionId,
              order: metafieldIndex,
              customName: metafield.customName,
              tooltipEnabled: metafield.tooltipEnabled,
              tooltipText: metafield.tooltipText,
              hideFromPC: metafield.hideFromPC,
              hideFromMobile: metafield.hideFromMobile,
            })),
          },
        })),
      },
    },
    include: {
      sections: {
        include: {
          metafields: {
            include: {
              metafieldDefinition: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Toggle isActive pentru un template
 */
export async function toggleTemplateActive(templateId, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const template = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  // Toggle isActive
  const updated = await prisma.specificationTemplate.update({
    where: { id: template.id },
    data: {
      isActive: !template.isActive,
    },
  });

  // Reconstruiește lookup table-ul dacă template-ul a fost activat/dezactivat
  const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
  await rebuildTemplateLookup(shop.id);

  return updated;
}

/**
 * Actualizează un template
 */
export async function updateTemplate(templateId, data, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const template = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  const { name, styling, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, sections } = data;

  // Debug: verifică datele primite
  if (process.env.NODE_ENV === "development") {
    console.log("updateTemplate - Data received:", JSON.stringify({
      name,
      seeMoreEnabled,
      seeMoreHideFromPC,
      seeMoreHideFromMobile,
      sections: sections?.map(s => ({
        heading: s.heading,
        metafields: s.metafields?.map(mf => ({
          metafieldDefinitionId: mf.metafieldDefinitionId,
          customName: mf.customName,
          tooltipEnabled: mf.tooltipEnabled,
          tooltipText: mf.tooltipText,
        }))
      }))
    }, null, 2));
  }

  // Șterge secțiunile existente și creează-le din nou
  await prisma.templateSection.deleteMany({
    where: { templateId: template.id },
  });

  const wasActive = template.isActive;
  const updated = await prisma.specificationTemplate.update({
    where: { id: template.id },
    data: {
      name,
      styling: JSON.stringify(styling || {}),
      isActive: isActive !== undefined ? isActive : template.isActive,
      isAccordion: isAccordion !== undefined ? isAccordion : template.isAccordion,
      isAccordionHideFromPC: isAccordionHideFromPC !== undefined ? isAccordionHideFromPC : template.isAccordionHideFromPC || false,
      isAccordionHideFromMobile: isAccordionHideFromMobile !== undefined ? isAccordionHideFromMobile : template.isAccordionHideFromMobile || false,
      seeMoreEnabled: seeMoreEnabled !== undefined ? seeMoreEnabled : template.seeMoreEnabled || false,
      seeMoreHideFromPC: seeMoreHideFromPC !== undefined ? seeMoreHideFromPC : template.seeMoreHideFromPC || false,
      seeMoreHideFromMobile: seeMoreHideFromMobile !== undefined ? seeMoreHideFromMobile : template.seeMoreHideFromMobile || false,
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => {
              const customName = metafield.customName && metafield.customName.trim() !== "" ? metafield.customName.trim() : null;
              const tooltipText = metafield.tooltipText && metafield.tooltipText.trim() !== "" ? metafield.tooltipText.trim() : null;
              
              return {
                metafieldDefinitionId: metafield.metafieldDefinitionId,
                order: metafieldIndex,
                customName,
                tooltipEnabled: metafield.tooltipEnabled || false,
                tooltipText,
                hideFromPC: metafield.hideFromPC || false,
                hideFromMobile: metafield.hideFromMobile || false,
              };
            }) || [],
          },
        })) || [],
      },
    },
    include: {
      sections: {
        include: {
          metafields: {
            include: {
              metafieldDefinition: true,
            },
          },
        },
      },
    },
  });

  // Dacă isActive s-a schimbat, reconstruiește lookup table-ul
  if (isActive !== undefined && isActive !== wasActive) {
    const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
    await rebuildTemplateLookup(template.shopId);
  }

  return updated;
}

/**
 * Șterge un template
 */
export async function deleteTemplate(templateId, shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const template = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  const deleted = await prisma.specificationTemplate.delete({
    where: { id: template.id },
  });

  // Reconstruiește lookup table-ul pentru acest shop (template-ul a fost șters)
  const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
  await rebuildTemplateLookup(template.shopId);

  return deleted;
}

/**
 * Obține toate metafield definitions pentru un shop
 */
export async function getMetafieldDefinitions(shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return [];
  }

  return await prisma.metafieldDefinition.findMany({
    where: { shopId: shop.id },
    orderBy: [
      { ownerType: "asc" },
      { namespace: "asc" },
      { key: "asc" },
    ],
  });
}

/**
 * Obține produsele pentru un shop (cu search opțional)
 */
export async function getProducts(shopDomain, search = "") {
  // Folosește cache pentru shop ID
  let shopId = shopIdCache.get(shopDomain);
  if (!shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) {
      return [];
    }
    shopId = shop.id;
    shopIdCache.set(shopDomain, shopId);
  }

  const where = {
    shopId: shopId,
    ...(search && {
      title: {
        contains: search,
      },
    }),
  };

  return await prisma.product.findMany({
    where,
    select: {
      id: true,
      shopifyId: true,
      title: true,
      handle: true,
    },
    orderBy: { title: "asc" },
    take: 100, // Limitează la 100 pentru performanță
  });
}

/**
 * Obține colecțiile pentru un shop (cu search opțional)
 */
export async function getCollections(shopDomain, search = "") {
  // Folosește cache pentru shop ID
  let shopId = shopIdCache.get(shopDomain);
  if (!shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) {
      return [];
    }
    shopId = shop.id;
    shopIdCache.set(shopDomain, shopId);
  }

  const where = {
    shopId: shopId,
    ...(search && {
      title: {
        contains: search,
      },
    }),
  };

  return await prisma.collection.findMany({
    where,
    select: {
      id: true,
      shopifyId: true,
      title: true,
      handle: true,
    },
    orderBy: { title: "asc" },
    take: 100, // Limitează la 100 pentru performanță
  });
}

/**
 * Obține toate assignment-urile pentru un shop (pentru verificare duplicate)
 */
export async function getAllAssignments(shopDomain) {
  // Folosește cache pentru shop ID
  let shopId = shopIdCache.get(shopDomain);
  if (!shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) {
      return [];
    }
    shopId = shop.id;
    shopIdCache.set(shopDomain, shopId);
  }

  return await prisma.templateAssignment.findMany({
    where: { shopId: shopId },
    select: {
      id: true,
      templateId: true,
      assignmentType: true,
      template: {
        select: { id: true, name: true },
      },
      targets: {
        select: {
          id: true,
          targetShopifyId: true,
          targetType: true,
          isExcluded: true,
        },
      },
    },
  });
}

/**
 * Salvează assignment-ul pentru un template
 */
export async function saveTemplateAssignment(templateId, assignmentType, targetIds, shopDomain, isExcluded = false, admin = null) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const template = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  // Verifică duplicate-urile
  const allAssignments = await prisma.templateAssignment.findMany({
    where: {
      shopId: shop.id,
      templateId: { not: template.id }, // Exclude template-ul curent
    },
    include: {
      targets: true,
    },
  });

  // Verifică dacă există deja un template assignat global
  if (assignmentType === "DEFAULT") {
    const globalAssignment = allAssignments.find(a => a.assignmentType === "DEFAULT");
    if (globalAssignment) {
      throw new Error(`Another template (${globalAssignment.templateId}) is already assigned globally`);
    }
  }

  // Pentru EXCEPT assignments, trebuie să adăugăm automat în excluderi
  // toate produsele/colecțiile care sunt deja assignate la alte template-uri
  let autoAddedCount = 0;
  if (isExcluded && assignmentType !== "DEFAULT") {
    // Găsește toate produsele/colecțiile care sunt deja assignate la alte template-uri
    const alreadyAssignedTargets = new Set();
    allAssignments.forEach(assignment => {
      if (assignment.assignmentType === assignmentType) {
        assignment.targets.forEach(target => {
          // Include doar target-urile care NU sunt excluded (sunt assignate direct)
          if (target.targetType === assignmentType && !target.isExcluded) {
            alreadyAssignedTargets.add(target.targetShopifyId);
          }
        });
      }
    });
    
    // Adaugă automat target-urile deja assignate în lista de excluderi
    const targetIdsSet = new Set(targetIds || []);
    const initialCount = targetIds.length;
    alreadyAssignedTargets.forEach(targetId => {
      if (!targetIdsSet.has(targetId)) {
        targetIds.push(targetId);
      }
    });
    
    autoAddedCount = targetIds.length - initialCount;
    
    if (autoAddedCount > 0 && process.env.NODE_ENV === "development") {
      console.log(`[EXCEPT] Automatically added ${autoAddedCount} already assigned ${assignmentType === "PRODUCT" ? "products" : "collections"} to exclusions`);
    }
  }

  // Verifică dacă colecțiile/produsele selectate sunt deja assignate
  // Doar dacă NU sunt excluderi (pentru excluderi, logica este inversă)
  if (targetIds && targetIds.length > 0 && !isExcluded) {
    // Importă normalizeShopifyId pentru a normaliza ID-urile
    const { normalizeShopifyId } = await import("./template-lookup.server.js");
    
    const conflictingAssignments = [];
    for (const targetId of targetIds) {
      const normalizedTargetId = normalizeShopifyId(targetId);
      if (!normalizedTargetId) continue;
      
      // Verifică dacă target-ul este assignat direct
      const directConflict = allAssignments.find(a => 
        a.assignmentType === assignmentType &&
        a.targets.some(t => {
          const normalizedTId = normalizeShopifyId(t.targetShopifyId);
          return normalizedTId === normalizedTargetId && !t.isExcluded;
        })
      );
      
      if (directConflict) {
        conflictingAssignments.push({
          targetId: normalizedTargetId,
          templateId: directConflict.templateId,
        });
        continue;
      }
      
      // Verifică dacă target-ul face parte dintr-un EXCEPT assignment
      for (const assignment of allAssignments) {
        if (assignment.assignmentType !== assignmentType) continue;
        
        // Verifică dacă este un EXCEPT assignment (toate target-urile sunt excluded)
        const allExcluded = assignment.targets.length > 0 && assignment.targets.every(t => t.isExcluded);
        if (allExcluded) {
          const excludedIds = assignment.targets
            .filter(t => t.isExcluded)
            .map(t => normalizeShopifyId(t.targetShopifyId))
            .filter(Boolean);
          
          // Dacă target-ul NU este în lista de excluded, înseamnă că face parte din EXCEPT assignment
          if (!excludedIds.includes(normalizedTargetId)) {
            conflictingAssignments.push({
              targetId: normalizedTargetId,
              templateId: assignment.templateId,
            });
            break;
          }
        }
      }
    }
    
    if (conflictingAssignments.length > 0) {
      throw new Error(`Some targets are already assigned to other templates`);
    }
  }

  // Șterge assignment-urile existente pentru acest template
  await prisma.templateAssignment.deleteMany({
    where: { templateId: template.id },
  });

  // Reconstruiește lookup table-ul (assignment-urile vechi au fost șterse)
  const { rebuildTemplateLookup: rebuildLookup1 } = await import("./template-lookup.server.js");
  await rebuildLookup1(shop.id, shopDomain, admin);

  // Dacă nu există assignment (null sau empty), nu creăm nimic
  if (!assignmentType || assignmentType === "NONE") {
    return { success: true };
  }

  // Creează noul assignment
  const assignment = await prisma.templateAssignment.create({
    data: {
      templateId: template.id,
      assignmentType: assignmentType,
      shopId: shop.id,
      targets: {
        create: targetIds?.map((targetId) => ({
          targetShopifyId: targetId,
          targetType: assignmentType === "PRODUCT" ? "PRODUCT" : "COLLECTION",
          isExcluded: isExcluded,
        })) || [],
      },
    },
  });

  // Reconstruiește lookup table-ul pentru acest shop (după ce s-a creat noul assignment)
  const { rebuildTemplateLookup: rebuildLookup2 } = await import("./template-lookup.server.js");
  await rebuildLookup2(shop.id, shopDomain, admin);

  return { 
    success: true, 
    assignment,
    autoAddedCount: autoAddedCount || 0,
    autoAddedType: autoAddedCount > 0 ? assignmentType : null
  };
}

/**
 * Helper function pentru a normaliza ID-urile Shopify (extrage ID-ul numeric din GID dacă e cazul)
 */
function normalizeShopifyId(id) {
  if (!id) return null;
  // Dacă este în format GID (gid://shopify/Product/123456789), extrage doar partea numerică
  const gidMatch = id.match(/gid:\/\/shopify\/(?:Product|Collection)\/(\d+)/);
  if (gidMatch) {
    return gidMatch[1];
  }
  // Dacă este deja numeric, returnează-l ca string pentru consistență
  return String(id);
}

/**
 * Găsește template-ul pentru un produs sau colecție bazat pe assignment rules
 */
/**
 * Helper function pentru a obține template-ul cu toate relațiile (optimizat)
 */
async function getTemplateWithRelations(templateId) {
  return await prisma.specificationTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      isActive: true,
      isAccordion: true,
      isAccordionHideFromPC: true,
      isAccordionHideFromMobile: true,
      seeMoreEnabled: true,
      seeMoreHideFromPC: true,
      seeMoreHideFromMobile: true,
      styling: true,
      sections: {
        select: {
          id: true,
          heading: true,
          order: true,
          metafields: {
            select: {
              id: true,
              order: true,
              customName: true,
              tooltipEnabled: true,
              tooltipText: true,
              hideFromPC: true,
              hideFromMobile: true,
              metafieldDefinition: {
                select: {
                  id: true,
                  namespace: true,
                  key: true,
                  name: true,
                  type: true,
                  ownerType: true,
                },
              },
            },
            orderBy: {
              order: "asc",
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });
}

/**
 * OPTIMIZARE #2: JOIN direct pentru a obține template-ul complet într-un singur query
 * în loc de 2 query-uri separate (lookup + getTemplateWithRelations)
 */
export async function getTemplateForTarget(shopDomain, productId = null, collectionId = null) {
  const perfStart = performance.now();
  
  // OPTIMIZARE: Folosește cache pentru shop ID (evită query repetat)
  const shopQueryStart = performance.now();
  let shopId = shopIdCache.get(shopDomain);
  if (!shopId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) {
      return null;
    }
    shopId = shop.id;
    shopIdCache.set(shopDomain, shopId);
  }
  const shopQueryTime = performance.now() - shopQueryStart;

  // OPTIMIZARE: Elimină lookup check (nu e necesar să verificăm de fiecare dată)
  // Dacă lookup table-ul este gol, query-ul va returna null și vom trata asta mai jos

  // Normalizează ID-urile
  const normalizeStart = performance.now();
  const { normalizeShopifyId } = await import("./template-lookup.server.js");
  const normalizedProductId = normalizeShopifyId(productId);
  const normalizedCollectionId = normalizeShopifyId(collectionId);
  const normalizeTime = performance.now() - normalizeStart;

  // OPTIMIZARE: Caută mai întâi după productId (prioritatea cea mai mare), apoi collectionId, apoi default
  // În loc de OR care poate scana multe rânduri, facem query-uri separate în ordinea priorității
  let lookup = null;
  let lookupQueryTime = 0;

  // 1. Caută după productId (priority 1) - OPTIMIZAT: fără `productId: { not: null }` redundant
  if (normalizedProductId) {
    const queryStart = performance.now();
    lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId: shopId,
        productId: normalizedProductId,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
      },
    });
    lookupQueryTime = performance.now() - queryStart;
    
    if (lookup && process.env.NODE_ENV === "development") {
      console.log(`   ✅ Found template via PRODUCT lookup: ${lookupQueryTime.toFixed(2)}ms`);
    }
  }

  // 2. Dacă nu s-a găsit, caută după collectionId (priority 2)
  if (!lookup && normalizedCollectionId) {
    const queryStart = performance.now();
    lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId: shopId,
        collectionId: normalizedCollectionId,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
      },
    });
    lookupQueryTime = performance.now() - queryStart;
    
    if (lookup && process.env.NODE_ENV === "development") {
      console.log(`   ✅ Found template via COLLECTION lookup: ${lookupQueryTime.toFixed(2)}ms`);
    }
  }

  // 3. Dacă nu s-a găsit, caută DEFAULT (priority 3)
  if (!lookup) {
    const queryStart = performance.now();
    lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId: shopId,
        isDefault: true,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
      },
    });
    lookupQueryTime = performance.now() - queryStart;
    
    if (lookup && process.env.NODE_ENV === "development") {
      console.log(`   ✅ Found template via DEFAULT lookup: ${lookupQueryTime.toFixed(2)}ms`);
    } else if (!lookup && process.env.NODE_ENV === "development") {
      // Dacă lookup table-ul este gol, încearcă să-l reconstruiască (doar o dată)
      console.log("⚠️  [PERF] Lookup table is empty! Rebuilding...");
      try {
        const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
        await rebuildTemplateLookup(shopId);
        console.log("✅ [PERF] Lookup table rebuilt successfully");
        // Reîncearcă query-ul după rebuild
        lookup = await prisma.templateLookup.findFirst({
          where: {
            shopId: shopId,
            isDefault: true,
          },
          orderBy: {
            priority: "asc",
          },
          select: {
            templateId: true,
          },
        });
      } catch (error) {
        console.error("❌ [PERF] Error rebuilding lookup table:", error);
      }
    }
  }

  if (!lookup) {
    if (process.env.NODE_ENV === "development") {
      console.log(`   ⚠️  No template found. Lookup time: ${lookupQueryTime.toFixed(2)}ms`);
      console.log(`   💡 Tip: Rebuild lookup table if assignments exist`);
    }
    return null;
  }

  // 4. Obține template-ul complet cu toate relațiile (query separat pentru performanță)
  // OPTIMIZARE: Folosim query-uri separate pentru a evita JOIN-uri complexe
  const templateQueryStart = performance.now();
  
  // Query principal pentru template
  const template = await prisma.specificationTemplate.findUnique({
    where: { id: lookup.templateId },
    select: {
      id: true,
      name: true,
      isActive: true,
      isAccordion: true,
      isAccordionHideFromPC: true,
      isAccordionHideFromMobile: true,
      seeMoreEnabled: true,
      seeMoreHideFromPC: true,
      seeMoreHideFromMobile: true,
      styling: true,
    },
  });

  if (!template) {
    return null;
  }

  // Query separat pentru secțiuni (mai rapid decât JOIN-ul complex)
  const sectionsStart = performance.now();
  const sections = await prisma.templateSection.findMany({
    where: { templateId: lookup.templateId },
    select: {
      id: true,
      heading: true,
      order: true,
    },
    orderBy: {
      order: "asc",
    },
  });
  const sectionsTime = performance.now() - sectionsStart;

  // Query separat pentru metafields (cu JOIN doar la metafieldDefinition)
  const metafieldsStart = performance.now();
  const sectionIds = sections.map(s => s.id);
  const metafields = sectionIds.length > 0 ? await prisma.templateSectionMetafield.findMany({
    where: {
      sectionId: { in: sectionIds },
    },
    select: {
      id: true,
      sectionId: true,
      order: true,
      customName: true,
      tooltipEnabled: true,
      tooltipText: true,
      hideFromPC: true,
      hideFromMobile: true,
      metafieldDefinition: {
        select: {
          id: true,
          namespace: true,
          key: true,
          name: true,
          type: true,
          ownerType: true,
        },
      },
    },
    orderBy: {
      order: "asc",
    },
  }) : [];
  const metafieldsTime = performance.now() - metafieldsStart;

  // Grupează metafields după sectionId
  const metafieldsBySection = new Map();
  metafields.forEach(mf => {
    if (!metafieldsBySection.has(mf.sectionId)) {
      metafieldsBySection.set(mf.sectionId, []);
    }
    metafieldsBySection.get(mf.sectionId).push(mf);
  });

  // Construiește structura finală
  const templateWithSections = {
    ...template,
    sections: sections.map(section => ({
      ...section,
      metafields: metafieldsBySection.get(section.id) || [],
    })),
  };

  const templateQueryTime = performance.now() - templateQueryStart;

  const totalTime = performance.now() - perfStart;

  if (process.env.NODE_ENV === "development") {
    console.log("🔍 [PERF] getTemplateForTarget Breakdown:");
    console.log(`   🏪 Shop Query: ${shopQueryTime.toFixed(2)}ms ${shopIdCache.has(shopDomain) ? '(cached)' : '(new)'}`);
    console.log(`   🔄 Normalize IDs: ${normalizeTime.toFixed(2)}ms`);
    console.log(`   🔎 Lookup Query: ${lookupQueryTime.toFixed(2)}ms`);
    console.log(`   📄 Template Query: ${templateQueryTime.toFixed(2)}ms`);
    console.log(`      - Sections: ${sectionsTime.toFixed(2)}ms (${sections.length} sections)`);
    console.log(`      - Metafields: ${metafieldsTime.toFixed(2)}ms (${metafields.length} metafields)`);
    console.log(`   ⏱️  Total: ${totalTime.toFixed(2)}ms`);
    
    if (totalTime > 500) {
      console.log(`   ⚠️  WARNING: Query is slow (>500ms)!`);
      if (shopQueryTime > 50 && !shopIdCache.has(shopDomain)) {
        console.log(`   💡 Tip: Shop query is slow - check index on shopDomain`);
      }
      if (lookupQueryTime > 100) {
        console.log(`   💡 Tip: Lookup query is slow - check indexes on TemplateLookup`);
      }
      if (templateQueryTime > 300) {
        console.log(`   💡 Tip: Template query is slow - template has ${sections.length} sections, ${metafields.length} metafields`);
      }
    }
  }

  return templateWithSections;
}
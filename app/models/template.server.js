import prisma from "../db.server.js";

/**
 * Obține toate template-urile pentru un shop
 */
export async function getTemplates(shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return [];
  }

  return await prisma.specificationTemplate.findMany({
    where: { shopId: shop.id },
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
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
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

  const { name, styling, isActive, isAccordion, sections } = data;

  return await prisma.specificationTemplate.create({
    data: {
      name,
      styling: JSON.stringify(styling || {}),
      isActive: isActive !== undefined ? isActive : true,
      isAccordion: isAccordion !== undefined ? isAccordion : false,
      shopId: shop.id,
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => ({
              metafieldDefinitionId: metafield.metafieldDefinitionId,
              order: metafieldIndex,
            })) || [],
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

  const { name, styling, isActive, isAccordion, sections } = data;

  // Șterge secțiunile existente și creează-le din nou
  await prisma.templateSection.deleteMany({
    where: { templateId: template.id },
  });

  return await prisma.specificationTemplate.update({
    where: { id: template.id },
    data: {
      name,
      styling: JSON.stringify(styling || {}),
      isActive: isActive !== undefined ? isActive : template.isActive,
      isAccordion: isAccordion !== undefined ? isAccordion : template.isAccordion,
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => ({
              metafieldDefinitionId: metafield.metafieldDefinitionId,
              order: metafieldIndex,
            })) || [],
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

  return await prisma.specificationTemplate.delete({
    where: { id: template.id },
  });
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
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return [];
  }

  const where = {
    shopId: shop.id,
    ...(search && {
      title: {
        contains: search,
      },
    }),
  };

  return await prisma.product.findMany({
    where,
    orderBy: { title: "asc" },
    take: 100, // Limitează la 100 pentru performanță
  });
}

/**
 * Obține colecțiile pentru un shop (cu search opțional)
 */
export async function getCollections(shopDomain, search = "") {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return [];
  }

  const where = {
    shopId: shop.id,
    ...(search && {
      title: {
        contains: search,
      },
    }),
  };

  return await prisma.collection.findMany({
    where,
    orderBy: { title: "asc" },
    take: 100, // Limitează la 100 pentru performanță
  });
}

/**
 * Obține toate assignment-urile pentru un shop (pentru verificare duplicate)
 */
export async function getAllAssignments(shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return [];
  }

  return await prisma.templateAssignment.findMany({
    where: { shopId: shop.id },
    include: {
      template: {
        select: { id: true, name: true },
      },
      targets: true,
    },
  });
}

/**
 * Salvează assignment-ul pentru un template
 */
export async function saveTemplateAssignment(templateId, assignmentType, targetIds, shopDomain, isExcluded = false) {
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

  // Verifică dacă colecțiile/produsele selectate sunt deja assignate
  // Doar dacă NU sunt excluderi (pentru excluderi, logica este inversă)
  if (targetIds && targetIds.length > 0 && !isExcluded) {
    const conflictingAssignments = [];
    for (const targetId of targetIds) {
      const conflicting = allAssignments.find(a => 
        a.targets.some(t => t.targetShopifyId === targetId && !t.isExcluded)
      );
      if (conflicting) {
        conflictingAssignments.push({
          targetId,
          templateId: conflicting.templateId,
        });
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

  return { success: true, assignment };
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
export async function getTemplateForTarget(shopDomain, productId = null, collectionId = null) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return null;
  }

  // Normalizează ID-urile pentru comparare
  const normalizedProductId = normalizeShopifyId(productId);
  const normalizedCollectionId = normalizeShopifyId(collectionId);

  console.log('getTemplateForTarget - Input:', {
    shopDomain,
    productId,
    collectionId,
    normalizedProductId,
    normalizedCollectionId,
  });

  // Obține toate assignment-urile active
  const assignments = await prisma.templateAssignment.findMany({
    where: {
      shopId: shop.id,
    },
    include: {
      template: {
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
        },
      },
      targets: true,
    },
  });

  console.log('getTemplateForTarget - Found assignments:', assignments.map(a => ({
    id: a.id,
    assignmentType: a.assignmentType,
    templateId: a.templateId,
    templateIsActive: a.template.isActive,
    targetsCount: a.targets.length,
    targets: a.targets.map(t => ({
      targetShopifyId: t.targetShopifyId,
      targetType: t.targetType,
      isExcluded: t.isExcluded,
    })),
  })));

  // Prioritatea este: Template de produs > Template de colectie > Template global
  
  // 1. Verifică assignment-urile pentru produse (prioritatea cea mai mare)
  if (normalizedProductId) {
    // Caută assignment-uri directe pentru produs
    const productAssignment = assignments.find(a => {
      const matches = a.assignmentType === "PRODUCT" &&
        a.template.isActive &&
        a.targets.some(t => {
          const normalizedTargetId = normalizeShopifyId(t.targetShopifyId);
          return normalizedTargetId === normalizedProductId && !t.isExcluded;
        });
      if (matches) {
        console.log('getTemplateForTarget - Found PRODUCT assignment:', {
          assignmentId: a.id,
          templateId: a.templateId,
          templateName: a.template.name,
        });
      }
      return matches;
    });
    if (productAssignment) {
      return productAssignment.template;
    }

    // Caută assignment-uri EXCEPT pentru produse (toate produsele EXCEPT cele excluse)
    const productExceptAssignment = assignments.find(a => {
      const matches = a.assignmentType === "PRODUCT" &&
        a.template.isActive &&
        a.targets.length > 0 &&
        a.targets.every(t => t.isExcluded) &&
        !a.targets.some(t => {
          const normalizedTargetId = normalizeShopifyId(t.targetShopifyId);
          return normalizedTargetId === normalizedProductId && t.isExcluded;
        });
      if (matches) {
        console.log('getTemplateForTarget - Found PRODUCT_EXCEPT assignment:', {
          assignmentId: a.id,
          templateId: a.templateId,
          templateName: a.template.name,
        });
      }
      return matches;
    });
    if (productExceptAssignment) {
      return productExceptAssignment.template;
    }
  }

  // 2. Verifică assignment-urile pentru colecții (prioritatea medie)
  if (normalizedCollectionId) {
    // Caută assignment-uri directe pentru colecție
    const collectionAssignment = assignments.find(a => {
      const matches = a.assignmentType === "COLLECTION" &&
        a.template.isActive &&
        a.targets.some(t => {
          const normalizedTargetId = normalizeShopifyId(t.targetShopifyId);
          return normalizedTargetId === normalizedCollectionId && !t.isExcluded;
        });
      if (matches) {
        console.log('getTemplateForTarget - Found COLLECTION assignment:', {
          assignmentId: a.id,
          templateId: a.templateId,
          templateName: a.template.name,
        });
      }
      return matches;
    });
    if (collectionAssignment) {
      return collectionAssignment.template;
    }

    // Caută assignment-uri EXCEPT pentru colecții (toate colecțiile EXCEPT cele excluse)
    const collectionExceptAssignment = assignments.find(a => {
      const matches = a.assignmentType === "COLLECTION" &&
        a.template.isActive &&
        a.targets.length > 0 &&
        a.targets.every(t => t.isExcluded) &&
        !a.targets.some(t => {
          const normalizedTargetId = normalizeShopifyId(t.targetShopifyId);
          return normalizedTargetId === normalizedCollectionId && t.isExcluded;
        });
      if (matches) {
        console.log('getTemplateForTarget - Found COLLECTION_EXCEPT assignment:', {
          assignmentId: a.id,
          templateId: a.templateId,
          templateName: a.template.name,
        });
      }
      return matches;
    });
    if (collectionExceptAssignment) {
      return collectionExceptAssignment.template;
    }
  }

  // 3. Verifică assignment-ul global (DEFAULT) - prioritatea cea mai mică
  const globalAssignment = assignments.find(a => a.assignmentType === "DEFAULT");
  if (globalAssignment && globalAssignment.template.isActive) {
    console.log('getTemplateForTarget - Found DEFAULT assignment:', {
      assignmentId: globalAssignment.id,
      templateId: globalAssignment.templateId,
      templateName: globalAssignment.template.name,
    });
    return globalAssignment.template;
  }

  console.log('getTemplateForTarget - No template found');
  return null;
}


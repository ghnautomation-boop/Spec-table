import prisma from "../db.server.js";

/**
 * Obține toate template-urile pentru un shop
 */
// Cache pentru shop ID (evită query repetat pentru același shopDomain)
const shopIdCache = new Map();

/**
 * Invalidă cache-ul pentru un shop (folosit la uninstall)
 */
export function invalidateShopIdCache(shopDomain) {
  shopIdCache.delete(shopDomain);
}

export async function getTemplates(shopDomain) {
  const perfStart = performance.now();
  
  // Verifică cache pentru shop ID
  let shopId = shopIdCache.get(shopDomain);
  if (shopId) {
    // Verifică dacă shop-ul încă există în DB (pentru a evita problemele după uninstall/reinstall)
    const shopExists = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true },
    });
    
    if (!shopExists) {
      // Shop-ul nu mai există (probabil a fost șters la uninstall), invalidăm cache-ul
      shopIdCache.delete(shopDomain);
      shopId = null;
    }
  }
  
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
              type: true,
              productSpecType: true,
              customValue: true,
              customName: true,
              tooltipEnabled: true,
              tooltipText: true,
              hideFromPC: true,
              hideFromMobile: true,
              prefix: true,
              suffix: true,
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
 * @param {Object} data - Datele template-ului
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {Object} admin - Shopify Admin GraphQL client (opțional, pentru crearea metaobject-ului)
 */
export async function createTemplate(data, shopDomain, admin = null) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const { name, styling, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, seeLessHideFromPC, seeLessHideFromMobile, splitViewPerSection, splitViewPerMetafield, tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, sections } = data;

  const template = await prisma.specificationTemplate.create({
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
      seeLessHideFromPC: seeLessHideFromPC !== undefined ? seeLessHideFromPC : false,
      seeLessHideFromMobile: seeLessHideFromMobile !== undefined ? seeLessHideFromMobile : false,
      splitViewPerSection: splitViewPerSection !== undefined ? splitViewPerSection : false,
      splitViewPerMetafield: splitViewPerMetafield !== undefined ? splitViewPerMetafield : false,
      tableName: tableName !== undefined && tableName !== null && tableName.trim() !== "" ? tableName.trim() : "Specifications",
      isCollapsible: isCollapsible !== undefined ? isCollapsible : false,
      collapsibleOnPC: collapsibleOnPC !== undefined ? collapsibleOnPC : false,
      collapsibleOnMobile: collapsibleOnMobile !== undefined ? collapsibleOnMobile : false,
      shopId: shop.id,
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => {
              const customName = metafield.customName && metafield.customName.trim() !== "" ? metafield.customName.trim() : null;
              const tooltipText = metafield.tooltipText && metafield.tooltipText.trim() !== "" ? metafield.tooltipText.trim() : null;
              const prefix = metafield.prefix && metafield.prefix.trim() !== "" ? metafield.prefix.trim() : null;
              const suffix = metafield.suffix && metafield.suffix.trim() !== "" ? metafield.suffix.trim() : null;
              const customValue = metafield.customValue && metafield.customValue.trim() !== "" ? metafield.customValue.trim() : null;
              
              const type = metafield.type || 'metafield';
              const productSpecType = metafield.productSpecType && metafield.productSpecType.trim() !== "" ? metafield.productSpecType.trim() : null;
              
              return {
                metafieldDefinitionId: type === 'metafield' ? metafield.metafieldDefinitionId : null,
                type: type,
                productSpecType: productSpecType,
                customValue: customValue,
                order: metafieldIndex,
                customName,
                tooltipEnabled: metafield.tooltipEnabled || false,
                tooltipText,
                hideFromPC: metafield.hideFromPC || false,
                hideFromMobile: metafield.hideFromMobile || false,
                prefix,
                suffix,
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
      assignments: {
        select: {
          assignmentType: true,
        },
      },
    },
  });

  // Actualizează metaobject-ul în Shopify dacă admin este disponibil ȘI template-ul este activ
  if (admin && template.isActive) {

    try {
      const { createOrUpdateMetaobject } = await import("../utils/metaobject.server.js");
      const result = await createOrUpdateMetaobject(admin, template);
    } catch (error) {
      // Nu aruncăm eroarea - template-ul este deja creat în DB
      console.error("[createTemplate] Error creating metaobject for template:", error);
      console.error("[createTemplate] Error stack:", error.stack);
    }
  } else {
  }

  return template;
}
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
      splitViewPerSection: originalTemplate.splitViewPerSection,
      splitViewPerMetafield: originalTemplate.splitViewPerMetafield,
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
              prefix: metafield.prefix,
              suffix: metafield.suffix,
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
export async function toggleTemplateActive(templateId, shopDomain, admin = null, targetState = null) {
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
      assignments: {
        include: {
          targets: true,
        },
      },
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  // Dacă targetState este specificat, folosește-l; altfel, toggle
  const newActiveState = targetState !== null ? targetState : !template.isActive;
  
  // Dacă starea nu s-a schimbat, nu face nimic
  if (newActiveState === template.isActive) {
    return template;
  }

  // Toggle isActive
  const updated = await prisma.specificationTemplate.update({
    where: { id: template.id },
    data: {
      isActive: newActiveState,
    },
  });

  // Gestionează assignment-urile și metaobjects-urile în funcție de noua stare
  if (admin) {
    if (newActiveState) {
      // Template-ul devine activ - creează assignment-urile și metaobjects-urile
  
      const { createOrUpdateMetaobject, setCollectionMetafield, setProductMetafield } = await import("../utils/metaobject.server.js");
      
      // Creează/actualizează metaobject-ul
      const metaobjectResult = await createOrUpdateMetaobject(admin, template);
      
      if (metaobjectResult && metaobjectResult.id) {
        const metaobjectId = metaobjectResult.id;
        
        // Creează assignment-urile și setează metafield-urile pentru fiecare assignment
        for (const assignment of template.assignments) {
          if (assignment.assignmentType === "DEFAULT") {
            // Pentru DEFAULT, metaobject-ul este deja creat cu handle-ul global
          
          } else if (assignment.assignmentType === "COLLECTION") {
            for (const target of assignment.targets) {
              const collectionGid = target.targetShopifyId.startsWith('gid://') 
                ? target.targetShopifyId 
                : `gid://shopify/Collection/${target.targetShopifyId}`;
              await setCollectionMetafield(admin, collectionGid, metaobjectId);
            }
          } else if (assignment.assignmentType === "PRODUCT") {
            for (const target of assignment.targets) {
              const productGid = target.targetShopifyId.startsWith('gid://') 
                ? target.targetShopifyId 
                : `gid://shopify/Product/${target.targetShopifyId}`;
              await setProductMetafield(admin, productGid, metaobjectId);
            }
          }
        }
      }
    } else {
      // Template-ul devine inactiv - șterge assignment-urile și metafield-urile
     
      const { deleteProductMetafield, deleteCollectionMetafield, deleteMetaobject, deleteMetaobjectByHandle } = await import("../utils/metaobject.server.js");
      const { normalizeShopifyId } = await import("./template-lookup.server.js");
      
      // Șterge metafield-urile și entry-urile din DB
      for (const assignment of template.assignments) {
        if (assignment.assignmentType === "PRODUCT" || assignment.assignmentType === "COLLECTION") {
          for (const target of assignment.targets) {
            try {
              const targetGid = target.targetShopifyId.startsWith('gid://') 
                ? target.targetShopifyId 
                : (assignment.assignmentType === "PRODUCT" 
                  ? `gid://shopify/Product/${target.targetShopifyId}` 
                  : `gid://shopify/Collection/${target.targetShopifyId}`);
              
              // Șterge metafield-ul
              if (assignment.assignmentType === "PRODUCT") {
                await deleteProductMetafield(admin, targetGid);
              } else if (assignment.assignmentType === "COLLECTION") {
                await deleteCollectionMetafield(admin, targetGid);
              }
              
              // Șterge entry-ul din DB dacă nu mai este assignat la alt template
              const normalizedId = normalizeShopifyId(target.targetShopifyId);
              if (normalizedId) {
                const otherAssignments = await prisma.templateAssignmentTarget.findFirst({
                  where: {
                    targetShopifyId: normalizedId,
                    targetType: assignment.assignmentType,
                    assignment: {
                      templateId: { not: template.id },
                    },
                  },
                });
                
                if (!otherAssignments) {
                  if (assignment.assignmentType === "PRODUCT") {
                    await prisma.product.deleteMany({
                      where: {
                        shopId: shop.id,
                        OR: [
                          { shopifyId: targetGid },
                          { shopifyId: normalizedId },
                        ],
                      },
                    });
                  } else if (assignment.assignmentType === "COLLECTION") {
                    await prisma.collection.deleteMany({
                      where: {
                        shopId: shop.id,
                        OR: [
                          { shopifyId: targetGid },
                          { shopifyId: normalizedId },
                        ],
                      },
                    });
                  }
                }
              }
            } catch (error) {
              console.error(`[toggleTemplateActive] Error deleting metafield/DB entry for ${assignment.assignmentType} ${target.targetShopifyId}:`, error);
            }
          }
        }
      }
      
      // Șterge metaobject-ul
      const isGlobal = template.assignments.some(a => a.assignmentType === "DEFAULT");
      if (isGlobal) {
        await deleteMetaobjectByHandle(admin, "specification_template_global");
      } else {
        await deleteMetaobject(admin, template.id);
      }
      
      // Șterge assignment-urile din DB
      await prisma.templateAssignment.deleteMany({
        where: { templateId: template.id },
      });
    }
  }

  // Reconstruiește lookup table-ul dacă template-ul a fost activat/dezactivat
  const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
  await rebuildTemplateLookup(shop.id, shopDomain, admin);

  return updated;
}

/**
 * Actualizează un template
 * @param {string} templateId - ID-ul template-ului
 * @param {Object} data - Datele template-ului
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {Object} admin - Shopify Admin GraphQL client (opțional, pentru actualizarea metaobject-ului)
 */
export async function updateTemplate(templateId, data, shopDomain, admin = null) {
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

  const { name, styling, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, seeLessHideFromPC, seeLessHideFromMobile, splitViewPerSection, splitViewPerMetafield, tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, sections } = data;



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
      seeLessHideFromPC: seeLessHideFromPC !== undefined ? seeLessHideFromPC : template.seeLessHideFromPC || false,
      seeLessHideFromMobile: seeLessHideFromMobile !== undefined ? seeLessHideFromMobile : template.seeLessHideFromMobile || false,
      splitViewPerSection: splitViewPerSection !== undefined ? splitViewPerSection : (template.splitViewPerSection !== undefined ? template.splitViewPerSection : false),
      splitViewPerMetafield: splitViewPerMetafield !== undefined ? splitViewPerMetafield : (template.splitViewPerMetafield !== undefined ? template.splitViewPerMetafield : false),
      tableName: tableName !== undefined && tableName !== null && tableName.trim() !== "" ? tableName.trim() : (template.tableName || "Specifications"),
      isCollapsible: isCollapsible !== undefined ? isCollapsible : (template.isCollapsible !== undefined ? template.isCollapsible : false),
      collapsibleOnPC: collapsibleOnPC !== undefined ? collapsibleOnPC : (template.collapsibleOnPC !== undefined ? template.collapsibleOnPC : false),
      collapsibleOnMobile: collapsibleOnMobile !== undefined ? collapsibleOnMobile : (template.collapsibleOnMobile !== undefined ? template.collapsibleOnMobile : false),
      sections: {
        create: sections?.map((section, sectionIndex) => ({
          heading: section.heading,
          order: sectionIndex,
          metafields: {
            create: section.metafields?.map((metafield, metafieldIndex) => {
              const customName = metafield.customName && metafield.customName.trim() !== "" ? metafield.customName.trim() : null;
              const tooltipText = metafield.tooltipText && metafield.tooltipText.trim() !== "" ? metafield.tooltipText.trim() : null;
              const prefix = metafield.prefix && metafield.prefix.trim() !== "" ? metafield.prefix.trim() : null;
              const suffix = metafield.suffix && metafield.suffix.trim() !== "" ? metafield.suffix.trim() : null;
              const customValue = metafield.customValue && metafield.customValue.trim() !== "" ? metafield.customValue.trim() : null;
              
              const type = metafield.type || 'metafield';
              const productSpecType = metafield.productSpecType && metafield.productSpecType.trim() !== "" ? metafield.productSpecType.trim() : null;
              
              return {
                metafieldDefinitionId: type === 'metafield' ? metafield.metafieldDefinitionId : null,
                type: type,
                productSpecType: productSpecType,
                customValue: customValue,
                order: metafieldIndex,
                customName,
                tooltipEnabled: metafield.tooltipEnabled || false,
                tooltipText,
                hideFromPC: metafield.hideFromPC || false,
                hideFromMobile: metafield.hideFromMobile || false,
                prefix,
                suffix,
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
      assignments: {
        select: {
          assignmentType: true,
        },
      },
    },
  });

  // Dacă isActive s-a schimbat, gestionează assignment-urile și metaobjects-urile
  if (isActive !== undefined && isActive !== wasActive) {
    if (admin) {
      // Obține template-ul complet cu assignments pentru a gestiona ștergerea/crearea
      const templateWithAssignments = await prisma.specificationTemplate.findFirst({
        where: { id: template.id },
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
          assignments: {
            include: {
              targets: true,
            },
          },
        },
      });

      if (templateWithAssignments) {
        if (isActive) {
          // Template-ul devine activ - creează assignment-urile și metaobjects-urile
        
          const { createOrUpdateMetaobject, setCollectionMetafield, setProductMetafield } = await import("../utils/metaobject.server.js");
          
          // Creează/actualizează metaobject-ul
          const metaobjectResult = await createOrUpdateMetaobject(admin, templateWithAssignments);
          
          if (metaobjectResult && metaobjectResult.id) {
            const metaobjectId = metaobjectResult.id;
            
            // Creează assignment-urile și setează metafield-urile pentru fiecare assignment
            for (const assignment of templateWithAssignments.assignments) {
              if (assignment.assignmentType === "DEFAULT") {
                // Pentru DEFAULT, metaobject-ul este deja creat cu handle-ul global
               
              } else if (assignment.assignmentType === "COLLECTION") {
                for (const target of assignment.targets) {
                  const collectionGid = target.targetShopifyId.startsWith('gid://') 
                    ? target.targetShopifyId 
                    : `gid://shopify/Collection/${target.targetShopifyId}`;
                  await setCollectionMetafield(admin, collectionGid, metaobjectId);
                }
              } else if (assignment.assignmentType === "PRODUCT") {
                for (const target of assignment.targets) {
                  const productGid = target.targetShopifyId.startsWith('gid://') 
                    ? target.targetShopifyId 
                    : `gid://shopify/Product/${target.targetShopifyId}`;
                  await setProductMetafield(admin, productGid, metaobjectId);
                }
              }
            }
          }
        } else {
          // Template-ul devine inactiv - șterge assignment-urile și metafield-urile
    
          const { deleteProductMetafield, deleteCollectionMetafield, deleteMetaobject, deleteMetaobjectByHandle } = await import("../utils/metaobject.server.js");
          const { normalizeShopifyId } = await import("./template-lookup.server.js");
          
          // Șterge metafield-urile și entry-urile din DB
          for (const assignment of templateWithAssignments.assignments) {
            if (assignment.assignmentType === "PRODUCT" || assignment.assignmentType === "COLLECTION") {
              for (const target of assignment.targets) {
                try {
                  const targetGid = target.targetShopifyId.startsWith('gid://') 
                    ? target.targetShopifyId 
                    : (assignment.assignmentType === "PRODUCT" 
                      ? `gid://shopify/Product/${target.targetShopifyId}` 
                      : `gid://shopify/Collection/${target.targetShopifyId}`);
                  
                  // Șterge metafield-ul
                  if (assignment.assignmentType === "PRODUCT") {
                    await deleteProductMetafield(admin, targetGid);
                  } else if (assignment.assignmentType === "COLLECTION") {
                    await deleteCollectionMetafield(admin, targetGid);
                  }
                  
                  // Șterge entry-ul din DB dacă nu mai este assignat la alt template
                  const normalizedId = normalizeShopifyId(target.targetShopifyId);
                  if (normalizedId) {
                    const otherAssignments = await prisma.templateAssignmentTarget.findFirst({
                      where: {
                        targetShopifyId: normalizedId,
                        targetType: assignment.assignmentType,
                        assignment: {
                          templateId: { not: template.id },
                        },
                      },
                    });
                    
                    if (!otherAssignments) {
                      if (assignment.assignmentType === "PRODUCT") {
                        await prisma.product.deleteMany({
                          where: {
                            shopId: shop.id,
                            OR: [
                              { shopifyId: targetGid },
                              { shopifyId: normalizedId },
                            ],
                          },
                        });
                      } else if (assignment.assignmentType === "COLLECTION") {
                        await prisma.collection.deleteMany({
                          where: {
                            shopId: shop.id,
                            OR: [
                              { shopifyId: targetGid },
                              { shopifyId: normalizedId },
                            ],
                          },
                        });
                      }
                    }
                  }
                } catch (error) {
                  console.error(`[updateTemplate] Error deleting metafield/DB entry for ${assignment.assignmentType} ${target.targetShopifyId}:`, error);
                }
              }
            }
          }
          
          // Șterge metaobject-ul
          const isGlobal = templateWithAssignments.assignments.some(a => a.assignmentType === "DEFAULT");
          if (isGlobal) {
            await deleteMetaobjectByHandle(admin, "specification_template_global");
          } else {
            await deleteMetaobject(admin, template.id);
          }
          
          // Șterge assignment-urile din DB
          await prisma.templateAssignment.deleteMany({
            where: { templateId: template.id },
          });
        }
      }
    }
    
    // Reconstruiește lookup table-ul
    const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
    await rebuildTemplateLookup(template.shopId, shopDomain, admin);
  } else if (admin && updated.isActive) {
    // Dacă template-ul este activ și nu s-a schimbat isActive, actualizează metaobject-ul
    try {
      const { createOrUpdateMetaobject } = await import("../utils/metaobject.server.js");
      const result = await createOrUpdateMetaobject(admin, updated);
    } catch (error) {
      // Nu aruncăm eroarea - template-ul este deja actualizat în DB
      console.error("[updateTemplate] Error updating metaobject for template:", error);
      console.error("[updateTemplate] Error stack:", error.stack);
    }
  } else {
  }

  return updated;
}

/**
 * Șterge un template
 */
export async function deleteTemplate(templateId, shopDomain, admin = null) {
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
    include: {
      assignments: {
        include: {
          targets: true,
        },
      },
    },
  });

  if (!template) {
    throw new Error("Template not found");
  }

  // Șterge metafield-urile de pe produse/colecții care erau assignate la acest template
  // Și șterge entry-urile din DB pentru produsele/colecțiile care nu mai sunt assignate la niciun template
  if (admin && template.assignments && template.assignments.length > 0) {
    try {
      const { deleteProductMetafield, deleteCollectionMetafield } = await import("../utils/metaobject.server.js");
      const { normalizeShopifyId } = await import("./template-lookup.server.js");
      
      for (const assignment of template.assignments) {
        if (assignment.assignmentType === "PRODUCT" || assignment.assignmentType === "COLLECTION") {
          for (const target of assignment.targets) {
            try {
              const targetGid = target.targetShopifyId.startsWith('gid://') 
                ? target.targetShopifyId 
                : (assignment.assignmentType === "PRODUCT" 
                  ? `gid://shopify/Product/${target.targetShopifyId}` 
                  : `gid://shopify/Collection/${target.targetShopifyId}`);
              
              // Șterge metafield-ul
              if (assignment.assignmentType === "PRODUCT") {
                await deleteProductMetafield(admin, targetGid);
              } else if (assignment.assignmentType === "COLLECTION") {
                await deleteCollectionMetafield(admin, targetGid);
              }
              
              // Verifică dacă target-ul mai este assignat la alt template
              const normalizedId = normalizeShopifyId(target.targetShopifyId);
              if (normalizedId) {
                const otherAssignments = await prisma.templateAssignmentTarget.findFirst({
                  where: {
                    targetShopifyId: normalizedId,
                    targetType: assignment.assignmentType,
                    assignment: {
                      templateId: { not: template.id }, // Exclude template-ul curent
                    },
                  },
                });
                
                // Dacă nu mai este assignat la niciun template, șterge entry-ul din DB
                if (!otherAssignments) {
                  if (assignment.assignmentType === "PRODUCT") {
                    await prisma.product.deleteMany({
                      where: {
                        shopId: shop.id,
                        OR: [
                          { shopifyId: targetGid },
                          { shopifyId: normalizedId },
                        ],
                      },
                    });

                  } else if (assignment.assignmentType === "COLLECTION") {
                    await prisma.collection.deleteMany({
                      where: {
                        shopId: shop.id,
                        OR: [
                          { shopifyId: targetGid },
                          { shopifyId: normalizedId },
                        ],
                      },
                    });

                  }
                }
              }
            } catch (error) {
              console.error(`[deleteTemplate] Error deleting metafield/DB entry for ${assignment.assignmentType} ${target.targetShopifyId}:`, error);
              // Continuă cu următorul target chiar dacă unul eșuează
            }
          }
        }
      }
    } catch (error) {
      console.error("[deleteTemplate] Error deleting metafields/DB entries:", error);
      // Continuă cu ștergerea template-ului chiar dacă ștergerea metafield-urilor eșuează
    }
  }

  // Șterge metaobject-ul din Shopify
  if (admin) {
    try {
      const { deleteMetaobject, deleteMetaobjectByHandle } = await import("../utils/metaobject.server.js");
      // Verifică dacă template-ul este global (are assignment DEFAULT)
      const isGlobal = template.assignments?.some(a => a.assignmentType === "DEFAULT");
      if (isGlobal) {
        // Pentru template-ul global, folosim handle-ul fix
        await deleteMetaobjectByHandle(admin, "specification_template_global");
      } else {
        await deleteMetaobject(admin, template.id);
      }
    } catch (error) {
      console.error("[deleteTemplate] Error deleting metaobject:", error);
      // Continuă cu ștergerea template-ului chiar dacă ștergerea metaobject-ului eșuează
    }
  }

  const deleted = await prisma.specificationTemplate.delete({
    where: { id: template.id },
  });

  // Reconstruiește lookup table-ul pentru acest shop (template-ul a fost șters)
  const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
  await rebuildTemplateLookup(template.shopId, shopDomain, admin);

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

  // Reîncarcă template-ul pentru a obține starea cea mai recentă (în cazul în care a fost activat recent)
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
  // NOUA LOGICĂ: Nu mai folosim EXCEPT, deci verificăm doar assignment-uri directe
  if (targetIds && targetIds.length > 0) {
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
      
    }
    
    if (conflictingAssignments.length > 0) {
      throw new Error(`Some targets are already assigned to other templates`);
    }
  }

  // Obține assignment-urile existente înainte de a le șterge (pentru a șterge metafield-urile)
  const existingAssignments = await prisma.templateAssignment.findMany({
    where: { templateId: template.id },
    include: {
      targets: true,
    },
  });

  // Șterge metafield-urile de pe produse/colecții care erau assignate la template-ul vechi
  // Și șterge entry-urile din DB pentru produsele/colecțiile care nu mai sunt assignate la niciun template
  if (admin && existingAssignments.length > 0) {
    try {
      const { deleteProductMetafield, deleteCollectionMetafield } = await import("../utils/metaobject.server.js");
      const { normalizeShopifyId } = await import("./template-lookup.server.js");
      
      // Colectează toate target-urile care erau assignate la template-ul vechi
      const oldTargets = [];
      for (const assignment of existingAssignments) {
        if (assignment.assignmentType === "PRODUCT" || assignment.assignmentType === "COLLECTION") {
          for (const target of assignment.targets) {
            oldTargets.push({
              targetShopifyId: target.targetShopifyId,
              targetType: assignment.assignmentType,
            });
          }
        }
      }
      
      // Verifică care target-uri nu mai sunt în noul assignment
      const newTargetIds = targetIds ? [...new Set(targetIds)] : [];
      const targetsToRemove = oldTargets.filter(oldTarget => {
        const normalizedOldId = normalizeShopifyId(oldTarget.targetShopifyId);
        return !newTargetIds.some(newId => {
          const normalizedNewId = normalizeShopifyId(newId);
          return normalizedNewId === normalizedOldId;
        });
      });
      
      // Șterge metafield-urile și entry-urile din DB pentru target-urile care nu mai sunt assignate
      for (const targetToRemove of targetsToRemove) {
        try {
          const targetGid = targetToRemove.targetShopifyId.startsWith('gid://') 
            ? targetToRemove.targetShopifyId 
            : (targetToRemove.targetType === "PRODUCT" 
              ? `gid://shopify/Product/${targetToRemove.targetShopifyId}` 
              : `gid://shopify/Collection/${targetToRemove.targetShopifyId}`);
          
          // Șterge metafield-ul
          if (targetToRemove.targetType === "PRODUCT") {
            await deleteProductMetafield(admin, targetGid);
          } else if (targetToRemove.targetType === "COLLECTION") {
            await deleteCollectionMetafield(admin, targetGid);
          }
          
          // Verifică dacă target-ul mai este assignat la alt template
          const normalizedId = normalizeShopifyId(targetToRemove.targetShopifyId);
          if (normalizedId) {
            const otherAssignments = await prisma.templateAssignmentTarget.findFirst({
              where: {
                targetShopifyId: normalizedId,
                targetType: targetToRemove.targetType,
                assignment: {
                  templateId: { not: template.id }, // Exclude template-ul curent
                },
              },
            });
            
            // Dacă nu mai este assignat la niciun template, șterge entry-ul din DB
            if (!otherAssignments) {
              if (targetToRemove.targetType === "PRODUCT") {
                await prisma.product.deleteMany({
                  where: {
                    shopId: shop.id,
                    OR: [
                      { shopifyId: targetGid },
                      { shopifyId: normalizedId },
                    ],
                  },
                });

              } else if (targetToRemove.targetType === "COLLECTION") {
                await prisma.collection.deleteMany({
                  where: {
                    shopId: shop.id,
                    OR: [
                      { shopifyId: targetGid },
                      { shopifyId: normalizedId },
                    ],
                  },
                });

              }
            }
          }
        } catch (error) {
          console.error(`[saveTemplateAssignment] Error deleting metafield/DB entry for ${targetToRemove.targetType} ${targetToRemove.targetShopifyId}:`, error);
          // Continuă cu următorul target chiar dacă unul eșuează
        }
      }
    } catch (error) {
      console.error("[saveTemplateAssignment] Error deleting old metafields/DB entries:", error);
      // Continuă cu ștergerea assignment-urilor chiar dacă ștergerea metafield-urilor eșuează
    }
  }

  // Obține assignment-urile existente înainte de a le șterge (pentru a șterge metaobject-urile corespunzătoare)
  const existingAssignmentsBeforeDelete = await prisma.templateAssignment.findMany({
    where: { templateId: template.id },
    include: {
      targets: true,
    },
  });

  // Șterge assignment-urile existente pentru acest template
  await prisma.templateAssignment.deleteMany({
    where: { templateId: template.id },
  });

  // Dacă nu există assignment (null sau empty), reconstruiește lookup table-ul și returnează
  if (!assignmentType || assignmentType === "NONE") {
    // Șterge metaobject-urile (global și specific) dacă există
    if (admin) {
      try {
        const { deleteMetaobjectByHandle, deleteMetaobject } = await import("../utils/metaobject.server.js");
        // Verifică dacă există assignment DEFAULT (metaobject global)
        const hadDefaultAssignment = existingAssignmentsBeforeDelete.some(a => a.assignmentType === "DEFAULT");
        if (hadDefaultAssignment) {
          await deleteMetaobjectByHandle(admin, "specification_template_global");
          console.log(`[saveTemplateAssignment] Deleted global metaobject for template ${template.id}`);
        }
        // Șterge metaobject-ul specific dacă există
        await deleteMetaobject(admin, template.id);
      } catch (error) {
        console.error(`[saveTemplateAssignment] Error deleting metaobjects:`, error);
      }
    }
    const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
    await rebuildTemplateLookup(shop.id, shopDomain, admin);
    return { success: true };
  }

  // LOGICĂ: Șterge metaobject-ul global dacă se face assignment pe produs/colecție
  // Și invers: șterge metaobject-ul specific dacă se face assignment DEFAULT
  if (admin) {
    try {
      const { deleteMetaobjectByHandle, deleteMetaobject, deleteProductMetafield, deleteCollectionMetafield } = await import("../utils/metaobject.server.js");
      
      if (assignmentType === "DEFAULT") {
        // Dacă se face assignment DEFAULT, șterge metaobject-ul specific și metafield-urile de pe produse/colecții
        const hadProductOrCollectionAssignment = existingAssignmentsBeforeDelete.some(
          a => a.assignmentType === "PRODUCT" || a.assignmentType === "COLLECTION"
        );
        
        if (hadProductOrCollectionAssignment) {
          // Șterge metaobject-ul specific
          await deleteMetaobject(admin, template.id);
          console.log(`[saveTemplateAssignment] Deleted specific metaobject for template ${template.id} (switching to DEFAULT)`);
          
          // Șterge metafield-urile de pe produse/colecții
          for (const assignment of existingAssignmentsBeforeDelete) {
            if (assignment.assignmentType === "PRODUCT" || assignment.assignmentType === "COLLECTION") {
              for (const target of assignment.targets) {
                try {
                  const targetGid = target.targetShopifyId.startsWith('gid://') 
                    ? target.targetShopifyId 
                    : (assignment.assignmentType === "PRODUCT" 
                      ? `gid://shopify/Product/${target.targetShopifyId}` 
                      : `gid://shopify/Collection/${target.targetShopifyId}`);
                  
                  if (assignment.assignmentType === "PRODUCT") {
                    await deleteProductMetafield(admin, targetGid);
                  } else if (assignment.assignmentType === "COLLECTION") {
                    await deleteCollectionMetafield(admin, targetGid);
                  }
                } catch (error) {
                  console.error(`[saveTemplateAssignment] Error deleting metafield for ${assignment.assignmentType} ${target.targetShopifyId}:`, error);
                }
              }
            }
          }
        }
      } else if (assignmentType === "PRODUCT" || assignmentType === "COLLECTION") {
        // Dacă se face assignment pe produs/colecție, șterge metaobject-ul global
        const hadDefaultAssignment = existingAssignmentsBeforeDelete.some(a => a.assignmentType === "DEFAULT");
        
        if (hadDefaultAssignment) {
          await deleteMetaobjectByHandle(admin, "specification_template_global");
          console.log(`[saveTemplateAssignment] Deleted global metaobject for template ${template.id} (switching to ${assignmentType})`);
        }
      }
    } catch (error) {
      console.error(`[saveTemplateAssignment] Error cleaning up metaobjects:`, error);
      // Continuă cu crearea assignment-ului chiar dacă ștergerea metaobject-urilor eșuează
    }
  }

  // Reîncarcă template-ul pentru a obține starea cea mai recentă (în cazul în care a fost activat recent)
  // Acest lucru este important când template-ul este activat în același request înainte de assignment
  const refreshedTemplate = await prisma.specificationTemplate.findFirst({
    where: {
      id: templateId,
      shopId: shop.id,
    },
  });

  if (!refreshedTemplate) {
    throw new Error("Template not found");
  }

  // Dacă template-ul este inactiv, nu creăm assignment-uri
  if (!refreshedTemplate.isActive) {
    const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
    await rebuildTemplateLookup(shop.id, shopDomain, admin);
    return { success: true, skipped: true, reason: 'Template is inactive' };
  }
  
  // Folosește template-ul reîncărcat pentru restul funcției
  // Actualizează proprietățile obiectului template cu valorile din refreshedTemplate
  template.isActive = refreshedTemplate.isActive;

  // Elimină duplicate-urile din targetIds înainte de salvare
  const uniqueTargetIds = targetIds ? [...new Set(targetIds)] : [];



  // Populează produsele/colecțiile în DB când se face assignment
  // NOUA LOGICĂ: Populăm doar produsele/colecțiile assignate, nu toate
  if (uniqueTargetIds.length > 0 && admin) {
    const { syncSingleProduct, syncSingleCollection } = await import("./sync.server.js");
    
    
    // Sincronizează fiecare produs/colecție în DB
    for (const targetId of uniqueTargetIds) {
      try {
        // Convertește ID-ul la format GID dacă e necesar
        const gid = targetId.startsWith("gid://") ? targetId : 
          (assignmentType === "PRODUCT" ? `gid://shopify/Product/${targetId}` : `gid://shopify/Collection/${targetId}`);
        
        if (assignmentType === "PRODUCT") {
          await syncSingleProduct(admin, shopDomain, gid);
        } else if (assignmentType === "COLLECTION") {
          await syncSingleCollection(admin, shopDomain, gid);
        }
      } catch (error) {
        console.error(`[saveTemplateAssignment] Error syncing ${assignmentType} ${targetId}:`, error);
        // Continuă cu următorul target chiar dacă unul eșuează
      }
    }
    
   
  }

  // Creează noul assignment
  const assignment = await prisma.templateAssignment.create({
    data: {
      templateId: template.id,
      assignmentType: assignmentType,
      shopId: shop.id,
      targets: {
        create: uniqueTargetIds.map((targetId) => ({
          targetShopifyId: targetId,
          targetType: assignmentType === "PRODUCT" ? "PRODUCT" : "COLLECTION",
          isExcluded: false, // Nu mai folosim isExcluded (eliminăm EXCEPT)
        })),
      },
    },
  });

 

  // Creează/actualizează metaobject-ul pentru toate tipurile de assignment DOAR dacă template-ul este activ
  if (admin && template.isActive) {
    try {
      // Obține template-ul complet cu assignments pentru a detecta tipul de assignment
      const templateWithAssignments = await prisma.specificationTemplate.findFirst({
        where: { id: template.id },
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
          assignments: {
            select: {
              assignmentType: true,
            },
          },
        },
      });

      if (templateWithAssignments) {
        const { createOrUpdateMetaobject, setCollectionMetafield, setProductMetafield } = await import("../utils/metaobject.server.js");
        const metaobjectResult = await createOrUpdateMetaobject(admin, templateWithAssignments);
        
        if (metaobjectResult && metaobjectResult.id) {
          const metaobjectId = metaobjectResult.id;
          
          // Dacă assignment-ul este DEFAULT, nu setăm metafield-uri (template-ul global este accesat direct)
          if (assignmentType === "DEFAULT") {
            // Pentru DEFAULT, metaobject-ul este deja creat cu handle-ul global
            console.log(`[saveTemplateAssignment] DEFAULT assignment - no metafields to set`);
          } else if (assignmentType === "COLLECTION") {
            // Setează metafield-ul pe fiecare colecție
            console.log(`[saveTemplateAssignment] Setting metafields for ${uniqueTargetIds.length} collections`);
            for (const collectionId of uniqueTargetIds) {
              // Asigură-te că collectionId este în format GID
              const collectionGid = collectionId.startsWith('gid://') 
                ? collectionId 
                : `gid://shopify/Collection/${collectionId}`;
              
              try {
                const success = await setCollectionMetafield(admin, collectionGid, metaobjectId);
                if (success) {
                  console.log(`[saveTemplateAssignment] Successfully set metafield for collection ${collectionGid}`);
                } else {
                  console.error(`[saveTemplateAssignment] Failed to set metafield for collection ${collectionGid}`);
                }
              } catch (error) {
                console.error(`[saveTemplateAssignment] Error setting metafield for collection ${collectionGid}:`, error);
              }
            }
          } else if (assignmentType === "PRODUCT") {
            // Setează metafield-ul pe fiecare produs
            console.log(`[saveTemplateAssignment] Setting metafields for ${uniqueTargetIds.length} products`);
            for (const productId of uniqueTargetIds) {
              // Asigură-te că productId este în format GID
              const productGid = productId.startsWith('gid://') 
                ? productId 
                : `gid://shopify/Product/${productId}`;
              
              try {
                const success = await setProductMetafield(admin, productGid, metaobjectId);
                if (success) {
                  console.log(`[saveTemplateAssignment] Successfully set metafield for product ${productGid}`);
                } else {
                  console.error(`[saveTemplateAssignment] Failed to set metafield for product ${productGid}`);
                }
              } catch (error) {
                console.error(`[saveTemplateAssignment] Error setting metafield for product ${productGid}:`, error);
              }
            }
          }
        } else {
          console.error('[saveTemplateAssignment] Metaobject was not created/updated, cannot set metafields');
        }
      } else {
      }
    } catch (error) {
      console.error("[saveTemplateAssignment] Error updating metaobject:", error);
      // Nu aruncăm eroarea - assignment-ul este deja salvat
    }
  } else {
  }

  // Reconstruiește lookup table-ul pentru acest shop (o singură dată, după ce s-a creat noul assignment)
  // OPTIMIZAT: Nu mai facem rebuild de 2 ori - doar o dată după ce assignment-ul este creat
  const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
  await rebuildTemplateLookup(shop.id, shopDomain, admin);

  return { 
    success: true, 
    assignment
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
      splitViewPerSection: true,
      splitViewPerMetafield: true,
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
              type: true,
              productSpecType: true,
              customValue: true,
              customName: true,
              tooltipEnabled: true,
              tooltipText: true,
              hideFromPC: true,
              hideFromMobile: true,
              prefix: true,
              suffix: true,
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


  // OPTIMIZARE: Caută în ordinea priorității (PRODUCT > COLLECTION > DEFAULT)
  // NOTĂ: collectionId vine din Shopify context (Liquid), nu din DB
  // Nu mai stocăm produsele din colecții - doar colecțiile în sine
  let lookup = null;
  let lookupQueryTime = 0;

  // 1. Caută după productId (priority 1) - PRODUCT assignment direct
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
    

  }

  // 2. Dacă nu s-a găsit, caută după collectionId (priority 2)
  // NOTĂ: collectionId vine din parametru (Shopify context), nu din DB
  // Nu mai stocăm produsele din colecții în TemplateLookup - doar colecțiile în sine

  
  if (!lookup && normalizedCollectionId) {
    const queryStart = performance.now();
    

    
    // IMPORTANT: Asigură-te că normalizedCollectionId este string pentru match corect
    const collectionIdForQuery = String(normalizedCollectionId).trim();
    
    lookup = await prisma.templateLookup.findFirst({
      where: {
        shopId: shopId,
        collectionId: collectionIdForQuery,
      },
      orderBy: {
        priority: "asc",
      },
      select: {
        templateId: true,
        collectionId: true, // Adaugă pentru debugging
        priority: true, // Adaugă pentru debugging
      },
    });
    lookupQueryTime = performance.now() - queryStart;
    
    if (lookup && process.env.NODE_ENV === "development") {

    } else if (!lookup) {

      // Verifică dacă există colecții în TemplateLookup pentru acest shop
      const allCollectionLookups = await prisma.templateLookup.findMany({
        where: {
          shopId: shopId,
          collectionId: { not: null },
        },
        select: {
          collectionId: true,
          templateId: true,
          priority: true,
        },
      });
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
    } else if (!lookup && process.env.NODE_ENV === "development") {
      // Dacă lookup table-ul este gol, încearcă să-l reconstruiască (doar o dată)
      try {
        const { rebuildTemplateLookup } = await import("./template-lookup.server.js");
        await rebuildTemplateLookup(shopId);
      
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
      splitViewPerSection: true,
      splitViewPerMetafield: true,
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
      type: true,
      productSpecType: true,
      customValue: true,
      customName: true,
      tooltipEnabled: true,
      tooltipText: true,
      hideFromPC: true,
      hideFromMobile: true,
      prefix: true,
      suffix: true,
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



  return templateWithSections;
}
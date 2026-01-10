/**
 * Helper functions pentru gestionarea metaobjects în Shopify
 */

/**
 * Creează sau actualizează un metaobject în Shopify
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} template - Template-ul din baza de date
 * @returns {Promise<Object>} Metaobject-ul creat/actualizat
 */
export async function createOrUpdateMetaobject(admin, template) {

  
  // PAS 1: Asigură-te că metaobject definition-ul există înainte de a crea metaobject-ul

  const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
  if (!metaobjectDefinitionId) {
    console.error('[createOrUpdateMetaobject] Cannot create metaobject without metaobject definition');
    throw new Error('Metaobject definition does not exist and could not be created');
  }

  
  // Verifică dacă template-ul este global (are assignment de tip DEFAULT)
  // Pentru template-ul global, folosim handle-ul fix "specification_template_global"
  // Pentru celelalte, folosim handle-ul bazat pe ID
  let handle;
  if (template.assignments && template.assignments.some(a => a.assignmentType === 'DEFAULT')) {
    handle = 'specification_template_global';

  } else {
    handle = `specification_template_${template.id}`;

  }
  
  // Pregătește datele pentru metaobject

  
  const templateStructure = {
    sections: template.sections?.map(section => ({
      heading: section.heading,
      metafields: section.metafields?.map(mf => {
        // Dacă este custom_spec, returnează structura pentru custom spec
        if (mf.type === 'custom_spec') {
          return {
            type: 'custom_spec',
            customName: mf.customName || null,
            customValue: mf.customValue || null,
            tooltipEnabled: mf.tooltipEnabled === true,
            tooltipText: mf.tooltipText || null,
            hideFromPC: mf.hideFromPC === true,
            hideFromMobile: mf.hideFromMobile === true,
            prefix: mf.prefix || null,
            suffix: mf.suffix || null,
            order: mf.order,
          };
        }
        // Dacă este product spec, returnează structura pentru product spec
        if (mf.type === 'product_spec') {
          return {
            type: 'product_spec',
            productSpecType: mf.productSpecType || null,
            customName: mf.customName || null,
            tooltipEnabled: mf.tooltipEnabled === true,
            tooltipText: mf.tooltipText || null,
            hideFromPC: mf.hideFromPC === true,
            hideFromMobile: mf.hideFromMobile === true,
            prefix: mf.prefix || null,
            suffix: mf.suffix || null,
            order: mf.order,
          };
        }
        // Altfel, este metafield normal
        return {
          type: 'metafield',
          namespace: mf.metafieldDefinition?.namespace || null,
          key: mf.metafieldDefinition?.key || null,
          ownerType: mf.metafieldDefinition?.ownerType || null,
          name: mf.metafieldDefinition?.name || null,
          metafieldType: mf.metafieldDefinition?.type || null,
          customName: mf.customName || null,
          tooltipEnabled: mf.tooltipEnabled === true,
          tooltipText: mf.tooltipText || null,
          hideFromPC: mf.hideFromPC === true,
          hideFromMobile: mf.hideFromMobile === true,
          prefix: mf.prefix || null,
          suffix: mf.suffix || null,
          order: mf.order,
        };
      }) || [],
      order: section.order,
    })) || [],
  };

  // Parse styling JSON dacă este string
  const templateStyling = typeof template.styling === "string" 
    ? JSON.parse(template.styling) 
    : template.styling || {};

  const templateSettings = {
    isAccordion: template.isAccordion || false,
    isAccordionHideFromPC: template.isAccordionHideFromPC === true,
    isAccordionHideFromMobile: template.isAccordionHideFromMobile === true,
    seeMoreEnabled: template.seeMoreEnabled || false,
    seeMoreHideFromPC: template.seeMoreHideFromPC === true,
    seeMoreHideFromMobile: template.seeMoreHideFromMobile === true,
    seeLessHideFromPC: template.seeLessHideFromPC === true,
    seeLessHideFromMobile: template.seeLessHideFromMobile === true,
    splitViewPerSection: template.splitViewPerSection === true,
    splitViewPerMetafield: template.splitViewPerMetafield === true,
    tableName: template.tableName || "Specifications",
    isCollapsible: template.isCollapsible === true,
    collapsibleOnPC: template.collapsibleOnPC === true,
    collapsibleOnMobile: template.collapsibleOnMobile === true,
  };

  // Verifică dacă metaobject-ul există deja

  // Folosim metaobjectByHandle query pentru a găsi metaobject-ul după handle
  const checkQuery = `
    query getMetaobjectByHandle($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;

  const checkVariables = {
    handle: {
      type: "specification_template",
      handle: handle,
    },
  };

  try {

    const checkResponse = await admin.graphql(checkQuery, { variables: checkVariables });
    const checkData = await checkResponse.json();


    if (checkData.errors) {
      console.error("[createOrUpdateMetaobject] Error checking metaobject:", checkData.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(checkData.errors)}`);
    }

    // Extrage metaobject-ul direct din răspuns
    const existingMetaobject = checkData.data?.metaobjectByHandle || null;



    if (existingMetaobject) {
      // Actualizează metaobject-ul existent
      const updateMutation = `
        mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject {
              id
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const updateVariables = {
        id: existingMetaobject.id,
        metaobject: {
          fields: [
            {
              key: "template_id",
              value: template.id.toString(),
            },
            {
              key: "template_structure",
              value: JSON.stringify(templateStructure),
            },
            {
              key: "template_styling",
              value: JSON.stringify(templateStyling),
            },
            {
              key: "template_settings",
              value: JSON.stringify(templateSettings),
            },
          ],
          capabilities: {
            publishable: {
              status: "ACTIVE",
            },
          },
        },
      };


      const updateResponse = await admin.graphql(updateMutation, { variables: updateVariables });
      const updateData = await updateResponse.json();

      if (updateData.errors) {
        console.error("[createOrUpdateMetaobject] Error updating metaobject:", updateData.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(updateData.errors)}`);
      }

      if (updateData.data.metaobjectUpdate.userErrors?.length > 0) {
        console.error("[createOrUpdateMetaobject] User errors updating metaobject:", updateData.data.metaobjectUpdate.userErrors);
        throw new Error(`User errors: ${JSON.stringify(updateData.data.metaobjectUpdate.userErrors)}`);
      }

    
      return updateData.data.metaobjectUpdate.metaobject;
    } else {

      const createMutation = `
        mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
              id
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createVariables = {
        metaobject: {
          type: "specification_template",
          handle,
          fields: [
            {
              key: "template_id",
              value: template.id.toString(),
            },
            {
              key: "template_structure",
              value: JSON.stringify(templateStructure),
            },
            {
              key: "template_styling",
              value: JSON.stringify(templateStyling),
            },
            {
              key: "template_settings",
              value: JSON.stringify(templateSettings),
            },
          ],
          capabilities: {
            publishable: {
              status: "ACTIVE",
            },
          },
        },
      };


      const createResponse = await admin.graphql(createMutation, { variables: createVariables });
      const createData = await createResponse.json();

      if (createData.errors) {
        console.error("[createOrUpdateMetaobject] Error creating metaobject:", createData.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(createData.errors)}`);
      }

      if (createData.data.metaobjectCreate.userErrors?.length > 0) {
        console.error("[createOrUpdateMetaobject] User errors creating metaobject:", createData.data.metaobjectCreate.userErrors);
        throw new Error(`User errors: ${JSON.stringify(createData.data.metaobjectCreate.userErrors)}`);
      }

    
      return createData.data.metaobjectCreate.metaobject;
    }
  } catch (error) {
    console.error("[createOrUpdateMetaobject] Error in createOrUpdateMetaobject:", error);
    console.error("[createOrUpdateMetaobject] Error stack:", error.stack);
    // Nu aruncăm eroarea, doar logăm - nu vrem să blocheze salvarea template-ului
    // Template-ul se salvează în DB chiar dacă metaobject-ul eșuează
    return null;
  }
  
}

/**
 * Șterge un metaobject din Shopify
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} templateId - ID-ul template-ului
 * @returns {Promise<boolean>} True dacă a fost șters cu succes
 */
export async function deleteMetaobject(admin, templateId) {
  const handle = `specification_template_${templateId}`;

  // Găsește metaobject-ul
  const query = `
    query getMetaobjectByHandle($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        id
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: {
        handle: {
          type: "specification_template",
          handle: handle,
        },
      },
    });
    const data = await response.json();

    if (data.errors) {
      console.error("Error finding metaobject:", data.errors);
      return false;
    }

    const metaobject = data.data?.metaobjectByHandle || null;
    if (!metaobject) {
      // Metaobject-ul nu există, considerăm că e deja șters
      return true;
    }

    // Șterge metaobject-ul
    const deleteMutation = `
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const deleteResponse = await admin.graphql(deleteMutation, {
      variables: { id: metaobject.id },
    });
    const deleteData = await deleteResponse.json();

    if (deleteData.errors) {
      console.error("Error deleting metaobject:", deleteData.errors);
      return false;
    }

    if (deleteData.data.metaobjectDelete.userErrors?.length > 0) {
      console.error("User errors deleting metaobject:", deleteData.data.metaobjectDelete.userErrors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteMetaobject:", error);
    return false;
  }
}

/**
 * Șterge un metaobject din Shopify după handle
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} handle - Handle-ul metaobject-ului
 * @returns {Promise<boolean>} True dacă a fost șters cu succes
 */
export async function deleteMetaobjectByHandle(admin, handle) {
  // Găsește metaobject-ul
  const query = `
    query getMetaobjectByHandle($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) {
        id
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: {
        handle: {
          type: "specification_template",
          handle: handle,
        },
      },
    });
    const data = await response.json();

    if (data.errors) {
      console.error("Error finding metaobject by handle:", data.errors);
      return false;
    }

    const metaobject = data.data?.metaobjectByHandle || null;
    if (!metaobject) {
      // Metaobject-ul nu există, considerăm că e deja șters
      return true;
    }

    // Șterge metaobject-ul
    const deleteMutation = `
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const deleteResponse = await admin.graphql(deleteMutation, {
      variables: { id: metaobject.id },
    });
    const deleteData = await deleteResponse.json();

    if (deleteData.errors) {
      console.error("Error deleting metaobject by handle:", deleteData.errors);
      return false;
    }

    if (deleteData.data.metaobjectDelete.userErrors?.length > 0) {
      console.error("User errors deleting metaobject by handle:", deleteData.data.metaobjectDelete.userErrors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in deleteMetaobjectByHandle:", error);
    return false;
  }
}

/**
 * Obține sau creează metaobject definition-ul pentru specification_template
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<string|null>} ID-ul metaobject definition-ului sau null dacă nu poate fi creat
 */
async function getMetaobjectDefinitionId(admin) {
  const query = `
    query getMetaobjectDefinition($type: String!) {
      metaobjectDefinitionByType(type: $type) {
        id
        type
      }
    }
  `;

  try {
    // Verifică dacă definition-ul există deja (doar dacă avem permisiunea)
    
    try {
      const response = await admin.graphql(query, {
        variables: {
          type: "specification_template",
        },
      });
      const data = await response.json();

      

      if (data.errors) {
        console.warn("[getMetaobjectDefinitionId] Error fetching metaobject definition (may not have read permission):", data.errors);
        // Continuă să încerce să creeze definition-ul
      } else {
        const definition = data.data?.metaobjectDefinitionByType;
        if (definition) {
         
          return definition.id;
        } else {
         
        }
      }
    } catch (queryError) {
      // Dacă nu avem permisiunea de read, continuă direct la creare
      console.warn('[getMetaobjectDefinitionId] Cannot query metaobject definition (may not have read permission), will attempt to create:', queryError.message);
    }

    // Dacă nu există, încearcă să-l creeze
   
    const createMutation = `
      mutation metaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
            type
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    const createVariables = {
      definition: {
        name: "Specification Template",
        type: "specification_template",
        access: {
          storefront: "PUBLIC_READ",
        },
        fieldDefinitions: [
          {
            key: "template_id",
            name: "Template ID",
            type: "single_line_text_field",
            required: true,
          },
          {
            key: "template_structure",
            name: "Template Structure",
            type: "json",
            required: true,
          },
          {
            key: "template_styling",
            name: "Template Styling",
            type: "json",
            required: true,
          },
          {
            key: "template_settings",
            name: "Template Settings",
            type: "json",
            required: true,
          },
        ],
        capabilities: {
          publishable: {
            enabled: true,
          },
        },
      },
    };

   
    const createResponse = await admin.graphql(createMutation, { variables: createVariables });
    const createData = await createResponse.json();

   

    if (createData.errors) {
      console.error("[getMetaobjectDefinitionId] GraphQL errors creating definition:", createData.errors);
      return null;
    }

    if (createData.data.metaobjectDefinitionCreate.userErrors?.length > 0) {
      console.error("[getMetaobjectDefinitionId] User errors creating definition:", createData.data.metaobjectDefinitionCreate.userErrors);
      return null;
    }

    const createdDefinition = createData.data.metaobjectDefinitionCreate.metaobjectDefinition;
    if (createdDefinition) {
     
      return createdDefinition.id;
    }

    console.warn('[getMetaobjectDefinitionId] Metaobject definition not found and could not be created - response:', JSON.stringify(createData, null, 2));
    return null;
  } catch (error) {
    console.error("[getMetaobjectDefinitionId] Error:", error);
    return null;
  }
}

/**
 * Creează metafield definition-ul dc_specification_template pentru colecții dacă nu există
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<boolean>} True dacă definition-ul există sau a fost creat cu succes
 */
async function ensureCollectionMetafieldDefinition(admin) {
  const query = `
    query getMetafieldDefinition($namespace: String!, $key: String!, $ownerType: MetafieldOwnerType!) {
      metafieldDefinitions(first: 1, namespace: $namespace, key: $key, ownerType: $ownerType) {
        nodes {
          id
          namespace
          key
          name
          type {
            name
          }
        }
      }
    }
  `;

  try {
    // Verifică dacă definition-ul există deja
    const checkResponse = await admin.graphql(query, {
      variables: {
        namespace: "custom",
        key: "dc_specification_template",
        ownerType: "COLLECTION",
      },
    });
    const checkData = await checkResponse.json();

    if (checkData.errors) {
      console.error("[ensureCollectionMetafieldDefinition] Error checking definition:", checkData.errors);
      return false;
    }

    const existingDefinition = checkData.data?.metafieldDefinitions?.nodes?.[0];
    if (existingDefinition) {
   
      return true;
    }

    // Obține ID-ul metaobject definition-ului
    const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
    if (!metaobjectDefinitionId) {
      console.error('[ensureCollectionMetafieldDefinition] Cannot create metafield definition without metaobject definition ID');
      return false;
    }

    // Creează definition-ul explicit
    
    const createMutation = `
      mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            namespace
            key
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createVariables = {
      definition: {
        name: "Specification Template",
        namespace: "custom",
        key: "dc_specification_template",
        ownerType: "COLLECTION",
        type: "metaobject_reference",
        description: "Reference to specification template metaobject",
        validations: [
          {
            name: "metaobject_definition_id",
            value: metaobjectDefinitionId,
          },
        ],
      },
    };

    const createResponse = await admin.graphql(createMutation, { variables: createVariables });
    const createData = await createResponse.json();

    if (createData.errors) {
      console.error("[ensureCollectionMetafieldDefinition] GraphQL errors creating definition:", createData.errors);
      return false;
    }

    if (createData.data.metafieldDefinitionCreate.userErrors?.length > 0) {
      console.error("[ensureCollectionMetafieldDefinition] User errors creating definition:", createData.data.metafieldDefinitionCreate.userErrors);
      return false;
    }

   
    return true;
  } catch (error) {
    console.error("[ensureCollectionMetafieldDefinition] Error:", error);
    return false;
  }
}

/**
 * Creează metafield definition-ul dc_specification_template pentru produse dacă nu există
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<boolean>} True dacă definition-ul există sau a fost creat cu succes
 */
async function ensureProductMetafieldDefinition(admin) {
  const query = `
    query getMetafieldDefinition($namespace: String!, $key: String!, $ownerType: MetafieldOwnerType!) {
      metafieldDefinitions(first: 1, namespace: $namespace, key: $key, ownerType: $ownerType) {
        nodes {
          id
          namespace
          key
          name
          type {
            name
          }
        }
      }
    }
  `;

  try {
    // Verifică dacă definition-ul există deja
    const checkResponse = await admin.graphql(query, {
      variables: {
        namespace: "custom",
        key: "dc_specification_template",
        ownerType: "PRODUCT",
      },
    });
    const checkData = await checkResponse.json();

    if (checkData.errors) {
      console.error("[ensureProductMetafieldDefinition] Error checking definition:", checkData.errors);
      return false;
    }

    const existingDefinition = checkData.data?.metafieldDefinitions?.nodes?.[0];
    if (existingDefinition) {
    
      return true;
    }

    // Obține ID-ul metaobject definition-ului
    const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
    if (!metaobjectDefinitionId) {
      console.error('[ensureProductMetafieldDefinition] Cannot create metafield definition without metaobject definition ID');
      return false;
    }

    // Creează definition-ul explicit
   
    const createMutation = `
      mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            namespace
            key
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createVariables = {
      definition: {
        name: "Specification Template",
        namespace: "custom",
        key: "dc_specification_template",
        ownerType: "PRODUCT",
        type: "metaobject_reference",
        description: "Reference to specification template metaobject",
        validations: [
          {
            name: "metaobject_definition_id",
            value: metaobjectDefinitionId,
          },
        ],
      },
    };

    const createResponse = await admin.graphql(createMutation, { variables: createVariables });
    const createData = await createResponse.json();

    if (createData.errors) {
      console.error("[ensureProductMetafieldDefinition] GraphQL errors creating definition:", createData.errors);
      return false;
    }

    if (createData.data.metafieldDefinitionCreate.userErrors?.length > 0) {
      console.error("[ensureProductMetafieldDefinition] User errors creating definition:", createData.data.metafieldDefinitionCreate.userErrors);
      return false;
    }

   
    return true;
  } catch (error) {
    console.error("[ensureProductMetafieldDefinition] Error:", error);
    return false;
  }
}

/**
 * Setează metafield-ul dc_specification_template pe o colecție
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} collectionId - ID-ul colecției (GID format: gid://shopify/Collection/123456789)
 * @param {string} metaobjectId - ID-ul metaobject-ului (GID format: gid://shopify/Metaobject/123456789)
 * @returns {Promise<boolean>} True dacă a fost setat cu succes
 */
export async function setCollectionMetafield(admin, collectionId, metaobjectId) {
  // Asigură-te că collectionId este în format GID
  const collectionGid = collectionId.startsWith('gid://') 
    ? collectionId 
    : `gid://shopify/Collection/${collectionId}`;

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: collectionGid,
        namespace: "custom",
        key: "dc_specification_template",
        type: "metaobject_reference",
        value: metaobjectId, // GID-ul metaobject-ului
      },
    ],
  };

  try {
    // Asigură-te că metafield definition-ul există înainte de a seta metafield-ul
    const definitionExists = await ensureCollectionMetafieldDefinition(admin);
    if (!definitionExists) {
      console.error('[setCollectionMetafield] Failed to ensure metafield definition exists for COLLECTION');
      return false;
    }
    
    
    
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[setCollectionMetafield] GraphQL errors:", data.errors);
      return false;
    }

    if (data.data.metafieldsSet.userErrors?.length > 0) {
      console.error("[setCollectionMetafield] User errors:", data.data.metafieldsSet.userErrors);
      return false;
    }


    return true;
  } catch (error) {
    console.error("[setCollectionMetafield] Error setting metafield:", error);
    return false;
  }
}

/**
 * Setează metafield-ul dc_specification_template pe un produs
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} productId - ID-ul produsului (GID format: gid://shopify/Product/123456789)
 * @param {string} metaobjectId - ID-ul metaobject-ului (GID format: gid://shopify/Metaobject/123456789)
 * @returns {Promise<boolean>} True dacă a fost setat cu succes
 */
export async function setProductMetafield(admin, productId, metaobjectId) {
  // Asigură-te că productId este în format GID
  const productGid = productId.startsWith('gid://') 
    ? productId 
    : `gid://shopify/Product/${productId}`;

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: productGid,
        namespace: "custom",
        key: "dc_specification_template",
        type: "metaobject_reference",
        value: metaobjectId, // GID-ul metaobject-ului
      },
    ],
  };

  try {
    // Asigură-te că metafield definition-ul există înainte de a seta metafield-ul
    const definitionExists = await ensureProductMetafieldDefinition(admin);
    if (!definitionExists) {
      console.error('[setProductMetafield] Failed to ensure metafield definition exists for PRODUCT');
      return false;
    }
    

    
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[setProductMetafield] GraphQL errors:", data.errors);
      return false;
    }

    if (data.data.metafieldsSet.userErrors?.length > 0) {
      console.error("[setProductMetafield] User errors:", data.data.metafieldsSet.userErrors);
      return false;
    }

    
    return true;
  } catch (error) {
    console.error("[setProductMetafield] Error setting metafield:", error);
    return false;
  }
}

/**
 * Șterge metafield-ul dc_specification_template de pe o colecție
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} collectionId - ID-ul colecției (GID format: gid://shopify/Collection/123456789)
 * @returns {Promise<boolean>} True dacă a fost șters cu succes
 */
export async function deleteCollectionMetafield(admin, collectionId) {
  // Asigură-te că collectionId este în format GID
  const collectionGid = collectionId.startsWith('gid://') 
    ? collectionId 
    : `gid://shopify/Collection/${collectionId}`;

  // Șterge metafield-ul folosind ownerId, namespace și key
  const mutation = `
    mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields {
          key
          namespace
          ownerId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: collectionGid,
        namespace: "custom",
        key: "dc_specification_template",
      },
    ],
  };

  try {

    
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[deleteCollectionMetafield] GraphQL errors:", data.errors);
      return false;
    }

    if (data.data.metafieldsDelete.userErrors?.length > 0) {
      console.error("[deleteCollectionMetafield] User errors:", data.data.metafieldsDelete.userErrors);
      return false;
    }


    return true;
  } catch (error) {
    console.error("[deleteCollectionMetafield] Error deleting metafield:", error);
    return false;
  }
}

/**
 * Șterge metafield-ul dc_specification_template de pe un produs
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} productId - ID-ul produsului (GID format: gid://shopify/Product/123456789)
 * @returns {Promise<boolean>} True dacă a fost șters cu succes
 */
export async function deleteProductMetafield(admin, productId) {
  // Asigură-te că productId este în format GID
  const productGid = productId.startsWith('gid://') 
    ? productId 
    : `gid://shopify/Product/${productId}`;

  // Șterge metafield-ul folosind ownerId, namespace și key
  const mutation = `
    mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields {
          key
          namespace
          ownerId
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: productGid,
        namespace: "custom",
        key: "dc_specification_template",
      },
    ],
  };

  try {

    
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[deleteProductMetafield] GraphQL errors:", data.errors);
      return false;
    }

    if (data.data.metafieldsDelete.userErrors?.length > 0) {
      console.error("[deleteProductMetafield] User errors:", data.data.metafieldsDelete.userErrors);
      return false;
    }


    return true;
  } catch (error) {
    console.error("[deleteProductMetafield] Error deleting metafield:", error);
    return false;
  }
}

/**
 * Șterge toate metaobject-urile de tip specification_template pentru un shop
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<boolean>} True dacă a fost șters cu succes
 */
export async function deleteAllMetaobjects(admin) {

  
  const mutation = `
    mutation metaobjectBulkDelete($where: MetaobjectBulkDeleteWhereCondition!) {
      metaobjectBulkDelete(where: $where) {
        job {
          id
          done
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    where: {
      type: "specification_template",
    },
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[deleteAllMetaobjects] GraphQL errors:", data.errors);
      return false;
    }

    if (data.data.metaobjectBulkDelete.userErrors?.length > 0) {
      console.error("[deleteAllMetaobjects] User errors:", data.data.metaobjectBulkDelete.userErrors);
      return false;
    }

    const job = data.data.metaobjectBulkDelete.job;

    
    // Job-ul este asincron, dar returnăm true pentru că operația a fost inițiată cu succes
    return true;
  } catch (error) {
    console.error("[deleteAllMetaobjects] Error deleting metaobjects:", error);
    return false;
  }
}

/**
 * Șterge toate metafield-urile dc_specification_template de pe produse și colecții
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<{productsDeleted: number, collectionsDeleted: number}>} Numărul de metafield-uri șterse
 */
export async function deleteAllMetafields(admin) {

  
  let productsDeleted = 0;
  let collectionsDeleted = 0;
  let hasNextPage = true;
  let cursor = null;
  const batchSize = 25; // Maximum pentru metafieldsDelete

  // Șterge metafield-urile de pe produse

  try {
    while (hasNextPage) {
      const productsQuery = `
        query getProductsWithMetafield($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                metafield(namespace: "custom", key: "dc_specification_template") {
                  id
                }
              }
            }
          }
        }
      `;

      const productsResponse = await admin.graphql(productsQuery, {
        variables: {
          first: 250,
          after: cursor,
        },
      });
      const productsData = await productsResponse.json();

      if (productsData.errors) {
        console.error("[deleteAllMetafields] Error querying products:", productsData.errors);
        break;
      }

      const products = productsData.data?.products?.edges || [];
      const metafieldsToDelete = products
        .filter(edge => edge.node.metafield?.id)
        .map(edge => ({
          ownerId: edge.node.id,
          namespace: "custom",
          key: "dc_specification_template",
        }));

      if (metafieldsToDelete.length > 0) {
        // Șterge în batch-uri de 25 (limita pentru metafieldsDelete)
        for (let i = 0; i < metafieldsToDelete.length; i += batchSize) {
          const batch = metafieldsToDelete.slice(i, i + batchSize);
          
          const deleteMutation = `
            mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields {
                  ownerId
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const deleteResponse = await admin.graphql(deleteMutation, {
            variables: {
              metafields: batch,
            },
          });
          const deleteData = await deleteResponse.json();

          if (deleteData.errors) {
            console.error("[deleteAllMetafields] Error deleting product metafields:", deleteData.errors);
          } else if (deleteData.data.metafieldsDelete.userErrors?.length > 0) {
            console.warn("[deleteAllMetafields] User errors deleting product metafields:", deleteData.data.metafieldsDelete.userErrors);
          } else {
            const deletedCount = deleteData.data.metafieldsDelete.deletedMetafields?.length || 0;
            productsDeleted += deletedCount;
            
          }
        }
      }

      hasNextPage = productsData.data?.products?.pageInfo?.hasNextPage || false;
      cursor = productsData.data?.products?.pageInfo?.endCursor || null;
    }
  } catch (error) {
    console.error("[deleteAllMetafields] Error processing products:", error);
  }

  // Resetează pentru colecții
  hasNextPage = true;
  cursor = null;

  // Șterge metafield-urile de pe colecții

  try {
    while (hasNextPage) {
      const collectionsQuery = `
        query getCollectionsWithMetafield($first: Int!, $after: String) {
          collections(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                metafield(namespace: "custom", key: "dc_specification_template") {
                  id
                }
              }
            }
          }
        }
      `;

      const collectionsResponse = await admin.graphql(collectionsQuery, {
        variables: {
          first: 250,
          after: cursor,
        },
      });
      const collectionsData = await collectionsResponse.json();

      if (collectionsData.errors) {
        console.error("[deleteAllMetafields] Error querying collections:", collectionsData.errors);
        break;
      }

      const collections = collectionsData.data?.collections?.edges || [];
      const metafieldsToDelete = collections
        .filter(edge => edge.node.metafield?.id)
        .map(edge => ({
          ownerId: edge.node.id,
          namespace: "custom",
          key: "dc_specification_template",
        }));

      if (metafieldsToDelete.length > 0) {
        // Șterge în batch-uri de 25 (limita pentru metafieldsDelete)
        for (let i = 0; i < metafieldsToDelete.length; i += batchSize) {
          const batch = metafieldsToDelete.slice(i, i + batchSize);
          
          const deleteMutation = `
            mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields {
                  ownerId
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const deleteResponse = await admin.graphql(deleteMutation, {
            variables: {
              metafields: batch,
            },
          });
          const deleteData = await deleteResponse.json();

          if (deleteData.errors) {
            console.error("[deleteAllMetafields] Error deleting collection metafields:", deleteData.errors);
          } else if (deleteData.data.metafieldsDelete.userErrors?.length > 0) {
            console.warn("[deleteAllMetafields] User errors deleting collection metafields:", deleteData.data.metafieldsDelete.userErrors);
          } else {
            const deletedCount = deleteData.data.metafieldsDelete.deletedMetafields?.length || 0;
            collectionsDeleted += deletedCount;
            
          }
        }
      }

      hasNextPage = collectionsData.data?.collections?.pageInfo?.hasNextPage || false;
      cursor = collectionsData.data?.collections?.pageInfo?.endCursor || null;
    }
  } catch (error) {
    console.error("[deleteAllMetafields] Error processing collections:", error);
  }

  
  return { productsDeleted, collectionsDeleted };
}


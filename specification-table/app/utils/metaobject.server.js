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
  console.log('[createOrUpdateMetaobject] START - Template ID:', template.id);
  console.log('[createOrUpdateMetaobject] Template assignments:', template.assignments);
  
  // PAS 1: Asigură-te că metaobject definition-ul există înainte de a crea metaobject-ul
  console.log('[createOrUpdateMetaobject] Ensuring metaobject definition exists...');
  const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
  if (!metaobjectDefinitionId) {
    console.error('[createOrUpdateMetaobject] Cannot create metaobject without metaobject definition');
    throw new Error('Metaobject definition does not exist and could not be created');
  }
  console.log('[createOrUpdateMetaobject] Metaobject definition exists:', metaobjectDefinitionId);
  
  // Verifică dacă template-ul este global (are assignment de tip DEFAULT)
  // Pentru template-ul global, folosim handle-ul fix "specification_template_global"
  // Pentru celelalte, folosim handle-ul bazat pe ID
  let handle;
  if (template.assignments && template.assignments.some(a => a.assignmentType === 'DEFAULT')) {
    handle = 'specification_template_global';
    console.log('[createOrUpdateMetaobject] Template is GLOBAL, using handle:', handle);
  } else {
    handle = `specification_template_${template.id}`;
    console.log('[createOrUpdateMetaobject] Template is NOT global, using handle:', handle);
  }
  
  // Pregătește datele pentru metaobject
  console.log('[createOrUpdateMetaobject] Preparing template structure...');
  console.log('[createOrUpdateMetaobject] Template sections count:', template.sections?.length || 0);
  
  const templateStructure = {
    sections: template.sections?.map(section => ({
      heading: section.heading,
      metafields: section.metafields?.map(mf => {
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
  console.log('[createOrUpdateMetaobject] Checking if metaobject exists with handle:', handle);
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
    console.log('[createOrUpdateMetaobject] Executing GraphQL query to check metaobject...');
    const checkResponse = await admin.graphql(checkQuery, { variables: checkVariables });
    const checkData = await checkResponse.json();
    console.log('[createOrUpdateMetaobject] GraphQL response:', JSON.stringify(checkData, null, 2));

    if (checkData.errors) {
      console.error("[createOrUpdateMetaobject] Error checking metaobject:", checkData.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(checkData.errors)}`);
    }

    // Extrage metaobject-ul direct din răspuns
    const existingMetaobject = checkData.data?.metaobjectByHandle || null;
    console.log('[createOrUpdateMetaobject] Existing metaobject found:', !!existingMetaobject);
    if (existingMetaobject) {
      console.log('[createOrUpdateMetaobject] Existing metaobject ID:', existingMetaobject.id);
      console.log('[createOrUpdateMetaobject] Existing metaobject handle:', existingMetaobject.handle);
    }

    if (existingMetaobject) {
      // Actualizează metaobject-ul existent
      console.log('[createOrUpdateMetaobject] Updating existing metaobject...');
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

      console.log('[createOrUpdateMetaobject] Executing update mutation...');
      const updateResponse = await admin.graphql(updateMutation, { variables: updateVariables });
      const updateData = await updateResponse.json();
      console.log('[createOrUpdateMetaobject] Update mutation response:', JSON.stringify(updateData, null, 2));

      if (updateData.errors) {
        console.error("[createOrUpdateMetaobject] Error updating metaobject:", updateData.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(updateData.errors)}`);
      }

      if (updateData.data.metaobjectUpdate.userErrors?.length > 0) {
        console.error("[createOrUpdateMetaobject] User errors updating metaobject:", updateData.data.metaobjectUpdate.userErrors);
        throw new Error(`User errors: ${JSON.stringify(updateData.data.metaobjectUpdate.userErrors)}`);
      }

      console.log('[createOrUpdateMetaobject] Metaobject updated successfully:', updateData.data.metaobjectUpdate.metaobject);
      return updateData.data.metaobjectUpdate.metaobject;
    } else {
      // Creează metaobject-ul nou
      console.log('[createOrUpdateMetaobject] Creating new metaobject...');
      console.log('[createOrUpdateMetaobject] Template structure JSON length:', JSON.stringify(templateStructure).length);
      console.log('[createOrUpdateMetaobject] Template styling JSON length:', JSON.stringify(templateStyling).length);
      console.log('[createOrUpdateMetaobject] Template settings JSON length:', JSON.stringify(templateSettings).length);
      
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

      console.log('[createOrUpdateMetaobject] Executing create mutation...');
      console.log('[createOrUpdateMetaobject] Create variables:', JSON.stringify(createVariables, null, 2));
      const createResponse = await admin.graphql(createMutation, { variables: createVariables });
      const createData = await createResponse.json();
      console.log('[createOrUpdateMetaobject] Create mutation response:', JSON.stringify(createData, null, 2));

      if (createData.errors) {
        console.error("[createOrUpdateMetaobject] Error creating metaobject:", createData.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(createData.errors)}`);
      }

      if (createData.data.metaobjectCreate.userErrors?.length > 0) {
        console.error("[createOrUpdateMetaobject] User errors creating metaobject:", createData.data.metaobjectCreate.userErrors);
        throw new Error(`User errors: ${JSON.stringify(createData.data.metaobjectCreate.userErrors)}`);
      }

      console.log('[createOrUpdateMetaobject] Metaobject created successfully:', createData.data.metaobjectCreate.metaobject);
      return createData.data.metaobjectCreate.metaobject;
    }
  } catch (error) {
    console.error("[createOrUpdateMetaobject] Error in createOrUpdateMetaobject:", error);
    console.error("[createOrUpdateMetaobject] Error stack:", error.stack);
    // Nu aruncăm eroarea, doar logăm - nu vrem să blocheze salvarea template-ului
    // Template-ul se salvează în DB chiar dacă metaobject-ul eșuează
    return null;
  }
  
  console.log('[createOrUpdateMetaobject] END');
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
    console.log('[getMetaobjectDefinitionId] Checking for metaobject definition with type: specification_template');
    try {
      const response = await admin.graphql(query, {
        variables: {
          type: "specification_template",
        },
      });
      const data = await response.json();

      console.log('[getMetaobjectDefinitionId] Query response:', JSON.stringify(data, null, 2));

      if (data.errors) {
        console.warn("[getMetaobjectDefinitionId] Error fetching metaobject definition (may not have read permission):", data.errors);
        // Continuă să încerce să creeze definition-ul
      } else {
        const definition = data.data?.metaobjectDefinitionByType;
        if (definition) {
          console.log('[getMetaobjectDefinitionId] Found existing metaobject definition:', definition.id);
          return definition.id;
        } else {
          console.log('[getMetaobjectDefinitionId] No existing metaobject definition found for type: specification_template');
        }
      }
    } catch (queryError) {
      // Dacă nu avem permisiunea de read, continuă direct la creare
      console.warn('[getMetaobjectDefinitionId] Cannot query metaobject definition (may not have read permission), will attempt to create:', queryError.message);
    }

    // Dacă nu există, încearcă să-l creeze
    console.log('[getMetaobjectDefinitionId] Metaobject definition not found - creating it...');
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

    console.log('[getMetaobjectDefinitionId] Creating metaobject definition with variables:', JSON.stringify(createVariables, null, 2));
    const createResponse = await admin.graphql(createMutation, { variables: createVariables });
    const createData = await createResponse.json();

    console.log('[getMetaobjectDefinitionId] Create mutation response:', JSON.stringify(createData, null, 2));

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
      console.log('[getMetaobjectDefinitionId] Metaobject definition created successfully:', createdDefinition.id);
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
      console.log('[ensureCollectionMetafieldDefinition] Definition already exists for COLLECTION');
      return true;
    }

    // Obține ID-ul metaobject definition-ului
    const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
    if (!metaobjectDefinitionId) {
      console.error('[ensureCollectionMetafieldDefinition] Cannot create metafield definition without metaobject definition ID');
      return false;
    }

    // Creează definition-ul explicit
    console.log('[ensureCollectionMetafieldDefinition] Definition does not exist - creating it...');
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

    console.log('[ensureCollectionMetafieldDefinition] Definition created successfully for COLLECTION');
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
      console.log('[ensureProductMetafieldDefinition] Definition already exists for PRODUCT');
      return true;
    }

    // Obține ID-ul metaobject definition-ului
    const metaobjectDefinitionId = await getMetaobjectDefinitionId(admin);
    if (!metaobjectDefinitionId) {
      console.error('[ensureProductMetafieldDefinition] Cannot create metafield definition without metaobject definition ID');
      return false;
    }

    // Creează definition-ul explicit
    console.log('[ensureProductMetafieldDefinition] Definition does not exist - creating it...');
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

    console.log('[ensureProductMetafieldDefinition] Definition created successfully for PRODUCT');
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
    
    console.log('[setCollectionMetafield] Setting metafield for collection:', collectionGid);
    console.log('[setCollectionMetafield] Metaobject ID:', metaobjectId);
    
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

    console.log('[setCollectionMetafield] Metafield set successfully for collection:', collectionGid);
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
    
    console.log('[setProductMetafield] Setting metafield for product:', productGid);
    console.log('[setProductMetafield] Metaobject ID:', metaobjectId);
    
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

    console.log('[setProductMetafield] Metafield set successfully for product:', productGid);
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
    console.log('[deleteCollectionMetafield] Deleting metafield for collection:', collectionGid);
    
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

    console.log('[deleteCollectionMetafield] Metafield deleted successfully for collection:', collectionGid);
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
    console.log('[deleteProductMetafield] Deleting metafield for product:', productGid);
    
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

    console.log('[deleteProductMetafield] Metafield deleted successfully for product:', productGid);
    return true;
  } catch (error) {
    console.error("[deleteProductMetafield] Error deleting metafield:", error);
    return false;
  }
}


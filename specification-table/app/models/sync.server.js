import prisma from "../db.server.js";
import { randomUUID } from "crypto";

/**
 * Sincronizează toate produsele dintr-un shop
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {string|null} updatedAfter - ISO date string (opțional) - sincronizează doar produsele actualizate după această dată
 */
export async function syncProducts(admin, shopDomain, updatedAfter = null) {
  let hasNextPage = true;
  let cursor = null;
  let totalSynced = 0;

  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // OPTIMIZARE: pentru shop-uri noi (fără produse în DB) inserăm în batch (250 / request)
  // Folosim `createMany` + id generat (createMany nu aplică @default(uuid()) în mod fiabil).
  const existingCount = await prisma.product.count({
    where: { shopId: shop.id },
  });
  const isInitialSync = existingCount === 0;

  // Dacă avem updatedAfter, folosim query incremental, altfel sync complet
  const useIncrementalSync = updatedAfter && !isInitialSync;

  while (hasNextPage) {
    let query;
    let variables = {};

    if (useIncrementalSync) {
      // Query incremental - doar produsele actualizate după updatedAfter
      query = `
        query ProductsUpdatedAfter($cursor: String, $updatedAfter: String!) {
          products(
            first: 250
            after: $cursor
            query: $updatedAfter
            sortKey: UPDATED_AT
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              cursor
              node {
                id
                title
                handle
                updatedAt
              }
            }
          }
        }
      `;
      
      // Formatăm query string-ul pentru Shopify: "updated_at:>'2025-12-19T16:33:11Z'"
      const queryString = `updated_at:>'${updatedAfter}'`;
      variables = { updatedAfter: queryString };
      if (cursor) {
        variables.cursor = cursor;
      }
    } else {
      // Query complet - toate produsele
      query = `
        query getProducts($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
            }
          }
        }
      `;
      
      if (cursor) {
        variables.cursor = cursor;
      }
    }

    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    // Pentru query incremental folosim edges, pentru query complet folosim nodes
    const products = useIncrementalSync 
      ? data.data.products.edges.map(edge => edge.node)
      : data.data.products.nodes;
    const pageInfo = data.data.products.pageInfo;

    if (isInitialSync) {
      const rows = products.map((product) => ({
        id: randomUUID(),
        shopifyId: product.id,
        title: product.title,
        handle: product.handle || null,
        shopId: shop.id,
      }));

      if (rows.length > 0) {
        await prisma.product.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }
    } else {
      // Upsert products (pentru re-sync / update)
      for (const product of products) {
        await prisma.product.upsert({
          where: {
            shopifyId_shopId: {
              shopifyId: product.id,
              shopId: shop.id,
            },
          },
          update: {
            title: product.title,
            handle: product.handle || null,
          },
          create: {
            shopifyId: product.id,
            title: product.title,
            handle: product.handle || null,
            shopId: shop.id,
          },
        });
      }
    }

    totalSynced += products.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return { totalSynced, shopId: shop.id };
}

/**
 * Sincronizează toate colecțiile dintr-un shop
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {string|null} updatedAfter - ISO date string (opțional) - sincronizează doar colecțiile actualizate după această dată
 */
export async function syncCollections(admin, shopDomain, updatedAfter = null) {
  let hasNextPage = true;
  let cursor = null;
  let totalSynced = 0;

  // Găsește shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  const existingCount = await prisma.collection.count({
    where: { shopId: shop.id },
  });
  const isInitialSync = existingCount === 0;
  const useIncrementalSync = updatedAfter && !isInitialSync;

  while (hasNextPage) {
    let query;
    let variables = {};

    if (useIncrementalSync) {
      // Query incremental - doar colecțiile actualizate după updatedAfter
      query = `
        query CollectionsUpdatedAfter($cursor: String, $updatedAfter: String!) {
          collections(
            first: 250
            after: $cursor
            query: $updatedAfter
            sortKey: UPDATED_AT
          ) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              cursor
              node {
                id
                title
                handle
                updatedAt
              }
            }
          }
        }
      `;
      
      const queryString = `updated_at:>'${updatedAfter}'`;
      variables = { updatedAfter: queryString };
      if (cursor) {
        variables.cursor = cursor;
      }
    } else {
      // Query complet - toate colecțiile
      query = `
        query getCollections($cursor: String) {
          collections(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
            }
          }
        }
      `;
      
      if (cursor) {
        variables.cursor = cursor;
      }
    }

    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    // Pentru query incremental folosim edges, pentru query complet folosim nodes
    const collections = useIncrementalSync
      ? data.data.collections.edges.map(edge => edge.node)
      : data.data.collections.nodes;
    const pageInfo = data.data.collections.pageInfo;

    // Upsert collections
    for (const collection of collections) {
      await prisma.collection.upsert({
        where: {
          shopifyId_shopId: {
            shopifyId: collection.id,
            shopId: shop.id,
          },
        },
        update: {
          title: collection.title,
          handle: collection.handle || null,
        },
        create: {
          shopifyId: collection.id,
          title: collection.title,
          handle: collection.handle || null,
          shopId: shop.id,
        },
      });
    }

    totalSynced += collections.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return { totalSynced, shopId: shop.id };
}

/**
 * Sincronizează un singur produs (folosit în webhook-uri)
 */
export async function syncSingleProduct(admin, shopDomain, productId) {
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
      }
    }
  `;

  const response = await admin.graphql(query, { variables: { id: productId } });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const product = data.data.product;
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // Upsert product
  await prisma.product.upsert({
    where: {
      shopifyId_shopId: {
        shopifyId: product.id,
        shopId: shop.id,
      },
    },
    update: {
      title: product.title,
      handle: product.handle || null,
    },
    create: {
      shopifyId: product.id,
      title: product.title,
      handle: product.handle || null,
      shopId: shop.id,
    },
  });

  return { success: true, shopId: shop.id };
}

/**
 * Sincronizează o singură colecție (folosit în webhook-uri)
 */
export async function syncSingleCollection(admin, shopDomain, collectionId) {
  const query = `
    query getCollection($id: ID!) {
      collection(id: $id) {
        id
        title
        handle
      }
    }
  `;

  const response = await admin.graphql(query, { variables: { id: collectionId } });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  const collection = data.data.collection;
  if (!collection) {
    throw new Error(`Collection ${collectionId} not found`);
  }

  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // Upsert collection
  await prisma.collection.upsert({
    where: {
      shopifyId_shopId: {
        shopifyId: collection.id,
        shopId: shop.id,
      },
    },
    update: {
      title: collection.title,
      handle: collection.handle || null,
    },
    create: {
      shopifyId: collection.id,
      title: collection.title,
      handle: collection.handle || null,
      shopId: shop.id,
    },
  });

  return { success: true, shopId: shop.id };
}

/**
 * Sincronizează toate definițiile metafield-urilor pentru produse și variante
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shopDomain - Domain-ul shop-ului
 * @param {string|null} updatedAfter - ISO date string (opțional) - sincronizează doar metafield-urile actualizate după această dată
 * NOTĂ: Shopify nu suportă direct `updated_at` pentru metafield definitions în query-uri,
 * dar putem folosi `updatedAfter` pentru a face sync complet doar când este necesar
 */
export async function syncMetafieldDefinitions(admin, shopDomain, updatedAfter = null) {
  let hasNextPage = true;
  let cursor = null;
  let totalSynced = 0;

  // Găsește shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // NOTĂ: Shopify nu suportă `updatedAt` pentru metafield definitions în GraphQL API
  // Deci facem întotdeauna sync complet (toate metafield-urile), indiferent de `updatedAfter`
  // Parametrul `updatedAfter` este ignorat pentru metafield definitions

  // Set pentru a stoca toate metafield-urile din Shopify (pentru comparație)
  // Format: `${namespace}:${key}:${ownerType}`
  const shopifyMetafields = new Set();

  // Sincronizează metafield-urile pentru PRODUCT
  hasNextPage = true;
  cursor = null;

  while (hasNextPage) {
    const query = `
      query getMetafieldDefinitions($cursor: String) {
        metafieldDefinitions(first: 250, after: $cursor, ownerType: PRODUCT) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            namespace
            key
            name
            type {
              name
            }
            ownerType
          }
        }
      }
    `;

    const variables = cursor ? { cursor } : {};
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const definitions = data.data.metafieldDefinitions.nodes;
    const pageInfo = data.data.metafieldDefinitions.pageInfo;

    // NOTĂ: Shopify nu suportă `updatedAt` pentru metafield definitions în GraphQL API
    // Deci nu putem face sync incremental bazat pe `updatedAt` - facem sync complet
    // Dacă `updatedAfter` este setat, ignorăm-l și facem sync complet pentru siguranță

    // Upsert metafield definitions
    for (const definition of definitions) {
      // Normalizează ownerType: PRODUCT_VARIANT -> VARIANT, PRODUCT rămâne PRODUCT
      const normalizedOwnerType =
        definition.ownerType === "PRODUCT_VARIANT" ? "VARIANT" : definition.ownerType;

      // Adaugă în set pentru comparație ulterioară
      shopifyMetafields.add(`${definition.namespace}:${definition.key}:${normalizedOwnerType}`);

      await prisma.metafieldDefinition.upsert({
        where: {
          namespace_key_ownerType_shopId: {
            namespace: definition.namespace,
            key: definition.key,
            ownerType: normalizedOwnerType,
            shopId: shop.id,
          },
        },
        update: {
          name: definition.name || null,
          type: definition.type.name,
        },
        create: {
          namespace: definition.namespace,
          key: definition.key,
          name: definition.name || null,
          type: definition.type.name,
          ownerType: normalizedOwnerType,
          shopId: shop.id,
        },
      });
    }

    totalSynced += definitions.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  // Sincronizează metafield-urile pentru VARIANT
  // Notă: Valoarea corectă este PRODUCTVARIANT (fără underscore), nu PRODUCT_VARIANT
  hasNextPage = true;
  cursor = null;

  while (hasNextPage) {
    const query = `
      query getMetafieldDefinitions($cursor: String, $ownerType: MetafieldOwnerType!) {
        metafieldDefinitions(first: 250, after: $cursor, ownerType: $ownerType) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            namespace
            key
            name
            type {
              name
            }
            ownerType
          }
        }
      }
    `;

    const variables = cursor
      ? { cursor, ownerType: "PRODUCTVARIANT" }
      : { ownerType: "PRODUCTVARIANT" };
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const definitions = data.data.metafieldDefinitions.nodes;
    const pageInfo = data.data.metafieldDefinitions.pageInfo;

    // NOTĂ: Shopify nu suportă `updatedAt` pentru metafield definitions în GraphQL API
    // Deci nu putem face sync incremental bazat pe `updatedAt` - facem sync complet
    // Dacă `updatedAfter` este setat, ignorăm-l și facem sync complet pentru siguranță

    // Upsert metafield definitions pentru variante
    for (const definition of definitions) {
      // Normalizează ownerType: PRODUCTVARIANT -> VARIANT (pentru consistență în DB)
      const normalizedOwnerType = "VARIANT";

      // Adaugă în set pentru comparație ulterioară
      shopifyMetafields.add(`${definition.namespace}:${definition.key}:${normalizedOwnerType}`);

      await prisma.metafieldDefinition.upsert({
        where: {
          namespace_key_ownerType_shopId: {
            namespace: definition.namespace,
            key: definition.key,
            ownerType: normalizedOwnerType,
            shopId: shop.id,
          },
        },
        update: {
          name: definition.name || null,
          type: definition.type.name,
        },
        create: {
          namespace: definition.namespace,
          key: definition.key,
          name: definition.name || null,
          type: definition.type.name,
          ownerType: normalizedOwnerType,
          shopId: shop.id,
        },
      });
    }

    totalSynced += definitions.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  // NOUA LOGICĂ: Șterge metafield-urile care există în App Database dar nu mai există în Shopify
  // Obține toate metafield-urile din App Database pentru acest shop
  const appMetafields = await prisma.metafieldDefinition.findMany({
    where: {
      shopId: shop.id,
    },
    select: {
      id: true,
      namespace: true,
      key: true,
      ownerType: true,
    },
  });

  // Identifică metafield-urile care trebuie șterse
  const metafieldsToDelete = appMetafields.filter((appMetafield) => {
    const key = `${appMetafield.namespace}:${appMetafield.key}:${appMetafield.ownerType}`;
    return !shopifyMetafields.has(key);
  });

  // Șterge metafield-urile care nu mai există în Shopify
  let totalDeleted = 0;
  if (metafieldsToDelete.length > 0) {
    const idsToDelete = metafieldsToDelete.map((m) => m.id);
    const deleteResult = await prisma.metafieldDefinition.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
        shopId: shop.id,
      },
    });
    totalDeleted = deleteResult.count;
    console.log(
      `[syncMetafieldDefinitions] Deleted ${totalDeleted} metafield definitions that no longer exist in Shopify for shop ${shopDomain}`
    );
  }

  return { totalSynced, totalDeleted, shopId: shop.id };
}

/**
 * Sincronizează un singur metafield definition (folosit pentru webhook-uri)
 */
export async function syncSingleMetafieldDefinition(admin, shopDomain, metafieldDefinitionData) {
  console.log(`[sync] syncSingleMetafieldDefinition called with:`, metafieldDefinitionData);
  
  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
    console.log(`[sync] Created shop: ${shopDomain}`);
  }

  // Normalizează ownerType: 
  // - PRODUCT_VARIANT sau PRODUCTVARIANT -> VARIANT
  // - Product (cu majusculă) -> PRODUCT
  // - PRODUCT rămâne PRODUCT
  let normalizedOwnerType = metafieldDefinitionData.ownerType;
  
  if (normalizedOwnerType === "PRODUCT_VARIANT" || normalizedOwnerType === "PRODUCTVARIANT") {
    normalizedOwnerType = "VARIANT";
  } else if (normalizedOwnerType === "ProductVariant" || normalizedOwnerType === "PRODUCTVARIANT") {
    normalizedOwnerType = "VARIANT";
  } else if (normalizedOwnerType === "Product" || normalizedOwnerType === "PRODUCT") {
    normalizedOwnerType = "PRODUCT";
  } else if (normalizedOwnerType === "Variant" || normalizedOwnerType === "VARIANT") {
    normalizedOwnerType = "VARIANT";
  }
  
  // Asigură-te că ownerType este uppercase
  normalizedOwnerType = normalizedOwnerType.toUpperCase();

  console.log(`[sync] Normalized ownerType: ${metafieldDefinitionData.ownerType} -> ${normalizedOwnerType}`);

  // Upsert metafield definition
  const result = await prisma.metafieldDefinition.upsert({
    where: {
      namespace_key_ownerType_shopId: {
        namespace: metafieldDefinitionData.namespace,
        key: metafieldDefinitionData.key,
        ownerType: normalizedOwnerType,
        shopId: shop.id,
      },
    },
    update: {
      name: metafieldDefinitionData.name || null,
      type: metafieldDefinitionData.type?.name || metafieldDefinitionData.type,
    },
    create: {
      namespace: metafieldDefinitionData.namespace,
      key: metafieldDefinitionData.key,
      name: metafieldDefinitionData.name || null,
      type: metafieldDefinitionData.type?.name || metafieldDefinitionData.type,
      ownerType: normalizedOwnerType,
      shopId: shop.id,
    },
  });

  console.log(`[sync] Upsert result:`, {
    id: result.id,
    namespace: result.namespace,
    key: result.key,
    ownerType: result.ownerType,
    type: result.type
  });

  return { success: true, shopId: shop.id };
}

/**
 * Sincronizează toate datele (produse, colecții, metafield-uri)
 */
/**
 * Sincronizează toate datele (produse, colecții, metafield-uri) pentru un shop
 * Folosește sync incremental bazat pe lastFullSyncAt din SyncStatus pentru a evita sync-ul inutil
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} shopDomain - Domain-ul shop-ului
 * @returns {Promise<Object>} Rezultatele sync-ului
 */
/**
 * Sincronizează toate metafield definitions pentru un shop
 * NOUA LOGICĂ: Nu mai facem sync pentru products și collections (doar când se face assignment)
 */
export async function syncAll(admin, shopDomain) {
  const results = {
    metafieldDefinitions: null,
    errors: [],
  };

  // Găsește shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
      select: { id: true },
    });
  }

  // NOUA LOGICĂ: Doar metafield definitions (nu mai facem sync pentru products/collections)
  try {
    // Sync metafield definitions (sync complet - Shopify nu suportă updatedAt pentru metafield definitions)
    results.metafieldDefinitions = await syncMetafieldDefinitions(admin, shopDomain, null);
  } catch (error) {
    console.error(`[syncAll] Error syncing metafield definitions:`, error);
    results.errors.push({ type: "metafieldDefinitions", error: error.message });
  }

  // Actualizează lastFullSyncAt după sync reușit
  // NOUA LOGICĂ: Doar metafield definitions (nu mai facem sync pentru products/collections)
  if (results.metafieldDefinitions) {
    await prisma.syncStatus.upsert({
      where: { shopId: shop.id },
      update: {
        lastFullSyncAt: new Date(),
      },
      create: {
        shopId: shop.id,
        lastFullSyncAt: new Date(),
      },
    });
    console.log(`[syncAll] Updated lastFullSyncAt for ${shopDomain}`);
  }

  return results;
}

/**
 * Setează metafield-ul app_url pentru shop
 */
export async function setShopAppUrl(admin, shopDomain, appUrl) {
  // Obține shop ID-ul din GraphQL
  const shopQuery = `
    query {
      shop {
        id
      }
    }
  `;

  const shopResponse = await admin.graphql(shopQuery);
  const shopData = await shopResponse.json();

  if (shopData.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(shopData.errors)}`);
  }

  const shopId = shopData.data.shop.id;

  // Verifică dacă metafield-ul există deja
  const checkQuery = `
    query {
      shop {
        metafield(namespace: "custom", key: "app_url") {
          id
        }
      }
    }
  `;

  const checkResponse = await admin.graphql(checkQuery);
  const checkData = await checkResponse.json();

  const existingMetafieldId = checkData.data?.shop?.metafield?.id;

  // Creează sau actualizează metafield-ul
  const mutation = existingMetafieldId
    ? `
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
    `
    : `
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
        ownerId: shopId,
        namespace: "custom",
        key: "app_url",
        type: "single_line_text_field",
        value: appUrl,
      },
    ],
  };

  const response = await admin.graphql(mutation, { variables });
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  if (data.data.metafieldsSet.userErrors?.length > 0) {
    throw new Error(
      `User errors: ${JSON.stringify(data.data.metafieldsSet.userErrors)}`
    );
  }

  return {
    success: true,
    metafield: data.data.metafieldsSet.metafields[0],
  };
}

/**
 * Obține metafield-ul app_url pentru shop
 */
export async function getShopAppUrl(admin) {
  const query = `
    query {
      shop {
        metafield(namespace: "custom", key: "app_url") {
          id
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data?.shop?.metafield?.value || null;
}
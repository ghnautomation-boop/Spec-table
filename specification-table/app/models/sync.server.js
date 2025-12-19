import prisma from "../db.server.js";
import { randomUUID } from "crypto";

/**
 * Sincronizează toate produsele dintr-un shop
 */
export async function syncProducts(admin, shopDomain) {
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

  while (hasNextPage) {
    const query = `
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

    const variables = cursor ? { cursor } : {};
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data.products.nodes;
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
 */
export async function syncCollections(admin, shopDomain) {
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

  while (hasNextPage) {
    const query = `
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

    const variables = cursor ? { cursor } : {};
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const collections = data.data.collections.nodes;
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
 */
export async function syncMetafieldDefinitions(admin, shopDomain) {
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

    // Upsert metafield definitions
    for (const definition of definitions) {
      // Normalizează ownerType: PRODUCT_VARIANT -> VARIANT, PRODUCT rămâne PRODUCT
      const normalizedOwnerType =
        definition.ownerType === "PRODUCT_VARIANT" ? "VARIANT" : definition.ownerType;

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

    // Upsert metafield definitions pentru variante
    for (const definition of definitions) {
      // Normalizează ownerType: PRODUCTVARIANT -> VARIANT (pentru consistență în DB)
      const normalizedOwnerType = "VARIANT";

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

  return { totalSynced, shopId: shop.id };
}

/**
 * Sincronizează un singur metafield definition (folosit pentru webhook-uri)
 */
export async function syncSingleMetafieldDefinition(admin, shopDomain, metafieldDefinitionData) {
  // Găsește sau creează shop-ul
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // Normalizează ownerType: PRODUCT_VARIANT sau PRODUCTVARIANT -> VARIANT, PRODUCT rămâne PRODUCT
  const normalizedOwnerType =
    metafieldDefinitionData.ownerType === "PRODUCT_VARIANT" || 
    metafieldDefinitionData.ownerType === "PRODUCTVARIANT"
      ? "VARIANT"
      : metafieldDefinitionData.ownerType;

  // Upsert metafield definition
  await prisma.metafieldDefinition.upsert({
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

  return { success: true, shopId: shop.id };
}

/**
 * Sincronizează toate datele (produse, colecții, metafield-uri)
 */
export async function syncAll(admin, shopDomain) {
  const results = {
    products: null,
    collections: null,
    metafieldDefinitions: null,
    errors: [],
  };

  try {
    results.products = await syncProducts(admin, shopDomain);
  } catch (error) {
    results.errors.push({ type: "products", error: error.message });
  }

  try {
    results.collections = await syncCollections(admin, shopDomain);
  } catch (error) {
    results.errors.push({ type: "collections", error: error.message });
  }

  try {
    results.metafieldDefinitions = await syncMetafieldDefinitions(admin, shopDomain);
  } catch (error) {
    results.errors.push({ type: "metafieldDefinitions", error: error.message });
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
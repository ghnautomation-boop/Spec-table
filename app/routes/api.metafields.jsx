import { authenticate } from "../shopify.server";

/**
 * Endpoint API public pentru a obține valorile metafield-urilor pentru un produs și variantele sale
 * Accesibil din theme extension prin request HTTP
 */
export async function loader({ request }) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId"); // Opțional - pentru varianta specifică
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json(
      { error: "Shop parameter is required" },
      { status: 400 }
    );
  }

  if (!productId) {
    return Response.json(
      { error: "ProductId parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Autentificare pentru a accesa GraphQL API
    const { admin } = await authenticate.admin(request);

    // Construiește query-ul GraphQL pentru a obține metafield-urile
    const query = variantId
      ? `
        query getVariantMetafields($productId: ID!, $variantId: ID!) {
          product(id: $productId) {
            id
            metafields(first: 250) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                }
              }
            }
            variant(id: $variantId) {
              id
              metafields(first: 250) {
                edges {
                  node {
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      `
      : `
        query getProductMetafields($productId: ID!) {
          product(id: $productId) {
            id
            metafields(first: 250) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                }
              }
            }
            variants(first: 250) {
              edges {
                node {
                  id
                  metafields(first: 250) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

    const variables = variantId
      ? { productId: `gid://shopify/Product/${productId}`, variantId: `gid://shopify/ProductVariant/${variantId}` }
      : { productId: `gid://shopify/Product/${productId}` };

    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      return Response.json(
        { error: `GraphQL errors: ${JSON.stringify(data.errors)}` },
        { status: 500 }
      );
    }

    // Formatează metafield-urile pentru a fi ușor de folosit
    const product = data.data.product;
    const metafields = {
      product: {},
      variants: {},
    };

    // Metafield-uri PRODUCT
    product.metafields.edges.forEach((edge) => {
      const mf = edge.node;
      if (!metafields.product[mf.namespace]) {
        metafields.product[mf.namespace] = {};
      }
      metafields.product[mf.namespace][mf.key] = mf.value;
    });

    // Metafield-uri VARIANT
    if (variantId && product.variant) {
      const variantIdStr = variantId.toString();
      metafields.variants[variantIdStr] = {};
      product.variant.metafields.edges.forEach((edge) => {
        const mf = edge.node;
        if (!metafields.variants[variantIdStr][mf.namespace]) {
          metafields.variants[variantIdStr][mf.namespace] = {};
        }
        metafields.variants[variantIdStr][mf.namespace][mf.key] = mf.value;
      });
    } else if (product.variants) {
      product.variants.edges.forEach((variantEdge) => {
        const variant = variantEdge.node;
        const variantIdStr = variant.id.split("/").pop();
        metafields.variants[variantIdStr] = {};
        variant.metafields.edges.forEach((mfEdge) => {
          const mf = mfEdge.node;
          if (!metafields.variants[variantIdStr][mf.namespace]) {
            metafields.variants[variantIdStr][mf.namespace] = {};
          }
          metafields.variants[variantIdStr][mf.namespace][mf.key] = mf.value;
        });
      });
    }

    const apiResponse = Response.json({ metafields });

    // Adaugă CORS headers
    apiResponse.headers.set("Access-Control-Allow-Origin", "*");
    apiResponse.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    apiResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return apiResponse;
  } catch (error) {
    console.error("Error getting metafields:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function options() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}



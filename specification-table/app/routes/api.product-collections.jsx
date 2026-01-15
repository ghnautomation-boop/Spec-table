import { authenticate } from "../shopify.server";

function toLegacyId(id) {
  if (!id) return null;
  const str = String(id);
  const match = str.match(/gid:\/\/shopify\/(?:Product|Collection)\/(\d+)/);
  return match ? match[1] : str;
}

/**
 * API route pentru a verifica dacă un produs face parte dintr-o colecție
 * Folosit pentru funcționalitatea de search
 */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = toLegacyId(url.searchParams.get("productId"));
  const collectionId = toLegacyId(url.searchParams.get("collectionId"));

  if (!productId || !collectionId) {
    return Response.json({ error: "Missing productId or collectionId" }, { status: 400 });
  }

  try {
    // Query GraphQL pentru a verifica dacă produsul face parte din colecție
    const query = `
      query checkProductInCollection($productId: ID!, $collectionId: ID!) {
        product(id: $productId) {
          id
          inCollection(id: $collectionId)
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        productId: `gid://shopify/Product/${productId}`,
        collectionId: `gid://shopify/Collection/${collectionId}`,
      },
    });

    const data = await response.json();

    if (data.errors) {
      return Response.json({ error: data.errors[0].message }, { status: 500 });
    }

    const product = data.data.product;
    if (!product) {
      return Response.json({ isInCollection: false });
    }

    const isInCollection = !!product.inCollection;

    return Response.json({ isInCollection });
  } catch (error) {
    console.error("[api.product-collections] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};

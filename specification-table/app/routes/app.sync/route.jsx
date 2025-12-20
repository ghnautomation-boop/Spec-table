import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { syncAll } from "../../models/sync.server";
import prisma from "../../db.server";

/**
 * Count metafield definitions by iterating through pages
 */
async function countMetafieldDefinitions(admin, ownerType) {
  let totalCount = 0;
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query getMetafieldDefinitions($cursor: String) {
        metafieldDefinitions(first: 250, after: $cursor, ownerType: ${ownerType}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
          }
        }
      }
    `;

    const variables = cursor ? { cursor } : {};
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("Error counting metafield definitions:", data.errors);
      return null;
    }

    const definitions = data.data.metafieldDefinitions.nodes;
    const pageInfo = data.data.metafieldDefinitions.pageInfo;

    totalCount += definitions.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return totalCount;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Check if data is already synced for this shop
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: {
      _count: {
        select: {
          products: true,
          collections: true,
          metafieldDefinitions: {
            where: {
              ownerType: "PRODUCT",
            },
          },
        },
      },
      syncStatus: {
        select: {
          lastComparisonOk: true,
          lastMismatchDetails: true,
          appProducts: true,
          appCollections: true,
          appProductMetafields: true,
          appVariantMetafields: true,
          shopifyProducts: true,
          shopifyCollections: true,
          shopifyProductMetafields: true,
          shopifyVariantMetafields: true,
        },
      },
    },
  });

  // Count variant metafields separately
  const variantMetafieldsCount = shop
    ? await prisma.metafieldDefinition.count({
        where: {
          shopId: shop.id,
          ownerType: "VARIANT",
        },
      })
    : 0;

  const productMetafieldsCount = shop?._count?.metafieldDefinitions || 0;

  // Get counts from Shopify using GraphQL
  let shopifyCounts = {
    products: null,
    collections: null,
    productMetafields: null,
    variantMetafields: null,
  };

  try {
    // Get products count
    const productsCountQuery = `
      query {
        productsCount {
          count
        }
      }
    `;
    const productsResponse = await admin.graphql(productsCountQuery);
    const productsData = await productsResponse.json();
    if (!productsData.errors && productsData.data?.productsCount) {
      shopifyCounts.products = productsData.data.productsCount.count || 0;
    } else {
      console.error("Error getting products count:", productsData.errors);
    }

    // Get collections count
    const collectionsCountQuery = `
      query {
        collectionsCount {
          count
        }
      }
    `;
    const collectionsResponse = await admin.graphql(collectionsCountQuery);
    const collectionsData = await collectionsResponse.json();
    if (!collectionsData.errors && collectionsData.data?.collectionsCount) {
      shopifyCounts.collections = collectionsData.data.collectionsCount.count || 0;
    } else {
      console.error("Error getting collections count:", collectionsData.errors);
    }

    // Count metafield definitions (PRODUCT)
    const productMetafieldsCount = await countMetafieldDefinitions(admin, "PRODUCT");
    if (productMetafieldsCount !== null) {
      shopifyCounts.productMetafields = productMetafieldsCount;
    }

    // Count metafield definitions (PRODUCTVARIANT)
    const variantMetafieldsCount = await countMetafieldDefinitions(admin, "PRODUCTVARIANT");
    if (variantMetafieldsCount !== null) {
      shopifyCounts.variantMetafields = variantMetafieldsCount;
    }
  } catch (error) {
    console.error("Error fetching Shopify counts:", error);
    // Continue with null values if there's an error
  }

  // Calculează dacă există mismatch-uri comparând count-urile
  let hasMismatch = false;
  if (shop && shop.syncStatus) {
    const appCounts = {
      products: shop._count.products || 0,
      collections: shop._count.collections || 0,
      productMetafields: productMetafieldsCount,
      variantMetafields: variantMetafieldsCount,
    };
    
    const shopifyCountsForComparison = {
      products: shopifyCounts.products,
      collections: shopifyCounts.collections,
      productMetafields: shopifyCounts.productMetafields,
      variantMetafields: shopifyCounts.variantMetafields,
    };
    
    // Verifică mismatch-uri doar dacă avem count-uri din Shopify
    if (
      shopifyCountsForComparison.products !== null &&
      shopifyCountsForComparison.collections !== null &&
      shopifyCountsForComparison.productMetafields !== null &&
      shopifyCountsForComparison.variantMetafields !== null
    ) {
      hasMismatch =
        appCounts.products !== shopifyCountsForComparison.products ||
        appCounts.collections !== shopifyCountsForComparison.collections ||
        appCounts.productMetafields !== shopifyCountsForComparison.productMetafields ||
        appCounts.variantMetafields !== shopifyCountsForComparison.variantMetafields;
    } else {
      // Dacă nu avem count-uri din Shopify, verificăm lastComparisonOk din SyncStatus
      hasMismatch = shop.syncStatus.lastComparisonOk === false;
    }
  } else if (shop) {
    // Dacă shop-ul există dar nu are SyncStatus, verificăm manual
    if (
      shopifyCounts.products !== null &&
      shopifyCounts.collections !== null &&
      shopifyCounts.productMetafields !== null &&
      shopifyCounts.variantMetafields !== null
    ) {
      hasMismatch =
        (shop._count.products || 0) !== shopifyCounts.products ||
        (shop._count.collections || 0) !== shopifyCounts.collections ||
        productMetafieldsCount !== shopifyCounts.productMetafields ||
        variantMetafieldsCount !== shopifyCounts.variantMetafields;
    }
  }

  return {
    isSynced: !!shop,
    hasMismatch,
    counts: shop
      ? {
          products: shop._count.products || 0,
          collections: shop._count.collections || 0,
          productMetafields: productMetafieldsCount,
          variantMetafields: variantMetafieldsCount,
        }
      : null,
    shopifyCounts,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const results = await syncAll(admin, session.shop);

    return {
      success: true,
      results: {
        products: results.products
          ? {
              totalSynced: results.products.totalSynced,
            }
          : null,
        collections: results.collections
          ? {
              totalSynced: results.collections.totalSynced,
            }
          : null,
        metafieldDefinitions: results.metafieldDefinitions
          ? {
              totalSynced: results.metafieldDefinitions.totalSynced,
            }
          : null,
        errors: results.errors,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export default function SyncPage() {
  const loaderData = useLoaderData();
  const { isSynced, hasMismatch, counts, shopifyCounts } = loaderData || {};
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [isLoadingShopifyData, setIsLoadingShopifyData] = useState(true);
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  
  // Butonul este activ doar dacă există mismatch-uri sau dacă nu a fost făcut sync niciodată
  const isButtonEnabled = !isSynced || hasMismatch;

  // Simulate loading state for Shopify data (it's already loaded in loader, but we show spinner briefly)
  useEffect(() => {
    // Show loading for a brief moment to indicate data is being fetched
    const timer = setTimeout(() => {
      setIsLoadingShopifyData(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.results) {
        const results = fetcher.data.results;
        shopify.toast.show(
          `Sync completed! Products: ${results.products?.totalSynced || 0}, Collections: ${results.collections?.totalSynced || 0}, Metafields: ${results.metafieldDefinitions?.totalSynced || 0}`
        );
      }
    } else if (fetcher.data?.success === false) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSync = () => {
    fetcher.submit({ actionType: "sync" }, { method: "POST" });
  };

  return (
    <s-page heading="Data Synchronization">
      <s-stack direction="block" gap="loose">
        {/* Introduction Section */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-heading size="large">Sync Your Store Data</s-heading>
            <s-paragraph>
              This page synchronizes all products, collections, and metafield definitions
              from your store into the application database. This ensures your templates
              have access to the latest store data.
            </s-paragraph>
          </s-stack>
        </s-section>

        {/* Comparison Table */}
        {isSynced && counts && (
          <s-section>
            <s-heading size="medium">Data Comparison</s-heading>
            {isLoadingShopifyData ? (
              <s-box
                padding="loose"
                borderWidth="base"
                borderRadius="base"
                background="surface"
                style={{ textAlign: "center", marginTop: "16px" }}
              >
                <s-stack direction="block" gap="base" blockAlignment="center">
                  <s-spinner size="large" />
                  <s-text tone="subdued">Fetching data from Shopify... please wait</s-text>
                </s-stack>
              </s-box>
            ) : (
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="surface"
                style={{ marginTop: "16px", overflowX: "auto" }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e1e3e5" }}>
                      <th style={{ textAlign: "left", padding: "16px", fontWeight: "600" }}>
                        <s-text emphasis="strong" size="large">App Database</s-text>
                      </th>
                      <th style={{ textAlign: "center", padding: "16px", fontWeight: "600", width: "150px" }}>
                        <s-text emphasis="strong" size="large">Status</s-text>
                      </th>
                      <th style={{ textAlign: "right", padding: "16px", fontWeight: "600" }}>
                        <s-text emphasis="strong" size="large">Shopify Store</s-text>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Products Row */}
                    {(() => {
                      const appValue = counts?.products ?? 0;
                      const shopifyValue = shopifyCounts?.products ?? null;
                      const isMatch = shopifyValue !== null && appValue === shopifyValue;
                      return (
                        <tr style={{ 
                          borderTop: "1px solid #e1e3e5",
                          backgroundColor: isMatch ? "#e8f5e9" : shopifyValue !== null ? "#fff3cd" : "transparent"
                        }}>
                          <td style={{ padding: "16px" }}>
                            <s-stack direction="inline" gap="base" justifyContent="start">
                              <s-text emphasis="strong" size="large">{appValue}</s-text>
                              <s-text tone="subdued">Products</s-text>
                            </s-stack>
                          </td>
                          <td style={{ padding: "16px", justifyContent: "center", display:"flex" }}>
                            {shopifyValue !== null ? (
                              isMatch ? (
                                <s-badge tone="success">In Sync</s-badge>
                              ) : (
                                <s-badge tone="warning">Mismatch</s-badge>
                              )
                            ) : (
                              <s-badge tone="subdued">—</s-badge>
                            )}
                          </td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <s-stack direction="inline" gap="base" justifyContent="end">
                              <s-text emphasis="strong" size="large">
                                {shopifyValue !== null ? shopifyValue : "—"}
                              </s-text>
                              <s-text tone="subdued">Products</s-text>
                            </s-stack>
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* Collections Row */}
                    {(() => {
                      const appValue = counts?.collections ?? 0;
                      const shopifyValue = shopifyCounts?.collections ?? null;
                      const isMatch = shopifyValue !== null && appValue === shopifyValue;
                      return (
                        <tr style={{ 
                          borderTop: "1px solid #e1e3e5",
                          backgroundColor: isMatch ? "#e8f5e9" : shopifyValue !== null ? "#fff3cd" : "transparent"
                        }}>
                          <td style={{ padding: "16px" }}>
                            <s-stack direction="inline" gap="base" blockAlignment="center">
                              <s-text emphasis="strong" size="large">{appValue}</s-text>
                              <s-text tone="subdued">Collections</s-text>
                            </s-stack>
                          </td>
                          <td style={{ padding: "16px", justifyContent: "center", display:"flex" }}>
                            {shopifyValue !== null ? (
                              isMatch ? (
                                <s-badge tone="success">In Sync</s-badge>
                              ) : (
                                <s-badge tone="warning">Mismatch</s-badge>
                              )
                            ) : (
                              <s-badge tone="subdued">—</s-badge>
                            )}
                          </td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <s-stack direction="inline" gap="base" justifyContent="end">
                              <s-text emphasis="strong" size="large">
                                {shopifyValue !== null ? shopifyValue : "—"}
                              </s-text>
                              <s-text tone="subdued">Collections</s-text>
                            </s-stack>
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* Product Metafields Row */}
                    {(() => {
                      const appValue = counts?.productMetafields ?? 0;
                      const shopifyValue = shopifyCounts?.productMetafields ?? null;
                      const isMatch = shopifyValue !== null && appValue === shopifyValue;
                      return (
                        <tr style={{ 
                          borderTop: "1px solid #e1e3e5",
                          backgroundColor: isMatch ? "#e8f5e9" : shopifyValue !== null ? "#fff3cd" : "transparent"
                        }}>
                          <td style={{ padding: "16px" }}>
                            <s-stack direction="inline" gap="base" blockAlignment="center">
                              <s-text emphasis="strong" size="large">{appValue}</s-text>
                              <s-text tone="subdued">Product Metafields</s-text>
                            </s-stack>
                          </td>
                          <td style={{ padding: "16px", justifyContent: "center", display:"flex" }}>
                            {shopifyValue !== null ? (
                              isMatch ? (
                                <s-badge tone="success">In Sync</s-badge>
                              ) : (
                                <s-badge tone="warning">Mismatch</s-badge>
                              )
                            ) : (
                              <s-badge tone="subdued">—</s-badge>
                            )}
                          </td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <s-stack direction="inline" gap="base" justifyContent="end">
                              <s-text emphasis="strong" size="large">
                                {shopifyValue !== null ? shopifyValue : "—"}
                              </s-text>
                              <s-text tone="subdued">Product Metafields</s-text>
                            </s-stack>
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* Variant Metafields Row */}
                    {(() => {
                      const appValue = counts?.variantMetafields ?? 0;
                      const shopifyValue = shopifyCounts?.variantMetafields ?? null;
                      const isMatch = shopifyValue !== null && appValue === shopifyValue;
                      return (
                        <tr style={{ 
                          borderTop: "1px solid #e1e3e5",
                          backgroundColor: isMatch ? "#e8f5e9" : shopifyValue !== null ? "#fff3cd" : "transparent"
                        }}>
                          <td style={{ padding: "16px" }}>
                            <s-stack direction="inline" gap="base" blockAlignment="center">
                              <s-text emphasis="strong" size="large">{appValue}</s-text>
                              <s-text tone="subdued">Variant Metafields</s-text>
                            </s-stack>
                          </td>
                          <td style={{ padding: "16px", justifyContent: "center", display:"flex" }}>
                            {shopifyValue !== null ? (
                              isMatch ? (
                                <s-badge tone="success">In Sync</s-badge>
                              ) : (
                                <s-badge tone="warning">Mismatch</s-badge>
                              )
                            ) : (
                              <s-badge tone="subdued">—</s-badge>
                            )}
                          </td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <s-stack direction="inline" gap="base" justifyContent="end">
                              <s-text emphasis="strong" size="large">
                                {shopifyValue !== null ? shopifyValue : "—"}
                              </s-text>
                              <s-text tone="subdued">Variant Metafields</s-text>
                            </s-stack>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </s-box>
            )}
          </s-section>
        )}

        {/* Status Banner */}
        {!isSynced && (
          <s-banner tone="warning">
            <s-text emphasis="strong">
              Data has not been synchronized yet. Click the button below to start synchronization.
            </s-text>
          </s-banner>
        )}

        {/* Sync Section */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-heading size="medium">
              {isSynced ? "Re-sync Data" : "Initial Sync"}
            </s-heading>
            <s-paragraph>
              {isSynced
                ? hasMismatch
                  ? "There are differences between your store data and the application database. Click the button below to re-synchronize data. This will sync only products, collections, and metafield definitions that have been updated since the last sync, making it much faster for large stores."
                  : "Your data is synchronized and up to date. No action needed."
                : "Click the button below to synchronize all data from your store. This may take a few moments depending on the size of your store."}
            </s-paragraph>
            
            {isSynced && !hasMismatch && (
              <s-banner tone="success">
                <s-text emphasis="strong">
                  All data is synchronized. No mismatches detected.
                </s-text>
              </s-banner>
            )}
            
            <s-button
              onClick={handleSync}
              variant="primary"
              size="large"
              disabled={!isButtonEnabled}
              {...(isLoading ? { loading: true } : {})}
            >
              {isSynced ? "Re-sync All Data" : "Start Synchronization"}
            </s-button>
            
            {isSynced && !hasMismatch && (
              <s-text tone="subdued" size="small">
                The sync button is disabled because your data is already synchronized. If you need to force a full sync, wait for the reconciliation job to detect any mismatches, or contact support.
              </s-text>
            )}
          </s-stack>
        </s-section>

        {/* Results Section */}
        {fetcher.data?.success && fetcher.data.results && (
          <s-section>
            <s-heading size="medium">Sync Results</s-heading>
            <s-stack direction="block" gap="base" style={{ marginTop: "16px" }}>
              <s-grid columns={{ xs: 1, sm: 3 }} gap="base">
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="success-subdued"
                >
                  <s-stack direction="block" gap="tight">
                    <s-text tone="subdued">Products Synced</s-text>
                    <s-text emphasis="strong" size="large">
                      {fetcher.data.results.products?.totalSynced || 0}
                    </s-text>
                  </s-stack>
                </s-box>
                
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="success-subdued"
                >
                  <s-stack direction="block" gap="tight">
                    <s-text tone="subdued">Collections Synced</s-text>
                    <s-text emphasis="strong" size="large">
                      {fetcher.data.results.collections?.totalSynced || 0}
                    </s-text>
                  </s-stack>
                </s-box>
                
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="success-subdued"
                >
                  <s-stack direction="block" gap="tight">
                    <s-text tone="subdued">Metafields Synced</s-text>
                    <s-text emphasis="strong" size="large">
                      {fetcher.data.results.metafieldDefinitions?.totalSynced || 0}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-grid>
              
              {fetcher.data.results.errors?.length > 0 && (
                <s-banner tone="critical">
                  <s-text emphasis="strong">Errors occurred during synchronization:</s-text>
                  <s-unordered-list style={{ marginTop: "8px" }}>
                    {fetcher.data.results.errors.map((err, index) => (
                      <s-list-item key={index}>
                        <s-text emphasis="strong">{err.type}:</s-text> {err.error}
                      </s-list-item>
                    ))}
                  </s-unordered-list>
                </s-banner>
              )}
            </s-stack>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

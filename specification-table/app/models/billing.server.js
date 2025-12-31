/**
 * Shopify Billing API - GraphQL mutations pentru gestionarea subscription-urilor
 * Documentație: https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate
 */

/**
 * Creează o nouă subscription folosind Billing API
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} plan - Plan object cu price, name, etc.
 * @param {string} returnUrl - URL-ul de return după aprobare
 * @returns {Promise<Object>} - { confirmationUrl, subscriptionId, userErrors }
 */
export async function createAppSubscription(admin, plan, returnUrl) {
  const mutation = `
    mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
      ) {
        appSubscription {
          id
          name
          status
          currentPeriodEnd
          lineItems {
            id
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: plan.title,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: plan.price,
              currencyCode: plan.currencyCode || "USD",
            },
            interval: plan.interval || "EVERY_30_DAYS", // EVERY_30_DAYS, ANNUAL
          },
        },
      },
    ],
    returnUrl: returnUrl,
    test: process.env.NODE_ENV !== "production", // Test mode în development
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[billing] GraphQL errors:", data.errors);
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    const result = data.data?.appSubscriptionCreate;
    
    if (result?.userErrors?.length > 0) {
      console.error("[billing] User errors:", result.userErrors);
      throw new Error(`Billing API error: ${result.userErrors.map(e => e.message).join(", ")}`);
    }

    return {
      confirmationUrl: result?.confirmationUrl,
      subscriptionId: result?.appSubscription?.id,
      subscription: result?.appSubscription,
      userErrors: result?.userErrors || [],
    };
  } catch (error) {
    console.error("[billing] Error creating subscription:", error);
    throw error;
  }
}

/**
 * Verifică statusul unei subscription-uri existente
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<Object|null>} - Subscription object sau null dacă nu există
 */
export async function getCurrentSubscription(admin) {
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          currentPeriodEnd
          lineItems {
            id
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    const data = await response.json();

    if (data.errors) {
      console.error("[billing] GraphQL errors:", data.errors);
      return null;
    }

    const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
    // Returnează prima subscription activă
    return subscriptions.find(sub => sub.status === "ACTIVE") || subscriptions[0] || null;
  } catch (error) {
    console.error("[billing] Error fetching subscription:", error);
    return null;
  }
}

/**
 * Anulează o subscription existentă
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} subscriptionId - ID-ul subscription-ului de anulat
 * @returns {Promise<Object>} - Result object
 */
export async function cancelAppSubscription(admin, subscriptionId) {
  const mutation = `
    mutation appSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        appSubscription {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: subscriptionId,
  };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[billing] GraphQL errors:", data.errors);
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    const result = data.data?.appSubscriptionCancel;
    
    if (result?.userErrors?.length > 0) {
      console.error("[billing] User errors:", result.userErrors);
      throw new Error(`Billing API error: ${result.userErrors.map(e => e.message).join(", ")}`);
    }

    return {
      subscription: result?.appSubscription,
      userErrors: result?.userErrors || [],
    };
  } catch (error) {
    console.error("[billing] Error canceling subscription:", error);
    throw error;
  }
}











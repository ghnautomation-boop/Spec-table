import { useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import prisma from "../../db.server.js";
import { createAppSubscription, getCurrentSubscription } from "../../models/billing.server.js";

export const loader = async ({ request }) => {
  // Autentificarea se face complet aici - dacă eșuează, va returna redirect automat
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  

  // Verifică dacă există deja plan selectat
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
    select: { id: true },
  });

  // Verifică subscription-ul activ din Shopify Billing API
  let currentSubscription = null;
  try {
    currentSubscription = await getCurrentSubscription(admin);
  } catch (error) {
    console.warn("[app.plans] Could not fetch current subscription:", error.message);
  }

  // Verifică și în DB pentru backward compatibility
  const planRows = await prisma.$queryRaw`
    SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
  `;
  const existingPlanFromDB = Array.isArray(planRows) && planRows.length > 0
    ? planRows[0].planKey
    : null;

  // Prioritizează subscription-ul din Shopify, apoi din DB
  const existingPlan = currentSubscription?.name?.toLowerCase() || existingPlanFromDB;

  // Obține productsCount - autentificarea este deja completă aici
  // Dacă query-ul eșuează, continuăm cu productsCount = 0 și hasError = true
  let productsCount = 0;
  let hasError = false;
  
  // Obține productsCount - autentificarea este deja completă aici
  // Dacă query-ul eșuează, continuăm cu productsCount = 0 și hasError = true
  if (session.accessToken) {
    try {
      const query = `
        query {
          productsCount { count }
        }
      `;
      const res = await admin.graphql(query);
      const data = await res.json();
      
      if (data?.data?.productsCount?.count !== undefined) {
        productsCount = data.data.productsCount.count;
      } else if (data?.errors) {
        console.error("[app.plans] GraphQL errors:", data.errors);
        hasError = true;
      } else {
        // Dacă nu avem date, probabil autentificarea nu este completă
        console.warn("[app.plans] No products count in response");
        hasError = true;
      }
    } catch (error) {
      // Nu logăm ca eroare fatală - este normal la instalare când autentificarea nu este completă
      console.warn("[app.plans] Could not fetch products count:", error.message);
      hasError = true;
    }
  } else {
    console.warn("[app.plans] No access token available");
    hasError = true;
  }

  return { 
    shopDomain, 
    existingPlan, 
    productsCount,
    hasError 
  };
};

export const action = async ({ request }) => {
  
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const planKey = String(formData.get("planKey") || "");


  // Validează că planul există
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) {
    console.error("[app.plans.action] Invalid plan:", planKey);
    return { success: false, error: "Invalid plan selected." };
  }



  // Obține productsCount pentru validare
  let productsCount = 0;
  try {
    const query = `
      query {
        productsCount { count }
      }
    `;
    const res = await admin.graphql(query);
    const data = await res.json();
    productsCount = data?.data?.productsCount?.count ?? 0;
  } catch (error) {
    console.warn("[app.plans] Could not fetch products count:", error.message);
  }

  // Validează eligibilitatea planului
  const isEligible = Number(productsCount ?? 0) <= plan.maxProducts;
  if (!isEligible) {
    return { success: false, error: "This plan is not eligible for your store size." };
  }

  // Creează subscription folosind Shopify Billing API
  // După aprobare, redirect către pagina de home a aplicației în formatul:
  // https://admin.shopify.com/store/{shop-domain}/apps/{app-handle}/app
  // Extrage shop domain fără .myshopify.com
  const shopDomainForUrl = shopDomain.replace('.myshopify.com', '');
  // App handle - poate fi setat în env sau folosit default
  const appHandle = process.env.SHOPIFY_APP_HANDLE || 'specification-table';
  const returnUrl = `https://admin.shopify.com/store/${shopDomainForUrl}/apps/${appHandle}/app`;
  

  try {
    const result = await createAppSubscription(admin, plan, returnUrl);
    

    
    if (result.userErrors && result.userErrors.length > 0) {
      console.error("[app.plans.action] User errors:", result.userErrors);
      return { 
        success: false, 
        error: result.userErrors.map(e => e.message).join(", ") 
      };
    }

    if (!result.confirmationUrl) {
      console.error("[app.plans.action] No confirmation URL returned");
      return { 
        success: false, 
        error: "Failed to create subscription. Please try again." 
      };
    }


    
    // Returnăm confirmationUrl pentru redirect
    return { 
      success: true, 
      redirectUrl: result.confirmationUrl,
      subscriptionId: result.subscriptionId
    };
  } catch (error) {
    console.error("[app.plans.action] Error creating subscription:", error);
    console.error("[app.plans.action] Error stack:", error.stack);
    return { 
      success: false, 
      error: error.message || "Failed to create subscription. Please try again." 
    };
  }
};

// Planurile pentru Shopify Billing API
// Fiecare plan trebuie să aibă price, currencyCode, și interval
const PLANS = [
  {
    key: "starter",
    title: "Starter",
    price: 5.99, // Prețul în USD
    currencyCode: "USD",
    interval: "EVERY_30_DAYS", // EVERY_30_DAYS sau ANNUAL
    cta: "Select Plan",
    featured: false,
    quantities: ["Up to 300 products", "20 templates"],
    features: ["Dynamic metafields", "Template assignments", "Custom tooltips", "Custom names","Suffix & Preffix"],
    maxProducts: 300,
    maxTemplates: 20,
  },
  {
    key: "growth",
    title: "Growth",
    price: 9.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    cta: "Select Plan",
    featured: false,
    quantities: ["Up to 1,000 products", "75 templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
       "Custom tooltips", "Custom names","Suffix & Preffix",
    ],
    maxProducts: 1000,
    maxTemplates: 75,
  },
  {
    key: "scale",
    title: "Scale",
    price: 19.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    cta: "Select Plan",
    featured: true,
    quantities: ["Up to 10,000 products", "250 templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
      "Custom tooltips", "Custom names","Suffix & Preffix",    
    ],
    maxProducts: 10000,
    maxTemplates: 250,
  },
  {
    key: "scaleplus",
    title: "Unlimited",
    price: 29.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    cta: "Select Plan",
    featured: false,
    quantities: ["Unlimited products", "Unlimited templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
       "Custom tooltips", "Custom names","Suffix & Preffix","Advanced Support"
    ],
    maxProducts: Infinity,
    maxTemplates: Infinity,
  },
];

export default function PlansRoute() {
  const loaderData = useLoaderData();
  const { shopDomain, existingPlan, productsCount: initialProductsCount, hasError } = loaderData;
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  // Dacă nu avem productsCount sau avem eroare, reîncercăm
  useEffect(() => {
    if (hasError || initialProductsCount === undefined) {
      // Reîncearcă după 1 secundă
      const timer = setTimeout(() => {
        revalidator.revalidate();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasError, initialProductsCount, revalidator]);

  const productsCount = initialProductsCount ?? 0;
  const isLoading = hasError || initialProductsCount === undefined;

  const recommendedPlanKey = (() => {
    const count = Number(productsCount ?? 0);
    const sorted = [...PLANS].sort((a, b) => a.maxProducts - b.maxProducts);
    const match = sorted.find((p) => count <= p.maxProducts);
    return match?.key ?? "unlimited";
  })();

  const isSubmitting = ["submitting", "loading"].includes(fetcher.state);

  useEffect(() => {


    if (fetcher.data?.success === false) {
      console.error("[app.plans] Action returned error:", fetcher.data.error);
      shopify.toast.show(fetcher.data.error || "Error selecting plan", { isError: true });
    } else if (fetcher.data?.success === true && fetcher.data?.redirectUrl) {
     
      
      // Pentru aplicațiile embedded Shopify, trebuie să redirecționăm tab-ul principal, nu iframe-ul
      // Folosim window.top.location.href pentru a ieși din iframe și a redirecționa tab-ul principal
      try {
        // Încearcă să redirecționeze tab-ul principal (ieșind din iframe)
        if (window.top && window.top !== window.self) {
          
          window.top.location.href = fetcher.data.redirectUrl;
        } else {
          // Dacă nu suntem în iframe, folosim window.location.href normal
        
          window.location.href = fetcher.data.redirectUrl;
        }
      } catch (error) {
        // Dacă avem eroare de cross-origin, deschidem în tab nou
        console.warn("[app.plans] Cross-origin error, opening in new tab:", error);
        window.open(fetcher.data.redirectUrl, '_blank');
      }
    }
  }, [fetcher.data, fetcher.state, shopify]);

  // Dacă încă se încarcă datele, afișează spinner
  if (isLoading) {
    return (
      <s-page heading="Plans">
        <s-section>
          <s-box
            padding="loose"
            borderWidth="base"
            borderRadius="base"
            background="surface"
            style={{ textAlign: "center" }}
          >
            <s-stack direction="block" gap="base" blockAlignment="center">
              <s-spinner size="large" />
              <s-text emphasis="strong" style={{ fontSize: "18px" }}>
                Please wait a few seconds
              </s-text>
              <s-paragraph tone="subdued">
                We're retrieving data from your store...
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Plans">
      <s-section>
        <s-stack direction="block" gap="base" alignItems="center">
          <s-paragraph>
            Choose the plan that fits your store. You'll be redirected to approve your subscription.
          </s-paragraph>
          {existingPlan && (
            <s-banner tone="info">
              Current plan: <span style={{ fontWeight: "bold", textTransform: "capitalize" }}>{existingPlan}</span>. You can change it anytime.
            </s-banner>
          )}
          <s-text tone="subdued">
            <span style={{ fontSize: "18px", fontWeight: 700}}>Products in your store: </span>
            <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.06em" }}>{productsCount}</span>
          </s-text>
        </s-stack>
      </s-section>

      <s-section>
        <div className="plansGrid">
          {PLANS.map((p) => (
            (() => {
              const isRecommended = p.key === recommendedPlanKey;
              const isEligible = Number(productsCount ?? 0) <= p.maxProducts;
              const isTooSmall = !isEligible;
              const isActivated = p.key === existingPlan;
              
              // NOUA LOGICĂ: Evidențiază planul activ dacă există, altfel evidențiază planul recomandat
              const isHighlighted = isActivated || (!existingPlan && isRecommended);

              return (
            <s-box
              key={p.key}
              borderWidth={isHighlighted ? "large" : "small"}
              borderColor={isHighlighted ? "strong" : "base"}
              borderRadius="base"
              background={isHighlighted ? "subdued" : "base"}
              padding="base"
            >
              <s-stack direction="block" gap="base">
                {/* Top icon / header */}
                <s-stack direction="block" gap="tight" alignment="center">
                  <s-heading size="medium">{p.title}</s-heading>
                </s-stack>

                {/* Price */}
                <s-stack direction="inline" gap="tight" alignItems="center" blockAlignment="center">
                  <div>
                    <span style={{ fontSize: "27px", fontWeight: 700, lineHeight: 1 }}>$</span>
                    <span style={{ fontSize: "32px", fontWeight: 700, lineHeight: 1 }}>
                      {Number.isInteger(p.price) ? p.price : p.price.toFixed(2)}
                    </span>
                  </div>
                  <s-text tone="subdued">/mo</s-text>
                </s-stack>

                {/* CTA */}
                <s-stack alignItems="center" alignContent="center">
                  <fetcher.Form 
                    method="post"
                    onSubmit={(e) => {
                     
                      const formData = new FormData(e.currentTarget);
                      
                    }}
                  >
                    <input type="hidden" name="planKey" value={p.key} />
                    <s-button
                      variant={isHighlighted ? "primary" : "secondary"}
                      disabled={isTooSmall || isSubmitting || isActivated}
                      type="submit"
                      onClick={() => {
                      
                      }}
                      {...(isSubmitting ? { loading: true } : {})}
                    >
                      {!isActivated && <s-icon type="collection-featured" size="small" />}
                      {isActivated ? "Already activated" : p.cta}
                    </s-button>
                  </fetcher.Form>
                </s-stack>
                <s-divider />

                {/* Quantities */}
                <s-stack direction="block" gap="tight">
                   <span style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.06em" , marginBottom: "10px",color: "#942929"}}>QUANTITIES</span> 
                  <s-unordered-list>
                    {p.quantities.map((q) => (
                      <s-list-item key={q}>{q}</s-list-item>
                    ))}
                  </s-unordered-list>
                </s-stack>

                <s-divider />

                {/* Features */}
                <s-stack direction="block" gap="tight">
                  <s-text>
                    <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.06em" , marginBottom: "10px",color: "#942929"}}>FEATURES</div>
                  </s-text>
                  <s-unordered-list>
                    {p.features.map((f) => (
                        <s-list-item key={f}>{f}</s-list-item>
                    ))}
                  </s-unordered-list>
                </s-stack>
              </s-stack>
            </s-box>
              );
            })()
          ))}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

// NOTE: folosim media query clasic în loc de `@container` pentru compatibilitate în embedded webviews.
// Desktop: 4 coloane (Starter, Growth, Scale, Unlimited). Mobile: 1 coloană (listă pe rând).
export const links = () => [
  {
    rel: "stylesheet",
    href:
      "data:text/css," +
      encodeURIComponent(`
        .plansGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
        @media (max-width: 600px) { .plansGrid { grid-template-columns: 1fr; } }
      `),
  },
];

import { useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import prisma from "../../db.server.js";
import { syncAll } from "../../models/sync.server.js";

export const loader = async ({ request }) => {
  // Autentificarea se face complet aici - dacă eșuează, va returna redirect automat
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  
  console.log(`[app.plans] Loader called for shop: ${shopDomain}, has accessToken: ${!!session.accessToken}`);

  // Verifică dacă există deja plan selectat
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
    select: { id: true },
  });

  const planRows = await prisma.$queryRaw`
    SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
  `;
  const existingPlan = Array.isArray(planRows) && planRows.length > 0
    ? planRows[0].planKey
    : null;

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

  // Re-fetch products count pentru validare
  const query = `
    query {
      productsCount { count }
    }
  `;
  const res = await admin.graphql(query);
  const data = await res.json();
  const productsCount = data?.data?.productsCount?.count ?? 0;

  // Validează eligibilitatea planului
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) {
    return { success: false, error: "Invalid plan selected." };
  }

  const isEligible = Number(productsCount ?? 0) <= plan.maxProducts;
  if (!isEligible) {
    return { success: false, error: "This plan is not eligible for your store size." };
  }

  // Salvează planul în DB
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
    select: { id: true },
  });

  await prisma.$executeRaw`
    INSERT INTO "ShopPlan" ("id", "shopId", "planKey", "productsCountAtSelection", "selectedAt", "updatedAt")
    VALUES (gen_random_uuid(), ${shop.id}, ${planKey}, ${productsCount}, NOW(), NOW())
    ON CONFLICT ("shopId")
    DO UPDATE SET
      "planKey" = EXCLUDED."planKey",
      "productsCountAtSelection" = EXCLUDED."productsCountAtSelection",
      "updatedAt" = NOW()
  `;

  // Rulează syncAll (populează produsele în DB)
  try {
    await syncAll(admin, shopDomain);
  } catch (error) {
    console.error("[app.plans] Error during syncAll:", error);
    // Nu returnăm eroare aici - planul e salvat, sync-ul poate continua în background
  }

  // Redirect la home page
  throw new Response("", { status: 302, headers: { Location: "/app" } });
};

const PLANS = [
  {
    key: "free",
    title: "Free",
    price: 0,
    currency: "$",
    per: "/mo",
    cta: "Let’s Go",
    featured: false,
    quantities: ["Up to 5 products", "1 active template"],
    features: ["Dynamic metafields", "Basic setup guide"],
    maxProducts: 5,
  },
  {
    key: "starter",
    title: "Starter",
    price: 5.99,
    currency: "$",
    per: "/mo",
    cta: "Let’s Go",
    featured: false,
    quantities: ["Up to 300 products", "10 templates"],
    features: ["Dynamic metafields", "Template assignments", "Custom tooltips", "Advanced support"],
    maxProducts: 300,
  },
  {
    key: "growth",
    title: "Growth",
    price: 9.99,
    currency: "$",
    per: "/mo",
    cta: "Let’s Go",
    featured: false,
    quantities: ["Up to 1,000 products", "50 templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
      "Custom tooltips",
      "Custom names",	
      "Priority support",
    ],
    maxProducts: 1000,
  },
  {
    key: "scale",
    title: "Scale",
    price: 19.99,
    currency: "$",
    per: "/mo",
    cta: "Let’s Go",
    featured: true,
    quantities: ["Up to 10,000 products", "200 templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
      "Custom tooltips",
      "Custom names",
      "Priority support",     
    ],
    maxProducts: 10000,
  },
  {
    key: "unlimited",
    title: "Unlimited",
    price: 29.99,
    currency: "$",
    per: "/mo",
    cta: "Let’s Go",
    featured: false,
    quantities: ["Unlimited products", "Unlimited templates"],
    features: [
      "Dynamic metafields",
      "Template assignments",
      "Custom tooltips",
      "Custom names",
      "Priority support",
    ],
    maxProducts: Infinity,
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
      shopify.toast.show(fetcher.data.error || "Error selecting plan", { isError: true });
    }
  }, [fetcher.data, shopify]);

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
            Choose the plan that fits your store.
          </s-paragraph>
          {existingPlan && (
            <s-banner tone="info">
              Current plan: <s-text emphasis="strong">{existingPlan}</s-text>. You can change it anytime.
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

              return (
            <s-box
              key={p.key}
              borderWidth={isRecommended ? "large" : "small"}
              borderColor={isRecommended ? "strong" : "base"}
              borderRadius="base"
              background={isRecommended ? "subdued" : "base"}
              padding="base"
            >
              <s-stack direction="block" gap="base">
                {/* Top icon / header */}
                <s-stack direction="block" gap="tight" alignment="center">
                  <s-heading size="medium">{p.title}</s-heading>
                </s-stack>

                {/* Price */}
                <s-stack direction="inline" gap="tight" alignItems="center">
                    <div ><span style={{ fontSize: "27px", fontWeight: 700, lineHeight: 1 }}>{p.currency}</span><span style={{ fontSize: "32px", fontWeight: 700, lineHeight: 1 }}>{Number.isInteger(p.price) ? p.price : p.price.toFixed(2)}</span></div>
                  <s-text tone="subdued">{p.per}</s-text>
                </s-stack>

                {/* CTA */}
                <s-stack alignItems="center" alignContent="center">
                  <fetcher.Form method="post">
                    <input type="hidden" name="planKey" value={p.key} />
                    <s-button
                      variant={isRecommended ? "primary" : "secondary"}
                      disabled={isTooSmall || isSubmitting || isActivated}
                      type="submit"
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
// Desktop: 5 coloane. Mobile: 1 coloană (listă pe rând).
export const links = () => [
  {
    rel: "stylesheet",
    href:
      "data:text/css," +
      encodeURIComponent(`
        .plansGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
        @media (max-width: 600px) { .plansGrid { grid-template-columns: 1fr; } }
      `),
  },
];

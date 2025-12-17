import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const query = `
    query {
      productsCount { count }
    }
  `;
  const res = await admin.graphql(query);
  const data = await res.json();
  const productsCount = data?.data?.productsCount?.count ?? 0;

  return { shopDomain: session.shop, productsCount };
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
  const { shopDomain, productsCount } = useLoaderData();
  const shopify = useAppBridge();

  const recommendedPlanKey = (() => {
    const count = Number(productsCount ?? 0);
    const sorted = [...PLANS].sort((a, b) => a.maxProducts - b.maxProducts);
    const match = sorted.find((p) => count <= p.maxProducts);
    return match?.key ?? "unlimited";
  })();

  return (
    <s-page heading="Plans">
      <s-section>
        <s-stack direction="block" gap="base" alignItems="center">
          <s-paragraph>
            Choose the plan that fits your store. We’ll connect billing and plan
            eligibility next.
          </s-paragraph>
          <s-text tone="subdued">
            <span style={{ fontSize: "18px", fontWeight: 700}}>Products in your store: </span><span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.06em" }}>{productsCount}</span>
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
                <s-button
                  variant={isRecommended ? "primary" : "secondary"}
                  disabled={isTooSmall}
                  onClick={() =>
                    shopify.toast.show("Plan selection will be enabled next.", {
                      duration: 3500,
                    })
                  }
                >
                    <s-icon type="collection-featured" size="small" />
                  {p.cta}
                </s-button>
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

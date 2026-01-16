import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import CrispChat from "../components/CrispChat.jsx";
import prisma from "../db.server.js";
import { getCurrentSubscription } from "../models/billing.server.js";
import { NavigationSkeleton, TemplatesPageSkeleton, HomePageSkeleton } from "../components/PageSkeleton.jsx";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Verifică dacă există un plan activ
  let hasActivePlan = false;
  
  try {
    // Verifică subscription-ul activ din Shopify Billing API
    const currentSubscription = await getCurrentSubscription(admin);
    
    if (currentSubscription && currentSubscription.status === "ACTIVE") {
      hasActivePlan = true;
    } else {
      // Verifică și în DB pentru backward compatibility
      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
        select: { id: true },
      });
      
      if (shop) {
        const planRows = await prisma.$queryRaw`
          SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
        `;
        hasActivePlan = Array.isArray(planRows) && planRows.length > 0;
      }
    }
  } catch (error) {
    console.warn("[app.loader] Error checking for active plan:", error.message);
    // Dacă există o eroare, considerăm că nu există plan activ
    hasActivePlan = false;
  }

  // eslint-disable-next-line no-undef
  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    hasActivePlan 
  };
};

export default function App() {
  const { apiKey, hasActivePlan } = useLoaderData();
  const location = useLocation();

  // Determină ce skeleton să afișăm bazat pe ruta curentă
  const getSkeletonForRoute = (pathname) => {
    if (pathname.startsWith("/app/templates") && pathname !== "/app/templates/new") {
      return <TemplatesPageSkeleton />;
    }
    if (pathname === "/app" || pathname === "/app/") {
      return <HomePageSkeleton />;
    }
    return null; // Nu afișa skeleton pentru alte rute
  };

  return (
    <AppProvider embedded apiKey={apiKey}>
      <CrispChat />
      <s-app-nav>
        {hasActivePlan ? (
          <>
            <s-link href="/app">Home</s-link>
            <s-link href="/app/templates">Templates</s-link>
            <s-link href="/app/sync">Data Sync</s-link>
            <s-link href="/app/plans">Plans</s-link>
          </>
        ) : (
          <s-link href="/app/plans">Plans</s-link>
        )}
      </s-app-nav>
      <NavigationSkeleton skeletonComponent={getSkeletonForRoute(location.pathname)}>
        <Outlet />
      </NavigationSkeleton>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

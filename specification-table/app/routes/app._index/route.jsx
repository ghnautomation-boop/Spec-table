import { useEffect, useState, useRef } from "react";
import { useFetcher, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Importă funcțiile server-side doar în loader
  const { getThemes, getSetupProgress } = await import(
    "../../models/setup.server.js"
  );
  const { getTemplates } = await import("../../models/template.server.js");
  const prisma = (await import("../../db.server.js")).default;

  // Gating: dacă nu există plan selectat, redirect la /app/plans
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
    select: { id: true },
  });

  const planRows = await prisma.$queryRaw`
    SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
  `;
  const hasPlan = Array.isArray(planRows) && planRows.length > 0;

  if (!hasPlan) {
    const url = new URL(request.url);
    throw new Response("", {
      status: 302,
      headers: { Location: `/app/plans${url.search ? `?${url.searchParams.toString()}` : ""}` },
    });
  }

  // Obține shop-ul cu statistici
  // NOUA LOGICĂ: Products count se obține direct din Shopify (nu din DB)
  const shopWithStats = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      _count: {
        select: {
          metafieldDefinitions: true,
          templates: true,
        },
      },
    },
  });

  // Obține products count direct din Shopify GraphQL API
  // NOUA LOGICĂ: Nu mai folosim count-ul din DB pentru products
  let productsCount = 0;
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
    }
  } catch (error) {
    console.warn("[app._index] Could not fetch products count from Shopify:", error.message);
    // Continuă cu 0 dacă nu poate obține count-ul
  }

  // Obține temele și progresul setup-ului
  let themes = [];
  try {
    themes = await getThemes(admin);
  } catch (error) {
    console.error("[loader] Error loading themes:", error);
  }

  const [progress, templates] = await Promise.all([
    getSetupProgress(shopDomain),
    getTemplates(shopDomain).catch(() => []),
  ]);

  // Verifică automat dacă există template-uri create
  const hasTemplates = templates.length > 0;

  // Verifică automat dacă există assignments configurate
  // Un template are assignment dacă are cel puțin un assignment în baza de date
  const hasAssignments = templates.some(template => 
    template.assignments && template.assignments.length > 0
  );

  // Actualizează progress-ul cu verificările automate
  const updatedProgress = {
    ...progress,
    step4_templateCreated: hasTemplates || progress?.step4_templateCreated || false,
    step5_assignmentConfigured: hasAssignments || progress?.step5_assignmentConfigured || false,
  };

  return {
    themes,
    progress: updatedProgress,
    templates,
    shopDomain,
    stats: shopWithStats
      ? {
          products: productsCount, // Din Shopify GraphQL API
          metafieldDefinitions: shopWithStats._count.metafieldDefinitions || 0,
          templates: shopWithStats._count.templates || 0,
        }
      : {
          products: productsCount, // Din Shopify GraphQL API
          metafieldDefinitions: 0,
          templates: 0,
        },
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const shopDomain = session.shop;

  const { updateSetupProgress } = await import(
    "../../models/setup.server.js"
  );

  if (action === "selectTheme") {
    const themeId = formData.get("themeId");
    const themeName = formData.get("themeName");

    await updateSetupProgress(shopDomain, {
      step1_themeSelected: true,
      step1_selectedThemeId: themeId,
      step1_selectedThemeName: themeName,
    });

    return { success: true, themeId, themeName };
  }

  if (action === "markExtensionAppliedAndActivated") {
    await updateSetupProgress(shopDomain, {
      step2_extensionApplied: true,
      step3_extensionActivated: true,
    });

    return { success: true };
  }

  if (action === "markTemplateCreated") {
    await updateSetupProgress(shopDomain, {
      step4_templateCreated: true,
    });

    return { success: true };
  }

  if (action === "markAssignmentConfigured") {
    await updateSetupProgress(shopDomain, {
      step5_assignmentConfigured: true,
    });

    return { success: true };
  }

  if (action === "markTested") {
    await updateSetupProgress(shopDomain, {
      step6_tested: true,
    });

    return { success: true };
  }

  return { success: false };
};

export default function Index() {
  const { themes, progress, templates, shopDomain, stats } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const [selectedThemeId, setSelectedThemeId] = useState(
    progress?.step1_selectedThemeId || null
  );
  const [selectedThemeName, setSelectedThemeName] = useState(
    progress?.step1_selectedThemeName || null
  );

  // Sortează temele astfel încât tema activă (MAIN) să fie prima
  const sortedThemes = [...(themes || [])].sort((a, b) => {
    // Tema activă (MAIN) primește prioritate
    if (a.role === "MAIN" && b.role !== "MAIN") return -1;
    if (a.role !== "MAIN" && b.role === "MAIN") return 1;
    // Restul rămân în ordinea originală
    return 0;
  });

  const isLoading = fetcher.state === "submitting";
  
  // State pentru a ține minte dacă se așteaptă confirmarea pentru selectarea temei
  const [isSelectingTheme, setIsSelectingTheme] = useState(false);
  
  // Ref pentru a preveni re-executarea revalidării
  const processedSuccessRef = useRef(null);
  
  // Ref pentru a ține minte dacă am pornit selectarea temei
  const isSelectingThemeRef = useRef(false);

  // State pentru vizibilitate și expandare
  const [visible, setVisible] = useState({
    setupGuide: true,
  });
  const [expanded, setExpanded] = useState({
    setupGuide: true,
    step1: false,
    step2: false,
    step3: false,
    step4: false,
    step5: false,
  });

  // Calculează progresul total
  const completedSteps = [
    progress?.step1_themeSelected,
    progress?.step2_extensionApplied && progress?.step3_extensionActivated, // Combinat în un singur step
    progress?.step4_templateCreated,
    progress?.step5_assignmentConfigured,
    progress?.step6_tested,
  ].filter(Boolean).length;

  const totalSteps = 5;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  useEffect(() => {
    // Verifică dacă se așteaptă confirmarea pentru selectarea temei
    const formData = fetcher.formData;
    const actionType = formData?.get("action");
    const isThemeSelection = actionType === "selectTheme";
    
    // Setează flag-ul când începe submit-ul pentru selectarea temei
    if (fetcher.state === "submitting" && isThemeSelection) {
      setIsSelectingTheme(true);
      isSelectingThemeRef.current = true;
    }
    
    // Verifică doar când fetcher-ul este idle și are date de succes
    if (fetcher.state === "idle" && fetcher.data?.success) {
      // Creează un identificator unic bazat pe conținutul răspunsului (fără timestamp)
      const responseId = JSON.stringify(fetcher.data);
      
      // Verifică dacă am procesat deja acest răspuns
      if (processedSuccessRef.current === responseId) {
        return; // Nu procesa din nou același răspuns
      }
      
      // Marchează că am procesat acest răspuns
      processedSuccessRef.current = responseId;
      
      // Ascunde loader-ul dacă era activ pentru selectarea temei
      if (isSelectingThemeRef.current) {
        setIsSelectingTheme(false);
        isSelectingThemeRef.current = false;
      }
      
      shopify.toast.show("Progress updated successfully!");
      
      // Revalidăm datele doar o dată, folosind setTimeout pentru a preveni loop-uri
      setTimeout(() => {
        revalidator.revalidate();
      }, 100);
    }
    
    // Resetează ref-ul când fetcher.state devine "idle" și nu mai există date
    if (fetcher.state === "idle" && !fetcher.data) {
      processedSuccessRef.current = null;
      // Ascunde loader-ul dacă era activ
      if (isSelectingThemeRef.current) {
        setIsSelectingTheme(false);
        isSelectingThemeRef.current = false;
      }
    }
  }, [fetcher.state, fetcher.data, fetcher.formData, shopify, revalidator]);

  const handleSelectTheme = (themeId, themeName) => {
    setSelectedThemeId(themeId);
    setSelectedThemeName(themeName);
    fetcher.submit(
      {
        action: "selectTheme",
        themeId,
        themeName,
      },
      { method: "POST" }
    );
  };

  const handleMarkStep = (stepAction) => {
    fetcher.submit({ action: stepAction }, { method: "POST" });
  };

  // Funcții helper client-side
  const extractNumericId = (gid) => {
    if (!gid) {
      console.error("[extractNumericId] GID is undefined or null");
      return null;
    }
    
    const match = gid.match(/\/(\d+)$/);
    if (match && match[1]) {
      return match[1];
    }
    
    const fallbackMatch = gid.match(/\d+$/);
    if (fallbackMatch) {
      return fallbackMatch[0];
    }
    
    console.error("[extractNumericId] Could not extract numeric ID from:", gid);
    return null;
  };

  const getThemeEditorUrl = (themeId) => {
    if (!themeId) {
      console.error("[getThemeEditorUrl] themeId is undefined or null");
      return null;
    }
    
    const shop = shopDomain.replace(".myshopify.com", "");
    // Deep linking pentru a adăuga automat app block-ul SmartSpecs Table
    // api_key = client_id din shopify.app.toml
    // handle = numele fișierului block-ului fără extensie (specification_table)
    const apiKey = "0016f30db22fa84f9b5068900f240d15";
    const blockHandle = "specification_table";
    const url = `https://admin.shopify.com/store/${shop}/themes/${themeId}/editor?template=product&addAppBlockId=${apiKey}/${blockHandle}&target=newAppsSection`;
    
    console.log("[getThemeEditorUrl] Generated URL with deep linking:", url);
    return url;
  };

  // Define steps for the stepper
  const steps = [
    {
      id: 1,
      title: "Select Theme",
      description: "Select the theme where you want to apply the extension",
      completed: progress?.step1_themeSelected || false,
      content: (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Select the theme where you want to apply the extension. 
          </s-paragraph>
          {sortedThemes.length > 0 ? (
            <s-stack direction="block" gap="tight">
              {sortedThemes.map((theme) => (
                <s-box
                  key={theme.id}
                  padding="base"
                  borderWidth={selectedThemeId === theme.id ? "large" : "base"}
                  borderRadius="base"
                  background={
                    selectedThemeId === theme.id ? "strong" : "base"
                  }
                  style={{
                    cursor: "pointer",
                    borderColor:
                      selectedThemeId === theme.id
                        ? "var(--p-color-border-interactive)"
                        : "var(--p-color-border)",
                    borderWidth: selectedThemeId === theme.id ? "2px" : "1px",
                    backgroundColor: selectedThemeId === theme.id
                      ? "#000000"
                      : "var(--p-color-bg-surface)",
                    color: selectedThemeId === theme.id ? "#ffffff" : undefined,
                    transition: "all 0.2s ease",
                  }}
                  onClick={() => handleSelectTheme(theme.id, theme.name)}
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center" alignment="space-between">
                    <s-stack direction="inline" gap="base" blockAlignment="center">
                      <s-text 
                        emphasis={selectedThemeId === theme.id ? "strong" : "regular"}
                        style={{
                          color: selectedThemeId === theme.id ? "#ffffff" : undefined,
                        }}
                      >
                        {theme.name}
                      </s-text>
                      {selectedThemeId === theme.id && (
                        <s-badge tone="success">Selected</s-badge>
                      )}
                    </s-stack>
                    <s-stack direction="inline" gap="base" blockAlignment="center">
                      {theme.role === "MAIN" && (
                        <s-badge tone="success">Active theme in shop</s-badge>
                      )}
                      {theme.role === "DEVELOPMENT" && (
                        <s-badge tone="info">Development</s-badge>
                      )}
                    </s-stack>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          ) : (
            <s-paragraph tone="subdued">
              Could not load themes. Please refresh the page.
            </s-paragraph>
          )}
        </s-stack>
      ),
    },
    {
      id: 2,
      title: "Apply&Activate Extension",
      description: "Open Theme Editor and activate the extension",
      completed: (progress?.step2_extensionApplied && progress?.step3_extensionActivated) || false,
      content: (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Click the button below to open Theme Editor. The "SmartSpecs Table" app block will be automatically added to your product page. Review it in the preview and save the changes.
          </s-paragraph>
          {progress?.step1_themeSelected && selectedThemeId ? (
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={() => {
                  const themeId = extractNumericId(selectedThemeId);
                  if (!themeId) {
                    shopify.toast.show("Error: Could not extract theme ID", {
                      isError: true,
                    });
                    return;
                  }
                  const url = getThemeEditorUrl(themeId);
                  if (url) {
                    window.open(url, "_blank");
                  } else {
                    shopify.toast.show("Error: Could not generate URL", {
                      isError: true,
                    });
                  }
                }}
              >
                Open Theme Editor
              </s-button>
              <s-button
                variant="secondary"
                onClick={() => handleMarkStep("markExtensionAppliedAndActivated")}
                loading={isLoading}
              >
                I have applied and activated the extension
              </s-button>
            </s-stack>
          ) : (
            <s-paragraph tone="subdued">
              Complete Step 1 first.
            </s-paragraph>
          )}
        </s-stack>
      ),
    },
    {
      id: 3,
      title: "Create Template",
      description: "Create your first specification template",
      completed: progress?.step4_templateCreated || false,
      content: (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Create the first template to configure the structure and styles of the
            specification table.
          </s-paragraph>
          {progress?.step2_extensionApplied && progress?.step3_extensionActivated ? (
            <s-button 
              variant="primary"
              onClick={() => navigate("/app/templates/new")}
            >
              Create Template
            </s-button>
          ) : (
            <s-paragraph tone="subdued">
              Complete Step 2 first.
            </s-paragraph>
          )}
        </s-stack>
      ),
    },
    {
      id: 4,
      title: "Configure Assignments",
      description: "Set up product and collection assignments",
      completed: progress?.step5_assignmentConfigured || false,
      content: (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Configure assignments to determine which products or collections the
            template applies to.
          </s-paragraph>
          {progress?.step4_templateCreated ? (
            <s-button 
              variant="primary"
              onClick={() => navigate("/app/templates")}
            >
              View Templates
            </s-button>
          ) : (
            <s-paragraph tone="subdued">
              Complete Step 3 first.
            </s-paragraph>
          )}
        </s-stack>
      ),
    },
    {
      id: 5,
      title: "Test Application",
      description: "Verify everything works correctly",
      completed: progress?.step6_tested || false,
      content: (
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Verify on a product that the template displays correctly and that
            specifications are shown according to the configuration.
          </s-paragraph>
          {progress?.step5_assignmentConfigured ? (
            <s-button
              variant="secondary"
              onClick={() => handleMarkStep("markTested")}
              loading={isLoading}
            >
              I have tested the application
            </s-button>
          ) : (
            <s-paragraph tone="subdued">
              Complete Step 4 first.
            </s-paragraph>
          )}
        </s-stack>
      ),
    },
  ];

  return (
    <s-page>
      {/* === */}
      {/* Intro Banner */}
      {/* === */}
      {!progress?.completedAt && (
        <s-section>
          <s-banner tone="info">
            <s-stack direction="block" gap="tight">
              <s-text emphasis="strong">Welcome to SmartSpecs Table!</s-text>
              <s-paragraph>
                Get started by following the setup guide below. This will help you configure
                your product specification tables and make them available on your storefront.
              </s-paragraph>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      {/* === */}
      {/* Metrics cards */}
      {/* === */}
      <s-section padding="base">
        <s-grid
          gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr"
          gap="small"
        >
          <s-clickable
            onClick={() => navigate("/app/sync")}
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Products</s-heading>
              <s-text>{stats.products.toLocaleString()}</s-text>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable
            onClick={() => navigate("/app/sync")}
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Metafields</s-heading>
              <s-text>{stats.metafieldDefinitions.toLocaleString()}</s-text>
            </s-grid>
          </s-clickable>
          <s-divider direction="block" />
          <s-clickable
            onClick={() => navigate("/app/templates")}
            paddingBlock="small-400"
            paddingInline="small-100"
            borderRadius="base"
          >
            <s-grid gap="small-300">
              <s-heading>Templates</s-heading>
              <s-text>{stats.templates.toLocaleString()}</s-text>
            </s-grid>
          </s-clickable>
        </s-grid>
      </s-section>

      {/* === */}
      {/* Setup Guide */}
      {/* === */}
      {visible.setupGuide && (
        <s-section>
          <s-grid gap="small">
            {/* Header */}
            <s-grid gap="small-200">
              <s-grid
                gridTemplateColumns="1fr auto auto"
                gap="small-300"
                alignItems="center"
              >
                <s-heading>Setup Guide</s-heading>
                <s-button
                  accessibilityLabel="Dismiss Guide"
                  onClick={() => setVisible({ ...visible, setupGuide: false })}
                  variant="tertiary"
                  tone="neutral"
                  icon="x"
                ></s-button>
                <s-button
                  accessibilityLabel="Toggle setup guide"
                  onClick={() =>
                    setExpanded({
                      ...expanded,
                      setupGuide: !expanded.setupGuide,
                    })
                  }
                  variant="tertiary"
                  tone="neutral"
                  icon={expanded.setupGuide ? "chevron-up" : "chevron-down"}
                ></s-button>
              </s-grid>
              <s-paragraph>
                Use this personalized guide to get your store ready for sales.
              </s-paragraph>
              {/* Banner informativ când se așteaptă confirmarea pentru selectarea temei */}
              {isSelectingTheme && (
                <s-banner tone="info" style={{ marginBottom: "1rem" }}>
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    <s-spinner size="small" />
                    <s-text>Waiting for the theme to be selected...</s-text>
                  </s-stack>
                </s-banner>
              )}
              <s-stack direction="block" gap="tight">
                <s-stack direction="inline" gap="base" blockAlignment="center" alignment="space-between">
                  <s-paragraph color="subdued">
                    {completedSteps} out of {steps.length} steps completed
                  </s-paragraph>
                  <s-text emphasis="strong">{Math.round(progressPercentage)}%</s-text>
                </s-stack>
                <s-progress-bar value={progressPercentage} />
                {progressPercentage === 100 && !progress?.completedAt && (
                  <s-banner tone="success">
                    <s-stack direction="block" gap="tight">
                      <s-text emphasis="strong">🎉 Congratulations!</s-text>
                      <s-paragraph>
                        You have successfully completed all setup steps! Your application is now ready to use.
                      </s-paragraph>
                    </s-stack>
                  </s-banner>
                )}
              </s-stack>
            </s-grid>
            {/* Steps Container */}
            <s-box
              borderRadius="base"
              border="base"
              background="base"
              display={expanded.setupGuide ? "auto" : "none"}
            >
              {/* Step 1 */}
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    {steps[0].completed ? (
                      <s-icon type="check-circle-filled" tone="success" />
                    ) : (
                      <s-icon type="check-circle" tone="subdued" />
                    )}
                    <s-text>{steps[0].title}</s-text>
                  </s-stack>
                  <s-button
                    onClick={() => {
                      setExpanded({ ...expanded, step1: !expanded.step1 });
                    }}
                    accessibilityLabel="Toggle step 1 details"
                    variant="tertiary"
                    icon={expanded.step1 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step1 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    {steps[0].content}
                  </s-box>
                </s-box>
              </s-box>
              {/* Step 2 */}
              <s-divider />
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    {steps[1].completed ? (
                      <s-icon type="check-circle-filled" tone="success" />
                    ) : (
                      <s-icon type="check-circle" tone="subdued" />
                    )}
                    <s-text>{steps[1].title}</s-text>
                  </s-stack>
                  <s-button
                    onClick={() => {
                      setExpanded({ ...expanded, step2: !expanded.step2 });
                    }}
                    accessibilityLabel="Toggle step 2 details"
                    variant="tertiary"
                    icon={expanded.step2 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step2 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    {steps[1].content}
                  </s-box>
                </s-box>
              </s-box>
              {/* Step 3 */}
              <s-divider />
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    {steps[2].completed ? (
                      <s-icon type="check-circle-filled" tone="success" />
                    ) : (
                      <s-icon type="check-circle" tone="subdued" />
                    )}
                    <s-text>{steps[2].title}</s-text>
                  </s-stack>
                  <s-button
                    onClick={() => {
                      setExpanded({ ...expanded, step3: !expanded.step3 });
                    }}
                    accessibilityLabel="Toggle step 3 details"
                    variant="tertiary"
                    icon={expanded.step3 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step3 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    {steps[2].content}
                  </s-box>
                </s-box>
              </s-box>
              {/* Step 4 */}
              <s-divider />
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    {steps[3].completed ? (
                      <s-icon type="check-circle-filled" tone="success" />
                    ) : (
                      <s-icon type="check-circle" tone="subdued" />
                    )}
                    <s-text>{steps[3].title}</s-text>
                  </s-stack>
                  <s-button
                    onClick={() => {
                      setExpanded({ ...expanded, step4: !expanded.step4 });
                    }}
                    accessibilityLabel="Toggle step 4 details"
                    variant="tertiary"
                    icon={expanded.step4 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step4 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    {steps[3].content}
                  </s-box>
                </s-box>
              </s-box>
              {/* Step 5 */}
              <s-divider />
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-stack direction="inline" gap="base" blockAlignment="center">
                    {steps[4].completed ? (
                      <s-icon type="check-circle-filled" tone="success" />
                    ) : (
                      <s-icon type="check-circle" tone="subdued" />
                    )}
                    <s-text>{steps[4].title}</s-text>
                  </s-stack>
                  <s-button
                    onClick={() => {
                      setExpanded({ ...expanded, step5: !expanded.step5 });
                    }}
                    accessibilityLabel="Toggle step 5 details"
                    variant="tertiary"
                    icon={expanded.step5 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step5 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    {steps[4].content}
                  </s-box>
                </s-box>
              </s-box>
            </s-box>
          </s-grid>
        </s-section>
      )}

      {/* Completion Message */}
      {progress?.completedAt && (
        <s-section>
          <s-box
            padding="base"
            background="success-subdued"
            borderRadius="base"
          >
            <s-stack direction="block" gap="tight">
              <s-heading size="small">🎉 Congratulations!</s-heading>
              <s-paragraph>
                You have successfully completed the application setup! You can now start
                using all features.
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* === */}
      {/* Support Section */}
      {/* === */}
      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="base"
        >
          <s-stack direction="block" gap="base">
            <s-heading size="small">Need Help?</s-heading>
            <s-paragraph tone="subdued">
              Our support team is here to help you get the most out of your application.
            </s-paragraph>
            <s-stack direction="block" gap="base">
              <s-box
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" blockAlignment="center">
                  <s-icon type="chat" tone="info" />
                  <s-stack direction="block" gap="tight">
                    <s-text emphasis="strong">Live Support</s-text>
                    <s-paragraph tone="subdued">
                      Available daily through our chat widget. Click the chat icon in the bottom right corner.
                    </s-paragraph>
                  </s-stack>
                </s-stack>
              </s-box>
              <s-box
                padding="base"
                background="subdued"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" blockAlignment="center">
                  <s-icon type="email" tone="info" />
                  <s-stack direction="block" gap="tight">
                    <s-text emphasis="strong">Email Support</s-text>
                    <s-paragraph tone="subdued">
                      Send us an email at{" "}
                      <s-link href="mailto:email@yahoo.com" external>
                        email@yahoo.com
                      </s-link>
                      {" "}and we'll get back to you as soon as possible.
                    </s-paragraph>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


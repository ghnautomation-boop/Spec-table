import { useLoaderData, useFetcher, Form, useNavigate, useActionData, useRevalidator, redirect, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Modal, TitleBar, SaveBar } from "@shopify/app-bridge-react";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "~/shopify.server";
import {
  getTemplate,
  getMetafieldDefinitions,
  createTemplate,
  updateTemplate,
  getTemplates,
  getAllAssignments,
} from "~/models/template.server";
import { getCurrentSubscription } from "~/models/billing.server";
import { getMaxTemplatesForPlan } from "~/models/plans.server";
import prisma from "~/db.server";

// Helper functions pentru conversie hex <-> rgba
function hexToRgba(hex) {
  if (!hex || !hex.startsWith("#")) {
    return "rgba(255, 255, 255, 1)";
  }
  
  // Elimină # și normalizează
  let hexValue = hex.slice(1);
  
  // Dacă e #RRGGBBAA, extrage doar RGB
  if (hexValue.length === 8) {
    hexValue = hexValue.slice(0, 6);
  }
  
  // Dacă e #RGB, expandează la #RRGGBB
  if (hexValue.length === 3) {
    hexValue = hexValue.split("").map(char => char + char).join("");
  }
  
  const r = parseInt(hexValue.slice(0, 2), 16);
  const g = parseInt(hexValue.slice(2, 4), 16);
  const b = parseInt(hexValue.slice(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

function rgbaToHex(rgba) {
  if (!rgba) {
    return null;
  }
  
  // Dacă este deja hex, returnează-l
  if (rgba.startsWith("#")) {
    return rgba;
  }
  
  // Dacă este rgb sau rgba
  if (rgba.startsWith("rgb")) {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) {
      return null;
  }
  
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  
  return `#${r}${g}${b}`;
  }
  
  return null;
}

// Helper functions pentru conversie px <-> number
function pxToNumber(pxValue) {
  if (!pxValue) return 0;
  const match = pxValue.toString().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function numberToPx(number) {
  return `${number}px`;
}

// Component CollapsibleSection pentru secțiunile de styling
function CollapsibleSection({ title, children, defaultCollapsed = true }) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="base">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <s-heading level="3" style={{ margin: 0 }}>{title}</s-heading>
          <span
            style={{
              fontSize: "20px",
              transition: "transform 0.2s ease",
              transform: isCollapsed ? "rotate(0deg)" : "rotate(180deg)",
            }}
          >
            ▼
          </span>
        </div>
        {!isCollapsed && (
          <s-stack direction="block" gap="base">
            {children}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

// Component RangeSlider custom
function RangeSlider({ label, value, onChange, min = 0, max = 100, step = 1 }) {
  return (
    <div style={{ width: "100%", marginBottom: "16px" }}>
      <label
        style={{
          display: "block",
          marginBottom: "8px",
          fontSize: "14px",
          fontWeight: "500",
          color: "#202223",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          style={{
            flex: 1,
            height: "8px",
            borderRadius: "4px",
            background: "#e1e3e5",
            outline: "none",
            cursor: "pointer",
          }}
        />
        <span
          style={{
            minWidth: "40px",
            textAlign: "right",
            fontSize: "14px",
            fontWeight: "500",
            color: "#202223",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { id } = params;

  // Dacă încercăm să creăm un template nou, verifică limita
  if (id === "new") {
    // Obține planul curent
    let currentPlan = null;
    try {
      const currentSubscription = await getCurrentSubscription(admin);
      if (currentSubscription?.name) {
        currentPlan = currentSubscription.name.toLowerCase();
      } else {
        // Fallback: verifică în DB pentru backward compatibility
        const shop = await prisma.shop.findUnique({
          where: { shopDomain: session.shop },
          select: { id: true },
        });
        if (shop) {
          const planRows = await prisma.$queryRaw`
            SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
          `;
          if (Array.isArray(planRows) && planRows.length > 0) {
            currentPlan = planRows[0].planKey;
          }
        }
      }
    } catch (error) {
      console.warn("[app.templates.$id] Could not fetch current plan:", error.message);
    }

    // Obține numărul de template-uri existente
    const templates = await getTemplates(session.shop);
    const currentTemplatesCount = templates.length;
    const planKeyForLimit = currentPlan || "starter"; // Temporar pentru testare
    const maxTemplates = getMaxTemplatesForPlan(planKeyForLimit);
    const isTemplateLimitReached = currentTemplatesCount >= maxTemplates;

    // Dacă limita este atinsă, redirect către pagina de templates cu mesaj
    if (isTemplateLimitReached) {
      return redirect("/app/templates?limitReached=true");
    }
  }

  const [template, metafieldDefinitions, allAssignments] = await Promise.all([
    id !== "new" ? getTemplate(id, session.shop) : null,
    getMetafieldDefinitions(session.shop),
    getAllAssignments(session.shop),
  ]);

  // Calculează numărul de template-uri assignate (template-uri care au cel puțin un assignment)
  // Un template este assignat dacă există un assignment pentru el
  const assignedTemplateIds = new Set();
  allAssignments.forEach(assignment => {
    if (assignment.templateId) {
      assignedTemplateIds.add(assignment.templateId);
    }
  });
  const assignedTemplatesCount = assignedTemplateIds.size;

  return {
    template,
    metafieldDefinitions,
    isNew: id === "new",
    assignedTemplatesCount,
  };
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const action = formData.get("action");
  if (action === "delete") {
    // Delete is handled in templates list page
    return { success: true };
  }

  const name = formData.get("name");
  const isActive = formData.get("isActive") === "true";
  const isAccordion = formData.get("isAccordion") === "true";
  const isAccordionHideFromPC = formData.get("isAccordionHideFromPC") === "true";
  const isAccordionHideFromMobile = formData.get("isAccordionHideFromMobile") === "true";
  const seeMoreEnabled = formData.get("seeMoreEnabled") === "true";
  const seeMoreHideFromPC = formData.get("seeMoreHideFromPC") === "true";
  const seeMoreHideFromMobile = formData.get("seeMoreHideFromMobile") === "true";
  const seeLessHideFromPC = formData.get("seeLessHideFromPC") === "true";
  const seeLessHideFromMobile = formData.get("seeLessHideFromMobile") === "true";
  
  // Extrage splitViewPerSection și splitViewPerMetafield cu fallback la false dacă nu există
  const splitViewPerSectionRaw = formData.get("splitViewPerSection");
  const splitViewPerSection = splitViewPerSectionRaw === "true" || splitViewPerSectionRaw === true || splitViewPerSectionRaw === "True" ? true : false;
  const splitViewPerMetafieldRaw = formData.get("splitViewPerMetafield");
  const splitViewPerMetafield = splitViewPerMetafieldRaw === "true" || splitViewPerMetafieldRaw === true || splitViewPerMetafieldRaw === "True" ? true : false;
  
  // Extrage tableName și setările de collapsible
  const tableNameRaw = formData.get("tableName");
  const tableName = tableNameRaw && tableNameRaw.trim() !== "" ? tableNameRaw.trim() : "Specifications";
  const isCollapsible = formData.get("isCollapsible") === "true";
  const collapsibleOnPC = formData.get("collapsibleOnPC") === "true";
  const collapsibleOnMobile = formData.get("collapsibleOnMobile") === "true";

  // Validare: Template name nu poate fi gol
  if (!name || name.trim() === "") {
    return { success: false, error: "Template name cannot be empty" };
  }

  // Parse styling - verifică dacă există styling JSON (noua structură cu mobile/tablet/desktop)
  const stylingJson = formData.get("styling");
  let stylingData;
  
  if (stylingJson) {
    try {
      stylingData = JSON.parse(stylingJson);
      // Asigură-te că are structura corectă (mobile, tablet, desktop)
      if (!stylingData.mobile || !stylingData.tablet || !stylingData.desktop) {
        // Dacă nu are structura corectă, migrează
        stylingData = migrateStylingToDeviceSpecific(stylingData);
      }
    } catch (e) {
      // Fallback la logica veche
      stylingData = null;
    }
  }
  
  // Dacă nu există styling JSON sau a eșuat parsing-ul, folosește logica veche (backward compatibility)
  if (!stylingData) {
    const oldStyling = {
    backgroundColor: formData.get("backgroundColor") || "#ffffff",
    specificationTextColor: formData.get("specificationTextColor") || formData.get("textColor") || "#000000", // Backward compatibility
    valueTextColor: formData.get("valueTextColor") || formData.get("textColor") || "#000000", // Backward compatibility
    headingColor: formData.get("headingColor") || "#000000",
    headingFontSize: formData.get("headingFontSize") || "18px",
    headingFontWeight: formData.get("headingFontWeight") || "bold",
    headingFontFamily: formData.get("headingFontFamily") || "Arial",
    textFontSize: formData.get("textFontSize") || "14px",
    textFontFamily: formData.get("textFontFamily") || "Arial",
    borderWidth: formData.get("borderWidth") || "0px",
    borderRadius: formData.get("borderRadius") || "0px",
    padding: formData.get("padding") || "10px",
    sectionBorderEnabled: formData.get("sectionBorderEnabled") === "true",
    sectionBorderColor: formData.get("sectionBorderColor") || "#000000",
    sectionBorderStyle: formData.get("sectionBorderStyle") || "solid",
    rowBorderEnabled: formData.get("rowBorderEnabled") === "true",
    rowBorderColor: formData.get("rowBorderColor") || "#000000",
    rowBorderStyle: formData.get("rowBorderStyle") || "solid",
    rowBorderWidth: formData.get("rowBorderWidth") || "1px",
    tdBackgroundColor: formData.get("tdBackgroundColor") || "transparent",
    rowBackgroundEnabled: formData.get("rowBackgroundEnabled") === "true",
    oddRowBackgroundColor: formData.get("oddRowBackgroundColor") || "#f0f0f0",
    evenRowBackgroundColor: formData.get("evenRowBackgroundColor") || "#ffffff",
    columnBackgroundEnabled: formData.get("columnBackgroundEnabled") === "true",
    oddColumnBackgroundColor: formData.get("oddColumnBackgroundColor") || "#ff0000",
    evenColumnBackgroundColor: formData.get("evenColumnBackgroundColor") || "#00ff00",
    textTransform: formData.get("textTransform") || "none",
    // See More Button Settings
    seeMoreButtonStyle: formData.get("seeMoreButtonStyle") || "arrow",
    seeMoreButtonText: formData.get("seeMoreButtonText") || "See More",
    seeMoreButtonBorderEnabled: formData.get("seeMoreButtonBorderEnabled") === "true",
    seeMoreButtonBorderWidth: formData.get("seeMoreButtonBorderWidth") || "1px",
    seeMoreButtonBorderStyle: formData.get("seeMoreButtonBorderStyle") || "solid",
    seeMoreButtonBorderColor: formData.get("seeMoreButtonBorderColor") || "#000000",
    seeMoreButtonColor: formData.get("seeMoreButtonColor") || "#000000",
    seeMoreButtonBackground: formData.get("seeMoreButtonBackground") || "transparent",
    seeMoreButtonFontSize: formData.get("seeMoreButtonFontSize") || "14px",
    seeMoreButtonFontStyle: formData.get("seeMoreButtonFontStyle") || "normal",
    seeMoreButtonFontFamily: formData.get("seeMoreButtonFontFamily") || "Arial",
    seeMoreButtonBorderRadius: formData.get("seeMoreButtonBorderRadius") || "0px",
    seeMoreButtonPadding: formData.get("seeMoreButtonPadding") || "8px",
    // See Less Button Settings (uses same styling as See More)
    seeLessButtonStyle: (() => {
      const value = formData.get("seeLessButtonStyle");
      const fallback = formData.get("seeMoreButtonStyle");
      const result = (value && value.trim() !== "") ? value.trim() : ((fallback && fallback.trim() !== "") ? fallback.trim() : "arrow");
      return result;
    })(),
    seeLessButtonText: (() => {
      const value = formData.get("seeLessButtonText");
      const result = (value && value.trim() !== "") ? value.trim() : "See Less";
      return result;
    })(),
    seeLessHideFromPC: formData.get("seeLessHideFromPC") === "true",
    seeLessHideFromMobile: formData.get("seeLessHideFromMobile") === "true",
    // New styling features
    tableWidth: formData.get("tableWidth") || "100",
    tableMarginTop: formData.get("tableMarginTop") || "0",
    tableMarginBottom: formData.get("tableMarginBottom") || "0",
    tableAlignment: formData.get("tableAlignment") || "left",
    headerTextAlign: formData.get("headerTextAlign") || "left",
    headerBottomBorderEnabled: formData.get("headerBottomBorderEnabled") === "true",
    headerBottomBorderColor: formData.get("headerBottomBorderColor") || "#000000",
    headerBottomBorderWidth: formData.get("headerBottomBorderWidth") || "1px",
    headerBottomBorderStyle: formData.get("headerBottomBorderStyle") || "solid",
    specSpacing: formData.get("specSpacing") || "10",
    columnRatio: formData.get("columnRatio") || "40",
    };
    // Migrează la noua structură
    stylingData = migrateStylingToDeviceSpecific(oldStyling);
  }
  
  // Folosește stylingData ca styling pentru restul codului
  const styling = stylingData;

  // Parse sections
  const sections = [];
  const sectionCount = parseInt(formData.get("sectionCount") || "0");

  // Validare: Fiecare secțiune trebuie să aibă un heading
  for (let i = 0; i < sectionCount; i++) {
    const heading = formData.get(`section_${i}_heading`);
    if (!heading || heading.trim() === "") {
      return { success: false, error: `Section ${i + 1} title cannot be empty` };
    }

    const metafieldCount = parseInt(
      formData.get(`section_${i}_metafieldCount`) || "0"
    );
    const metafields = [];

    for (let j = 0; j < metafieldCount; j++) {
      const metafieldId = formData.get(`section_${i}_metafield_${j}`);
      const metafieldType = formData.get(`section_${i}_metafield_${j}_type`) || 'metafield';
      const productSpecType = formData.get(`section_${i}_metafield_${j}_productSpecType`);
      const customValueRaw = formData.get(`section_${i}_metafield_${j}_customValue`);
      const customValue = customValueRaw && customValueRaw.trim() !== "" ? customValueRaw.trim() : null;
      
      // Extrage proprietățile comune
      const customNameRaw = formData.get(`section_${i}_metafield_${j}_customName`);
      const customName = customNameRaw && customNameRaw.trim() !== "" ? customNameRaw.trim() : null;
      const tooltipEnabledRaw = formData.get(`section_${i}_metafield_${j}_tooltipEnabled`);
      const tooltipEnabled = tooltipEnabledRaw === "true";
      const tooltipTextRaw = formData.get(`section_${i}_metafield_${j}_tooltipText`);
      const tooltipText = tooltipTextRaw && tooltipTextRaw.trim() !== "" ? tooltipTextRaw.trim() : null;
      const hideFromPCRaw = formData.get(`section_${i}_metafield_${j}_hideFromPC`);
      const hideFromPC = hideFromPCRaw === "true";
      const hideFromMobileRaw = formData.get(`section_${i}_metafield_${j}_hideFromMobile`);
      const hideFromMobile = hideFromMobileRaw === "true";
      const prefixRaw = formData.get(`section_${i}_metafield_${j}_prefix`);
      const prefix = prefixRaw && prefixRaw.trim() !== "" ? prefixRaw.trim() : null;
      const suffixRaw = formData.get(`section_${i}_metafield_${j}_suffix`);
      const suffix = suffixRaw && suffixRaw.trim() !== "" ? suffixRaw.trim() : null;
      
      // Verifică dacă este custom_spec
      if (metafieldType === 'custom_spec' && customName && customValue) {
        metafields.push({
          type: 'custom_spec',
          metafieldDefinitionId: null,
          productSpecType: null,
          customValue: customValue,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
          prefix,
          suffix,
        });
      } else if (metafieldType === 'product_spec' && productSpecType) {
        metafields.push({
          type: 'product_spec',
          metafieldDefinitionId: null,
          productSpecType: productSpecType,
          customValue: null,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
          prefix,
          suffix,
        });
      } else if (metafieldId) {
        metafields.push({
          type: 'metafield',
          metafieldDefinitionId: metafieldId,
          productSpecType: null,
          customValue: null,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
          prefix,
          suffix,
        });
      }
    }

    if (metafields.length > 0) {
      sections.push({
        heading,
        metafields,
      });
    }
  }

  // Verifică limita înainte de a crea un template nou
  if (id === "new") {
    // Obține planul curent
    let currentPlan = null;
    try {
      const currentSubscription = await getCurrentSubscription(admin);
      if (currentSubscription?.name) {
        currentPlan = currentSubscription.name.toLowerCase();
      } else {
        // Fallback: verifică în DB pentru backward compatibility
        const shop = await prisma.shop.findUnique({
          where: { shopDomain: session.shop },
          select: { id: true },
        });
        if (shop) {
          const planRows = await prisma.$queryRaw`
            SELECT "planKey" FROM "ShopPlan" WHERE "shopId" = ${shop.id} LIMIT 1
          `;
          if (Array.isArray(planRows) && planRows.length > 0) {
            currentPlan = planRows[0].planKey;
          }
        }
      }
    } catch (error) {
      console.warn("[app.templates.$id] Could not fetch current plan:", error.message);
    }

    // Obține numărul de template-uri existente
    const templates = await getTemplates(session.shop);
    const currentTemplatesCount = templates.length;
    const planKeyForLimit = currentPlan || "starter"; // Temporar pentru testare
    const maxTemplates = getMaxTemplatesForPlan(planKeyForLimit);
    const isTemplateLimitReached = currentTemplatesCount >= maxTemplates;

    // Dacă limita este atinsă, returnează eroare
    if (isTemplateLimitReached) {
      return { 
        success: false, 
        error: `You have reached the maximum number of templates (${currentTemplatesCount}/${maxTemplates}) for your ${currentPlan ? currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1) : 'current'} plan. Please upgrade your plan to create more templates.` 
      };
    }
  }

  try {
    if (id === "new") {
      const created = await createTemplate(
        {
          name,
          styling,
          isActive,
          isAccordion,
          isAccordionHideFromPC,
          isAccordionHideFromMobile,
          seeMoreEnabled,
          seeMoreHideFromPC,
          seeMoreHideFromMobile,
          seeLessHideFromPC,
          seeLessHideFromMobile,
          splitViewPerSection,
          splitViewPerMetafield,
          tableName,
          isCollapsible,
          collapsibleOnPC,
          collapsibleOnMobile,
          sections,
        },
        session.shop,
        admin
      );
      return { success: true, redirect: `/app/templates?focusTemplateId=${created.id}`, redirectNonce: String(Date.now()) };
    } else {
      await updateTemplate(
        id,
        {
          name,
          styling,
          isActive,
          isAccordion,
          isAccordionHideFromPC,
          isAccordionHideFromMobile,
          seeMoreEnabled,
          seeMoreHideFromPC,
          seeMoreHideFromMobile,
          seeLessHideFromPC,
          seeLessHideFromMobile,
          splitViewPerSection,
          splitViewPerMetafield,
          tableName,
          isCollapsible,
          collapsibleOnPC,
          collapsibleOnMobile,
          sections,
        },
        session.shop,
        admin
      );
      return { success: true, redirect: `/app/templates?focusTemplateId=${id}`, redirectNonce: String(Date.now()) };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Helper function to migrate old styling structure to new device-specific structure
function migrateStylingToDeviceSpecific(oldStyling) {
  // Dacă deja are structura nouă (mobile, tablet, desktop), returnează direct
  if (oldStyling && (oldStyling.mobile || oldStyling.tablet || oldStyling.desktop)) {
    return oldStyling;
  }

  // Funcție helper pentru a obține default styling
  const getDefaultStyling = () => ({
    backgroundColor: "#ffffff",
    specificationTextColor: "#000000",
    valueTextColor: "#000000",
    headingColor: "#000000",
    headingFontSize: "18px",
    headingFontWeight: "bold",
    headingFontFamily: "Arial",
    textFontSize: "14px",
    textFontFamily: "Arial",
    borderWidth: "0px",
    borderRadius: "0px",
    padding: "10px",
    sectionBorderEnabled: false,
    sectionBorderColor: "#000000",
    sectionBorderStyle: "solid",
    rowBorderEnabled: false,
    rowBorderColor: "#000000",
    rowBorderStyle: "solid",
    rowBorderWidth: "1px",
    tdBackgroundColor: "transparent",
    rowBackgroundEnabled: false,
    oddRowBackgroundColor: "#f0f0f0",
    evenRowBackgroundColor: "#ffffff",
    columnBackgroundEnabled: false,
    oddColumnBackgroundColor: "#ff0000",
    evenColumnBackgroundColor: "#00ff00",
    textTransform: "none",
    seeMoreButtonStyle: "arrow",
    seeMoreButtonText: "See More",
    seeMoreButtonBorderEnabled: false,
    seeMoreButtonBorderWidth: "1px",
    seeMoreButtonBorderStyle: "solid",
    seeMoreButtonBorderColor: "#000000",
    seeMoreButtonColor: "#000000",
    seeMoreButtonBackground: "transparent",
    seeMoreButtonFontSize: "14px",
    seeMoreButtonFontStyle: "normal",
    seeMoreButtonFontFamily: "Arial",
    seeMoreButtonBorderRadius: "0px",
    seeMoreButtonPadding: "8px",
    tableWidth: "100",
    tableMarginTop: "0",
    tableMarginBottom: "0",
    tableAlignment: "left",
    headerTextAlign: "left",
    headerBottomBorderEnabled: false,
    headerBottomBorderColor: "#000000",
    headerBottomBorderWidth: "1px",
    headerBottomBorderStyle: "solid",
    specSpacing: "10",
    columnRatio: "40",
  });

  // Dacă nu există oldStyling, returnează default pentru toate device-urile
  if (!oldStyling) {
    const defaultStyling = getDefaultStyling();
    return {
      mobile: { ...defaultStyling },
      tablet: { ...defaultStyling },
      desktop: { ...defaultStyling },
    };
  }

  // Backward compatibility: dacă există textColor vechi, îl folosim pentru ambele
  if (oldStyling.textColor && !oldStyling.specificationTextColor) {
    oldStyling.specificationTextColor = oldStyling.textColor;
  }
  if (oldStyling.textColor && !oldStyling.valueTextColor) {
    oldStyling.valueTextColor = oldStyling.textColor;
  }

  // Adaugă default-uri pentru câmpurile lipsă
  const defaultStyling = getDefaultStyling();
  const migratedStyling = { ...defaultStyling, ...oldStyling };

  // Adaugă default-uri pentru noile câmpuri dacă nu există
  if (!migratedStyling.tableWidth) migratedStyling.tableWidth = "100";
  if (!migratedStyling.tableMarginTop) migratedStyling.tableMarginTop = "0";
  if (!migratedStyling.tableMarginBottom) migratedStyling.tableMarginBottom = "0";
  if (!migratedStyling.tableAlignment) migratedStyling.tableAlignment = "left";
  if (!migratedStyling.headerTextAlign) migratedStyling.headerTextAlign = "left";
  if (migratedStyling.headerBottomBorderEnabled === undefined) migratedStyling.headerBottomBorderEnabled = false;
  if (!migratedStyling.headerBottomBorderColor) migratedStyling.headerBottomBorderColor = "#000000";
  if (!migratedStyling.headerBottomBorderWidth) migratedStyling.headerBottomBorderWidth = "1px";
  if (!migratedStyling.headerBottomBorderStyle) migratedStyling.headerBottomBorderStyle = "solid";
  if (!migratedStyling.specSpacing) migratedStyling.specSpacing = "10";
  if (!migratedStyling.columnRatio) migratedStyling.columnRatio = "40";

  // Returnează structura nouă cu același styling pentru toate device-urile
  return {
    mobile: { ...migratedStyling },
    tablet: { ...migratedStyling },
    desktop: { ...migratedStyling },
  };
}

export default function TemplateEditorPage() {
  const { template, metafieldDefinitions, isNew, assignedTemplatesCount } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const processedRedirectRef = useRef(null);
  const shopify = useAppBridge();
  const saveFormRef = useRef(null);
  
  // Detect loading state when form is submitting
  const isSubmitting = navigation.state === "submitting";

  const [sections, setSections] = useState(() => {
    if (!template?.sections) {
      return [
        {
          heading: "",
          metafields: [],
        },
      ];
    }
    
    const initialSections = template.sections.map(section => ({
      heading: section.heading,
      metafields: (section.metafields || []).map(mf => {
        return {
          metafieldDefinitionId: mf.metafieldDefinitionId,
          // Folosește valorile direct din baza de date, nu null coalescing
          customName: mf.customName !== undefined && mf.customName !== null ? mf.customName : null,
          tooltipEnabled: mf.tooltipEnabled === true,
          tooltipText: mf.tooltipText !== undefined && mf.tooltipText !== null ? mf.tooltipText : null,
          hideFromPC: mf.hideFromPC === true,
          hideFromMobile: mf.hideFromMobile === true,
          prefix: mf.prefix !== undefined && mf.prefix !== null ? mf.prefix : null,
          suffix: mf.suffix !== undefined && mf.suffix !== null ? mf.suffix : null,
        };
      })
    }));
    
    return initialSections;
  });

  const [isActive, setIsActive] = useState(
    template?.isActive !== undefined ? template.isActive : true
  );
  const [isAccordion, setIsAccordion] = useState(
    template?.isAccordion || false
  );
  const [isAccordionHideFromPC, setIsAccordionHideFromPC] = useState(
    template?.isAccordionHideFromPC || false
  );
  const [isAccordionHideFromMobile, setIsAccordionHideFromMobile] = useState(
    template?.isAccordionHideFromMobile || false
  );
  const [seeMoreEnabled, setSeeMoreEnabled] = useState(
    template?.seeMoreEnabled || false
  );
  const [seeMoreHideFromPC, setSeeMoreHideFromPC] = useState(
    template?.seeMoreHideFromPC || false
  );
  const [seeMoreHideFromMobile, setSeeMoreHideFromMobile] = useState(
    template?.seeMoreHideFromMobile || false
  );
  const [seeLessHideFromPC, setSeeLessHideFromPC] = useState(
    template?.seeLessHideFromPC || false
  );
  const [seeLessHideFromMobile, setSeeLessHideFromMobile] = useState(
    template?.seeLessHideFromMobile || false
  );
  const [splitViewPerSection, setSplitViewPerSection] = useState(
    template?.splitViewPerSection || false
  );
  const [splitViewPerMetafield, setSplitViewPerMetafield] = useState(
    template?.splitViewPerMetafield || false
  );
  const [tableName, setTableName] = useState(
    template?.tableName || "Specifications"
  );
  const [isCollapsible, setIsCollapsible] = useState(
    template?.isCollapsible || false
  );
  const [collapsibleOnPC, setCollapsibleOnPC] = useState(
    template?.collapsibleOnPC || false
  );
  const [collapsibleOnMobile, setCollapsibleOnMobile] = useState(
    template?.collapsibleOnMobile || false
  );

  const [openSelectIndex, setOpenSelectIndex] = useState(null);
  const [selectedMetafieldsForSection, setSelectedMetafieldsForSection] = useState({});
  const [openProductSpecIndex, setOpenProductSpecIndex] = useState(null);
  const [openCustomSpecIndex, setOpenCustomSpecIndex] = useState(null);
  const [customSpecName, setCustomSpecName] = useState("");
  const [customSpecValue, setCustomSpecValue] = useState("");
  
  // Tipurile disponibile de product specifications
  const productSpecTypes = [
    { value: 'vendor', label: 'Vendor' },
    { value: 'inventory_quantity', label: 'Inventory Quantity' },
    { value: 'weight', label: 'Weight' },
    { value: 'sku', label: 'SKU' },
    { value: 'barcode', label: 'Barcode' },
    { value: 'variant_sku', label: 'Variant SKU' },
    { value: 'compare_at_price', label: 'Compare at price' },
    { value: 'product_type', label: 'Product Type' },
    { value: 'collection_names', label: 'Collection Names' },
  ];
  const [metafieldSearchTerm, setMetafieldSearchTerm] = useState({});
  const [templateName, setTemplateName] = useState(template?.name || "");
  const [editingMetafield, setEditingMetafield] = useState(null); // { sectionIndex, metafieldIndex }
  const [metafieldEditData, setMetafieldEditData] = useState({ 
    customName: "", 
    customValue: "",
    tooltipEnabled: false, 
    tooltipText: "",
    hideFromPC: false,
    hideFromMobile: false,
    prefix: "",
    suffix: ""
  });
  const [formKey, setFormKey] = useState(0); // Counter pentru a forța re-renderizarea formularului
  const isInitialMount = useRef(true); // Flag pentru a detecta prima încărcare
  const [expandedSections, setExpandedSections] = useState({}); // State pentru secțiunile expandate (key: sectionIndex, value: boolean)
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0); // State pentru secțiunea selectată în layout-ul cu 2 coloane
  const [showSaveBar, setShowSaveBar] = useState(false); // Control visibility of SaveBar
  
  // State-uri pentru tooltip modals
  const [showTemplateNameTooltip, setShowTemplateNameTooltip] = useState(false);
  const [showSectionsTooltip, setShowSectionsTooltip] = useState(false);

  // Salvează state-ul inițial pentru detectarea schimbărilor
  const initialFormState = useRef({
    templateName: template?.name || "",
    sections: template?.sections ? template.sections.map(section => ({
      heading: section.heading,
      metafields: (section.metafields || []).map(mf => ({
        metafieldDefinitionId: mf.metafieldDefinitionId,
        type: mf.type || 'metafield',
        productSpecType: mf.productSpecType !== undefined && mf.productSpecType !== null ? mf.productSpecType : null,
        customValue: mf.customValue !== undefined && mf.customValue !== null ? mf.customValue : null,
        customName: mf.customName !== undefined && mf.customName !== null ? mf.customName : null,
        tooltipEnabled: mf.tooltipEnabled === true,
        tooltipText: mf.tooltipText !== undefined && mf.tooltipText !== null ? mf.tooltipText : null,
        hideFromPC: mf.hideFromPC === true,
        hideFromMobile: mf.hideFromMobile === true,
        prefix: mf.prefix !== undefined && mf.prefix !== null ? mf.prefix : null,
        suffix: mf.suffix !== undefined && mf.suffix !== null ? mf.suffix : null,
      }))
    })) : [{ heading: "", metafields: [] }],
    isActive: template?.isActive !== undefined ? template.isActive : true,
    isAccordion: template?.isAccordion || false,
    isAccordionHideFromPC: template?.isAccordionHideFromPC || false,
    isAccordionHideFromMobile: template?.isAccordionHideFromMobile || false,
    seeMoreEnabled: template?.seeMoreEnabled || false,
    seeMoreHideFromPC: template?.seeMoreHideFromPC || false,
    seeMoreHideFromMobile: template?.seeMoreHideFromMobile || false,
    splitViewPerSection: template?.splitViewPerSection || false,
    splitViewPerMetafield: template?.splitViewPerMetafield || false,
    tableName: template?.tableName || "Specifications",
    isCollapsible: template?.isCollapsible || false,
    collapsibleOnPC: template?.collapsibleOnPC || false,
    collapsibleOnMobile: template?.collapsibleOnMobile || false,
    styling: template?.styling ? migrateStylingToDeviceSpecific(JSON.parse(template.styling)) : migrateStylingToDeviceSpecific(null),
  });



  // Actualizează manual valorile hidden inputs-urilor când se schimbă sections
  useEffect(() => {
    sections.forEach((section, sectionIndex) => {
      section.metafields?.forEach((metafield, mfIndex) => {
        const customNameInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_customName"]`);
        const tooltipEnabledInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipEnabled"]`);
        const tooltipTextInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipText"]`);
        const hideFromPCInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromPC"]`);
        const hideFromMobileInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromMobile"]`);
        const prefixInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_prefix"]`);
        const suffixInput = document.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_suffix"]`);
        
        if (customNameInput) {
          customNameInput.value = metafield.customName || "";
        }
        if (tooltipEnabledInput) {
          tooltipEnabledInput.value = metafield.tooltipEnabled ? "true" : "false";
        }
        if (tooltipTextInput) {
          tooltipTextInput.value = metafield.tooltipText || "";
        }
        if (hideFromPCInput) {
          hideFromPCInput.value = metafield.hideFromPC ? "true" : "false";
        }
        if (hideFromMobileInput) {
          hideFromMobileInput.value = metafield.hideFromMobile ? "true" : "false";
        }
        if (prefixInput) {
          prefixInput.value = metafield.prefix || "";
        }
        if (suffixInput) {
          suffixInput.value = metafield.suffix || "";
        }
      });
    });
  }, [sections, formKey]);

  // Actualizează valorile hidden inputs-urilor pentru seeMoreHideFromPC și seeMoreHideFromMobile
  useEffect(() => {
    const seeMoreHideFromPCInput = document.querySelector('input[name="seeMoreHideFromPC"]');
    const seeMoreHideFromMobileInput = document.querySelector('input[name="seeMoreHideFromMobile"]');
    
    if (seeMoreHideFromPCInput) {
      seeMoreHideFromPCInput.value = seeMoreHideFromPC ? "true" : "false";
    }
    if (seeMoreHideFromMobileInput) {
      seeMoreHideFromMobileInput.value = seeMoreHideFromMobile ? "true" : "false";
    }
  }, [seeMoreHideFromPC, seeMoreHideFromMobile]);
  
  // Actualizează valorile hidden inputs-urilor pentru seeLessHideFromPC și seeLessHideFromMobile
  useEffect(() => {
    const seeLessHideFromPCInput = document.querySelector('input[name="seeLessHideFromPC"]');
    const seeLessHideFromMobileInput = document.querySelector('input[name="seeLessHideFromMobile"]');
    
    if (seeLessHideFromPCInput) {
      seeLessHideFromPCInput.value = seeLessHideFromPC ? "true" : "false";
    }
    if (seeLessHideFromMobileInput) {
      seeLessHideFromMobileInput.value = seeLessHideFromMobile ? "true" : "false";
    }
  }, [seeLessHideFromPC, seeLessHideFromMobile]);

  // Actualizează valorile hidden inputs-urilor pentru splitViewPerSection și splitViewPerMetafield
  useEffect(() => {
    const splitViewPerSectionInput = document.querySelector('input[name="splitViewPerSection"]');
    const splitViewPerMetafieldInput = document.querySelector('input[name="splitViewPerMetafield"]');
    
    if (splitViewPerSectionInput) {
      splitViewPerSectionInput.value = splitViewPerSection ? "true" : "false";
    }
    if (splitViewPerMetafieldInput) {
      splitViewPerMetafieldInput.value = splitViewPerMetafield ? "true" : "false";
    }
  }, [splitViewPerSection, splitViewPerMetafield]);

  // State pentru device-ul selectat (mobile, tablet, desktop)
  const [selectedDevice, setSelectedDevice] = useState("desktop");
  
  // State pentru dialog-ul de confirmare copy styles
  const [copyStylesDialog, setCopyStylesDialog] = useState({ open: false, sourceDevice: null });

  const [styling, setStyling] = useState(
    template?.styling
      ? migrateStylingToDeviceSpecific(JSON.parse(template.styling))
      : migrateStylingToDeviceSpecific(null)
  );

  // Helper pentru a obține styling-ul pentru device-ul selectat
  const getCurrentDeviceStyling = () => {
    return styling[selectedDevice] || styling.desktop || {};
  };

  // Helper pentru a actualiza styling-ul pentru device-ul selectat
  const updateCurrentDeviceStyling = (updates) => {
    setStyling((prev) => ({
      ...prev,
      [selectedDevice]: {
        ...prev[selectedDevice],
        ...updates,
      },
    }));
  };

  // Sincronizează state-ul când se încarcă template-ul
  useEffect(() => {
    if (template?.styling) {
      const migratedStyling = migrateStylingToDeviceSpecific(JSON.parse(template.styling));
      setStyling(migratedStyling);
    }
  }, [template]);

  // Funcție pentru deschiderea dialog-ului de confirmare copy styles
  const openCopyStylesDialog = (sourceDevice) => {
    setCopyStylesDialog({ open: true, sourceDevice });
  };

  // Funcție pentru copierea efectivă a stilurilor de la un device la altul
  const copyStylesFromDevice = (sourceDevice) => {
    if (!styling[sourceDevice]) return;
    
    setStyling((prev) => ({
      ...prev,
      [selectedDevice]: {
        ...styling[sourceDevice],
      },
    }));
    
    // Închide dialog-ul
    setCopyStylesDialog({ open: false, sourceDevice: null });
  };

  // Sincronizează state-ul când se încarcă template-ul
  useEffect(() => {
    if (template?.sections) {
      // Asigură-te că toate metafields-urile au type setat și toate proprietățile necesare
      const sectionsWithType = template.sections.map(section => ({
        ...section,
        metafields: section.metafields?.map(mf => {
          // Determină tipul pe baza proprietăților disponibile dacă type nu este setat
          let metafieldType = mf.type;
          if (!metafieldType) {
            if (mf.customValue !== null && mf.customValue !== undefined) {
              metafieldType = 'custom_spec';
            } else if (mf.productSpecType !== null && mf.productSpecType !== undefined) {
              metafieldType = 'product_spec';
            } else {
              metafieldType = 'metafield';
            }
          }
          return {
            ...mf,
            type: metafieldType,
            productSpecType: mf.productSpecType || null,
            customValue: mf.customValue || null, // Include customValue pentru custom specs
            customName: mf.customName || null,
          };
        }) || [],
      }));
      setSections(sectionsWithType);
    }
    if (template?.isActive !== undefined) {
      setIsActive(template.isActive);
    }
    if (template?.isAccordion !== undefined) {
      setIsAccordion(template.isAccordion);
    }
    if (template?.seeMoreEnabled !== undefined) {
      setSeeMoreEnabled(template.seeMoreEnabled);
    }
    if (template?.seeMoreHideFromPC !== undefined) {
      setSeeMoreHideFromPC(template.seeMoreHideFromPC);
    }
    if (template?.seeMoreHideFromMobile !== undefined) {
      setSeeMoreHideFromMobile(template.seeMoreHideFromMobile);
    }
    if (template?.seeLessHideFromPC !== undefined) {
      setSeeLessHideFromPC(template.seeLessHideFromPC);
    }
    if (template?.seeLessHideFromMobile !== undefined) {
      setSeeLessHideFromMobile(template.seeLessHideFromMobile);
    }
    if (template?.splitViewPerSection !== undefined) {
      setSplitViewPerSection(template.splitViewPerSection);
    }
    if (template?.splitViewPerMetafield !== undefined) {
      setSplitViewPerMetafield(template.splitViewPerMetafield);
    }
    if (template?.tableName !== undefined) {
      setTableName(template.tableName);
    }
    if (template?.isCollapsible !== undefined) {
      setIsCollapsible(template.isCollapsible);
    }
    if (template?.collapsibleOnPC !== undefined) {
      setCollapsibleOnPC(template.collapsibleOnPC);
    }
    if (template?.collapsibleOnMobile !== undefined) {
      setCollapsibleOnMobile(template.collapsibleOnMobile);
    }
    if (template?.name) {
      setTemplateName(template.name);
    }
  }, [template]);

  // Actualizează valorile hidden inputs-urilor pentru seeLessButtonStyle și seeLessButtonText
  // Trebuie să fie după definirea lui styling
  useEffect(() => {
    const seeLessButtonStyleInput = document.querySelector('input[name="seeLessButtonStyle"]');
    const seeLessButtonTextInput = document.querySelector('input[name="seeLessButtonText"]');
    
    if (seeLessButtonStyleInput) {
      const value = styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow";
      seeLessButtonStyleInput.value = value;
      seeLessButtonStyleInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (seeLessButtonTextInput) {
      const value = styling.seeLessButtonText || "See Less";
      seeLessButtonTextInput.value = value;
      seeLessButtonTextInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [styling.seeLessButtonStyle, styling.seeLessButtonText, styling.seeMoreButtonStyle]);

  // Redirect after successful save (works for both create and edit)
  useEffect(() => {
    if (!actionData) return;
    if (!actionData.redirectNonce) return;
    if (processedRedirectRef.current === actionData.redirectNonce) return;

    if (actionData.success) {
      processedRedirectRef.current = actionData.redirectNonce;
      shopify.toast.show(`Template ${isNew ? "created" : "updated"} successfully!`);
      navigate(actionData.redirect || "/app/templates", { replace: true });
    } else if (actionData.success === false) {
      processedRedirectRef.current = actionData.redirectNonce;
      shopify.toast.show(`Eroare: ${actionData.error}`, { isError: true });
    }
  }, [actionData, shopify, navigate, isNew]);

  // Funcție pentru a detecta dacă există schimbări nesalvate
  const hasUnsavedChanges = useCallback(() => {
    // Dacă salvare a reușit recent, nu mai detectăm modificări nesalvate
    // pentru a preveni pop-up-ul de beforeunload după salvare
    if (actionData?.success === true) {
      return false;
    }

    // Compară templateName
    if (templateName !== initialFormState.current.templateName) {
      return true;
    }

    // Compară isActive
    if (isActive !== initialFormState.current.isActive) {
      return true;
    }

    // Compară isAccordion și setările asociate
    if (isAccordion !== initialFormState.current.isAccordion ||
        isAccordionHideFromPC !== initialFormState.current.isAccordionHideFromPC ||
        isAccordionHideFromMobile !== initialFormState.current.isAccordionHideFromMobile) {
      return true;
    }

    // Compară seeMoreEnabled și setările asociate
    if (seeMoreEnabled !== initialFormState.current.seeMoreEnabled ||
        seeMoreHideFromPC !== initialFormState.current.seeMoreHideFromPC ||
        seeMoreHideFromMobile !== initialFormState.current.seeMoreHideFromMobile ||
        seeLessHideFromPC !== initialFormState.current.seeLessHideFromPC ||
        seeLessHideFromMobile !== initialFormState.current.seeLessHideFromMobile ||
        splitViewPerSection !== initialFormState.current.splitViewPerSection ||
        splitViewPerMetafield !== initialFormState.current.splitViewPerMetafield) {
      return true;
    }

    // Compară tableName și setările de collapsible
    if (tableName !== initialFormState.current.tableName ||
        isCollapsible !== initialFormState.current.isCollapsible ||
        collapsibleOnPC !== initialFormState.current.collapsibleOnPC ||
        collapsibleOnMobile !== initialFormState.current.collapsibleOnMobile) {
      return true;
    }

    // Compară sections
    if (sections.length !== initialFormState.current.sections.length) {
      return true;
    }

    for (let i = 0; i < sections.length; i++) {
      const currentSection = sections[i];
      const initialSection = initialFormState.current.sections[i];

      if (!initialSection) return true;

      if (currentSection.heading !== initialSection.heading) {
        return true;
      }

      if (currentSection.metafields.length !== initialSection.metafields.length) {
        return true;
      }

      for (let j = 0; j < currentSection.metafields.length; j++) {
        const currentMf = currentSection.metafields[j];
        const initialMf = initialSection.metafields[j];

        if (!initialMf) return true;

        // Determină tipul pentru comparație
        const currentType = currentMf.type || (currentMf.customValue ? 'custom_spec' : (currentMf.productSpecType ? 'product_spec' : 'metafield'));
        const initialType = initialMf.type || (initialMf.customValue ? 'custom_spec' : (initialMf.productSpecType ? 'product_spec' : 'metafield'));
        
        if (currentType !== initialType ||
            currentMf.metafieldDefinitionId !== initialMf.metafieldDefinitionId ||
            currentMf.productSpecType !== (initialMf.productSpecType || null) ||
            currentMf.customValue !== (initialMf.customValue || null) ||
            currentMf.customName !== initialMf.customName ||
            currentMf.tooltipEnabled !== initialMf.tooltipEnabled ||
            currentMf.tooltipText !== initialMf.tooltipText ||
            currentMf.hideFromPC !== initialMf.hideFromPC ||
            currentMf.hideFromMobile !== initialMf.hideFromMobile ||
            currentMf.prefix !== initialMf.prefix ||
            currentMf.suffix !== initialMf.suffix) {
          return true;
        }
      }
    }

    // Compară styling
    const currentStyling = JSON.stringify(styling);
    const initialStyling = JSON.stringify(initialFormState.current.styling);
    if (currentStyling !== initialStyling) {
      return true;
    }

    return false;
  }, [templateName, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, 
      seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, splitViewPerSection, splitViewPerMetafield, 
      tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, sections, styling, actionData]);

  // Control SaveBar visibility based on unsaved changes (only after initial mount)
  // Using SaveBar component with 'open' prop (Shopify recommended approach)
  useEffect(() => {
    if (isInitialMount.current) {
      setShowSaveBar(false);
      return;
    }
    
    const dirty = hasUnsavedChanges();
    setShowSaveBar(dirty);
  }, [hasUnsavedChanges, templateName, isActive, isAccordion, isAccordionHideFromPC, isAccordionHideFromMobile, 
      seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, seeLessHideFromPC, seeLessHideFromMobile, 
      splitViewPerSection, splitViewPerMetafield, tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, 
      sections, styling, actionData]);

  const requestSubmitSaveForm = useCallback(() => {
    const form = saveFormRef.current || document.querySelector('form[data-save-bar]');
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else if (form) {
      // Fallback
      form.submit();
    }
  }, []);

  const resetSaveForm = useCallback(() => {
    // Hide SaveBar immediately before resetting form
    setShowSaveBar(false);
    
    const form = saveFormRef.current || document.querySelector('form#template-editor-save-form');
    if (form && typeof form.reset === "function") {
      form.reset();
    }
  }, []);


  // Funcție pentru a declanșa evenimente change pe hidden inputs
  // Acest lucru este necesar pentru ca Save Bar să detecteze schimbările
  const triggerFormChanges = useCallback(() => {
    const form = document.querySelector('form[data-save-bar]');
    if (!form) return;

    // Declanșează change pe input-ul pentru templateName
    const nameInput = form.querySelector('input[name="name"]');
    if (nameInput) {
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Declanșează change pe input-ul pentru tableName
    const tableNameInput = form.querySelector('input[name="tableName"]');
    if (tableNameInput) {
      tableNameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Declanșează change pe toate hidden inputs pentru sections
    sections.forEach((section, sectionIndex) => {
      const headingInput = form.querySelector(`input[name="section_${sectionIndex}_heading"]`);
      if (headingInput) {
        headingInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      section.metafields?.forEach((metafield, mfIndex) => {
        const inputs = [
          `input[name="section_${sectionIndex}_metafield_${mfIndex}_customName"]`,
          `input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipEnabled"]`,
          `input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipText"]`,
          `input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromPC"]`,
          `input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromMobile"]`,
        ];

        inputs.forEach(selector => {
          const input = form.querySelector(selector);
          if (input) {
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    });

    // Declanșează change pe hidden inputs pentru splitViewPerSection și splitViewPerMetafield
    const splitViewInputs = [
      'input[name="splitViewPerSection"]',
      'input[name="splitViewPerMetafield"]',
    ];
    splitViewInputs.forEach(selector => {
      const input = form.querySelector(selector);
      if (input) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Declanșează change pe toate celelalte hidden inputs
    const otherInputs = [
      'input[name="isActive"]',
      'input[name="isAccordion"]',
      'input[name="isAccordionHideFromPC"]',
      'input[name="isAccordionHideFromMobile"]',
      'input[name="seeMoreEnabled"]',
      'input[name="seeMoreHideFromPC"]',
      'input[name="seeMoreHideFromMobile"]',
      'input[name="seeLessHideFromPC"]',
      'input[name="seeLessHideFromMobile"]',
      'input[name="tableName"]',
      'input[name="isCollapsible"]',
      'input[name="collapsibleOnPC"]',
      'input[name="collapsibleOnMobile"]',
      // Styling inputs
      'input[name="backgroundColor"]',
      'input[name="specificationTextColor"]',
      'input[name="valueTextColor"]',
      'input[name="headingColor"]',
      'input[name="headingFontSize"]',
      'input[name="headingFontWeight"]',
      'input[name="headingFontFamily"]',
      'input[name="textFontSize"]',
      'input[name="textFontFamily"]',
      'input[name="borderWidth"]',
      'input[name="borderRadius"]',
      'input[name="padding"]',
      'input[name="sectionBorderEnabled"]',
      'input[name="sectionBorderColor"]',
      'input[name="sectionBorderStyle"]',
      'input[name="rowBorderEnabled"]',
      'input[name="rowBorderColor"]',
      'input[name="rowBorderStyle"]',
      'input[name="rowBorderWidth"]',
      'input[name="tdBackgroundColor"]',
      'input[name="rowBackgroundEnabled"]',
      'input[name="oddRowBackgroundColor"]',
      'input[name="evenRowBackgroundColor"]',
      'input[name="columnBackgroundEnabled"]',
      'input[name="oddColumnBackgroundColor"]',
      'input[name="evenColumnBackgroundColor"]',
      'input[name="textTransform"]',
      'input[name="seeLessButtonStyle"]',
      'input[name="seeLessButtonText"]',
    ];

    otherInputs.forEach(selector => {
      const input = form.querySelector(selector);
      if (input) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, [sections, styling]);

  // Ascunde Save Bar explicit la prima încărcare și resetează flag-ul
  useEffect(() => {
    if (isInitialMount.current) {
      // Ascunde explicit Save Bar la prima încărcare dacă apare
      const hideSaveBar = () => {
        const form = document.querySelector('form[data-save-bar]');
        if (form && typeof shopify?.saveBar?.hide === 'function') {
          shopify.saveBar.hide('save-bar').catch(() => {
            // Ignoră erorile dacă Save Bar nu este încă inițializat
          });
        }
      };
      
      // Încearcă să ascundă imediat
      hideSaveBar();
      
      // Încearcă din nou după un mic delay pentru a fi sigur
      const timeoutId = setTimeout(() => {
        hideSaveBar();
        isInitialMount.current = false;
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shopify]);

  // Monitorizează schimbările și declanșează evenimente change pentru Save Bar
  // DOAR după prima încărcare (nu la mount inițial)
  useEffect(() => {
    // La prima încărcare, nu declanșăm evenimente change
    if (isInitialMount.current) {
      return;
    }

    // Așteaptă puțin pentru ca DOM-ul să fie actualizat și formularul să fie disponibil
    const timeoutId = setTimeout(() => {
      const form = document.querySelector('form[data-save-bar]');
      if (form) {
        triggerFormChanges();
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [templateName, sections, isActive, isAccordion, 
      isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, 
      seeMoreHideFromPC, seeMoreHideFromMobile, splitViewPerSection, splitViewPerMetafield, 
      tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, styling, triggerFormChanges, shopify]);

  // Previne navigarea când există schimbări nesalvate
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Verifică dacă există schimbări nesalvate
      if (hasUnsavedChanges()) {
        // Previne închiderea paginii
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    // Adaugă event listener pentru beforeunload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Interceptează navigarea programatică
  const handleNavigate = useCallback((path) => {
    // Verifică dacă există schimbări nesalvate
    if (hasUnsavedChanges()) {
      // Afișează confirmare
      if (confirm('Ai modificări nesalvate. Ești sigur că vrei să părăsești pagina?')) {
        navigate(path);
      }
    } else {
      // Dacă nu există schimbări, navighează direct
      navigate(path);
    }
  }, [hasUnsavedChanges, navigate]);



  // Adaugă event listeners pentru text fields și select fields
  useEffect(() => {
    const handleInputChange = (event, fieldName) => {
      const target = event.target || event.currentTarget;
      const value = target.value;
      if (value !== undefined && value !== null) {
        setStyling((prev) => ({ ...prev, [fieldName]: value }));
      }
    };

    // Așteaptă ca elementele să fie în DOM
    const timeoutId = setTimeout(() => {
      // Adaugă listeners pentru text fields
      const textFields = document.querySelectorAll('s-text-field');
      const textHandlers = new Map();
      
      textFields.forEach((field) => {
        const name = field.getAttribute('name');
        if (name && ['headingFontSize', 'headingFontWeight', 'textFontSize', 'borderWidth', 'borderRadius', 'padding'].includes(name)) {
          const inputHandler = (e) => handleInputChange(e, name);
          const changeHandler = (e) => handleInputChange(e, name);
          
          field.addEventListener('input', inputHandler);
          field.addEventListener('change', changeHandler);
          
          textHandlers.set(field, { input: inputHandler, change: changeHandler });
        }
      });

      // Adaugă listeners pentru select fields
      const selectFields = document.querySelectorAll('s-select');
      const selectHandlers = new Map();
      
      selectFields.forEach((field) => {
        const name = field.getAttribute('name');
        if (name && ['headingFontFamily', 'textFontFamily', 'borderStyle'].includes(name)) {
          const changeHandler = (e) => handleInputChange(e, name);
          field.addEventListener('change', changeHandler);
          selectHandlers.set(field, { change: changeHandler });
        }
      });

      // Cleanup function va fi apelată când se demontează componenta
      window.__templateEditorCleanup = () => {
        textHandlers.forEach((handlers, field) => {
          field.removeEventListener('input', handlers.input);
          field.removeEventListener('change', handlers.change);
        });
        selectHandlers.forEach((handlers, field) => {
          field.removeEventListener('change', handlers.change);
        });
      };
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (window.__templateEditorCleanup) {
        window.__templateEditorCleanup();
        delete window.__templateEditorCleanup;
      }
    };
  }, []); // Rulează o singură dată la mount

  // (redirect handled by the unified effect above)

  // Elimină complet scroll-ul modal-ului principal - doar container-ul de metafield-uri are scroll
  useEffect(() => {
    if (openSelectIndex === null) return;

    // Așteaptă ca modal-ul să fie complet renderat
    const timeoutId = setTimeout(() => {
      // Găsește modal-ul App Bridge
      const modalElement = document.getElementById(`metafield-selector-modal-${openSelectIndex}`);
      if (!modalElement) return;

      // Găsește iframe-ul modal-ului (App Bridge modals sunt renderate într-un iframe)
      const modalIframe = modalElement.querySelector('iframe');
      if (!modalIframe) return;

      const iframeWindow = modalIframe.contentWindow;
      if (iframeWindow && iframeWindow.document) {
        // Setează overflow: hidden pe body și html pentru a elimina complet scroll-ul modal-ului
        if (iframeWindow.document.body) {
          iframeWindow.document.body.style.overflow = 'hidden';
          iframeWindow.document.body.style.height = '100%';
          iframeWindow.document.body.style.margin = '0';
          iframeWindow.document.body.style.padding = '0';
        }
        if (iframeWindow.document.documentElement) {
          iframeWindow.document.documentElement.style.overflow = 'hidden';
          iframeWindow.document.documentElement.style.height = '100%';
          iframeWindow.document.documentElement.style.margin = '0';
          iframeWindow.document.documentElement.style.padding = '0';
        }

        // Forțează scroll position la 0 și previne orice scroll
        const forceScrollToTop = () => {
          if (iframeWindow.pageYOffset !== 0 || iframeWindow.document.documentElement.scrollTop !== 0) {
            iframeWindow.scrollTo(0, 0);
            iframeWindow.document.documentElement.scrollTop = 0;
            iframeWindow.document.body.scrollTop = 0;
          }
        };

        // Adaugă event listener pentru a forța scroll la 0
        const scrollHandler = () => {
          forceScrollToTop();
        };

        iframeWindow.addEventListener('scroll', scrollHandler, true);
        iframeWindow.document.addEventListener('scroll', scrollHandler, true);

        // Forțează scroll la 0 imediat și periodic pentru a fi sigur
        forceScrollToTop();
        const intervalId = setInterval(forceScrollToTop, 100);

        return () => {
          clearInterval(intervalId);
          iframeWindow.removeEventListener('scroll', scrollHandler, true);
          iframeWindow.document.removeEventListener('scroll', scrollHandler, true);
          if (iframeWindow.document.body) {
            iframeWindow.document.body.style.overflow = '';
            iframeWindow.document.body.style.height = '';
            iframeWindow.document.body.style.margin = '';
            iframeWindow.document.body.style.padding = '';
          }
          if (iframeWindow.document.documentElement) {
            iframeWindow.document.documentElement.style.overflow = '';
            iframeWindow.document.documentElement.style.height = '';
            iframeWindow.document.documentElement.style.margin = '';
            iframeWindow.document.documentElement.style.padding = '';
          }
        };
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [openSelectIndex]);

  const addSection = () => {
    const newIndex = sections.length;
    setSections([...sections, { heading: "", metafields: [] }]);
    // Selectează automat noua secțiune
    setSelectedSectionIndex(newIndex);
  };

  const removeSection = (index) => {
    const newSections = sections.filter((_, i) => i !== index);
    setSections(newSections);
    // Ajustează selectedSectionIndex dacă este necesar
    if (selectedSectionIndex >= newSections.length) {
      setSelectedSectionIndex(Math.max(0, newSections.length - 1));
    } else if (selectedSectionIndex > index) {
      setSelectedSectionIndex(selectedSectionIndex - 1);
    }
  };

  const updateSectionHeading = (index, heading) => {
    const newSections = [...sections];
    newSections[index].heading = heading;
    setSections(newSections);
  };


  const addMetafieldToSection = (sectionIndex, metafieldId) => {
    if (!metafieldId) return;
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields) {
      newSections[sectionIndex].metafields = [];
    }
    newSections[sectionIndex].metafields.push({
      type: 'metafield',
      metafieldDefinitionId: metafieldId,
      productSpecType: null,
      customName: null,
      tooltipEnabled: false,
      tooltipText: null,
      hideFromPC: false,
      hideFromMobile: false,
      prefix: null,
      suffix: null,
    });
    setSections(newSections);
  };

  const addProductSpecToSection = (sectionIndex, productSpecType) => {
    if (!productSpecType) return;
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields) {
      newSections[sectionIndex].metafields = [];
    }
    // Verifică dacă product spec-ul de acest tip există deja în secțiune
    const alreadyExists = newSections[sectionIndex].metafields.some(
      mf => mf.type === 'product_spec' && mf.productSpecType === productSpecType
    );
    if (alreadyExists) {
      shopify.toast.show(`Product specification "${productSpecType}" already exists in this section`, { isError: true });
      return;
    }
    newSections[sectionIndex].metafields.push({
      type: 'product_spec',
      metafieldDefinitionId: null,
      productSpecType: productSpecType,
      customName: null,
      tooltipEnabled: false,
      tooltipText: null,
      hideFromPC: false,
      hideFromMobile: false,
      prefix: null,
      suffix: null,
    });
    setSections(newSections);
    setOpenProductSpecIndex(null);
  };

  const addCustomSpecToSection = (sectionIndex) => {
    if (!customSpecName || !customSpecValue) {
      shopify.toast.show("Please enter both name and value for the custom specification", { isError: true });
      return;
    }
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields) {
      newSections[sectionIndex].metafields = [];
    }
    // Verifică dacă custom spec-ul cu același nume există deja în secțiune
    const alreadyExists = newSections[sectionIndex].metafields.some(
      mf => mf.type === 'custom_spec' && mf.customName === customSpecName.trim()
    );
    if (alreadyExists) {
      shopify.toast.show(`Custom specification "${customSpecName.trim()}" already exists in this section`, { isError: true });
      return;
    }
    newSections[sectionIndex].metafields.push({
      type: 'custom_spec',
      metafieldDefinitionId: null,
      productSpecType: null,
      customValue: customSpecValue.trim(),
      customName: customSpecName.trim(),
      tooltipEnabled: false,
      tooltipText: null,
      hideFromPC: false,
      hideFromMobile: false,
      prefix: null,
      suffix: null,
    });
    setSections(newSections);
    setOpenCustomSpecIndex(null);
    setCustomSpecName("");
    setCustomSpecValue("");
  };

  const toggleMetafieldSelection = (sectionIndex, metafieldId) => {
    const key = `${sectionIndex}_${metafieldId}`;
    setSelectedMetafieldsForSection((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const addSelectedMetafieldsToSection = (sectionIndex) => {
    const availableMetafields = getAvailableMetafields(sectionIndex);
    const selectedIds = availableMetafields
      .filter((mf) => selectedMetafieldsForSection[`${sectionIndex}_${mf.id}`])
      .map((mf) => mf.id);

    if (selectedIds.length === 0) return;

    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields) {
      newSections[sectionIndex].metafields = [];
    }

    selectedIds.forEach((id) => {
      newSections[sectionIndex].metafields.push({
        type: 'metafield',
        metafieldDefinitionId: id,
        productSpecType: null,
        customName: null,
        tooltipEnabled: false,
        tooltipText: null,
        hideFromPC: false,
        hideFromMobile: false,
        prefix: null,
        suffix: null,
      });
      // Șterge selecția după adăugare
      delete selectedMetafieldsForSection[`${sectionIndex}_${id}`];
    });

    setSections(newSections);
    setSelectedMetafieldsForSection({ ...selectedMetafieldsForSection });
  };

  const removeMetafieldFromSection = (sectionIndex, metafieldIndex) => {
    const newSections = [...sections];
    newSections[sectionIndex].metafields = newSections[
      sectionIndex
    ].metafields.filter((_, i) => i !== metafieldIndex);
    setSections(newSections);
  };

  const reorderMetafields = (sectionIndex, dragIndex, dropIndex) => {
    if (dragIndex === dropIndex) return;
    
    const newSections = [...sections];
    const metafields = [...newSections[sectionIndex].metafields];
    const [draggedItem] = metafields.splice(dragIndex, 1);
    metafields.splice(dropIndex, 0, draggedItem);
    
    newSections[sectionIndex].metafields = metafields;
    setSections(newSections);
  };

  const reorderSections = (dragIndex, dropIndex) => {
    if (dragIndex === dropIndex) return;
    
    const newSections = [...sections];
    const [draggedSection] = newSections.splice(dragIndex, 1);
    newSections.splice(dropIndex, 0, draggedSection);
    
    setSections(newSections);
    
    // Actualizează selectedSectionIndex dacă este necesar
    if (selectedSectionIndex === dragIndex) {
      setSelectedSectionIndex(dropIndex);
    } else if (selectedSectionIndex > dragIndex && selectedSectionIndex <= dropIndex) {
      setSelectedSectionIndex(selectedSectionIndex - 1);
    } else if (selectedSectionIndex < dragIndex && selectedSectionIndex >= dropIndex) {
      setSelectedSectionIndex(selectedSectionIndex + 1);
    }
  };

  const updateMetafieldData = (sectionIndex, metafieldIndex, data) => {
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields[metafieldIndex]) {
      return;
    }
    
    // Tratează valorile goale corect
    const customName = data.customName && data.customName.trim() !== "" ? data.customName.trim() : null;
    const customValue = data.customValue && data.customValue.trim() !== "" ? data.customValue.trim() : null;
    const tooltipText = data.tooltipText && data.tooltipText.trim() !== "" ? data.tooltipText.trim() : null;
    const prefix = data.prefix && data.prefix.trim() !== "" ? data.prefix.trim() : null;
    const suffix = data.suffix && data.suffix.trim() !== "" ? data.suffix.trim() : null;
    
    // Logica mutually exclusive: dacă unul este true, celălalt devine false
    let hideFromPC = data.hideFromPC || false;
    let hideFromMobile = data.hideFromMobile || false;
    
    if (hideFromPC && hideFromMobile) {
      // Dacă ambele sunt true, păstrează doar cel care a fost setat ultimul
      // Verifică care a fost setat în data
      if (data.hideFromPC === true && data.hideFromMobile === true) {
        // Dacă ambele sunt setate simultan, prioritate pentru hideFromPC
        hideFromMobile = false;
      }
    }
    
    newSections[sectionIndex].metafields[metafieldIndex] = {
      ...newSections[sectionIndex].metafields[metafieldIndex],
      customName,
      customValue: newSections[sectionIndex].metafields[metafieldIndex].type === 'custom_spec' ? customValue : null,
      tooltipEnabled: data.tooltipEnabled || false,
      tooltipText,
      hideFromPC,
      hideFromMobile,
      prefix,
      suffix,
    };
    setSections(newSections);
    // Incrementează formKey pentru a forța re-renderizarea formularului și hidden inputs-urilor
    setFormKey(prev => prev + 1);
    setEditingMetafield(null);
    setMetafieldEditData({ customName: "", customValue: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false, prefix: "", suffix: "" });
  };

  const getAvailableMetafields = (sectionIndex) => {
    if (!metafieldDefinitions || metafieldDefinitions.length === 0) {
      return [];
    }

    const usedIds = new Set();
    sections.forEach((section) => {
      section.metafields?.forEach((mf) => {
        if (mf.metafieldDefinitionId) {
          usedIds.add(mf.metafieldDefinitionId);
        }
      });
    });

    if (!metafieldDefinitions || metafieldDefinitions.length === 0) {
      return [];
    }

    return metafieldDefinitions.filter((mf) => !usedIds.has(mf.id));
  };

  // Memoizează rezultatele filtrate pentru fiecare secțiune
  const getFilteredMetafields = useCallback((sectionIndex) => {
    const available = getAvailableMetafields(sectionIndex);
    const searchTerm = (metafieldSearchTerm[sectionIndex] || "").toLowerCase().trim();
    
    let filtered = available;
    
    if (searchTerm) {
      filtered = available.filter((mf) => {
        const name = (mf.name || "").toLowerCase();
        const namespace = (mf.namespace || "").toLowerCase();
        const key = (mf.key || "").toLowerCase();
        const ownerType = (mf.ownerType || "").toLowerCase();
        const fullKey = `${namespace}.${key}`.toLowerCase();
        
        return (
          name.includes(searchTerm) ||
          namespace.includes(searchTerm) ||
          key.includes(searchTerm) ||
          ownerType.includes(searchTerm) ||
          fullKey.includes(searchTerm)
        );
      });
    }

    // Sortează alfabetic: mai întâi după name (dacă există), apoi după namespace.key
    // Folosim spread operator pentru a nu modifica array-ul original
    return [...filtered].sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aKey = `${a.namespace || ""}.${a.key || ""}`.toLowerCase();
      const bKey = `${b.namespace || ""}.${b.key || ""}`.toLowerCase();
      
      // Dacă ambele au name, sortează după name
      if (aName && bName) {
        return aName.localeCompare(bName);
      }
      // Dacă doar a are name, a vine primul
      if (aName && !bName) {
        return -1;
      }
      // Dacă doar b are name, b vine primul
      if (!aName && bName) {
        return 1;
      }
      // Dacă niciunul nu are name, sortează după namespace.key
      return aKey.localeCompare(bKey);
    });
  }, [metafieldSearchTerm, sections, metafieldDefinitions]);

  // Component pentru modal-ul de selectare metafields (pentru a permite re-renderizare live)
  const MetafieldSelectorModal = ({ 
    sectionIndex, 
    openSelectIndex, 
    setOpenSelectIndex, 
    metafieldSearchTerm, 
    setMetafieldSearchTerm,
    getAvailableMetafields,
    getFilteredMetafields,
    selectedMetafieldsForSection,
    toggleMetafieldSelection,
    addSelectedMetafieldsToSection,
    setSelectedMetafieldsForSection,
    navigate
  }) => {
    // Memoizează lista filtrată pentru a re-renderiza automat când se schimbă searchTerm
    const searchValue = metafieldSearchTerm[sectionIndex] || "";
    const filteredList = useMemo(() => {
      return getFilteredMetafields(sectionIndex);
    }, [getFilteredMetafields, sectionIndex, metafieldSearchTerm[sectionIndex]]);
    
    return (
      <Modal
        id={`metafield-selector-modal-${sectionIndex}`}
        open={openSelectIndex === sectionIndex}
        variant="large"
        onClose={() => {
          setOpenSelectIndex(null);
          // Resetează selecțiile pentru această secțiune
          const newSelected = { ...selectedMetafieldsForSection };
          getAvailableMetafields(sectionIndex).forEach((mf) => {
            delete newSelected[`${sectionIndex}_${mf.id}`];
          });
          setSelectedMetafieldsForSection(newSelected);
        }}
      >
        <div style={{ padding: "20px", height: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ marginBottom: "16px", flexShrink: 0 }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "18px", fontWeight: "600" }}>
              Select metafields ({getAvailableMetafields(sectionIndex).length} available)
            </h2>
            <s-text-field
              label="Search metafields"
              value={searchValue}
              onChange={(e) => {
                // Pentru Polaris Web Components, folosim currentTarget.value
                const value = e.currentTarget?.value ?? e.target?.value ?? "";
                setMetafieldSearchTerm((prev) => ({
                  ...prev,
                  [sectionIndex]: value,
                }));
              }}
              placeholder="Search by name, namespace, key..."
              autoComplete="off"
            />
          </div>
          <div
            style={{ 
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              border: "1px solid #e1e3e5",
              borderRadius: "4px",
              padding: "12px",
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "#6d7175" }}>
                {searchValue 
                  ? "No metafields found that match the search"
                  : "No metafields available"}
              </div>
            ) : (
              <div 
                key={`metafield-list-container-${sectionIndex}-${searchValue}`}
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {filteredList.map((mf) => {
                  const isSelected =
                    selectedMetafieldsForSection[
                      `${sectionIndex}_${mf.id}`
                    ];
                  const metafieldLabel = `${mf.namespace}.${mf.key} (${mf.ownerType})${mf.name ? ` - ${mf.name}` : ""}`;
                  return (
                    <s-checkbox
                      key={`${sectionIndex}-${mf.id}`}
                      checked={isSelected || false}
                      onChange={() =>
                        toggleMetafieldSelection(
                          sectionIndex,
                          mf.id
                        )
                      }
                      label={metafieldLabel}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#f6f6f7", borderRadius: "4px", fontSize: "13px", color: "#6d7175", flexShrink: 0 }}>
            If you are not able to see a specific metafield already created in the store in this list, please{" "}
            <a 
              href="/app/sync" 
              style={{ color: "#008060", textDecoration: "underline", cursor: "pointer" }}
              onClick={(e) => {
                e.preventDefault();
                setOpenSelectIndex(null);
                navigate("/app/sync");
              }}
            >
              Sync metafields from this page → Data Sync
            </a>
          </div>
        </div>
        <TitleBar title="Select Metafields">
          <button
            variant="primary"
            onClick={() => {
              addSelectedMetafieldsToSection(sectionIndex);
              setOpenSelectIndex(null);
            }}
          >
            Add Selected
          </button>
          <button
            onClick={() => {
              setOpenSelectIndex(null);
              // Resetează selecțiile pentru această secțiune
              const newSelected = { ...selectedMetafieldsForSection };
              getAvailableMetafields(sectionIndex).forEach((mf) => {
                delete newSelected[`${sectionIndex}_${mf.id}`];
              });
              setSelectedMetafieldsForSection(newSelected);
            }}
          >
            Cancel
          </button>
        </TitleBar>
      </Modal>
    );
  };

  // Component pentru secțiune accordion
  const AccordionSection = ({ section, sectionIndex, styling, metafieldDefinitions, renderMetafieldRow, globalIndexOffset }) => {
    const [isOpen, setIsOpen] = useState(sectionIndex === 0);
    
    return (
      <div style={{ marginBottom: "20px" }}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            color: currentStyling.headingColor,
            fontSize: currentStyling.headingFontSize,
            fontWeight: currentStyling.headingFontWeight,
            fontFamily: currentStyling.headingFontFamily,
            cursor: "pointer",
            padding: "10px",
            backgroundColor: currentStyling.backgroundColor,
            borderBottom: `1px solid ${currentStyling.specificationTextColor || currentStyling.valueTextColor || "#000000"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            userSelect: "none",
          }}
        >
          <span>{section.heading}</span>
          <span
            style={{
              display: "inline-block",
              transition: "transform 0.3s ease",
              fontSize: "14px",
              marginLeft: "10px",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
        {isOpen && section.metafields && section.metafields.length > 0 && (
          <div style={{ padding: "10px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
              <tbody>
                {section.metafields.map((metafield, mfIndex) => {
                  const globalIndex = globalIndexOffset + mfIndex;
                  return renderMetafieldRow(metafield, globalIndex);
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Component pentru preview
  const PreviewTable = ({ styling, sections, isAccordion, seeMoreEnabled, splitViewPerSection = false, splitViewPerMetafield = false, tableName = "Specifications", isCollapsible = false, collapsibleOnPC = false, collapsibleOnMobile = false, selectedDevice = "desktop" }) => {
    const [showAll, setShowAll] = useState(!seeMoreEnabled);
    const [isCollapsed, setIsCollapsed] = useState(true);
    // State pentru accordion: fiecare secțiune poate fi deschisă sau închisă
    const [openSections, setOpenSections] = useState(() => {
      // Prima secțiune este deschisă by default
      const initial = {};
      if (sections.length > 0) {
        initial[0] = true;
      }
      return initial;
    });
    
    // Funcție pentru toggle accordion
    const toggleSection = (sectionIdx) => {
      setOpenSections(prev => ({
        ...prev,
        [sectionIdx]: !prev[sectionIdx]
      }));
    };
    
    // Colectează toate metafields-urile din toate secțiunile cu informații despre secțiune
    const allMetafieldsWithSection = sections.flatMap((section, sectionIndex) => 
      (section.metafields || []).map((metafield, mfIndex) => ({
        ...metafield,
        sectionIndex,
        sectionHeading: section.heading,
        mfIndex,
      }))
    );
    
    // Determină limita pentru "See More" bazată pe split view
    // Pentru splitViewPerMetafield: metafields-urile sunt distribuite în 2 coloane, deci 20 total (10 pe coloană)
    // Pentru splitViewPerSection: secțiunile sunt distribuite în 2 coloane, deci trebuie să calculăm separat per coloană (10 pe coloană)
    const seeMoreLimit = splitViewPerMetafield ? 20 : (splitViewPerSection ? 20 : 10);
    
    const totalRows = allMetafieldsWithSection.length;
    const displayRows = seeMoreEnabled && !showAll ? allMetafieldsWithSection.slice(0, seeMoreLimit) : allMetafieldsWithSection;
    const hasMore = seeMoreEnabled && totalRows > seeMoreLimit;
    
    // Grupează toate metafields-urile pe secțiuni (nu doar cele afișate)
    const allGroupedBySection = {};
    allMetafieldsWithSection.forEach(item => {
      if (!allGroupedBySection[item.sectionIndex]) {
        allGroupedBySection[item.sectionIndex] = {
          heading: item.sectionHeading,
          allMetafields: [],
          displayMetafields: [],
          hiddenMetafields: [],
        };
      }
      allGroupedBySection[item.sectionIndex].allMetafields.push(item);
    });
    
    // Distribuie metafields-urile în display și hidden
    displayRows.forEach(item => {
      allGroupedBySection[item.sectionIndex].displayMetafields.push(item);
    });
    
    if (hasMore) {
      const hiddenRows = allMetafieldsWithSection.slice(seeMoreLimit);
      hiddenRows.forEach(item => {
        allGroupedBySection[item.sectionIndex].hiddenMetafields.push(item);
      });
    }
    
    const currentStyling = getCurrentDeviceStyling();
    
    const containerStyle = {
      backgroundColor: currentStyling.backgroundColor,
      color: currentStyling.specificationTextColor || currentStyling.valueTextColor || "#000000", // Fallback pentru backward compatibility
      borderWidth: currentStyling.borderWidth,
      borderColor: currentStyling.sectionBorderEnabled ? currentStyling.sectionBorderColor : "transparent",
      borderStyle: currentStyling.sectionBorderEnabled ? currentStyling.sectionBorderStyle : "none",
      borderRadius: currentStyling.borderRadius,
      padding: currentStyling.padding,
      fontFamily: currentStyling.textFontFamily,
      fontSize: currentStyling.textFontSize,
      // New styling features
      width: (currentStyling.tableWidth || '100') + '%',
      marginTop: (currentStyling.tableMarginTop || '0') + 'px',
      marginBottom: (currentStyling.tableMarginBottom || '0') + 'px',
    };

    const headingStyle = {
      color: currentStyling.headingColor,
      fontSize: currentStyling.headingFontSize,
      fontWeight: currentStyling.headingFontWeight,
      fontFamily: currentStyling.headingFontFamily,
      // New styling features
      textAlign: currentStyling.headerTextAlign || 'left',
      ...(currentStyling.headerBottomBorderEnabled ? {
        borderBottom: (currentStyling.headerBottomBorderWidth || '1px') + ' ' + (currentStyling.headerBottomBorderStyle || 'solid') + ' ' + (currentStyling.headerBottomBorderColor || '#000000'),
      } : {}),
    };

    const renderMetafieldRow = (metafield, globalIndex) => {
      const isProductSpec = metafield.type === 'product_spec';
      const isCustomSpec = metafield.type === 'custom_spec';
      const mfDef = !isProductSpec && !isCustomSpec ? metafieldDefinitions?.find(
        (mf) => mf.id === metafield.metafieldDefinitionId
      ) : null;
      
      // Dacă este product spec sau custom spec, folosește numele corespunzător
      let metafieldName;
      if (isCustomSpec) {
        metafieldName = metafield.customName || "Custom Specification";
      } else if (isProductSpec) {
        const productSpecLabels = {
          'vendor': 'Vendor',
          'inventory_quantity': 'Stock Quantity',
          'weight': 'Weight',
          'sku': 'SKU',
          'barcode': 'Barcode / EAN',
          'variant_sku': 'Variant SKU',
          'compare_at_price': 'Compare at price',
          'product_type': 'Product Category',
          'collection_names': 'Collection name'
        };
        metafieldName = metafield.customName || productSpecLabels[metafield.productSpecType] || metafield.productSpecType || "Product Specification";
      } else {
        metafieldName = metafield.customName 
          ? metafield.customName
          : (mfDef
              ? (mfDef.name || `${mfDef.namespace}.${mfDef.key}`)
              : "Metafield");
      }
      const isOdd = globalIndex % 2 === 0;
      
      // NOUA LOGICĂ: Column background (Odd/Even) sau Row background (Odd/Even)
      // Mutual exclusivity: dacă column e activat, row nu poate fi activat și invers
      let specBackground, valueBackground;
      if (styling.columnBackgroundEnabled) {
        // Column background: prima coloană (spec) = odd, a doua coloană (value) = even
        specBackground = styling.oddColumnBackgroundColor;
        valueBackground = styling.evenColumnBackgroundColor;
      } else if (styling.rowBackgroundEnabled) {
        // Row background: ambele coloane au același background bazat pe rând
        const rowBackground = isOdd ? styling.oddRowBackgroundColor : styling.evenRowBackgroundColor;
        specBackground = rowBackground;
        valueBackground = rowBackground;
      } else {
        // Background TD standard
        specBackground = styling.tdBackgroundColor;
        valueBackground = styling.tdBackgroundColor;
      }
      
      return (
        <tr 
          key={`${metafield.sectionIndex}-${metafield.mfIndex}`} 
          style={{ 
            borderBottom: styling.rowBorderEnabled ? `${styling.rowBorderWidth} ${styling.rowBorderStyle} ${styling.rowBorderColor}` : "none",
            // New: specSpacing (row padding)
            paddingTop: (styling.specSpacing || '10') + 'px',
            paddingBottom: (styling.specSpacing || '10') + 'px',
          }}
        >
          <td
            style={{
              padding: "8px",
              fontWeight: "bold",
              width: (styling.columnRatio || '40') + '%', // Use columnRatio instead of fixed 40%
              color: styling.specificationTextColor || "#000000",
              fontFamily: styling.textFontFamily,
              fontSize: styling.textFontSize,
              backgroundColor: specBackground,
              textTransform: styling.textTransform,
              paddingTop: (styling.specSpacing || '10') + 'px',
              paddingBottom: (styling.specSpacing || '10') + 'px',
            }}
          >
            {metafieldName}
            {metafield.tooltipEnabled && metafield.tooltipText && (
              <span 
                title={metafield.tooltipText} 
                style={{ 
                  marginLeft: "8px", 
                  cursor: "help",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  backgroundColor: "#202223",
                  color: "#ffffff",
                  fontSize: "11px",
                  fontWeight: "bold",
                  lineHeight: "1",
                  verticalAlign: "middle"
                }}
              >
                i
              </span>
            )}
            :
          </td>
          <td
            style={{
              padding: "8px",
              color: currentStyling.valueTextColor || "#000000",
              fontFamily: currentStyling.textFontFamily,
              fontSize: currentStyling.textFontSize,
              backgroundColor: valueBackground,
              textTransform: currentStyling.textTransform,
              paddingTop: (currentStyling.specSpacing || '10') + 'px',
              paddingBottom: (currentStyling.specSpacing || '10') + 'px',
            }}
          >
            {isCustomSpec ? (
              metafield.customValue || 'Example value'
            ) : isProductSpec ? (
              (() => {
                const exampleValues = {
                  'vendor': 'Example Vendor',
                  'inventory_quantity': '100',
                  'weight': '1.5 kg',
                  'sku': 'SKU-12345',
                  'barcode': '1234567890123',
                  'variant_sku': 'VAR-SKU-12345',
                  'compare_at_price': '$99.99',
                  'product_type': 'Example Type',
                  'collection_names': 'Collection 1, Collection 2'
                };
                return exampleValues[metafield.productSpecType] || 'Example value';
              })()
            ) : 'Example value'}
          </td>
        </tr>
      );
    };

    const arrowDownSvg = (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease" }}>
        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
              
              return (
      <div style={containerStyle}>
          {/* Header cu numele tabelului și butonul de collapsible */}
          {isCollapsible ? (
          <div style={{ marginBottom: "15px", borderBottom: "2px solid #e1e3e5", paddingBottom: "10px" }}>
            <div 
              onClick={() => setIsCollapsed(!isCollapsed)}
                  style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                    cursor: "pointer",
                userSelect: "none",
                padding: "10px",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f6f6f7"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <span style={headingStyle}>{tableName}</span>
              <span style={{ 
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                transition: "transform 0.3s ease",
                transform: isCollapsed ? "rotate(0deg)" : "rotate(180deg)",
                marginLeft: "10px"
              }}>
                {arrowDownSvg}
              </span>
              </div>
          </div>
        ) : (
          <div style={{ marginBottom: "15px", borderBottom: "2px solid #e1e3e5", paddingBottom: "10px" }}>
            <h2 style={{ ...headingStyle, margin: 0 }}>{tableName}</h2>
          </div>
        )}
        
        {/* Conținutul tabelului (collapsible sau nu) */}
        <div style={{
          overflow: "hidden",
          transition: "max-height 0.3s ease, opacity 0.3s ease",
          maxHeight: isCollapsible && isCollapsed ? "0" : "10000px",
          opacity: isCollapsible && isCollapsed ? 0 : 1,
          position: "relative",
        }}>
        {sections.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: styling.specificationTextColor || styling.valueTextColor || "#000000" }}>
            <p>Add sections to see the preview</p>
          </div>
        ) : (() => {
          // Logica pentru Split View per Section cu distribuție echilibrată
          let leftColumnSections = [];
          let rightColumnSections = [];
          let finalHasMore = hasMore;
          
          if (splitViewPerSection) {
            // Calculează numărul de metafields pentru fiecare secțiune
            const sectionsWithCount = Object.keys(allGroupedBySection)
              .map(sectionIndex => {
              const sectionIdx = parseInt(sectionIndex);
                const sectionData = allGroupedBySection[sectionIndex];
                return {
                  sectionIndex: sectionIdx,
                  sectionData,
                  metafieldCount: sectionData.allMetafields.length
                };
              })
              .sort((a, b) => a.sectionIndex - b.sectionIndex);

            // Funcție helper pentru a calcula suma metafields-urilor
            const getTotalCount = (sections) => sections.reduce((sum, s) => sum + s.metafieldCount, 0);

            // Găsește cea mai echilibrată distribuție folosind backtracking pentru până la 10 secțiuni
            let bestLeft = [];
            let bestRight = [];
            let bestDiff = Infinity;

            function findBestDistribution(index, left, right) {
              if (index >= sectionsWithCount.length) {
                const leftTotal = getTotalCount(left);
                const rightTotal = getTotalCount(right);
                const diff = Math.abs(leftTotal - rightTotal);
                
                if (diff < bestDiff || (diff === bestDiff && left.length > 0 && left[0].sectionIndex < bestLeft[0]?.sectionIndex)) {
                  bestDiff = diff;
                  bestLeft = [...left];
                  bestRight = [...right];
                }
                return;
              }

              const currentSection = sectionsWithCount[index];
              const leftTotal = getTotalCount(left);
              const rightTotal = getTotalCount(right);

              if (Math.abs(leftTotal - rightTotal) > bestDiff + currentSection.metafieldCount) {
                return;
              }

              findBestDistribution(index + 1, [...left, currentSection], right);
              findBestDistribution(index + 1, left, [...right, currentSection]);
            }

            if (sectionsWithCount.length <= 10) {
              findBestDistribution(0, [], []);
            } else {
              // Fallback la algoritm greedy pentru multe secțiuni
              bestLeft = [];
              bestRight = [];
              let leftColumnTotal = 0;
              let rightColumnTotal = 0;

              sectionsWithCount.forEach(section => {
                if (leftColumnTotal <= rightColumnTotal) {
                  bestLeft.push(section);
                  leftColumnTotal += section.metafieldCount;
                } else {
                  bestRight.push(section);
                  rightColumnTotal += section.metafieldCount;
                }
              });
            }

            leftColumnSections = bestLeft.sort((a, b) => a.sectionIndex - b.sectionIndex);
            rightColumnSections = bestRight.sort((a, b) => a.sectionIndex - b.sectionIndex);

            // Pentru splitViewPerSection, recalculăm displayMetafields per coloană (10 per coloană)
            if (seeMoreEnabled && splitViewPerSection) {
              const perColumnLimit = 10;
              
              let leftColumnMetafieldsCount = 0;
              leftColumnSections.forEach(({ sectionIndex }) => {
                const sectionData = allGroupedBySection[sectionIndex];
                if (leftColumnMetafieldsCount < perColumnLimit) {
                  const remaining = perColumnLimit - leftColumnMetafieldsCount;
                  const displayCount = Math.min(remaining, sectionData.allMetafields.length);
                  sectionData.displayMetafields = sectionData.allMetafields.slice(0, displayCount);
                  sectionData.hiddenMetafields = sectionData.allMetafields.slice(displayCount);
                  leftColumnMetafieldsCount += displayCount;
                } else {
                  sectionData.displayMetafields = [];
                  sectionData.hiddenMetafields = sectionData.allMetafields;
                }
              });
              
              let rightColumnMetafieldsCount = 0;
              rightColumnSections.forEach(({ sectionIndex }) => {
                const sectionData = allGroupedBySection[sectionIndex];
                if (rightColumnMetafieldsCount < perColumnLimit) {
                  const remaining = perColumnLimit - rightColumnMetafieldsCount;
                  const displayCount = Math.min(remaining, sectionData.allMetafields.length);
                  sectionData.displayMetafields = sectionData.allMetafields.slice(0, displayCount);
                  sectionData.hiddenMetafields = sectionData.allMetafields.slice(displayCount);
                  rightColumnMetafieldsCount += displayCount;
                } else {
                  sectionData.displayMetafields = [];
                  sectionData.hiddenMetafields = sectionData.allMetafields;
                }
              });
              
              finalHasMore = leftColumnSections.some(({ sectionIndex }) => {
                const sectionData = allGroupedBySection[sectionIndex];
                return sectionData.hiddenMetafields.length > 0;
              }) || rightColumnSections.some(({ sectionIndex }) => {
                const sectionData = allGroupedBySection[sectionIndex];
                return sectionData.hiddenMetafields.length > 0;
              });
            }
          }

          // Funcție helper pentru a randa o secțiune
          const renderSection = (sectionData, sectionIdx, forceShow = false) => {
            // Calculează metafields-urile de afișat
            // Dacă showAll este true sau forceShow este true, afișăm toate metafields-urile
            const metafieldsToShow = (showAll || forceShow)
              ? sectionData.allMetafields
              : sectionData.displayMetafields;
            
            // Verifică dacă există metafields de afișat
            const hasMetafieldsToShow = metafieldsToShow && metafieldsToShow.length > 0;
            
            // IMPORTANT: Afișăm secțiunea DOAR dacă are metafields de afișat
            // Dacă toate metafields-urile sunt hidden și showAll este false, secțiunea nu se afișează deloc
            if (!hasMetafieldsToShow) {
              return null;
            }

            // Verifică dacă accordion este activat și dacă secțiunea este deschisă
            const isSectionOpen = openSections[sectionIdx] !== false; // Default true pentru prima secțiune
            const showAccordion = isAccordion;

            // Render conținutul secțiunii (tabelul)
            const renderSectionContent = () => {
              // Pentru splitViewPerMetafield, calculăm odd/even separat pentru fiecare coloană
              if (splitViewPerMetafield) {
                const leftColumnMetafields = metafieldsToShow.filter((_, mfIdx) => mfIdx % 2 === 0);
                const rightColumnMetafields = metafieldsToShow.filter((_, mfIdx) => mfIdx % 2 === 1);
                
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "10px" }}>
                    <div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {leftColumnMetafields.map((metafield, idx) => {
                            // Calculează odd/even bazat pe index-ul din array-ul filtrat (doar metafields-urile afișate)
                            const visibleIndex = idx;
                            return renderMetafieldRow(metafield, visibleIndex);
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {rightColumnMetafields.map((metafield, idx) => {
                            // Calculează odd/even bazat pe index-ul din array-ul filtrat (doar metafields-urile afișate)
                            const visibleIndex = idx;
                            return renderMetafieldRow(metafield, visibleIndex);
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              } else {
                // Pentru cazul normal, calculăm odd/even bazat pe index-ul din metafieldsToShow
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                    <tbody>
                      {metafieldsToShow.map((metafield, idx) => {
                        // Calculează odd/even bazat pe index-ul din array-ul de metafields afișate
                        const visibleIndex = idx;
                        return renderMetafieldRow(metafield, visibleIndex);
                      })}
                    </tbody>
                  </table>
                );
              }
            };

            return (
              <div key={sectionIdx} style={{ marginBottom: "20px" }}>
                {showAccordion ? (
                  <>
                    {/* Header clickable pentru accordion */}
                    <div
                      onClick={() => toggleSection(sectionIdx)}
                      style={{
                        cursor: "pointer",
                        padding: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: styling.headerBottomBorderEnabled 
                          ? `${styling.headerBottomBorderWidth || '1px'} ${styling.headerBottomBorderStyle || 'solid'} ${styling.headerBottomBorderColor || '#000000'}`
                          : `1px solid ${styling.specificationTextColor || styling.valueTextColor || "#000000"}`,
                        backgroundColor: styling.backgroundColor || "#ffffff",
                        fontSize: styling.headingFontSize || "18px",
                        fontWeight: styling.headingFontWeight || "bold",
                        fontFamily: styling.headingFontFamily || "inherit",
                        color: styling.headingColor || "#000000",
                        textAlign: styling.headerTextAlign || "left",
                        userSelect: "none",
                        transition: "background-color 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f6f6f7";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = currentStyling.backgroundColor || "#ffffff";
                      }}
                    >
                      <span>{sectionData.heading}</span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "transform 0.3s ease",
                          transform: isSectionOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        {arrowDownSvg}
                      </span>
                    </div>
                    {/* Conținutul secțiunii (collapsible) */}
                    <div
                      style={{
                        display: isSectionOpen ? "block" : "none",
                        padding: "10px 0",
                      }}
                    >
                      {renderSectionContent()}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Header normal (non-accordion) */}
                    <h3 style={headingStyle}>{sectionData.heading}</h3>
                    {renderSectionContent()}
                  </>
                )}
              </div>
            );
          };

          // Când showAll este true, trebuie să afișăm și secțiunile care erau complet hidden
          // Colectează toate secțiunile care trebuie afișate
          const sectionsToRender = [];
          
          if (splitViewPerSection) {
            // Pentru split view per section, folosim distribuția calculată
            leftColumnSections.forEach(({ sectionIndex, sectionData }) => {
              sectionsToRender.push({ sectionIndex, sectionData, column: 'left' });
            });
            rightColumnSections.forEach(({ sectionIndex, sectionData }) => {
              sectionsToRender.push({ sectionIndex, sectionData, column: 'right' });
            });
            
            // Dacă showAll este true, adaugă și secțiunile care erau complet hidden
            if (showAll) {
              Object.keys(allGroupedBySection).forEach(sectionIndex => {
                const sectionIdx = parseInt(sectionIndex);
                const sectionData = allGroupedBySection[sectionIndex];
                // Verifică dacă secțiunea nu este deja în listă
                const alreadyIncluded = sectionsToRender.some(s => s.sectionIndex === sectionIdx);
                if (!alreadyIncluded && sectionData.hiddenMetafields.length > 0) {
                  // Determină în ce coloană ar trebui să fie bazat pe distribuția optimă
                  const maxLeftIndex = leftColumnSections.length > 0 ? Math.max(...leftColumnSections.map(s => s.sectionIndex)) : -1;
                  const minRightIndex = rightColumnSections.length > 0 ? Math.min(...rightColumnSections.map(s => s.sectionIndex)) : Infinity;
                  
                  if (sectionIdx <= maxLeftIndex || (sectionIdx < minRightIndex && leftColumnSections.length <= rightColumnSections.length)) {
                    sectionsToRender.push({ sectionIndex: sectionIdx, sectionData, column: 'left' });
                  } else {
                    sectionsToRender.push({ sectionIndex: sectionIdx, sectionData, column: 'right' });
                  }
                }
              });
            }
          } else {
            // Pentru view normal, adaugă toate secțiunile
            Object.keys(allGroupedBySection).forEach(sectionIndex => {
              const sectionIdx = parseInt(sectionIndex);
              const sectionData = allGroupedBySection[sectionIndex];
              sectionsToRender.push({ sectionIndex: sectionIdx, sectionData, column: null });
            });
          }

          return (
            <>
              {splitViewPerSection ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div>
                    {sectionsToRender
                      .filter(s => s.column === 'left')
                      .sort((a, b) => a.sectionIndex - b.sectionIndex)
                      .map(({ sectionIndex, sectionData }) => {
                        // Pentru secțiunile care erau complet hidden, forțăm afișarea când showAll este true
                        const forceShow = showAll && sectionData.displayMetafields.length === 0 && sectionData.hiddenMetafields.length > 0;
                        return renderSection(sectionData, sectionIndex, forceShow);
                      })}
                  </div>
                  <div>
                    {sectionsToRender
                      .filter(s => s.column === 'right')
                      .sort((a, b) => a.sectionIndex - b.sectionIndex)
                      .map(({ sectionIndex, sectionData }) => {
                        // Pentru secțiunile care erau complet hidden, forțăm afișarea când showAll este true
                        const forceShow = showAll && sectionData.displayMetafields.length === 0 && sectionData.hiddenMetafields.length > 0;
                        return renderSection(sectionData, sectionIndex, forceShow);
                      })}
                  </div>
                </div>
              ) : (
                <>
                  {sectionsToRender.map(({ sectionIndex, sectionData }) => {
                    // Pentru secțiunile care erau complet hidden, forțăm afișarea când showAll este true
                    const forceShow = showAll && sectionData.displayMetafields.length === 0 && sectionData.hiddenMetafields.length > 0;
                    return renderSection(sectionData, sectionIndex, forceShow);
                  })}
                </>
              )}
              {/* Fog overlay când See More este activat și există conținut hidden */}
              {seeMoreEnabled && finalHasMore && !showAll && (() => {
                // Extrage culoarea de background și o convertește pentru gradient
                const bgColor = styling.backgroundColor || "#ffffff";
                const rgbaColor = hexToRgba(bgColor);
                // Extrage valorile RGB din rgba
                const rgbMatch = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                const r = rgbMatch ? rgbMatch[1] : "255";
                const g = rgbMatch ? rgbMatch[2] : "255";
                const b = rgbMatch ? rgbMatch[3] : "255";
                
                return (
                  <div style={{
                    position: "absolute",
                    bottom: "60px", // Poziționat deasupra butonului "See More"
                    left: 0,
                    right: 0,
                    height: "80px",
                    background: `linear-gradient(to bottom, rgba(${r}, ${g}, ${b}, 0) 0%, rgba(${r}, ${g}, ${b}, 0.8) 50%, rgba(${r}, ${g}, ${b}, 1) 100%)`,
                    pointerEvents: "none",
                    zIndex: 1,
                  }} />
                );
              })()}
              {finalHasMore && !showAll && (
              <div style={{ textAlign: "center", marginTop: "12px", position: "relative", zIndex: 2 }}>
                <button
                  onClick={() => setShowAll(true)}
                  style={{
                      background: styling.seeMoreButtonBackground || "transparent",
                      border: styling.seeMoreButtonBorderEnabled 
                        ? `${styling.seeMoreButtonBorderWidth || "1px"} ${styling.seeMoreButtonBorderStyle || "solid"} ${styling.seeMoreButtonBorderColor || "#000000"}`
                        : "none",
                    cursor: "pointer",
                      padding: styling.seeMoreButtonPadding || "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                      gap: "8px",
                      color: styling.seeMoreButtonColor || "#000000",
                      fontSize: styling.seeMoreButtonFontSize || "14px",
                      fontFamily: styling.seeMoreButtonFontFamily || "Arial",
                      fontStyle: styling.seeMoreButtonFontStyle === "italic" || styling.seeMoreButtonFontStyle === "bold italic" ? "italic" : "normal",
                      fontWeight: styling.seeMoreButtonFontStyle === "bold" || styling.seeMoreButtonFontStyle === "bold italic" ? "bold" : "normal",
                      borderRadius: styling.seeMoreButtonBorderRadius || "0px",
                      width: "100%",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    {(styling.seeMoreButtonStyle === "arrow" || styling.seeMoreButtonStyle === "arrow+text") && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease", flexShrink: 0 }}>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                    )}
                    {(styling.seeMoreButtonStyle === "text" || styling.seeMoreButtonStyle === "arrow+text") && (
                      <span>{styling.seeMoreButtonText || "See More"}</span>
                    )}
                </button>
              </div>
            )}
            {finalHasMore && showAll && (
              <div style={{ textAlign: "center", marginTop: "12px", position: "relative", zIndex: 2 }}>
                <button
                  onClick={() => setShowAll(false)}
                  style={{
                      background: styling.seeMoreButtonBackground || "transparent",
                      border: styling.seeMoreButtonBorderEnabled 
                        ? `${styling.seeMoreButtonBorderWidth || "1px"} ${styling.seeMoreButtonBorderStyle || "solid"} ${styling.seeMoreButtonBorderColor || "#000000"}`
                        : "none",
                    cursor: "pointer",
                      padding: styling.seeMoreButtonPadding || "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                      gap: "8px",
                      color: styling.seeMoreButtonColor || "#000000",
                      fontSize: styling.seeMoreButtonFontSize || "14px",
                      fontFamily: styling.seeMoreButtonFontFamily || "Arial",
                      fontStyle: styling.seeMoreButtonFontStyle === "italic" || styling.seeMoreButtonFontStyle === "bold italic" ? "italic" : "normal",
                      fontWeight: styling.seeMoreButtonFontStyle === "bold" || styling.seeMoreButtonFontStyle === "bold italic" ? "bold" : "normal",
                      borderRadius: styling.seeMoreButtonBorderRadius || "0px",
                      width: "100%",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    {((styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "arrow" || (styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "arrow+text") && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease", flexShrink: 0, transform: "rotate(180deg)" }}>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                    )}
                    {((styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "text" || (styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "arrow+text") && (
                      <span>{styling.seeLessButtonText || "See Less"}</span>
                    )}
                </button>
              </div>
            )}
          </>
          );
        })()}
        </div> {/* Închide div-ul pentru conținutul collapsible */}
      </div>
    );
  };

  return (
    <s-page 
      heading={isNew ? "Create New Template" : `Edit: ${template?.name}`}
      inlineSize="large"
    >
      {/* SaveBar component with declarative control (Shopify recommended approach) */}
      {/* Don't render SaveBar until initial mount is complete */}
      {!isInitialMount.current && (
        <SaveBar id="save-bar" open={showSaveBar} discardConfirmation={true}>
          <button 
            variant="primary" 
            onClick={requestSubmitSaveForm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button 
            onClick={resetSaveForm}
            disabled={isSubmitting}
          >
            Discard
          </button>
        </SaveBar>
      )}

      {/* Loading overlay with spinner when saving */}
      {isSubmitting && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            backdropFilter: "blur(4px)",
            transition: "opacity 0.2s ease-in-out",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "32px 40px",
              minWidth: "320px",
              maxWidth: "400px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "20px",
              }}
            >
              <s-spinner size="large" />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <s-text 
                  emphasis="strong" 
                  style={{ 
                    fontSize: "18px",
                    color: "#202223",
                    fontWeight: "600",
                    lineHeight: "24px",
                    margin: 0,
                  }}
                >
                  Saving template...
                </s-text>
                <s-text 
                  style={{ 
                    fontSize: "14px",
                    color: "#6D7175",
                    lineHeight: "20px",
                    margin: 0,
                  }}
                >
                  Please wait while we save your changes
                </s-text>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner informativ pentru utilizatori noi (mai puțin de 2 template-uri assignate) */}
      {assignedTemplatesCount < 2 && (
        <s-section>
          <s-banner tone="info">
            <s-stack direction="block" gap="tight">
              <s-text emphasis="strong">💡 How to assign your template</s-text>
              <s-paragraph>
                In this page, you can configure all the settings for your specification table (structure, styling, and display options). 
                After you save your template, you'll be redirected to the Templates page where you can assign it to products, collections, or set it as global.
              </s-paragraph>
              <s-paragraph tone="subdued" style={{ fontSize: "13px", marginTop: "4px" }}>
                <strong>Next step:</strong> Once you save, go to the Templates page and use the assignment section to choose where this template should appear on your storefront.
              </s-paragraph>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      {/* Banner de eroare */}
      {actionData?.error && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner heading="Error" tone="critical" dismissible={true} onDismiss={() => {}}>
            {actionData.error}
          </s-banner>
        </div>
      )}

      {/* Formular pentru Save Bar */}
      <Form 
            method="post" 
            style={{ display: "inline" }}
            key={`form-${formKey}`}
            id="template-editor-save-form"
            ref={saveFormRef}
            onSubmit={(e) => {
              // Validare în frontend
              if (!templateName || templateName.trim() === "") {
                e.preventDefault();
                shopify.toast.show("Template name cannot be empty", { isError: true });
                return;
              }

              // Validare section headings
              for (let i = 0; i < sections.length; i++) {
                if (!sections[i].heading || sections[i].heading.trim() === "") {
                  e.preventDefault();
                  shopify.toast.show(`Section ${i + 1} title cannot be empty`, { isError: true });
                  return;
                }
              }

              // Actualizează manual valorile hidden inputs-urilor înainte de submit
              sections.forEach((section, sectionIndex) => {
                section.metafields?.forEach((metafield, mfIndex) => {
                  const customNameInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_customName"]`);
                  const tooltipEnabledInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipEnabled"]`);
                  const tooltipTextInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_tooltipText"]`);
                  const hideFromPCInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromPC"]`);
                  const hideFromMobileInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_hideFromMobile"]`);
                  const prefixInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_prefix"]`);
                  const suffixInput = e.currentTarget.querySelector(`input[name="section_${sectionIndex}_metafield_${mfIndex}_suffix"]`);
                  
                  if (customNameInput) {
                    customNameInput.value = metafield.customName || "";
                  }
                  if (tooltipEnabledInput) {
                    tooltipEnabledInput.value = metafield.tooltipEnabled ? "true" : "false";
                  }
                  if (tooltipTextInput) {
                    tooltipTextInput.value = metafield.tooltipText || "";
                  }
                  if (hideFromPCInput) {
                    hideFromPCInput.value = metafield.hideFromPC ? "true" : "false";
                  }
                  if (hideFromMobileInput) {
                    hideFromMobileInput.value = metafield.hideFromMobile ? "true" : "false";
                  }
                  if (prefixInput) {
                    prefixInput.value = metafield.prefix || "";
                  }
                  if (suffixInput) {
                    suffixInput.value = metafield.suffix || "";
                  }
                });
              });
              
              // Actualizează valorile pentru splitViewPerSection și splitViewPerMetafield
              const splitViewPerSectionInput = e.currentTarget.querySelector('input[name="splitViewPerSection"]');
              const splitViewPerMetafieldInput = e.currentTarget.querySelector('input[name="splitViewPerMetafield"]');
              
              // Verifică dacă variabilele sunt definite (pentru siguranță)
              const splitViewPerSectionValue = typeof splitViewPerSection !== 'undefined' ? splitViewPerSection : false;
              const splitViewPerMetafieldValue = typeof splitViewPerMetafield !== 'undefined' ? splitViewPerMetafield : false;
              
              if (splitViewPerSectionInput) {
                splitViewPerSectionInput.value = splitViewPerSectionValue ? "true" : "false";
              } else {
              }
              if (splitViewPerMetafieldInput) {
                splitViewPerMetafieldInput.value = splitViewPerMetafieldValue ? "true" : "false";
              } else {
              }
              
              // Actualizează valorile pentru seeMoreHideFromPC și seeMoreHideFromMobile
              const seeMoreHideFromPCInput = e.currentTarget.querySelector('input[name="seeMoreHideFromPC"]');
              const seeMoreHideFromMobileInput = e.currentTarget.querySelector('input[name="seeMoreHideFromMobile"]');
              
              if (seeMoreHideFromPCInput) {
                seeMoreHideFromPCInput.value = seeMoreHideFromPC ? "true" : "false";
              }
              if (seeMoreHideFromMobileInput) {
                seeMoreHideFromMobileInput.value = seeMoreHideFromMobile ? "true" : "false";
              }
              
              // Actualizează valorile pentru seeLessHideFromPC și seeLessHideFromMobile
              const seeLessHideFromPCInput = e.currentTarget.querySelector('input[name="seeLessHideFromPC"]');
              const seeLessHideFromMobileInput = e.currentTarget.querySelector('input[name="seeLessHideFromMobile"]');
              
              if (seeLessHideFromPCInput) {
                seeLessHideFromPCInput.value = seeLessHideFromPC ? "true" : "false";
              }
              if (seeLessHideFromMobileInput) {
                seeLessHideFromMobileInput.value = seeLessHideFromMobile ? "true" : "false";
              }
              
              // Actualizează valorile pentru isAccordionHideFromPC și isAccordionHideFromMobile
              const isAccordionHideFromPCInput = e.currentTarget.querySelector('input[name="isAccordionHideFromPC"]');
              const isAccordionHideFromMobileInput = e.currentTarget.querySelector('input[name="isAccordionHideFromMobile"]');
              
              if (isAccordionHideFromPCInput) {
                isAccordionHideFromPCInput.value = isAccordionHideFromPC ? "true" : "false";
              }
              if (isAccordionHideFromMobileInput) {
                isAccordionHideFromMobileInput.value = isAccordionHideFromMobile ? "true" : "false";
              }

              // După submit cu succes, actualizează state-ul inițial
              // Acest lucru se va întâmpla în useEffect când actionData indică succes
            }}
            onReset={(e) => {
              // Resetare la state-ul inițial când utilizatorul apasă "Discard"
              setTemplateName(initialFormState.current.templateName);
              setIsActive(initialFormState.current.isActive);
              setIsAccordion(initialFormState.current.isAccordion);
              setIsAccordionHideFromPC(initialFormState.current.isAccordionHideFromPC);
              setIsAccordionHideFromMobile(initialFormState.current.isAccordionHideFromMobile);
              setSeeMoreEnabled(initialFormState.current.seeMoreEnabled);
              setSeeMoreHideFromPC(initialFormState.current.seeMoreHideFromPC);
              setSeeMoreHideFromMobile(initialFormState.current.seeMoreHideFromMobile);
              setSeeLessHideFromPC(initialFormState.current.seeLessHideFromPC);
              setSeeLessHideFromMobile(initialFormState.current.seeLessHideFromMobile);
              setSplitViewPerSection(initialFormState.current.splitViewPerSection);
              setSplitViewPerMetafield(initialFormState.current.splitViewPerMetafield);
              setTableName(initialFormState.current.tableName);
              setIsCollapsible(initialFormState.current.isCollapsible);
              setCollapsibleOnPC(initialFormState.current.collapsibleOnPC);
              setCollapsibleOnMobile(initialFormState.current.collapsibleOnMobile);
              setSections(JSON.parse(JSON.stringify(initialFormState.current.sections)));
              setStyling(JSON.parse(JSON.stringify(initialFormState.current.styling)));
              setFormKey(prev => prev + 1);
              
              // Hide SaveBar immediately - useEffect will verify hasUnsavedChanges() after state updates
              setShowSaveBar(false);
            }}
          >
            <input type="hidden" name="name" value={templateName} />
        <input type="hidden" name="sectionCount" value={sections.length} />
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <input type="hidden" name="isAccordion" value={isAccordion ? "true" : "false"} />
        <input 
          type="hidden" 
          name="isAccordionHideFromPC" 
          value={isAccordionHideFromPC ? "true" : "false"} 
          key={`isAccordionHideFromPC-${isAccordionHideFromPC}`}
        />
        <input 
          type="hidden" 
          name="isAccordionHideFromMobile" 
          value={isAccordionHideFromMobile ? "true" : "false"} 
          key={`isAccordionHideFromMobile-${isAccordionHideFromMobile}`}
        />
        <input 
          type="hidden" 
          name="seeMoreEnabled" 
          value={seeMoreEnabled ? "true" : "false"} 
          key={`seeMoreEnabled-${seeMoreEnabled}`}
        />
        <input 
          type="hidden" 
          name="seeMoreHideFromPC" 
          value={seeMoreHideFromPC ? "true" : "false"} 
          key={`seeMoreHideFromPC-${seeMoreHideFromPC}`}
        />
        <input 
          type="hidden" 
          name="seeMoreHideFromMobile" 
          value={seeMoreHideFromMobile ? "true" : "false"} 
          key={`seeMoreHideFromMobile-${seeMoreHideFromMobile}`}
        />
        <input 
          type="hidden" 
          name="seeLessHideFromPC" 
          value={seeLessHideFromPC ? "true" : "false"} 
          key={`seeLessHideFromPC-${seeLessHideFromPC}`}
        />
        <input 
          type="hidden" 
          name="seeLessHideFromMobile" 
          value={seeLessHideFromMobile ? "true" : "false"} 
          key={`seeLessHideFromMobile-${seeLessHideFromMobile}`}
        />
        <input 
          type="hidden" 
          name="splitViewPerSection" 
          value={splitViewPerSection ? "true" : "false"} 
          key={`splitViewPerSection-${splitViewPerSection}`}
        />
        <input 
          type="hidden" 
          name="splitViewPerMetafield" 
          value={splitViewPerMetafield ? "true" : "false"} 
          key={`splitViewPerMetafield-${splitViewPerMetafield}`}
        />
        <input 
          type="hidden" 
          name="tableName" 
          value={tableName} 
          key={`tableName-${tableName}`}
        />
        <input 
          type="hidden" 
          name="isCollapsible" 
          value={isCollapsible ? "true" : "false"} 
          key={`isCollapsible-${isCollapsible}`}
        />
        <input 
          type="hidden" 
          name="collapsibleOnPC" 
          value={collapsibleOnPC ? "true" : "false"} 
          key={`collapsibleOnPC-${collapsibleOnPC}`}
        />
        <input 
          type="hidden" 
          name="collapsibleOnMobile" 
          value={collapsibleOnMobile ? "true" : "false"} 
          key={`collapsibleOnMobile-${collapsibleOnMobile}`}
        />
            {/* Save entire styling object as JSON for all devices */}
            <input type="hidden" name="styling" value={JSON.stringify(styling)} />
            <input type="hidden" name="valueTextColor" value={styling.valueTextColor} />
            <input type="hidden" name="headingColor" value={styling.headingColor} />
            <input type="hidden" name="headingFontSize" value={styling.headingFontSize} />
            <input type="hidden" name="headingFontWeight" value={styling.headingFontWeight} />
            <input type="hidden" name="headingFontFamily" value={styling.headingFontFamily} />
            <input type="hidden" name="textFontSize" value={styling.textFontSize} />
            <input type="hidden" name="textFontFamily" value={styling.textFontFamily} />
            <input type="hidden" name="borderWidth" value={styling.borderWidth} />
            <input type="hidden" name="borderRadius" value={styling.borderRadius} />
            <input type="hidden" name="padding" value={styling.padding} />
            <input type="hidden" name="sectionBorderEnabled" value={styling.sectionBorderEnabled ? "true" : "false"} />
            <input type="hidden" name="sectionBorderWidth" value={styling.borderWidth} />
            <input type="hidden" name="sectionBorderColor" value={styling.sectionBorderColor} />
            <input type="hidden" name="sectionBorderStyle" value={styling.sectionBorderStyle} />
            <input type="hidden" name="rowBorderEnabled" value={styling.rowBorderEnabled ? "true" : "false"} />
            <input type="hidden" name="rowBorderColor" value={styling.rowBorderColor} />
            <input type="hidden" name="rowBorderStyle" value={styling.rowBorderStyle} />
            <input type="hidden" name="rowBorderWidth" value={styling.rowBorderWidth} />
            <input type="hidden" name="tdBackgroundColor" value={styling.tdBackgroundColor} />
            <input type="hidden" name="rowBackgroundEnabled" value={styling.rowBackgroundEnabled ? "true" : "false"} />
            <input type="hidden" name="oddRowBackgroundColor" value={styling.oddRowBackgroundColor} />
            <input type="hidden" name="evenRowBackgroundColor" value={styling.evenRowBackgroundColor} />
            <input type="hidden" name="columnBackgroundEnabled" value={styling.columnBackgroundEnabled ? "true" : "false"} />
            <input type="hidden" name="oddColumnBackgroundColor" value={styling.oddColumnBackgroundColor} />
            <input type="hidden" name="evenColumnBackgroundColor" value={styling.evenColumnBackgroundColor} />
            <input type="hidden" name="textTransform" value={styling.textTransform} />
            {/* See More Button Settings */}
            <input type="hidden" name="seeMoreButtonStyle" value={styling.seeMoreButtonStyle || "arrow"} />
            <input type="hidden" name="seeMoreButtonText" value={styling.seeMoreButtonText || "See More"} />
            <input 
              type="hidden" 
              name="seeLessButtonStyle" 
              value={styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow"}
              key={`seeLessButtonStyle-${styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow"}`}
            />
            <input 
              type="hidden" 
              name="seeLessButtonText" 
              value={styling.seeLessButtonText || "See Less"}
              key={`seeLessButtonText-${styling.seeLessButtonText || "See Less"}`}
            />
            <input type="hidden" name="seeMoreButtonBorderEnabled" value={styling.seeMoreButtonBorderEnabled ? "true" : "false"} />
            <input type="hidden" name="seeMoreButtonBorderWidth" value={styling.seeMoreButtonBorderWidth || "1px"} />
            <input type="hidden" name="seeMoreButtonBorderStyle" value={styling.seeMoreButtonBorderStyle || "solid"} />
            <input type="hidden" name="seeMoreButtonBorderColor" value={styling.seeMoreButtonBorderColor || "#000000"} />
            <input type="hidden" name="seeMoreButtonColor" value={styling.seeMoreButtonColor || "#000000"} />
            <input type="hidden" name="seeMoreButtonBackground" value={styling.seeMoreButtonBackground || "transparent"} />
            <input type="hidden" name="seeMoreButtonFontSize" value={styling.seeMoreButtonFontSize || "14px"} />
            <input type="hidden" name="seeMoreButtonFontStyle" value={styling.seeMoreButtonFontStyle || "normal"} />
            <input type="hidden" name="seeMoreButtonFontFamily" value={styling.seeMoreButtonFontFamily || "Arial"} />
            <input type="hidden" name="seeMoreButtonBorderRadius" value={styling.seeMoreButtonBorderRadius || "0px"} />
            <input type="hidden" name="seeMoreButtonPadding" value={styling.seeMoreButtonPadding || "8px"} />
            {/* New styling features */}
            <input type="hidden" name="tableWidth" value={styling.tableWidth || "100"} />
            <input type="hidden" name="tableMarginTop" value={styling.tableMarginTop || "0"} />
            <input type="hidden" name="tableMarginBottom" value={styling.tableMarginBottom || "0"} />
            <input type="hidden" name="tableAlignment" value={styling.tableAlignment || "left"} />
            <input type="hidden" name="headerTextAlign" value={styling.headerTextAlign || "left"} />
            <input type="hidden" name="headerBottomBorderEnabled" value={styling.headerBottomBorderEnabled ? "true" : "false"} />
            <input type="hidden" name="headerBottomBorderColor" value={styling.headerBottomBorderColor || "#000000"} />
            <input type="hidden" name="headerBottomBorderWidth" value={styling.headerBottomBorderWidth || "1px"} />
            <input type="hidden" name="headerBottomBorderStyle" value={styling.headerBottomBorderStyle || "solid"} />
            <input type="hidden" name="specSpacing" value={styling.specSpacing || "10"} />
            <input type="hidden" name="columnRatio" value={styling.columnRatio || "40"} />
            {sections.map((section, sectionIndex) => (
                <div key={sectionIndex}>
                    <input
                    type="hidden"
                    name={`section_${sectionIndex}_heading`}
                    value={section.heading || ""}
                    />
                    <input
                    type="hidden"
                    name={`section_${sectionIndex}_metafieldCount`}
                    value={section.metafields?.length || 0}
                    />

                    {section.metafields?.map((mf, mfIndex) => (
                    <div key={`${sectionIndex}-${mfIndex}`}>
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}`}
                        value={mf.metafieldDefinitionId || mf.id || ""}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_type`}
                        value={mf.type || 'metafield'}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_productSpecType`}
                        value={mf.productSpecType || ""}
                        />

                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_customName`}
                        value={mf.customName || ""}
                        />

                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_tooltipEnabled`}
                        value={mf.tooltipEnabled ? "true" : "false"}
                        />

                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_tooltipText`}
                        value={mf.tooltipText || ""}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_hideFromPC`}
                        value={mf.hideFromPC ? "true" : "false"}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_hideFromMobile`}
                        value={mf.hideFromMobile ? "true" : "false"}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_prefix`}
                        value={mf.prefix || ""}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_suffix`}
                        value={mf.suffix || ""}
                        />
                        <input
                        type="hidden"
                        name={`section_${sectionIndex}_metafield_${mfIndex}_customValue`}
                        value={mf.customValue || ""}
                        />
                    </div>
                    ))}
                </div>
                ))}

            {/* Hidden submit button so App Bridge SaveBar can trigger a real form submit */}
            <button type="submit" style={{ display: "none" }} aria-hidden="true" tabIndex={-1}>
              Submit
            </button>
          </Form>

      {/* Secțiuni de bază - Informații și Metafield-uri */}
      <s-section heading="Basic information">
          <s-stack direction="block" gap="base">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <label style={{ margin: 0, fontWeight: "500" }}>Template name</label>
              <s-button
                variant="tertiary"
                onClick={() => setShowTemplateNameTooltip(true)}
                icon="info"
                accessibilityLabel="Information about Template name"
              />
            </div>
            <s-text-field
              name="name"
              label="Template Name"
              labelAccessibilityVisibility="exclusive"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value || e.currentTarget?.value || "")}
              required
              data-onboarding="template-name-input"
            />
          </s-stack>
        </s-section>

        <s-section heading="Specification Table settings">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="tableName"
              label="Table Name"
              value={tableName}
              onChange={(e) => {
                const newValue = e.target.value || e.currentTarget?.value || "";
                setTableName(newValue);
                // Actualizează imediat hidden input-ul și declanșează evenimentul change
                const form = document.querySelector('form[data-save-bar]');
                if (form) {
                  const tableNameInput = form.querySelector('input[name="tableName"]');
                  if (tableNameInput) {
                    tableNameInput.value = newValue;
                    tableNameInput.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }}
              placeholder="Specifications"
            />
            <s-switch
              data-onboarding="collapsible-table-switch"
              checked={isCollapsible}
              onChange={(e) => {
                const newValue = e.target.checked;
                setIsCollapsible(newValue);
                // Dacă activezi collapsible, dezactivează accordion și seeMore (mutual exclusiv)
                if (newValue) {
                  setIsAccordion(false);
                  setIsAccordionHideFromPC(false);
                  setIsAccordionHideFromMobile(false);
                  setSeeMoreEnabled(false);
                  setSeeMoreHideFromPC(false);
                  setSeeMoreHideFromMobile(false);
                } else {
                  // Dacă dezactivezi collapsible, dezactivează și opțiunile PC/Mobile
                  setCollapsibleOnPC(false);
                  setCollapsibleOnMobile(false);
                }
                // Actualizează imediat hidden input-ul
                const form = document.querySelector('form[data-save-bar]');
                if (form) {
                  const isCollapsibleInput = form.querySelector('input[name="isCollapsible"]');
                  if (isCollapsibleInput) {
                    isCollapsibleInput.value = newValue ? "true" : "false";
                    isCollapsibleInput.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              }}
              value={isCollapsible ? "true" : "false"}
              label="Collapsible table"
              accessibilityLabel="Enable collapsible table"
            />
            {isCollapsible && (
              <s-stack direction="block" gap="tight">
                <s-switch
                  checked={collapsibleOnPC}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setCollapsibleOnPC(newValue);
                    // Dacă activezi collapsibleOnPC, dezactivează collapsibleOnMobile (mutual exclusiv)
                    if (newValue) {
                      setCollapsibleOnMobile(false);
                    }
                    // Actualizează imediat hidden input-ul
                    const form = document.querySelector('form[data-save-bar]');
                    if (form) {
                      const collapsibleOnPCInput = form.querySelector('input[name="collapsibleOnPC"]');
                      if (collapsibleOnPCInput) {
                        collapsibleOnPCInput.value = newValue ? "true" : "false";
                        collapsibleOnPCInput.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      if (newValue) {
                        const collapsibleOnMobileInput = form.querySelector('input[name="collapsibleOnMobile"]');
                        if (collapsibleOnMobileInput) {
                          collapsibleOnMobileInput.value = "false";
                          collapsibleOnMobileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                      }
                    }
                  }}
                  value={collapsibleOnPC ? "true" : "false"}
                  label="Collapsible table just on Desktop"
                  accessibilityLabel="Enable collapsible table on PC only"
                />
                <s-switch
                  checked={collapsibleOnMobile}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setCollapsibleOnMobile(newValue);
                    // Dacă activezi collapsibleOnMobile, dezactivează collapsibleOnPC (mutual exclusiv)
                    if (newValue) {
                      setCollapsibleOnPC(false);
                    }
                    // Actualizează imediat hidden input-ul
                    const form = document.querySelector('form[data-save-bar]');
                    if (form) {
                      const collapsibleOnMobileInput = form.querySelector('input[name="collapsibleOnMobile"]');
                      if (collapsibleOnMobileInput) {
                        collapsibleOnMobileInput.value = newValue ? "true" : "false";
                        collapsibleOnMobileInput.dispatchEvent(new Event('change', { bubbles: true }));
                      }
                      if (newValue) {
                        const collapsibleOnPCInput = form.querySelector('input[name="collapsibleOnPC"]');
                        if (collapsibleOnPCInput) {
                          collapsibleOnPCInput.value = "false";
                          collapsibleOnPCInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                      }
                    }
                  }}
                  value={collapsibleOnMobile ? "true" : "false"}
                  label="Collapsible table just on Mobile"
                  accessibilityLabel="Enable collapsible table on Mobile only"
                />
              </s-stack>
            )}
          </s-stack>
        </s-section>

        <s-section>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <s-heading level="2" style={{ margin: 0, flex: 1 }}>Sections and Specifications</s-heading>
            <s-button
              variant="tertiary"
              onClick={() => setShowSectionsTooltip(true)}
              icon="info"
              accessibilityLabel="Information about Sections and Specifications"
            />
          </div>
          <s-grid gridTemplateColumns="1fr 3fr" gap="base">
            {/* Coloana stângă - Lista de secțiuni */}
            <s-grid-item>
              <s-box padding="base" background="subdued" borderRadius="base" borderWidth="base">
                <s-stack direction="block" gap="small">
                  {sections.length === 0 ? (
                    <s-text color="subdued">No sections yet. Add a new section to get started.</s-text>
                  ) : (
                    sections.map((section, index) => (
                      <div
                        key={`section-list-${index}-${formKey}`}
                        draggable={sections.length > 1}
                        data-section-index={index}
                        onClick={() => setSelectedSectionIndex(index)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("sectionIndex", index.toString());
                          e.currentTarget.style.opacity = "0.5";
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.opacity = "1";
                          // Resetează toate secțiunile la starea normală
                          const sectionItems = Array.from(e.currentTarget.parentNode.children);
                          sectionItems.forEach(item => {
                            if (item !== e.currentTarget && item.tagName !== 'BUTTON') {
                              item.style.borderTop = "";
                              item.style.borderBottom = "";
                            }
                          });
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          
                          const draggedSectionIndex = parseInt(e.dataTransfer.getData("sectionIndex"));
                          if (isNaN(draggedSectionIndex) || draggedSectionIndex === index) return;
                          
                          const targetItem = e.currentTarget;
                          const sectionItems = Array.from(targetItem.parentNode.children).filter(
                            item => item.tagName !== 'BUTTON'
                          );
                          
                          // Elimină indicatorii vizuali de la toate secțiunile
                          sectionItems.forEach(item => {
                            item.style.borderTop = "";
                            item.style.borderBottom = "";
                          });
                          
                          // Calculează poziția relativă pentru a afișa indicatorul vizual
                          const rect = targetItem.getBoundingClientRect();
                          const offset = e.clientY - rect.top;
                          const midpoint = rect.height / 2;
                          
                          if (offset < midpoint) {
                            targetItem.style.borderTop = "2px solid #008060";
                          } else {
                            targetItem.style.borderBottom = "2px solid #008060";
                          }
                        }}
                        onDragLeave={(e) => {
                          // Elimină indicatorul vizual când părăsește secțiunea
                          e.currentTarget.style.borderTop = "";
                          e.currentTarget.style.borderBottom = "";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          const draggedSectionIndex = parseInt(e.dataTransfer.getData("sectionIndex"));
                          if (isNaN(draggedSectionIndex) || draggedSectionIndex === index) return;
                          
                          // Găsește noua poziție bazată pe poziția mouse-ului
                          const targetItem = e.currentTarget;
                          const sectionItems = Array.from(targetItem.parentNode.children).filter(
                            item => item.tagName !== 'BUTTON'
                          );
                          const rect = targetItem.getBoundingClientRect();
                          const offset = e.clientY - rect.top;
                          const midpoint = rect.height / 2;
                          
                          let dropIndex = sectionItems.indexOf(targetItem);
                          if (offset > midpoint) {
                            dropIndex += 1;
                          }
                          
                          // Ajustează index-ul dacă tragem în jos
                          if (draggedSectionIndex < dropIndex) {
                            dropIndex -= 1;
                          }
                          
                          // Reordonează secțiunile
                          if (draggedSectionIndex !== dropIndex) {
                            reorderSections(draggedSectionIndex, dropIndex);
                          }
                          
                          // Elimină indicatorii vizuali
                          sectionItems.forEach(item => {
                            item.style.borderTop = "";
                            item.style.borderBottom = "";
                          });
                        }}
                        style={{
                          padding: "12px",
                          borderRadius: "6px",
                          backgroundColor: selectedSectionIndex === index ? "#ffffff" : "transparent",
                          border: selectedSectionIndex === index ? "1px solid #008060" : "1px solid transparent",
                          cursor: sections.length > 1 ? "move" : "pointer",
                          transition: "all 0.2s ease",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          userSelect: "none"
                        }}
                      >
                        {sections.length > 1 && (
                          <s-icon 
                            type="drag-handle" 
                            color="subdued" 
                            size="small"
                            style={{ flexShrink: 0 }}
                          />
                        )}
                        <s-text 
                          type={selectedSectionIndex === index ? "strong" : "generic"}
                          style={{ flex: 1 }}
                        >
                          {section.heading || `Section ${index + 1}`}
                        </s-text>
                      </div>
                    ))
                  )}
                  <s-button 
                    type="button" 
                    onClick={addSection}
                    variant="secondary"
                    icon="plus"
                    style={{ marginTop: "8px" }}
                    accessibilityLabel="Add New Section"
                    data-onboarding="add-section"
                  >
                    Add New Section
                  </s-button>
                </s-stack>
              </s-box>
            </s-grid-item>

            {/* Coloana dreaptă - Setările secțiunii selectate */}
            <s-grid-item>
              {sections.length === 0 ? (
                <s-box padding="large" background="base" borderRadius="base" borderWidth="base">
                  <s-text color="subdued" style={{ textAlign: "center" }}>
                    No sections available. Click "Add New Section" to create your first section.
                  </s-text>
                </s-box>
              ) : (
                <s-box
                  key={`section-${selectedSectionIndex}-${sections[selectedSectionIndex]?.heading || ""}-${formKey}`}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="base"
                  style={{ position: "relative", overflow: "visible" }}
                >
                  {(() => {
                    const section = sections[selectedSectionIndex];
                    const sectionIndex = selectedSectionIndex;
                    return (
                      <s-stack direction="block" gap="base">
                        <s-stack direction="inline" gap="base" alignment="space-between">
                          <s-heading level="3">Section {sectionIndex + 1}</s-heading>
                          <s-stack direction="inline" gap="tight" alignment="center">
                            {sections.length > 1 && (
                              <s-button
                                type="button"
                                variant="primary"
                                icon="delete"
                                tone="critical"
                                onClick={() => removeSection(sectionIndex)}
                                accessibilityLabel="Delete Section"
                              >
                                Delete Section
                              </s-button>
                            )}
                          </s-stack>
                        </s-stack>

                        <input
                          type="hidden"
                          name={`section_${sectionIndex}_metafieldCount`}
                          value={section.metafields?.length || 0}
                        />

                        <s-text-field
                          name={`section_${sectionIndex}_heading`}
                          label="Section Title"
                          value={section.heading}
                          onChange={(e) =>
                            updateSectionHeading(sectionIndex, e.target.value)
                          }
                          required
                          data-onboarding={sectionIndex === 0 ? "section-name-input" : undefined}
                        />
                        <s-stack direction="block" gap="small">
                          <s-text emphasis="strong">Metafields:</s-text>
                          {section.metafields && section.metafields.length > 0 ? (
                            <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
                              {/* Wrapper pentru tabel cu overlay */}
                              <div style={{ 
                                position: "relative", 
                                width: "100%", 
                                maxWidth: "100%",
                                border: "1px solid #e1e3e5", 
                                borderRadius: "8px", 
                                overflow: "hidden"
                              }}>
                                {/* Tabelul cu metafields */}
                                <div style={{
                                  maxHeight: section.metafields.length > 10 && !expandedSections[sectionIndex] ? "450px" : "none",
                                  overflow: "hidden",
                                  transition: "max-height 0.3s ease",
                                  width: "100%",
                                  maxWidth: "100%"
                                }}>
                                  <table style={{ width: "100%", maxWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <thead>
                            <tr style={{ backgroundColor: "#f6f6f7", borderBottom: "2px solid #e1e3e5" }}>
                              <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: "600", fontSize: "13px", color: "#202223", width: "32px" }}>
                                {/* Drag handle column */}
                              </th>
                              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                                Spec Name
                              </th>
                              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                                Spec Definition
                              </th>
                              <th style={{ padding: "8px 4px", textAlign: "center", fontWeight: "600", fontSize: "13px", color: "#202223", width: "50px" }}>
                                Hide from PC
                              </th>
                              <th style={{ padding: "8px 4px", textAlign: "center", fontWeight: "600", fontSize: "13px", color: "#202223", width: "50px" }}>
                                Hide from Mobile
                              </th>
                              <th style={{ padding: "8px 4px", textAlign: "center", fontWeight: "600", fontSize: "13px", color: "#202223", width: "45px" }}>
                                Prefix
                              </th>
                              <th style={{ padding: "8px 4px", textAlign: "center", fontWeight: "600", fontSize: "13px", color: "#202223", width: "45px" }}>
                                Suffix
                              </th>
                              <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: "600", fontSize: "13px", color: "#202223", width: "100px" }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.metafields.map((metafield, mfIndex) => {
                              // Asigură-te că type este setat corect - verifică și pe baza proprietăților disponibile
                              let metafieldType = metafield.type;
                              // Dacă type nu este setat, încearcă să-l determine pe baza proprietăților
                              if (!metafieldType) {
                                if (metafield.customValue !== null && metafield.customValue !== undefined) {
                                  metafieldType = 'custom_spec';
                                } else if (metafield.productSpecType !== null && metafield.productSpecType !== undefined) {
                                  metafieldType = 'product_spec';
                                } else {
                                  metafieldType = 'metafield';
                                }
                              }
                              const isProductSpec = metafieldType === 'product_spec';
                              const isCustomSpec = metafieldType === 'custom_spec';
                              const mfDef = !isProductSpec && !isCustomSpec ? metafieldDefinitions.find(
                                (mf) => mf.id === metafield.metafieldDefinitionId
                              ) : null;
                              const productSpecLabel = isProductSpec 
                                ? productSpecTypes.find(ps => ps.value === metafield.productSpecType)?.label || metafield.productSpecType
                                : null;
                              // Forțează re-renderizarea când se schimbă valorile
                              const metafieldKey = `${sectionIndex}-${mfIndex}-${metafield.type || 'metafield'}-${metafield.customName || ""}-${metafield.customValue || ""}-${metafield.tooltipEnabled}-${metafield.tooltipText || ""}-${metafield.prefix || ""}-${metafield.suffix || ""}`;
                              return (
                                <tr 
                                  key={metafieldKey}
                                  draggable={true}
                                  data-section-index={sectionIndex}
                                  data-metafield-index={mfIndex}
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("sectionIndex", sectionIndex.toString());
                                    e.dataTransfer.setData("metafieldIndex", mfIndex.toString());
                                    e.currentTarget.style.opacity = "0.5";
                                  }}
                                  onDragEnd={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                    // Resetează toate rândurile la starea normală
                                    const rows = Array.from(e.currentTarget.parentNode.children);
                                    rows.forEach(row => {
                                      row.style.borderTop = "";
                                      row.style.borderBottom = "";
                                    });
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    
                                    const draggedSectionIndex = parseInt(e.dataTransfer.getData("sectionIndex"));
                                    const draggedMetafieldIndex = parseInt(e.dataTransfer.getData("metafieldIndex"));
                                    
                                    // Verifică dacă drag-ul este în aceeași secțiune
                                    if (draggedSectionIndex !== sectionIndex) return;
                                    
                                    const targetRow = e.currentTarget;
                                    const rows = Array.from(targetRow.parentNode.children);
                                    
                                    // Elimină indicatorii vizuali de la toate rândurile
                                    rows.forEach(row => {
                                      row.style.borderTop = "";
                                      row.style.borderBottom = "";
                                    });
                                    
                                    // Calculează poziția relativă pentru a afișa indicatorul vizual
                                    const rect = targetRow.getBoundingClientRect();
                                    const offset = e.clientY - rect.top;
                                    const midpoint = rect.height / 2;
                                    
                                    if (offset < midpoint) {
                                      targetRow.style.borderTop = "2px solid #008060";
                                    } else {
                                      targetRow.style.borderBottom = "2px solid #008060";
                                    }
                                  }}
                                  onDragLeave={(e) => {
                                    // Elimină indicatorul vizual când părăsește rândul
                                    e.currentTarget.style.borderTop = "";
                                    e.currentTarget.style.borderBottom = "";
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    const draggedSectionIndex = parseInt(e.dataTransfer.getData("sectionIndex"));
                                    const draggedMetafieldIndex = parseInt(e.dataTransfer.getData("metafieldIndex"));
                                    
                                    // Verifică dacă drag-ul este în aceeași secțiune
                                    if (draggedSectionIndex !== sectionIndex) return;
                                    
                                    // Găsește noua poziție bazată pe poziția mouse-ului
                                    const targetRow = e.currentTarget;
                                    const rows = Array.from(targetRow.parentNode.children);
                                    const rect = targetRow.getBoundingClientRect();
                                    const offset = e.clientY - rect.top;
                                    const midpoint = rect.height / 2;
                                    
                                    let dropIndex = rows.indexOf(targetRow);
                                    if (offset > midpoint) {
                                      dropIndex += 1;
                                    }
                                    
                                    // Ajustează index-ul dacă tragem în jos
                                    if (draggedMetafieldIndex < dropIndex) {
                                      dropIndex -= 1;
                                    }
                                    
                                    // Reordonează metafields-urile
                                    if (draggedMetafieldIndex !== dropIndex) {
                                      reorderMetafields(sectionIndex, draggedMetafieldIndex, dropIndex);
                                    }
                                    
                                    // Elimină indicatorii vizuali
                                    rows.forEach(row => {
                                      row.style.borderTop = "";
                                      row.style.borderBottom = "";
                                    });
                                  }}
                                  style={{ 
                                    borderBottom: mfIndex < section.metafields.length - 1 ? "1px solid #e1e3e5" : "none",
                                    backgroundColor: mfIndex % 2 === 0 ? "#ffffff" : "#fafbfb",
                                    cursor: "move"
                                  }}
                                >
                                  <td style={{ padding: "8px 6px", verticalAlign: "middle", width: "32px", textAlign: "center" }}>
                                    <s-icon type="drag-handle" color="subdued" size="small" />
                                  </td>
                                  <td style={{ padding: "8px 12px", verticalAlign: "middle", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    <s-text style={{ fontSize: "13px" }}>
                                      {isCustomSpec
                                        ? (metafield.customName || "Custom Specification")
                                        : isProductSpec
                                        ? (metafield.customName || productSpecLabel || "Product Specification")
                                        : (mfDef
                                          ? (metafield.customName || mfDef.name || `${mfDef.namespace}.${mfDef.key}`)
                                          : "Metafield deleted")}
                                      {metafield.tooltipEnabled && metafield.tooltipText && (
                                        <span 
                                          title={metafield.tooltipText} 
                                          style={{ 
                                            marginLeft: "6px", 
                                            cursor: "help", 
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: "14px",
                                            height: "14px",
                                            borderRadius: "50%",
                                            backgroundColor: "#202223",
                                            color: "#ffffff",
                                            fontSize: "10px",
                                            fontWeight: "bold",
                                            lineHeight: "1",
                                            verticalAlign: "middle"
                                          }}
                                        >
                                          i
                                        </span>
                                      )}
                                    </s-text>
                                  </td>
                                  <td style={{ padding: "8px 12px", verticalAlign: "middle", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    <s-text style={{ color: "#6d7175", fontSize: "12px" }}>
                                      {isCustomSpec
                                        ? (metafield.customValue || "N/A")
                                        : isProductSpec
                                        ? "Product Specification"
                                        : (mfDef
                                          ? `${mfDef.namespace}.${mfDef.key} (${mfDef.ownerType})`
                                          : "N/A")}
                                    </s-text>
                                  </td>
                                  <td style={{ padding: "8px 2px", verticalAlign: "middle", textAlign: "center", width: "50px" }}>
                                    {metafield.hideFromPC ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "11px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 2px", verticalAlign: "middle", textAlign: "center", width: "50px" }}>
                                    {metafield.hideFromMobile ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "11px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 2px", verticalAlign: "middle", textAlign: "center", width: "45px" }}>
                                    {metafield.prefix && metafield.prefix.trim() !== "" ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "11px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 2px", verticalAlign: "middle", textAlign: "center", width: "45px" }}>
                                    {metafield.suffix && metafield.suffix.trim() !== "" ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "10px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "11px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 8px", verticalAlign: "middle", textAlign: "right", width: "100px" }}>
                                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                      <s-button
                                        type="button"
                                        variant="primary"
                                        icon="edit"
                                        tone="primary"
                                        accessibilityLabel="Edit Metafield"
                                        onClick={() => {
                                          setEditingMetafield({ sectionIndex, metafieldIndex: mfIndex });
                                          setMetafieldEditData({
                                            customName: metafield.customName || "",
                                            customValue: metafield.customValue || "",
                                            tooltipEnabled: metafield.tooltipEnabled || false,
                                            tooltipText: metafield.tooltipText || "",
                                            hideFromPC: metafield.hideFromPC || false,
                                            hideFromMobile: metafield.hideFromMobile || false,
                                            prefix: metafield.prefix || "",
                                            suffix: metafield.suffix || "",
                                          });
                                        }}
                                      >
                                      </s-button>
                                      <s-button
                                        type="button"
                                        variant="primary"
                                        tone="critical"
                                        icon="delete"
                                        onClick={() =>
                                          removeMetafieldFromSection(sectionIndex, mfIndex)
                                        }
                                        accessibilityLabel={`Remove metafield from section ${sectionIndex + 1}`}
                                      >
                                      </s-button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                          </div>
                          
                          {/* Overlay gradient când este collapsed */}
                          {section.metafields.length > 10 && !expandedSections[sectionIndex] && (
                            <div style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: "80px",
                              background: "linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 1) 100%)",
                              pointerEvents: "none",
                              zIndex: 1
                            }} />
                          )}
                        </div>
                        
                        {/* Butonul de See More / See Less */}
                        {section.metafields.length > 10 && (
                          <div style={{ marginTop: "12px", textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedSections(prev => ({
                                  ...prev,
                                  [sectionIndex]: !prev[sectionIndex]
                                }));
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                                padding: "8px 16px",
                                backgroundColor: "transparent",
                                border: "1px solid #e1e3e5",
                                borderRadius: "6px",
                                cursor: "pointer",
                                color: "#202223",
                                fontSize: "14px",
                                fontFamily: "inherit",
                                transition: "all 0.2s ease"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f6f6f7";
                                e.currentTarget.style.borderColor = "#c9cccf";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.borderColor = "#e1e3e5";
                              }}
                            >
                              <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 20 20" 
                                fill="none" 
                                xmlns="http://www.w3.org/2000/svg"
                                style={{ 
                                  display: "inline-block", 
                                  transition: "transform 0.3s ease",
                                  transform: expandedSections[sectionIndex] ? "rotate(180deg)" : "rotate(0deg)"
                                }}
                              >
                                <path 
                                  d="M5 7.5L10 12.5L15 7.5" 
                                  stroke="currentColor" 
                                  strokeWidth="2" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span>
                                {expandedSections[sectionIndex] 
                                  ? "See less assignments on this section" 
                                  : "See more assignments on this section"}
                              </span>
                            </button>
                          </div>
                        )}
                            </div>
                          ) : (
                            <s-text style={{ color: "#6d7175", fontStyle: "italic" }}>
                              No metafields added in this section
                            </s-text>
                          )}

                            <div
                              style={{ 
                                display: "flex", 
                                flexWrap: "wrap",
                                gap: "8px", 
                                position: "relative", 
                                width: "100%",
                                marginTop: "20px" 
                              }}
                              data-onboarding={sectionIndex === 0 ? "buttons-container" : undefined}
                            >
                            {/* Buton pentru Add metafields specification */}
                            <div style={{ position: "relative", flex: "1 1 30%", maxWidth: "30%", minWidth: "180px" }}>
                              <s-button
                                type="button"
                                variant="secondary"
                                icon = "search"
                                onClick={() => {
                                  if (getAvailableMetafields(sectionIndex).length > 0) {
                                    setOpenSelectIndex(sectionIndex);
                                  }
                                }}
                                accessibilityLabel={getAvailableMetafields(sectionIndex).length > 0
                                  ? `Add metafields specification (${getAvailableMetafields(sectionIndex).length} available)`
                                  : "No any metafields available"}
                                style={{ width: "100%" }}
                                data-onboarding={sectionIndex === 0 ? "add-metafields" : undefined}
                              >
                                {getAvailableMetafields(sectionIndex).length > 0
                                  ? `Add metafields specification (${getAvailableMetafields(sectionIndex).length} available)`
                                  : "No any metafields available"}
                              </s-button>
                              
                              {/* Modal pentru selectarea metafield-urilor */}
                              {openSelectIndex === sectionIndex && getAvailableMetafields(sectionIndex).length > 0 && (
                                <MetafieldSelectorModal
                                  sectionIndex={sectionIndex}
                                  openSelectIndex={openSelectIndex}
                                  setOpenSelectIndex={setOpenSelectIndex}
                                  metafieldSearchTerm={metafieldSearchTerm}
                                  setMetafieldSearchTerm={setMetafieldSearchTerm}
                                  getAvailableMetafields={getAvailableMetafields}
                                  getFilteredMetafields={getFilteredMetafields}
                                  selectedMetafieldsForSection={selectedMetafieldsForSection}
                                  toggleMetafieldSelection={toggleMetafieldSelection}
                                  addSelectedMetafieldsToSection={addSelectedMetafieldsToSection}
                                  setSelectedMetafieldsForSection={setSelectedMetafieldsForSection}
                                  navigate={navigate}
                                />
                              )}
                              </div>
                              
                              {/* Buton pentru Add Product Specification */}
                              <div style={{ position: "relative", flex: "1 1 33%", maxWidth: "33%", minWidth: "200px" }}>
                                <s-button
                                  type="button"
                                  variant="secondary"
                                  icon="tag"
                                  onClick={() =>
                                    setOpenProductSpecIndex(
                                      openProductSpecIndex === sectionIndex ? null : sectionIndex
                                    )
                                  }
                                  style={{ width: "100%" }}
                                  data-onboarding={sectionIndex === 0 ? "add-product-spec" : undefined}
                                >
                                  {openProductSpecIndex === sectionIndex
                                    ? "Close the list"
                                    : "+ Add Product Specification"}
                                </s-button>
                                {openProductSpecIndex === sectionIndex && (
                                  <s-box
                            padding="base"
                            borderWidth="base"
                            borderRadius="base"
                            background="base"
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 1000,
                              marginTop: "8px",
                              maxHeight: "400px",
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                              border: "1px solid #e1e3e5",
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <s-stack direction="block" gap="base" style={{ flexShrink: 0 }}>
                              <s-text emphasis="strong">
                                Select Product Specification:
                              </s-text>
                            </s-stack>
                            <div
                              style={{ 
                                maxHeight: "300px", 
                                overflowY: "auto",
                                overflowX: "hidden",
                                border: "1px solid #e1e3e5",
                                borderRadius: "4px",
                                padding: "8px",
                                marginTop: "8px",
                                flex: "1 1 auto",
                                minHeight: 0
                              }}
                            >
                              <s-stack direction="block" gap="tight">
                                {productSpecTypes.map((specType) => {
                                  // Verifică dacă product spec-ul de acest tip există deja în secțiune
                                  const alreadyExists = sections[sectionIndex]?.metafields?.some(
                                    mf => mf.type === 'product_spec' && mf.productSpecType === specType.value
                                  );
                                  return (
                                    <s-button
                                      key={specType.value}
                                      type="button"
                                      variant={alreadyExists ? "tertiary" : "primary"}
                                      disabled={alreadyExists}
                                      onClick={() => addProductSpecToSection(sectionIndex, specType.value)}
                                      style={{ width: "100%", justifyContent: "flex-start" }}
                                    >
                                      {specType.label} {alreadyExists && "(Already added)"}
                                    </s-button>
                                  );
                                })}
                              </s-stack>
                            </div>
                            <s-button
                              type="button"
                              variant="tertiary"
                              onClick={() => setOpenProductSpecIndex(null)}
                              style={{ marginTop: "12px" }}
                            >
                              Cancel
                            </s-button>
                                  </s-box>
                                )}
                              </div>
                              
                              {/* Buton pentru Add Custom Specification */}
                              <div style={{ position: "relative", flex: "1 1 33%", maxWidth: "33%", minWidth: "200px" }}>
                                <s-button
                                  type="button"
                                  variant="secondary"
                                  icon="add"
                                  onClick={() =>
                                    setOpenCustomSpecIndex(
                                      openCustomSpecIndex === sectionIndex ? null : sectionIndex
                                    )
                                  }
                                  style={{ width: "100%" }}
                                  data-onboarding={sectionIndex === 0 ? "add-custom-spec" : undefined}
                                >
                                  {openCustomSpecIndex === sectionIndex
                                    ? "Close"
                                    : "+ Add Custom Specification"}
                                </s-button>
                              {openCustomSpecIndex === sectionIndex && (
                                <s-box
                                  padding="base"
                                  borderWidth="base"
                                  borderRadius="base"
                                  background="base"
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    right: 0,
                                    zIndex: 1000,
                                    marginTop: "8px",
                                    maxHeight: "400px",
                                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                    border: "1px solid #e1e3e5",
                                    display: "flex",
                                    flexDirection: "column",
                                  }}
                                >
                                  <s-stack direction="block" gap="base" style={{ flexShrink: 0 }}>
                                    <s-text emphasis="strong">
                                      Add Custom Specification:
                                    </s-text>
                                    <s-text-field
                                      label="Specification Name"
                                      value={customSpecName}
                                      onChange={(e) => {
                                        const value = e.currentTarget?.value ?? e.target?.value ?? "";
                                        setCustomSpecName(value);
                                      }}
                                      placeholder="e.g., Length"
                                      autoComplete="off"
                                    />
                                    <s-text-field
                                      label="Specification Value"
                                      value={customSpecValue}
                                      onChange={(e) => {
                                        const value = e.currentTarget?.value ?? e.target?.value ?? "";
                                        setCustomSpecValue(value);
                                      }}
                                      placeholder="e.g., 20 cm"
                                      autoComplete="off"
                                    />
                                  </s-stack>
                                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                                    <s-button
                                      type="button"
                                      variant="primary"
                                      onClick={() => addCustomSpecToSection(sectionIndex)}
                                      style={{ flex: 1 }}
                                    >
                                      Add
                                    </s-button>
                                    <s-button
                                      type="button"
                                      variant="tertiary"
                                      onClick={() => {
                                        setOpenCustomSpecIndex(null);
                                        setCustomSpecName("");
                                        setCustomSpecValue("");
                                      }}
                                      style={{ flex: 1 }}
                                    >
                                      Cancel
                                    </s-button>
                                  </div>
                                </s-box>
                              )}
                            </div>
                            </div>
                        </s-stack>
                      </s-stack>
                    );
                  })()}
                </s-box>
              )}
            </s-grid-item>
          </s-grid>
        </s-section>
        
        {/* Setări pentru afișare */}
        <s-section heading="Display Settings" data-onboarding="display-settings-section">
          <s-stack direction="block" gap="base">
            <s-switch
              id="accordion-switch"
              name="isAccordion"
              checked={isAccordion}
              onChange={(e) => {
                const newValue = e.target.checked;
                setIsAccordion(newValue);
                // Dacă activezi accordion, dezactivează seeMore și collapsible (mutual exclusiv)
                if (newValue) {
                  setSeeMoreEnabled(false);
                  setSeeMoreHideFromPC(false);
                  setSeeMoreHideFromMobile(false);
                  setIsCollapsible(false);
                  setCollapsibleOnPC(false);
                  setCollapsibleOnMobile(false);
                } else {
                  // Dacă dezactivezi accordion, resetează și flag-urile hide
                  setIsAccordionHideFromPC(false);
                  setIsAccordionHideFromMobile(false);
                }
              }}
              value={isAccordion ? "true" : "false"}
              label="Collapsible sections (expandable)"
            />
            {isAccordion && (
              <s-box 
                padding="base" 
                background="subdued" 
                borderWidth="base" 
                borderRadius="base"
                style={{ marginLeft: "24px", marginTop: "8px" }}
              >
                <s-stack direction="block" gap="base">
                  <s-switch
                    id="accordion-hide-from-pc-switch"
                    name="isAccordionHideFromPC"
                    checked={isAccordionHideFromPC}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromPC, dezactivează hideFromMobile (mutual exclusiv)
                      if (newValue) {
                        setIsAccordionHideFromMobile(false);
                      }
                      setIsAccordionHideFromPC(newValue);
                      // Actualizează imediat hidden input-ul
                      setTimeout(() => {
                        const input = document.querySelector('input[name="isAccordionHideFromPC"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                        }
                        const mobileInput = document.querySelector('input[name="isAccordionHideFromMobile"]');
                        if (mobileInput) {
                          mobileInput.value = newValue ? "false" : mobileInput.value;
                        }
                      }, 0);
                    }}
                    value={isAccordionHideFromPC ? "true" : "false"}
                    label="Collapsible sections just on mobile"
                  />
                  <s-switch
                    id="accordion-hide-from-mobile-switch"
                    name="isAccordionHideFromMobile"
                    checked={isAccordionHideFromMobile}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromMobile, dezactivează hideFromPC (mutual exclusiv)
                      if (newValue) {
                        setIsAccordionHideFromPC(false);
                      }
                      setIsAccordionHideFromMobile(newValue);
                      // Actualizează imediat hidden input-ul
                      setTimeout(() => {
                        const input = document.querySelector('input[name="isAccordionHideFromMobile"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                        }
                        const pcInput = document.querySelector('input[name="isAccordionHideFromPC"]');
                        if (pcInput) {
                          pcInput.value = newValue ? "false" : pcInput.value;
                        }
                      }, 0);
                    }}
                    value={isAccordionHideFromMobile ? "true" : "false"}
                    label="Collapsible sections just on PC"
                  />
                </s-stack>
              </s-box>
            )}
            <s-switch
              id="see-more-switch"
              name="seeMoreEnabled"
              checked={seeMoreEnabled}
              onChange={(e) => {
                const newValue = e.target.checked;
                setSeeMoreEnabled(newValue);
                // Dacă activezi seeMore, dezactivează accordion și collapsible (mutual exclusiv)
                if (newValue) {
                  setIsAccordion(false);
                  setIsAccordionHideFromPC(false);
                  setIsAccordionHideFromMobile(false);
                  setIsCollapsible(false);
                  setCollapsibleOnPC(false);
                  setCollapsibleOnMobile(false);
                } else {
                  // Dacă dezactivezi seeMore, resetează și flag-urile hide
                  setSeeMoreHideFromPC(false);
                  setSeeMoreHideFromMobile(false);
                }
              }}
              value={seeMoreEnabled ? "true" : "false"}
              label="See more button (Show first 10 rows)"
            />
            {seeMoreEnabled && (
              <s-box 
                padding="base" 
                background="subdued" 
                borderWidth="base" 
                borderRadius="base"
                style={{ marginLeft: "24px", marginTop: "8px" }}
              >
                <s-stack direction="block" gap="base">
                  <s-switch
                    id="see-more-hide-from-pc-switch"
                    name="seeMoreHideFromPC"
                    checked={seeMoreHideFromPC}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromPC, dezactivează hideFromMobile (mutual exclusiv)
                      if (newValue) {
                        setSeeMoreHideFromMobile(false);
                      }
                      setSeeMoreHideFromPC(newValue);
                      // Actualizează imediat hidden input-ul
                      setTimeout(() => {
                        const input = document.querySelector('input[name="seeMoreHideFromPC"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                        }
                        const mobileInput = document.querySelector('input[name="seeMoreHideFromMobile"]');
                        if (mobileInput) {
                          mobileInput.value = newValue ? "false" : mobileInput.value;
                        }
                      }, 0);
                    }}
                    value={seeMoreHideFromPC ? "true" : "false"}
                    label="Show see more button just on mobile"
                  />
                  <s-switch
                    id="see-more-hide-from-mobile-switch"
                    name="seeMoreHideFromMobile"
                    checked={seeMoreHideFromMobile}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromMobile, dezactivează hideFromPC (mutual exclusiv)
                      if (newValue) {
                        setSeeMoreHideFromPC(false);
                      }
                      setSeeMoreHideFromMobile(newValue);
                      // Actualizează imediat hidden input-ul
                      setTimeout(() => {
                        const input = document.querySelector('input[name="seeMoreHideFromMobile"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                        }
                        const pcInput = document.querySelector('input[name="seeMoreHideFromPC"]');
                        if (pcInput) {
                          pcInput.value = newValue ? "false" : pcInput.value;
                        }
                      }, 0);
                    }}
                    value={seeMoreHideFromMobile ? "true" : "false"}
                    label="Show see more button just on PC"
                  />
                  
                  {/* Show More Button Style */}
                  <s-select
                    name="seeMoreButtonStyle"
                    label="Show More Button Style"
                    value={styling.seeMoreButtonStyle || "arrow"}
                    onInput={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, seeMoreButtonStyle: value }));
                      }
                    }}
                    onChange={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, seeMoreButtonStyle: value }));
                      }
                    }}
                  >
                    <s-option value="arrow">Arrow</s-option>
                    <s-option value="text">Text</s-option>
                    <s-option value="arrow+text">Arrow + Text</s-option>
                  </s-select>
                  
                  {/* Show More Button Text - se afișează doar dacă style este "text" sau "arrow+text" */}
                  {(styling.seeMoreButtonStyle === "text" || styling.seeMoreButtonStyle === "arrow+text") && (
                    <s-text-field
                      label="Button Text"
                      name="seeMoreButtonText"
                      value={styling.seeMoreButtonText || "See More"}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || "";
                        setStyling((prev) => ({
                          ...prev,
                          seeMoreButtonText: value,
                        }));
                      }}
                      placeholder="See More, Vezi mai mult, Extinde lista..."
                    />
                  )}
                  
                  {/* Show Less Button Settings */}
                  <s-heading level="3" style={{ marginTop: "16px", marginBottom: "8px" }}>Show Less Button Settings</s-heading>
                  
                  <s-switch
                    id="see-less-hide-from-pc-switch"
                    name="seeLessHideFromPC"
                    checked={seeLessHideFromPC}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromPC, dezactivează hideFromMobile (mutual exclusiv)
                      if (newValue) {
                        setSeeLessHideFromMobile(false);
                      }
                      setSeeLessHideFromPC(newValue);
                      // Actualizează imediat hidden input-ul și declanșează change pentru Save Bar
                      setTimeout(() => {
                        const input = document.querySelector('input[name="seeLessHideFromPC"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                          input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        const mobileInput = document.querySelector('input[name="seeLessHideFromMobile"]');
                        if (mobileInput) {
                          mobileInput.value = newValue ? "false" : mobileInput.value;
                          mobileInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        triggerFormChanges();
                      }, 0);
                    }}
                    value={seeLessHideFromPC ? "true" : "false"}
                    label="Show see less button just on mobile"
                  />
                  <s-switch
                    id="see-less-hide-from-mobile-switch"
                    name="seeLessHideFromMobile"
                    checked={seeLessHideFromMobile}
                    onChange={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const newValue = e.target.checked;
                      // Dacă activezi hideFromMobile, dezactivează hideFromPC (mutual exclusiv)
                      if (newValue) {
                        setSeeLessHideFromPC(false);
                      }
                      setSeeLessHideFromMobile(newValue);
                      // Actualizează imediat hidden input-ul și declanșează change pentru Save Bar
                      setTimeout(() => {
                        const input = document.querySelector('input[name="seeLessHideFromMobile"]');
                        if (input) {
                          input.value = newValue ? "true" : "false";
                          input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        const pcInput = document.querySelector('input[name="seeLessHideFromPC"]');
                        if (pcInput) {
                          pcInput.value = newValue ? "false" : pcInput.value;
                          pcInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        triggerFormChanges();
                      }, 0);
                    }}
                    value={seeLessHideFromMobile ? "true" : "false"}
                    label="Show see less button just on PC"
                  />
                  
                  {/* Show Less Button Style - uses same style as See More */}
                  <s-select
                    name="seeLessButtonStyle"
                    label="Show Less Button Style"
                    value={styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow"}
                    onInput={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, seeLessButtonStyle: value }));
                        setTimeout(() => {
                          const input = document.querySelector('input[name="seeLessButtonStyle"]');
                          if (input) {
                            input.value = value;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                          }
                          triggerFormChanges();
                        }, 0);
                      }
                    }}
                    onChange={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, seeLessButtonStyle: value }));
                        setTimeout(() => {
                          const input = document.querySelector('input[name="seeLessButtonStyle"]');
                          if (input) {
                            input.value = value;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                          }
                          triggerFormChanges();
                        }, 0);
                      }
                    }}
                  >
                    <s-option value="arrow">Arrow</s-option>
                    <s-option value="text">Text</s-option>
                    <s-option value="arrow+text">Arrow + Text</s-option>
                  </s-select>
                  
                  {/* Show Less Button Text - se afișează doar dacă style este "text" sau "arrow+text" */}
                  {((styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "text" || (styling.seeLessButtonStyle || styling.seeMoreButtonStyle || "arrow") === "arrow+text") && (
                    <s-text-field
                      label="Button Text"
                      name="seeLessButtonText"
                      value={styling.seeLessButtonText || "See Less"}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || "";
                        setStyling((prev) => ({
                          ...prev,
                          seeLessButtonText: value,
                        }));
                        setTimeout(() => {
                          const input = document.querySelector('input[name="seeLessButtonText"]');
                          if (input) {
                            input.value = value;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                          }
                          triggerFormChanges();
                        }, 0);
                      }}
                      placeholder="See Less, Vezi mai putin, Restrange lista..."
                    />
                  )}
                </s-stack>
              </s-box>
            )}
            <s-switch
              id="split-view-per-section-switch"
              name="splitViewPerSection"
              checked={splitViewPerSection}
              onChange={(e) => {
                const newValue = e.target.checked;
                setSplitViewPerSection(newValue);
                // Dacă activezi splitViewPerSection, dezactivează splitViewPerMetafield (mutual exclusiv)
                if (newValue) {
                  setSplitViewPerMetafield(false);
                }
              }}
              value={splitViewPerSection ? "true" : "false"}
              label="Split View per Section (distribute sections in 2 columns)"
            />
            {splitViewPerSection && (
              <div style={{
                marginLeft: "24px",
                backgroundColor: "#fff4e5",
                border: "1px solid #f5d07b",
                padding:"5px",
                borderRadius: "6px"
              }}>
                <s-text style={{ color: "#8b6914", fontSize: "13px" }}>
                  This setting will not be applied on mobile devices.
                </s-text>
              </div>
            )}
            <s-switch
              id="split-view-per-metafield-switch"
              name="splitViewPerMetafield"
              checked={splitViewPerMetafield}
              onChange={(e) => {
                const newValue = e.target.checked;
                setSplitViewPerMetafield(newValue);
                // Dacă activezi splitViewPerMetafield, dezactivează splitViewPerSection (mutual exclusiv)
                if (newValue) {
                  setSplitViewPerSection(false);
                }
              }}
              value={splitViewPerMetafield ? "true" : "false"}
              label="Split View per Metafield (distribute metafields in 2 columns)"
            />
            {splitViewPerMetafield && (
              <div style={{
                marginLeft: "24px",

                padding: "5px",
                backgroundColor: "#fff4e5",
                border: "1px solid #f5d07b",
                borderRadius: "6px"
              }}>
                <s-text style={{ color: "#8b6914", fontSize: "13px" }}>
                  This setting will not be applied on mobile devices.
                </s-text>
              </div>
            )}
          </s-stack>
        </s-section>
      <s-divider />
      <s-section>
          <s-stack direction="block" gap="base" alignItems="center">
            <s-heading level="2">Select the device type where you want to apply styling :</s-heading>
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <s-button
                variant={selectedDevice === "mobile" ? "primary" : "secondary"}
                onClick={() => setSelectedDevice("mobile")}
                style={{ flex: 1 }}
                icon="mobile"
                accessibilityLabel="Select mobile device view"
              >
                Mobile
              </s-button>
              <s-button
                variant={selectedDevice === "tablet" ? "primary" : "secondary"}
                onClick={() => setSelectedDevice("tablet")}
                style={{ flex: 1 }}
                icon="tablet"
                accessibilityLabel="Select tablet device view"
              >
                Tablet
              </s-button>
              <s-button
                variant={selectedDevice === "desktop" ? "primary" : "secondary"}
                onClick={() => setSelectedDevice("desktop")}
                style={{ flex: 1 }}
                icon="desktop"
                accessibilityLabel="Select desktop device view"
              >
                Desktop
              </s-button>
            </div>
            
            {/* Copy Styles Buttons */}
            {selectedDevice === "mobile" && (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("tablet")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Tablet to Mobile. This action will overwrite all current settings for Mobile."
                  >
                    Copy styles from Tablet
                  </s-button>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("desktop")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Desktop to Mobile. This action will overwrite all current settings for Mobile."
                  >
                    Copy styles from Desktop
                  </s-button>
                </div>
              </div>
            )}
            {selectedDevice === "tablet" && (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("mobile")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Mobile to Tablet. This action will overwrite all current settings for Tablet."
                  >
                    Copy styles from Mobile
                  </s-button>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("desktop")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Desktop to Tablet. This action will overwrite all current settings for Tablet."
                  >
                    Copy styles from Desktop
                  </s-button>
                </div>
              </div>
            )}
            {selectedDevice === "desktop" && (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("mobile")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Mobile to Desktop. This action will overwrite all current settings for Desktop."
                  >
                    Copy styles from Mobile
                  </s-button>
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <s-button
                    variant="secondary"
                    onClick={() => openCopyStylesDialog("tablet")}
                    style={{ width: "100%" }}
                    title="Copy all styling settings from Tablet to Desktop. This action will overwrite all current settings for Desktop."
                  >
                    Copy styles from Tablet
                  </s-button>
                </div>
              </div>
            )}
            
            {/* Dialog de confirmare pentru Copy Styles */}
            {copyStylesDialog.open && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10000,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setCopyStylesDialog({ open: false, sourceDevice: null });
                  }
                }}
              >
                <s-box
                  padding="large"
                  borderWidth="base"
                  borderRadius="base"
                  background="base"
                  style={{
                    maxWidth: "500px",
                    width: "90%",
                    maxHeight: "90vh",
                    overflowY: "auto",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <s-stack direction="block" gap="base">
                    <s-heading level="3">
                      Confirm copy styles
                    </s-heading>
                    <s-text>
                      Are you sure you want to copy all styling settings from{" "}
                      <strong>{copyStylesDialog.sourceDevice === "mobile" ? "Mobile" : copyStylesDialog.sourceDevice === "tablet" ? "Tablet" : "Desktop"}</strong>{" "}
                      to{" "}
                      <strong>{selectedDevice === "mobile" ? "Mobile" : selectedDevice === "tablet" ? "Tablet" : "Desktop"}</strong>?
                    </s-text>
                    <s-box
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                      background="subdued"
                    >
                      <s-stack direction="block" gap="tight">
                        <s-text type="strong">Consequences:</s-text>
                        <s-text>
                          • All current settings for {selectedDevice === "mobile" ? "Mobile" : selectedDevice === "tablet" ? "Tablet" : "Desktop"} will be completely replaced
                        </s-text>
                        <s-text>
                          • This action includes: colors, fonts, spacing, borders, padding, margin and all other styling settings
                        </s-text>
                        <s-text>
                          • The changes will be applied immediately in preview, but you need to save the template to keep them permanently
                        </s-text>
                        <s-text>
                          • You can cancel the action if you don't save the template
                        </s-text>
                      </s-stack>
                    </s-box>
                    <s-stack direction="inline" gap="base" style={{ marginTop: "16px" }}>
                      <s-button
                        variant="primary"
                        onClick={() => copyStylesFromDevice(copyStylesDialog.sourceDevice)}
                      >
                        Yes, copy styles
                      </s-button>
                      <s-button
                        variant="secondary"
                        onClick={() => setCopyStylesDialog({ open: false, sourceDevice: null })}
                      >
                        Cancel
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-box>
              </div>
            )}
          </s-stack>
        </s-section>
      <div data-onboarding="styles-preview-container" style={{ display: "flex", gap: "20px", height: "calc(100vh - 400px)", minHeight: "600px", width: "100%" }}>
        {/* Partea stângă - Stiluri (35%) */}
        <div style={{ width: "35%", minWidth: "350px", overflowY: "auto", paddingRight: "10px" }}>
        {/* Device Selection Buttons */}
        
        <s-section heading="Styles">
          <s-stack direction="block" gap="base">
            {/* 1. Table Styling (formerly Section Styling) */}
            <CollapsibleSection title="Table Styling" defaultCollapsed={true}>
              <s-color-field
                label="Background Color"
                name="backgroundColor"
                    value={getCurrentDeviceStyling().backgroundColor}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      updateCurrentDeviceStyling({ backgroundColor: value });
                    }}
                  />
                  
                  {/* New: Table width, margins */}
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Table Width (%)"
                      value={parseInt(getCurrentDeviceStyling().tableWidth) || 100}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ tableWidth: value.toString() });
                      }}
                      min={1}
                      max={100}
                      step={1}
                      output
                    />
                    <input
                      type="hidden"
                      name={`tableWidth_${selectedDevice}`}
                      value={getCurrentDeviceStyling().tableWidth || "100"}
                    />
                  </div>
                  
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Table Margin Top (px)"
                      value={parseInt(getCurrentDeviceStyling().tableMarginTop) || 0}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ tableMarginTop: value.toString() });
                      }}
                      min={0}
                      max={100}
                      step={1}
                      output
                    />
                  </div>
                  
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Table Margin Bottom (px)"
                      value={parseInt(getCurrentDeviceStyling().tableMarginBottom) || 0}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ tableMarginBottom: value.toString() });
                      }}
                      min={0}
                      max={100}
                      step={1}
                      output
                    />
                  </div>
                  
                  {/* Table Alignment */}
                  <s-stack direction="block" gap="tight">
                    <s-text style={{ fontSize: "14px", fontWeight: "500", color: "#202223" }}>Table Alignment</s-text>
                    <s-stack direction="inline" gap="base">
                      <s-button
                        variant={getCurrentDeviceStyling().tableAlignment === "left" ? "primary" : "secondary"}
                        onClick={() => updateCurrentDeviceStyling({ tableAlignment: "left" })}
                      >
                        Left
                      </s-button>
                      <s-button
                        variant={getCurrentDeviceStyling().tableAlignment === "center" ? "primary" : "secondary"}
                        onClick={() => updateCurrentDeviceStyling({ tableAlignment: "center" })}
                      >
                        Center
                      </s-button>
                      <s-button
                        variant={getCurrentDeviceStyling().tableAlignment === "right" ? "primary" : "secondary"}
                        onClick={() => updateCurrentDeviceStyling({ tableAlignment: "right" })}
                      >
                        Right
                      </s-button>
                    </s-stack>
                    <input
                      type="hidden"
                      name={`tableAlignment_${selectedDevice}`}
                      value={getCurrentDeviceStyling().tableAlignment || "left"}
                    />
                  </s-stack>
                  
                  {/* Section Border */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="section-border-switch"
                      label="Section Border"
                      checked={getCurrentDeviceStyling().sectionBorderEnabled}
                onChange={(e) => {
                        updateCurrentDeviceStyling({ sectionBorderEnabled: e.target.checked });
                      }}
                    />
                    {getCurrentDeviceStyling().sectionBorderEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
              <s-color-field
                            label="Section Border Color"
                            name="sectionBorderColor"
                            value={getCurrentDeviceStyling().sectionBorderColor}
                alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ sectionBorderColor: value });
                            }}
                          />
                          <s-select
                            name="sectionBorderStyle"
                            label="Stil Section Border"
                            value={getCurrentDeviceStyling().sectionBorderStyle}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ sectionBorderStyle: value });
                              }
                            }}
                onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ sectionBorderStyle: value });
                              }
                            }}
                          >
                            <s-option value="solid">Solid</s-option>
                            <s-option value="dashed">Dashed</s-option>
                            <s-option value="dotted">Dotted</s-option>
                            <s-option value="none">None</s-option>
                          </s-select>
                        </s-stack>
                        <s-stack direction="inline" gap="base">
                          <div style={{ width: "100%" }}>
                            <RangeSlider
                              label="Border Width"
                              value={pxToNumber(getCurrentDeviceStyling().borderWidth)}
                              onChange={(value) => {
                                updateCurrentDeviceStyling({ borderWidth: numberToPx(value) });
                              }}
                              min={1}
                              max={20}
                              step={1}
                              output
                            />
                          </div>
                          <div style={{ width: "100%" }}>
                            <RangeSlider
                              label="Border Round Corners"
                              value={pxToNumber(getCurrentDeviceStyling().borderRadius)}
                              onChange={(value) => {
                                updateCurrentDeviceStyling({ borderRadius: numberToPx(value) });
                              }}
                              min={0}
                              max={50}
                              step={1}
                              output
                            />
                          </div>
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>

                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Padding"
                      value={pxToNumber(getCurrentDeviceStyling().padding)}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ padding: numberToPx(value) });
                      }}
                      min={0}
                      max={50}
                      step={1}
                      output
                    />
                  </div>
            </CollapsibleSection>

            {/* 2. Header Styling */}
            <CollapsibleSection title="Header Styling" defaultCollapsed={true}>
              <s-color-field
                label="Heading Color"
                name="headingColor"
                    value={getCurrentDeviceStyling().headingColor}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      updateCurrentDeviceStyling({ headingColor: value });
                    }}
                  />
            <s-stack direction="inline" gap="base">
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Heading Font Size"
                        value={pxToNumber(getCurrentDeviceStyling().headingFontSize)}
                        onChange={(value) => {
                          updateCurrentDeviceStyling({ headingFontSize: numberToPx(value) });
                        }}
                        min={8}
                        max={72}
                        step={1}
                        output
                      />
                    </div>
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Heading Font Weight"
                        value={parseInt(getCurrentDeviceStyling().headingFontWeight) || 400}
                        onChange={(value) => {
                          updateCurrentDeviceStyling({ headingFontWeight: value.toString() });
                        }}
                        min={100}
                        max={900}
                        step={100}
                        output
                      />
                    </div>
              <s-select
                name="headingFontFamily"
                label="Heading Font"
                value={getCurrentDeviceStyling().headingFontFamily}
                      onInput={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ headingFontFamily: value });
                        }
                      }}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ headingFontFamily: value });
                        }
                      }}
              >
                <s-option value="Arial">Arial</s-option>
                <s-option value="Helvetica">Helvetica</s-option>
                <s-option value="Times New Roman">Times New Roman</s-option>
                <s-option value="Courier New">Courier New</s-option>
                <s-option value="Verdana">Verdana</s-option>
                <s-option value="Georgia">Georgia</s-option>
                <s-option value="Palatino">Palatino</s-option>
                <s-option value="Garamond">Garamond</s-option>
                <s-option value="Comic Sans MS">Comic Sans MS</s-option>
                <s-option value="Trebuchet MS">Trebuchet MS</s-option>
                <s-option value="Impact">Impact</s-option>
                <s-option value="Lucida Console">Lucida Console</s-option>
                <s-option value="Tahoma">Tahoma</s-option>
                <s-option value="Calibri">Calibri</s-option>
                <s-option value="Roboto">Roboto</s-option>
              </s-select>
            </s-stack>
            
            {/* New: Text Align */}
            <s-stack direction="block" gap="tight">
              <s-text style={{ fontSize: "14px", fontWeight: "500", color: "#202223" }}>Text Align</s-text>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant={getCurrentDeviceStyling().headerTextAlign === "left" ? "primary" : "secondary"}
                  onClick={() => updateCurrentDeviceStyling({ headerTextAlign: "left" })}
                >
                  Left
                </s-button>
                <s-button
                  variant={getCurrentDeviceStyling().headerTextAlign === "center" ? "primary" : "secondary"}
                  onClick={() => updateCurrentDeviceStyling({ headerTextAlign: "center" })}
                >
                  Center
                </s-button>
                <s-button
                  variant={getCurrentDeviceStyling().headerTextAlign === "right" ? "primary" : "secondary"}
                  onClick={() => updateCurrentDeviceStyling({ headerTextAlign: "right" })}
                >
                  Right
                </s-button>
              </s-stack>
            </s-stack>
            
            {/* New: Header Bottom Border */}
            <s-stack direction="block" gap="tight">
              <s-switch
                id="header-bottom-border-switch"
                label="Header Bottom Border"
                checked={getCurrentDeviceStyling().headerBottomBorderEnabled || false}
                onChange={(e) => {
                  updateCurrentDeviceStyling({ headerBottomBorderEnabled: e.target.checked });
                }}
              />
              {getCurrentDeviceStyling().headerBottomBorderEnabled && (
                <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                  <s-stack direction="inline" gap="base">
                    <s-color-field
                      label="Border Color"
                      name="headerBottomBorderColor"
                      value={getCurrentDeviceStyling().headerBottomBorderColor || "#000000"}
                      alpha
                      onChange={(event) => {
                        const value = event.currentTarget?.value || event.target?.value;
                        if (!value) return;
                        updateCurrentDeviceStyling({ headerBottomBorderColor: value });
                      }}
                    />
                    <s-select
                      name="headerBottomBorderStyle"
                      label="Border Style"
                      value={getCurrentDeviceStyling().headerBottomBorderStyle || "solid"}
                      onInput={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ headerBottomBorderStyle: value });
                        }
                      }}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ headerBottomBorderStyle: value });
                        }
                      }}
                    >
                      <s-option value="solid">Solid</s-option>
                      <s-option value="dashed">Dashed</s-option>
                      <s-option value="dotted">Dotted</s-option>
                      <s-option value="none">None</s-option>
                    </s-select>
                  </s-stack>
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Border Width"
                      value={pxToNumber(getCurrentDeviceStyling().headerBottomBorderWidth || "1px")}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ headerBottomBorderWidth: numberToPx(value) });
                      }}
                      min={1}
                      max={20}
                      step={1}
                      output
                    />
                  </div>
                </s-stack>
              )}
            </s-stack>
            </CollapsibleSection>

            {/* 3. Spec Styling */}
            <CollapsibleSection title="Spec Styling" defaultCollapsed={true}>
                  <s-color-field
                    label="Specification Text Color"
                    name="specificationTextColor"
                    value={getCurrentDeviceStyling().specificationTextColor || "#000000"}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      updateCurrentDeviceStyling({ specificationTextColor: value });
                    }}
                  />
                  <s-color-field
                    label="Value Text Color"
                    name="valueTextColor"
                    value={getCurrentDeviceStyling().valueTextColor || "#000000"}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      updateCurrentDeviceStyling({ valueTextColor: value });
                    }}
                  />
            <s-stack direction="inline" gap="base">
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Font Size Text"
                        value={pxToNumber(getCurrentDeviceStyling().textFontSize)}
                        onChange={(value) => {
                          updateCurrentDeviceStyling({ textFontSize: numberToPx(value) });
                        }}
                        min={8}
                        max={48}
                        step={1}
                        output
                      />
                    </div>
              <s-select
                name="textFontFamily"
                label="Font Text"
                value={getCurrentDeviceStyling().textFontFamily}
                      onInput={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ textFontFamily: value });
                        }
                      }}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          updateCurrentDeviceStyling({ textFontFamily: value });
                        }
                      }}
              >
                <s-option value="Arial">Arial</s-option>
                <s-option value="Helvetica">Helvetica</s-option>
                <s-option value="Times New Roman">Times New Roman</s-option>
                <s-option value="Courier New">Courier New</s-option>
                <s-option value="Verdana">Verdana</s-option>
                <s-option value="Georgia">Georgia</s-option>
                <s-option value="Palatino">Palatino</s-option>
                <s-option value="Garamond">Garamond</s-option>
                <s-option value="Comic Sans MS">Comic Sans MS</s-option>
                <s-option value="Trebuchet MS">Trebuchet MS</s-option>
                <s-option value="Impact">Impact</s-option>
                <s-option value="Lucida Console">Lucida Console</s-option>
                <s-option value="Tahoma">Tahoma</s-option>
                <s-option value="Calibri">Calibri</s-option>
                <s-option value="Roboto">Roboto</s-option>
              </s-select>
            </s-stack>

                  {/* Background TD - se afișează doar când Row Background și Column Background sunt dezactivate */}
                  {!getCurrentDeviceStyling().rowBackgroundEnabled && !getCurrentDeviceStyling().columnBackgroundEnabled && (
                    <s-color-field
                      label="Background TD"
                      name="tdBackgroundColor"
                      value={getCurrentDeviceStyling().tdBackgroundColor}
                      alpha
                      onChange={(event) => {
                        const value = event.currentTarget?.value || event.target?.value;
                        if (!value) return;
                        updateCurrentDeviceStyling({ tdBackgroundColor: value });
                      }}
                    />
                  )}

                  {/* Row Background (Odd/Even) */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="row-background-switch"
                      label="Row Background (Odd/Even)"
                      checked={getCurrentDeviceStyling().rowBackgroundEnabled}
                      disabled={getCurrentDeviceStyling().columnBackgroundEnabled}
                      onChange={(e) => {
                        const current = getCurrentDeviceStyling();
                        updateCurrentDeviceStyling({
                          rowBackgroundEnabled: e.target.checked,
                          // Mutual exclusivity: dacă row e activat, column e dezactivat
                          columnBackgroundEnabled: e.target.checked ? false : current.columnBackgroundEnabled,
                        });
                      }}
                    />
                    {getCurrentDeviceStyling().rowBackgroundEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
                          <s-color-field
                            label="Odd Row Background"
                            name="oddRowBackgroundColor"
                            value={getCurrentDeviceStyling().oddRowBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ oddRowBackgroundColor: value });
                            }}
                          />
                          <s-color-field
                            label="Even Row Background"
                            name="evenRowBackgroundColor"
                            value={getCurrentDeviceStyling().evenRowBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ evenRowBackgroundColor: value });
                            }}
                          />
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>

                  {/* Column Background (Odd/Even) */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="column-background-switch"
                      label="Column Background (Odd/Even)"
                      checked={getCurrentDeviceStyling().columnBackgroundEnabled}
                      disabled={getCurrentDeviceStyling().rowBackgroundEnabled}
                      onChange={(e) => {
                        const current = getCurrentDeviceStyling();
                        updateCurrentDeviceStyling({
                          columnBackgroundEnabled: e.target.checked,
                          // Mutual exclusivity: dacă column e activat, row e dezactivat
                          rowBackgroundEnabled: e.target.checked ? false : current.rowBackgroundEnabled,
                        });
                      }}
                    />
                    {getCurrentDeviceStyling().columnBackgroundEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
                          <s-color-field
                            label="Odd Column Background (Spec)"
                            name="oddColumnBackgroundColor"
                            value={getCurrentDeviceStyling().oddColumnBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ oddColumnBackgroundColor: value });
                            }}
                          />
                          <s-color-field
                            label="Even Column Background (Value)"
                            name="evenColumnBackgroundColor"
                            value={getCurrentDeviceStyling().evenColumnBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ evenColumnBackgroundColor: value });
                            }}
                          />
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>

                  {/* New: Spacing (Row Padding) */}
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Spacing (Row Padding in px)"
                      value={parseInt(getCurrentDeviceStyling().specSpacing) || 10}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ specSpacing: value.toString() });
                      }}
                      min={0}
                      max={50}
                      step={1}
                      output
                    />
                    <input
                      type="hidden"
                      name="specSpacing"
                      value={styling.specSpacing || "10"}
                    />
                  </div>
                  
                  {/* New: Column Ratio (replaces firstColumnWidth) */}
                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Column Ratio (%)"
                      value={parseInt(getCurrentDeviceStyling().columnRatio) || 40}
                      onChange={(value) => {
                        updateCurrentDeviceStyling({ columnRatio: value.toString() });
                      }}
                      min={10}
                      max={90}
                      step={10}
                      output
                    />
                  </div>

                  {/* Text Transform */}
                  <s-select
                    name="textTransform"
                    label="Text Transform"
                    value={getCurrentDeviceStyling().textTransform}
                    onInput={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        updateCurrentDeviceStyling({ textTransform: value });
                      }
                    }}
                    onChange={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        updateCurrentDeviceStyling({ textTransform: value });
                      }
                    }}
                  >
                    <s-option value="none">None</s-option>
                    <s-option value="uppercase">Uppercase</s-option>
                    <s-option value="lowercase">Lowercase</s-option>
                    <s-option value="capitalize">Capitalize</s-option>
                  </s-select>

                  {/* Row Border */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="row-border-switch"
                      label="Row Border"
                      checked={getCurrentDeviceStyling().rowBorderEnabled}
                      onChange={(e) => {
                        updateCurrentDeviceStyling({ rowBorderEnabled: e.target.checked });
                      }}
                    />
                    {getCurrentDeviceStyling().rowBorderEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
              <s-color-field
                            label="Row Border Color"
                            name="rowBorderColor"
                            value={getCurrentDeviceStyling().rowBorderColor}
                alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ rowBorderColor: value });
                }}
              />
              <s-select
                            name="rowBorderStyle"
                            label="Stil Row Border"
                            value={getCurrentDeviceStyling().rowBorderStyle}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ rowBorderStyle: value });
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ rowBorderStyle: value });
                              }
                            }}
                          >
                            <s-option value="solid">Solid</s-option>
                            <s-option value="dashed">Dashed</s-option>
                            <s-option value="dotted">Dotted</s-option>
                            <s-option value="none">None</s-option>
              </s-select>
            </s-stack>
                        <div style={{ width: "100%" }}>
                          <RangeSlider
                            label="Border Width"
                            value={pxToNumber(getCurrentDeviceStyling().rowBorderWidth)}
                            onChange={(value) => {
                              updateCurrentDeviceStyling({ rowBorderWidth: numberToPx(value) });
                            }}
                            min={1}
                            max={20}
                            step={1}
                            output
                          />
                        </div>
            </s-stack>
                    )}
                  </s-stack>
            </CollapsibleSection>
            
            {/* 4. See More Button Styling */}
            {seeMoreEnabled && (
              <CollapsibleSection title="See More Button Styling" defaultCollapsed={true}>
                  <s-stack direction="block" gap="base"> 
                          <s-color-field
                            label="Button Text Color"
                            name="seeMoreButtonColor"
                            value={getCurrentDeviceStyling().seeMoreButtonColor || "#000000"}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ seeMoreButtonColor: value });
                            }}
                          />
                          
                          <s-color-field
                            label="Button Background"
                            name="seeMoreButtonBackground"
                            value={getCurrentDeviceStyling().seeMoreButtonBackground || "transparent"}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              updateCurrentDeviceStyling({ seeMoreButtonBackground: value });
                            }}
                          />
                          
                          <s-stack direction="inline" gap="base">
                            <div style={{ width: "100%" }}>
                              <RangeSlider
                                label="Font Size"
                                value={pxToNumber(getCurrentDeviceStyling().seeMoreButtonFontSize || "14px")}
                                onChange={(value) => {
                                  updateCurrentDeviceStyling({ seeMoreButtonFontSize: numberToPx(value) });
                                }}
                                min={8}
                                max={48}
                                step={1}
                                output
                              />
                            </div>
                            <div style={{ width: "100%" }}>
                              <RangeSlider
                                label="Padding"
                                value={pxToNumber(getCurrentDeviceStyling().seeMoreButtonPadding || "8px")}
                                onChange={(value) => {
                                  updateCurrentDeviceStyling({ seeMoreButtonPadding: numberToPx(value) });
                                }}
                                min={0}
                                max={40}
                                step={1}
                                output
                              />
                            </div>
                          </s-stack>
                          
                          <s-select
                            name="seeMoreButtonFontStyle"
                            label="Font Style"
                            value={getCurrentDeviceStyling().seeMoreButtonFontStyle || "normal"}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ seeMoreButtonFontStyle: value });
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ seeMoreButtonFontStyle: value });
                              }
                            }}
                          >
                            <s-option value="normal">Normal</s-option>
                            <s-option value="italic">Italic</s-option>
                            <s-option value="bold">Bold</s-option>
                            <s-option value="bold italic">Bold Italic</s-option>
                          </s-select>
                          
                          <s-select
                            name="seeMoreButtonFontFamily"
                            label="Font Family"
                            value={getCurrentDeviceStyling().seeMoreButtonFontFamily || "Arial"}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ seeMoreButtonFontFamily: value });
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                updateCurrentDeviceStyling({ seeMoreButtonFontFamily: value });
                              }
                            }}
                          >
                            <s-option value="Arial">Arial</s-option>
                            <s-option value="Helvetica">Helvetica</s-option>
                            <s-option value="Times New Roman">Times New Roman</s-option>
                            <s-option value="Courier New">Courier New</s-option>
                            <s-option value="Verdana">Verdana</s-option>
                            <s-option value="Georgia">Georgia</s-option>
                            <s-option value="Palatino">Palatino</s-option>
                            <s-option value="Garamond">Garamond</s-option>
                            <s-option value="Comic Sans MS">Comic Sans MS</s-option>
                            <s-option value="Trebuchet MS">Trebuchet MS</s-option>
                            <s-option value="Impact">Impact</s-option>
                            <s-option value="Lucida Console">Lucida Console</s-option>
                            <s-option value="Tahoma">Tahoma</s-option>
                            <s-option value="Calibri">Calibri</s-option>
                            <s-option value="Roboto">Roboto</s-option>
                          </s-select>
                          
                          <div style={{ width: "100%" }}>
                            <RangeSlider
                              label="Border Radius"
                              value={pxToNumber(getCurrentDeviceStyling().seeMoreButtonBorderRadius || "0px")}
                              onChange={(value) => {
                                updateCurrentDeviceStyling({ seeMoreButtonBorderRadius: numberToPx(value) });
                              }}
                              min={0}
                              max={50}
                              step={1}
                              output
                            />
                          </div>
                          
                          {/* Button Border */}
                          <s-stack direction="block" gap="tight">
                            <s-switch
                              id="see-more-button-border-switch"
                              label="Button Border"
                              checked={getCurrentDeviceStyling().seeMoreButtonBorderEnabled || false}
                              onChange={(e) => {
                                updateCurrentDeviceStyling({ seeMoreButtonBorderEnabled: e.target.checked });
                              }}
                            />
                            {getCurrentDeviceStyling().seeMoreButtonBorderEnabled && (
                              <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                                <s-stack direction="inline" gap="base">
                                  <div style={{ width: "100%" }}>
                                    <RangeSlider
                                      label="Border Width"
                                      value={pxToNumber(getCurrentDeviceStyling().seeMoreButtonBorderWidth || "1px")}
                                      onChange={(value) => {
                                        updateCurrentDeviceStyling({ seeMoreButtonBorderWidth: numberToPx(value) });
                                      }}
                                      min={1}
                                      max={10}
                                      step={1}
                                      output
                                    />
                                  </div>
                                  <s-select
                                    name="seeMoreButtonBorderStyle"
                                    label="Border Style"
                                    value={getCurrentDeviceStyling().seeMoreButtonBorderStyle || "solid"}
                                    onInput={(e) => {
                                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                                      if (value !== undefined) {
                                        updateCurrentDeviceStyling({ seeMoreButtonBorderStyle: value });
                                      }
                                    }}
                                    onChange={(e) => {
                                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                                      if (value !== undefined) {
                                        updateCurrentDeviceStyling({ seeMoreButtonBorderStyle: value });
                                      }
                                    }}
                                  >
                                    <s-option value="solid">Solid</s-option>
                                    <s-option value="dashed">Dashed</s-option>
                                    <s-option value="dotted">Dotted</s-option>
                                    <s-option value="double">Double</s-option>
                                  </s-select>
                                </s-stack>
                                <s-color-field
                                  label="Border Color"
                                  name="seeMoreButtonBorderColor"
                                  value={getCurrentDeviceStyling().seeMoreButtonBorderColor || "#000000"}
                                  alpha
                                  onChange={(event) => {
                                    const value = event.currentTarget?.value || event.target?.value;
                                    if (!value) return;
                                    updateCurrentDeviceStyling({ seeMoreButtonBorderColor: value });
                                  }}
                                />
                                <s-paragraph>
                                  <s-text type="strong">More settings can be found in Theme settings </s-text>

                                </s-paragraph>
                              </s-stack>
                            )}
                          </s-stack>
                  </s-stack>
              </CollapsibleSection>
            )}
          </s-stack>
        </s-section>
        </div>

        {/* Partea dreaptă - Preview (65%) */}
        <div style={{ width: "65%", flex: "1", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "20px", backgroundColor: "#f6f6f7", overflowY: "auto" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>
              Preview ({selectedDevice === "mobile" ? "Mobile" : selectedDevice === "tablet" ? "Tablet" : "Desktop"} Version)
            </h2>
          </div>
          <div style={{ backgroundColor: "#ffffff", padding: "20px", borderRadius: "4px", minHeight: "400px" }}>
            <PreviewTable 
              styling={getCurrentDeviceStyling()} 
              sections={sections} 
              isAccordion={isAccordion} 
              seeMoreEnabled={seeMoreEnabled} 
              splitViewPerSection={selectedDevice === "mobile" ? false : splitViewPerSection} 
              splitViewPerMetafield={selectedDevice === "mobile" ? false : splitViewPerMetafield}
              tableName={tableName}
              isCollapsible={isCollapsible}
              collapsibleOnPC={collapsibleOnPC}
              collapsibleOnMobile={collapsibleOnMobile}
              selectedDevice={selectedDevice}
            />
          </div>
        </div>
      </div>

      {/* Modal pentru editare metafield */}
      {editingMetafield && (() => {
        const section = sections[editingMetafield.sectionIndex];
        const metafield = section?.metafields?.[editingMetafield.metafieldIndex];
        const isCustomSpec = metafield?.type === 'custom_spec';
        const isProductSpec = metafield?.type === 'product_spec';
        const mfDef = !isCustomSpec && !isProductSpec ? metafieldDefinitions?.find(
          (mf) => mf.id === metafield?.metafieldDefinitionId
        ) : null;
        const productSpecLabel = isProductSpec 
          ? productSpecTypes.find(ps => ps.value === metafield?.productSpecType)?.label || metafield?.productSpecType
          : null;
        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setEditingMetafield(null);
                setMetafieldEditData({ customName: "", customValue: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false, prefix: "", suffix: "" });
              }
            }}
          >
            <s-box
              padding="large"
              borderWidth="base"
              borderRadius="base"
              background="base"
              style={{
                width: "90%",
                maxWidth: "500px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <s-stack direction="block" gap="base">
                <s-heading level="3">
                  {isCustomSpec 
                    ? "Edit Custom Specification"
                    : isProductSpec
                    ? `Edit Product Specification: ${productSpecLabel || "Unknown"}`
                    : `Edit Metafield: ${mfDef ? `${mfDef.namespace}.${mfDef.key}` : "Unknown"}`}
                </s-heading>
                
                {isCustomSpec ? (
                  <>
                    <s-text-field
                      label="Specification Name"
                      value={metafieldEditData.customName}
                      onChange={(e) =>
                        setMetafieldEditData({
                          ...metafieldEditData,
                          customName: e.target.value,
                        })
                      }
                      placeholder="e.g., Marime"
                      required
                    />
                    <s-text-field
                      label="Specification Value"
                      value={metafieldEditData.customValue}
                      onChange={(e) =>
                        setMetafieldEditData({
                          ...metafieldEditData,
                          customValue: e.target.value,
                        })
                      }
                      placeholder="e.g., 20"
                      required
                    />
                  </>
                ) : (
                  <s-text-field
                    label="Custom name (only for this template)"
                    value={metafieldEditData.customName}
                    onChange={(e) =>
                      setMetafieldEditData({
                        ...metafieldEditData,
                        customName: e.target.value,
                      })
                    }
                    placeholder={isProductSpec ? (productSpecLabel || "Product Specification") : (mfDef?.name || `${mfDef?.namespace}.${mfDef?.key}`)}
                    helpText={isProductSpec ? "If left blank, the default product specification name will be used" : "If left blank, the default name of the metafield will be used"}
                  />
                )}

                <s-checkbox
                  checked={metafieldEditData.tooltipEnabled}
                  onChange={(e) =>
                    setMetafieldEditData({
                      ...metafieldEditData,
                      tooltipEnabled: e.target.checked,
                    })
                  }
                  label="Enable tooltip"
                />

                {metafieldEditData.tooltipEnabled && (
                  <s-text-field
                    label="Tooltip text"
                    value={metafieldEditData.tooltipText}
                    onChange={(e) =>
                      setMetafieldEditData({
                        ...metafieldEditData,
                        tooltipText: e.target.value,
                      })
                    }
                    placeholder="Enter the tooltip text..."
                    multiline
                    rows={3}
                  />
                )}

                <s-stack direction="block" gap="base" style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <s-text emphasis="strong">Value Formatting:</s-text>
                    <span 
                      title="Prefix and Suffix allow you to add text before or after the metafield value. For example, if your metafield value is '50' and you add suffix 'cm', it will display as '50 cm'. Prefix adds text before the value (e.g., '$50'), while Suffix adds text after the value (e.g., '50 cm'). A space is automatically added between the value and the prefix/suffix."
                      style={{ 
                        cursor: "help",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        backgroundColor: "#202223",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: "bold",
                        lineHeight: "1",
                        verticalAlign: "middle"
                      }}
                    >
                      i
                    </span>
                  </div>
                  <s-text-field
                    label="Prefix"
                    value={metafieldEditData.prefix}
                    onChange={(e) =>
                      setMetafieldEditData({
                        ...metafieldEditData,
                        prefix: e.target.value,
                      })
                    }
                    placeholder="e.g., $, €, etc."
                    helpText="Text to add before the value. Example: prefix '$' with value '50' displays as '$ 50'"
                  />
                  <s-text-field
                    label="Suffix"
                    value={metafieldEditData.suffix}
                    onChange={(e) =>
                      setMetafieldEditData({
                        ...metafieldEditData,
                        suffix: e.target.value,
                      })
                    }
                    placeholder="e.g., cm, kg, etc."
                    helpText="Text to add after the value. Example: suffix 'cm' with value '50' displays as '50 cm'"
                  />
                </s-stack>

                <s-stack direction="block" gap="base" style={{ marginTop: "16px" }}>
                  <s-text emphasis="strong">Display Options:</s-text>
                  <s-switch
                    label="Hide from PC"
                    checked={metafieldEditData.hideFromPC}
                    onChange={(e) => {
                      const newHideFromPC = e.target.checked;
                      setMetafieldEditData({
                        ...metafieldEditData,
                        hideFromPC: newHideFromPC,
                        // Dacă hideFromPC devine true, hideFromMobile devine false (mutually exclusive)
                        hideFromMobile: newHideFromPC ? false : metafieldEditData.hideFromMobile,
                      });
                    }}
                  />
                  <s-switch
                    label="Hide from Mobile"
                    checked={metafieldEditData.hideFromMobile}
                    onChange={(e) => {
                      const newHideFromMobile = e.target.checked;
                      setMetafieldEditData({
                        ...metafieldEditData,
                        hideFromMobile: newHideFromMobile,
                        // Dacă hideFromMobile devine true, hideFromPC devine false (mutually exclusive)
                        hideFromPC: newHideFromMobile ? false : metafieldEditData.hideFromPC,
                      });
                    }}
                  />
                  <s-text tone="subdued" style={{ fontSize: "12px" }}>
                    Only one option can be enabled at a time. If both are disabled, the metafield will be displayed on all devices.
                  </s-text>
                </s-stack>

                <s-stack direction="inline" gap="tight" style={{ marginTop: "16px" }}>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      updateMetafieldData(
                        editingMetafield.sectionIndex,
                        editingMetafield.metafieldIndex,
                        metafieldEditData
                      );
                    }}
                  >
                    Save
                  </s-button>
                  <s-button
                    type="button"
                    variant="tertiary"
                    onClick={() => {
                      setEditingMetafield(null);
                      setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false, prefix: "", suffix: "" });
                    }}
                  >
                    Cancel
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          </div>
        );
      })()}

      {/* Modal pentru tooltip Template name */}
      {showTemplateNameTooltip && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTemplateNameTooltip(false);
            }
          }}
        >
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
            background="base"
            style={{
              maxWidth: "500px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <s-stack direction="block" gap="base">
              <s-heading level="3">About Template Name</s-heading>
              <s-paragraph>
                The template name is used to identify and organize your specification tables. This name will be visible in the Templates page where you can manage all your templates.
              </s-paragraph>
              <s-paragraph>
                <s-text type="strong">How it helps:</s-text>
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>Helps you quickly identify which template to use when assigning to products or collections</s-list-item>
                <s-list-item>Makes it easier to manage multiple templates in your store</s-list-item>
                <s-list-item>Appears in the template list for quick reference</s-list-item>
              </s-unordered-list>
              <s-stack direction="inline" gap="base" style={{ marginTop: "16px" }}>
                <s-button
                  variant="primary"
                  onClick={() => setShowTemplateNameTooltip(false)}
                >
                  Got it
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </div>
      )}

      {/* Modal pentru tooltip Sections and Specifications */}
      {showSectionsTooltip && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSectionsTooltip(false);
            }
          }}
        >
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
            background="base"
            style={{
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <s-stack direction="block" gap="base">
              <s-heading level="3">About Sections and Specifications</s-heading>
              <s-paragraph>
                Sections allow you to organize your specifications into logical groups. Each section can contain multiple specifications (metafields, product specifications, or custom specifications).
              </s-paragraph>
              <s-paragraph>
                <s-text type="strong">How it works:</s-text>
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>
                  <s-text type="strong">Sections:</s-text> Create multiple sections to group related specifications together (e.g., "Technical Specifications", "Dimensions", "Materials")
                </s-list-item>
                <s-list-item>
                  <s-text type="strong">Specifications:</s-text> Add metafields, product specifications (like SKU, weight, vendor), or create custom specifications with your own name and value
                </s-list-item>
                <s-list-item>
                  <s-text type="strong">Ordering:</s-text> You can reorder sections and specifications by dragging them to the desired position
                </s-list-item>
                <s-list-item>
                  <s-text type="strong">Display Logic:</s-text> The specifications will be displayed in the order you arrange them, grouped by their sections. Each section can have its own heading that appears in the final table
                </s-list-item>
              </s-unordered-list>
              <s-paragraph>
                <s-text type="strong">Example:</s-text> You might create a "Technical Specs" section with metafields like "Processor", "RAM", and "Storage", and a "Dimensions" section with "Width", "Height", and "Depth" specifications.
              </s-paragraph>
              <s-stack direction="inline" gap="base" style={{ marginTop: "16px" }}>
                <s-button
                  variant="primary"
                  onClick={() => setShowSectionsTooltip(false)}
                >
                  Got it
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </div>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
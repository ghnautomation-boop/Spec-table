import { useLoaderData, useFetcher, Form, useNavigate, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "~/shopify.server";
import {
  getTemplate,
  getMetafieldDefinitions,
  createTemplate,
  updateTemplate,
} from "~/models/template.server";

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
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const [template, metafieldDefinitions] = await Promise.all([
    id !== "new" ? getTemplate(id, session.shop) : null,
    getMetafieldDefinitions(session.shop),
  ]);

  // Debug: verifică dacă datele sunt corecte în template
  if (template) {
    console.log("Loader - Template loaded:", JSON.stringify(template.sections?.map(s => ({
      heading: s.heading,
      metafields: s.metafields?.map(mf => ({
        metafieldDefinitionId: mf.metafieldDefinitionId,
        customName: mf.customName,
        tooltipEnabled: mf.tooltipEnabled,
        tooltipText: mf.tooltipText,
      }))
    })), null, 2));
  }

  return {
    template,
    metafieldDefinitions,
    isNew: id === "new",
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
  
  // Debug logging
  console.log("Form submission - seeMore values:", {
    seeMoreEnabled,
    seeMoreHideFromPC,
    seeMoreHideFromMobile,
    splitViewPerSection,
    splitViewPerMetafield,
    splitViewPerSectionRaw,
    splitViewPerMetafieldRaw,
    rawPC: formData.get("seeMoreHideFromPC"),
    rawMobile: formData.get("seeMoreHideFromMobile")
  });

  // Validare: Template name nu poate fi gol
  if (!name || name.trim() === "") {
    return { success: false, error: "Template name cannot be empty" };
  }

  // Parse styling
  const styling = {
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
  };

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
      if (metafieldId) {
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
        
        console.log(`Metafield ${j} in section ${i}:`, {
          metafieldId,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
          prefix,
          suffix,
        });
        
        metafields.push({
          metafieldDefinitionId: metafieldId,
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

  try {
    if (id === "new") {
      await createTemplate(
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
    }

    return { success: true, redirect: "/app/templates" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function TemplateEditorPage() {
  const { template, metafieldDefinitions, isNew } = useLoaderData();
  const fetcher = useFetcher();
  const actionData = useActionData();
  const navigate = useNavigate();
  const shopify = useAppBridge();

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
        // Debug: verifică ce date sunt disponibile
        console.log("Loading metafield from template - raw data:", {
          id: mf.id,
          metafieldDefinitionId: mf.metafieldDefinitionId,
          customName: mf.customName,
          tooltipEnabled: mf.tooltipEnabled,
          tooltipText: mf.tooltipText,
          allKeys: Object.keys(mf),
        });
        
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
    
    console.log("Initial sections loaded:", JSON.stringify(initialSections, null, 2));
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
  const [metafieldSearchTerm, setMetafieldSearchTerm] = useState({});
  const [templateName, setTemplateName] = useState(template?.name || "");
  const [editingMetafield, setEditingMetafield] = useState(null); // { sectionIndex, metafieldIndex }
  const [metafieldEditData, setMetafieldEditData] = useState({ 
    customName: "", 
    tooltipEnabled: false, 
    tooltipText: "",
    hideFromPC: false,
    hideFromMobile: false,
    prefix: "",
    suffix: ""
  });
  const [formKey, setFormKey] = useState(0); // Counter pentru a forța re-renderizarea formularului
  const isInitialMount = useRef(true); // Flag pentru a detecta prima încărcare

  // Salvează state-ul inițial pentru detectarea schimbărilor
  const initialFormState = useRef({
    templateName: template?.name || "",
    sections: template?.sections ? template.sections.map(section => ({
      heading: section.heading,
      metafields: (section.metafields || []).map(mf => ({
        metafieldDefinitionId: mf.metafieldDefinitionId,
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
    styling: template?.styling ? (() => {
      const parsed = JSON.parse(template.styling);
      // Backward compatibility: dacă există textColor vechi, îl folosim pentru ambele
      if (parsed.textColor && !parsed.specificationTextColor) {
        parsed.specificationTextColor = parsed.textColor;
      }
      if (parsed.textColor && !parsed.valueTextColor) {
        parsed.valueTextColor = parsed.textColor;
      }
      return parsed;
    })() : {
      backgroundColor: "#ffffff",
      specificationTextColor: "#000000",
      valueTextColor: "#000000",
      headingColor: "#000000",
      headingFontSize: "16px",
      headingFontWeight: "bold",
      headingFontFamily: "Arial",
      textFontSize: "14px",
      textFontFamily: "Arial",
      borderWidth: "1px",
      borderRadius: "0px",
      padding: "10px",
      sectionBorderEnabled: false,
      sectionBorderWidth: "1px",
      sectionBorderColor: "#000000",
      sectionBorderStyle: "solid",
      rowBorderEnabled: false,
      rowBorderColor: "#000000",
      rowBorderStyle: "solid",
      rowBorderWidth: "1px",
      tdBackgroundColor: "#ffffff",
      rowBackgroundEnabled: false,
      oddRowBackgroundColor: "#f5f5f5",
      evenRowBackgroundColor: "#ffffff",
      textTransform: "none",
    }
  });


  // Debug: log sections când se schimbă
  useEffect(() => {
    console.log("Sections state updated:", JSON.stringify(sections, null, 2));
  }, [sections]);

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
      console.log("Updated seeMoreHideFromPC hidden input:", seeMoreHideFromPCInput.value);
    }
    if (seeMoreHideFromMobileInput) {
      seeMoreHideFromMobileInput.value = seeMoreHideFromMobile ? "true" : "false";
      console.log("Updated seeMoreHideFromMobile hidden input:", seeMoreHideFromMobileInput.value);
    }
  }, [seeMoreHideFromPC, seeMoreHideFromMobile]);

  // Actualizează valorile hidden inputs-urilor pentru splitViewPerSection și splitViewPerMetafield
  useEffect(() => {
    const splitViewPerSectionInput = document.querySelector('input[name="splitViewPerSection"]');
    const splitViewPerMetafieldInput = document.querySelector('input[name="splitViewPerMetafield"]');
    
    if (splitViewPerSectionInput) {
      splitViewPerSectionInput.value = splitViewPerSection ? "true" : "false";
      console.log("Updated splitViewPerSection hidden input:", splitViewPerSectionInput.value);
    }
    if (splitViewPerMetafieldInput) {
      splitViewPerMetafieldInput.value = splitViewPerMetafield ? "true" : "false";
      console.log("Updated splitViewPerMetafield hidden input:", splitViewPerMetafieldInput.value);
    }
  }, [splitViewPerSection, splitViewPerMetafield]);

  const [styling, setStyling] = useState(
    template?.styling
      ? JSON.parse(template.styling)
      : {
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
          // See More Button Settings
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
        }
  );

  // Sincronizează state-ul când se încarcă template-ul
  useEffect(() => {
    if (template?.styling) {
      const parsedStyling = JSON.parse(template.styling);
      // Backward compatibility: dacă există textColor vechi, îl folosim pentru ambele
      if (parsedStyling.textColor && !parsedStyling.specificationTextColor) {
        parsedStyling.specificationTextColor = parsedStyling.textColor;
      }
      if (parsedStyling.textColor && !parsedStyling.valueTextColor) {
        parsedStyling.valueTextColor = parsedStyling.textColor;
      }
      // Backward compatibility: dacă nu există columnBackgroundEnabled, setează false
      if (parsedStyling.columnBackgroundEnabled === undefined) {
        parsedStyling.columnBackgroundEnabled = false;
      }
      if (!parsedStyling.oddColumnBackgroundColor) {
        parsedStyling.oddColumnBackgroundColor = "#ff0000";
      }
      if (!parsedStyling.evenColumnBackgroundColor) {
        parsedStyling.evenColumnBackgroundColor = "#00ff00";
      }
      // Backward compatibility: See More Button Settings
      if (!parsedStyling.seeMoreButtonStyle) {
        parsedStyling.seeMoreButtonStyle = "arrow";
      }
      if (!parsedStyling.seeMoreButtonText) {
        parsedStyling.seeMoreButtonText = "See More";
      }
      if (parsedStyling.seeMoreButtonBorderEnabled === undefined) {
        parsedStyling.seeMoreButtonBorderEnabled = false;
      }
      if (!parsedStyling.seeMoreButtonBorderWidth) {
        parsedStyling.seeMoreButtonBorderWidth = "1px";
      }
      if (!parsedStyling.seeMoreButtonBorderStyle) {
        parsedStyling.seeMoreButtonBorderStyle = "solid";
      }
      if (!parsedStyling.seeMoreButtonBorderColor) {
        parsedStyling.seeMoreButtonBorderColor = "#000000";
      }
      if (!parsedStyling.seeMoreButtonColor) {
        parsedStyling.seeMoreButtonColor = "#000000";
      }
      if (!parsedStyling.seeMoreButtonBackground) {
        parsedStyling.seeMoreButtonBackground = "transparent";
      }
      if (!parsedStyling.seeMoreButtonFontSize) {
        parsedStyling.seeMoreButtonFontSize = "14px";
      }
      if (!parsedStyling.seeMoreButtonFontStyle) {
        parsedStyling.seeMoreButtonFontStyle = "normal";
      }
      if (!parsedStyling.seeMoreButtonFontFamily) {
        parsedStyling.seeMoreButtonFontFamily = "Arial";
      }
      if (!parsedStyling.seeMoreButtonBorderRadius) {
        parsedStyling.seeMoreButtonBorderRadius = "0px";
      }
      if (!parsedStyling.seeMoreButtonPadding) {
        parsedStyling.seeMoreButtonPadding = "8px";
      }
      setStyling(parsedStyling);
    }
    if (template?.sections) {
      setSections(template.sections);
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

  // Monitorizează salvarea cu succes
  useEffect(() => {
    if (actionData?.success) {
      // Afișează notificare toast de succes
      shopify.toast.show(
        `Template ${isNew ? "created" : "updated"} successfully!`
      );
      
      // Actualizează state-ul inițial după salvare cu succes
      // pentru a reseta detectarea schimbărilor nesalvate
      initialFormState.current = {
        templateName,
        sections: JSON.parse(JSON.stringify(sections)),
        isActive,
        isAccordion,
        isAccordionHideFromPC,
        isAccordionHideFromMobile,
        seeMoreEnabled,
        seeMoreHideFromPC,
        seeMoreHideFromMobile,
        splitViewPerSection,
        splitViewPerMetafield,
        styling: JSON.parse(JSON.stringify(styling))
      };
      
      // Resetează flag-ul pentru a preveni declanșarea evenimentelor change imediat după salvare
      isInitialMount.current = true;
      
      // Save Bar se va ascunde automat după submit cu succes
      
      // Dacă există redirect, navighează după 1.5 secunde pentru a permite utilizatorului să vadă notificarea
      if (actionData?.redirect) {
        const timer = setTimeout(() => {
          navigate(actionData.redirect);
        }, 1500);
        return () => clearTimeout(timer);
      }
    } else if (actionData?.success === false && actionData?.error) {
      // Dacă există eroare, afișează-o automat
      shopify.toast.show(`Eroare: ${actionData.error}`, { isError: true });
    }
  }, [actionData, navigate, shopify, templateName, sections, isActive, isAccordion, 
      isAccordionHideFromPC, isAccordionHideFromMobile, seeMoreEnabled, 
      seeMoreHideFromPC, seeMoreHideFromMobile, styling, isNew]);

  // Funcție pentru a detecta dacă există schimbări nesalvate
  const hasUnsavedChanges = useCallback(() => {
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

        if (currentMf.metafieldDefinitionId !== initialMf.metafieldDefinitionId ||
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
      tableName, isCollapsible, collapsibleOnPC, collapsibleOnMobile, sections, styling]);


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

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(
        `Template ${isNew ? "created" : "updated"} successfully!`
      );
      navigate("/app/templates");
    } else if (fetcher.data?.success === false) {
      shopify.toast.show(`Eroare: ${fetcher.data.error}`, { isError: true });
    }
  }, [fetcher.data, shopify, navigate, isNew]);

  // Închide lista de metafield-uri când se dă click în afara ei
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openSelectIndex !== null) {
        const target = event.target;
        if (!target.closest('[data-metafield-selector]')) {
          setOpenSelectIndex(null);
        }
      }
    };

    if (openSelectIndex !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openSelectIndex]);

  const addSection = () => {
    setSections([...sections, { heading: "", metafields: [] }]);
  };

  const removeSection = (index) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSectionHeading = (index, heading) => {
    const newSections = [...sections];
    newSections[index].heading = heading;
    setSections(newSections);
  };

  const reorderSection = useCallback((sectionIndex, newPosition) => {
    // newPosition este 1-based (poziția 1, 2, 3, etc.)
    // Convertim la 0-based pentru array
    const targetIndex = newPosition - 1;
    
    if (sectionIndex === targetIndex) return; // Nu face nimic dacă poziția este aceeași
    
    setSections((prevSections) => {
      const newSections = [...prevSections];
      const [movedSection] = newSections.splice(sectionIndex, 1);
      newSections.splice(targetIndex, 0, movedSection);
      return newSections;
    });
    
    // Forțează re-renderizarea pentru a actualiza dropdown-urile
    setFormKey(prev => prev + 1);
  }, []);

  // Adaugă event listeners pentru dropdown-urile de reordering secțiunilor
  useEffect(() => {
    if (sections.length <= 1) return;

    const timeoutId = setTimeout(() => {
      const sectionPositionSelects = document.querySelectorAll('s-select[id^="section-position-"]');
      const selectHandlers = new Map();

      sectionPositionSelects.forEach((select) => {
        const id = select.getAttribute('id');
        if (!id || !id.startsWith('section-position-')) return;

        const sectionIndex = parseInt(id.replace('section-position-', ''));
        if (isNaN(sectionIndex)) return;

        const changeHandler = (e) => {
          const target = e.target || e.currentTarget;
          const newPosition = parseInt(target.value);
          if (newPosition && newPosition !== sectionIndex + 1) {
            reorderSection(sectionIndex, newPosition);
          }
        };

        select.addEventListener('change', changeHandler);
        selectHandlers.set(select, { change: changeHandler });
      });

      // Cleanup function
      return () => {
        selectHandlers.forEach((handlers, select) => {
          select.removeEventListener('change', handlers.change);
        });
      };
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [sections, reorderSection]); // Re-run când secțiunile se schimbă (inclusiv la reordering)

  const addMetafieldToSection = (sectionIndex, metafieldId) => {
    if (!metafieldId) return;
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields) {
      newSections[sectionIndex].metafields = [];
    }
    newSections[sectionIndex].metafields.push({
      metafieldDefinitionId: metafieldId,
      customName: null,
      tooltipEnabled: false,
      tooltipText: null,
      prefix: null,
      suffix: null,
    });
    setSections(newSections);
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
          metafieldDefinitionId: id,
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

  const updateMetafieldData = (sectionIndex, metafieldIndex, data) => {
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields[metafieldIndex]) {
      return;
    }
    
    // Tratează valorile goale corect
    const customName = data.customName && data.customName.trim() !== "" ? data.customName.trim() : null;
    const tooltipText = data.tooltipText && data.tooltipText.trim() !== "" ? data.tooltipText.trim() : null;
    const prefix = data.prefix && data.prefix.trim() !== "" ? data.prefix.trim() : null;
    const suffix = data.suffix && data.suffix.trim() !== "" ? data.suffix.trim() : null;
    
    console.log("Updating metafield data:", {
      sectionIndex,
      metafieldIndex,
      customName,
      tooltipEnabled: data.tooltipEnabled,
      tooltipText,
      prefix,
      suffix,
    });
    
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
    setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false, prefix: "", suffix: "" });
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

  const getFilteredMetafields = (sectionIndex) => {
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
    return filtered.sort((a, b) => {
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
  };

  // Debug pentru metafield-uri
  console.log("Metafield definitions loaded:", metafieldDefinitions?.length || 0);

  // Component pentru secțiune accordion
  const AccordionSection = ({ section, sectionIndex, styling, metafieldDefinitions, renderMetafieldRow, globalIndexOffset }) => {
    const [isOpen, setIsOpen] = useState(sectionIndex === 0);
    
    return (
      <div style={{ marginBottom: "20px" }}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            color: styling.headingColor,
            fontSize: styling.headingFontSize,
            fontWeight: styling.headingFontWeight,
            fontFamily: styling.headingFontFamily,
            cursor: "pointer",
            padding: "10px",
            backgroundColor: styling.backgroundColor,
            borderBottom: `1px solid ${styling.specificationTextColor || styling.valueTextColor || "#000000"}`,
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
  const PreviewTable = ({ styling, sections, isAccordion, seeMoreEnabled, splitViewPerSection = false, splitViewPerMetafield = false, tableName = "Specifications", isCollapsible = false, collapsibleOnPC = false, collapsibleOnMobile = false }) => {
    const [showAll, setShowAll] = useState(!seeMoreEnabled);
    const [isCollapsed, setIsCollapsed] = useState(true);
    
    // Colectează toate metafields-urile din toate secțiunile cu informații despre secțiune
    const allMetafieldsWithSection = sections.flatMap((section, sectionIndex) => 
      (section.metafields || []).map((metafield, mfIndex) => ({
        ...metafield,
        sectionIndex,
        sectionHeading: section.heading,
        mfIndex,
      }))
    );
    
    const totalRows = allMetafieldsWithSection.length;
    const displayRows = seeMoreEnabled && !showAll ? allMetafieldsWithSection.slice(0, 10) : allMetafieldsWithSection;
    const hasMore = seeMoreEnabled && totalRows > 10;
    
    // Grupează rândurile afișate pe secțiuni pentru a le renderiza corect
    const groupedBySection = displayRows.reduce((acc, item) => {
      if (!acc[item.sectionIndex]) {
        acc[item.sectionIndex] = {
          heading: item.sectionHeading,
          metafields: [],
        };
      }
      acc[item.sectionIndex].metafields.push(item);
      return acc;
    }, {});
    
    const containerStyle = {
      backgroundColor: styling.backgroundColor,
      color: styling.specificationTextColor || styling.valueTextColor || "#000000", // Fallback pentru backward compatibility
      borderWidth: styling.borderWidth,
      borderColor: styling.sectionBorderEnabled ? styling.sectionBorderColor : "transparent",
      borderStyle: styling.sectionBorderEnabled ? styling.sectionBorderStyle : "none",
      borderRadius: styling.borderRadius,
      padding: styling.padding,
      fontFamily: styling.textFontFamily,
      fontSize: styling.textFontSize,
    };

    const headingStyle = {
      color: styling.headingColor,
      fontSize: styling.headingFontSize,
      fontWeight: styling.headingFontWeight,
      fontFamily: styling.headingFontFamily,
    };

    const renderMetafieldRow = (metafield, globalIndex) => {
      const mfDef = metafieldDefinitions?.find(
        (mf) => mf.id === metafield.metafieldDefinitionId
      );
      const metafieldName = metafield.customName 
        ? metafield.customName
        : (mfDef
            ? (mfDef.name || `${mfDef.namespace}.${mfDef.key}`)
            : "Metafield");
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
        <tr key={`${metafield.sectionIndex}-${metafield.mfIndex}`} style={{ borderBottom: styling.rowBorderEnabled ? `${styling.rowBorderWidth} ${styling.rowBorderStyle} ${styling.rowBorderColor}` : "none" }}>
          <td
            style={{
              padding: "8px",
              fontWeight: "bold",
              width: "40%",
              color: styling.specificationTextColor || "#000000",
              fontFamily: styling.textFontFamily,
              fontSize: styling.textFontSize,
              backgroundColor: specBackground,
              textTransform: styling.textTransform,
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
              color: styling.valueTextColor || "#000000",
              fontFamily: styling.textFontFamily,
              fontSize: styling.textFontSize,
              backgroundColor: valueBackground,
              textTransform: styling.textTransform,
            }}
          >
            Example value
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
        }}>
        {sections.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: styling.specificationTextColor || styling.valueTextColor || "#000000" }}>
            <p>Add sections to see the preview</p>
          </div>
        ) : isAccordion ? (
          <>
            {Object.entries(groupedBySection).map(([sectionIndex, sectionData]) => {
              const sectionIdx = parseInt(sectionIndex);
              // Calculează offset-ul global pentru indexarea corectă a rândurilor
              const globalIndexOffset = displayRows.findIndex(mf => mf.sectionIndex === sectionIdx);
              
              return (
                <AccordionSection
                  key={sectionIdx}
                  section={sectionData}
                  sectionIndex={sectionIdx}
                  styling={styling}
                  metafieldDefinitions={metafieldDefinitions}
                  renderMetafieldRow={renderMetafieldRow}
                  globalIndexOffset={globalIndexOffset >= 0 ? globalIndexOffset : 0}
                />
              );
            })}
            {hasMore && !showAll && (
              <div style={{ textAlign: "center", marginTop: "12px" }}>
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
          </>
        ) : splitViewPerSection ? (
          <>
            {/* Split View per Section */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {Object.entries(groupedBySection).map(([sectionIndex, sectionData], idx) => {
                const sectionIdx = parseInt(sectionIndex);
                const columnClass = idx % 2 === 0 ? "left" : "right";
                return (
                  <div key={sectionIdx} style={{ marginBottom: "20px" }}>
                    <h3 style={headingStyle}>{sectionData.heading}</h3>
                    {sectionData.metafields && sectionData.metafields.length > 0 ? (
                      splitViewPerMetafield ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "10px" }}>
                          <div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                {sectionData.metafields.filter((_, mfIdx) => mfIdx % 2 === 0).map((metafield, idx) => {
                                  const globalIndex = displayRows.indexOf(metafield);
                                  return renderMetafieldRow(metafield, globalIndex);
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                {sectionData.metafields.filter((_, mfIdx) => mfIdx % 2 === 1).map((metafield, idx) => {
                                  const globalIndex = displayRows.indexOf(metafield);
                                  return renderMetafieldRow(metafield, globalIndex);
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                          <tbody>
                            {sectionData.metafields.map((metafield, idx) => {
                              const globalIndex = displayRows.indexOf(metafield);
                              return renderMetafieldRow(metafield, globalIndex);
                            })}
                          </tbody>
                        </table>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {Object.entries(groupedBySection).map(([sectionIndex, sectionData]) => {
              const sectionIdx = parseInt(sectionIndex);
              return (
                <div key={sectionIdx} style={{ marginBottom: sectionIdx < sections.length - 1 ? "20px" : "0" }}>
                  <h3 style={headingStyle}>{sectionData.heading}</h3>
                  {sectionData.metafields && sectionData.metafields.length > 0 ? (
                    splitViewPerMetafield ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "10px" }}>
                        <div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              {sectionData.metafields.filter((_, mfIdx) => mfIdx % 2 === 0).map((metafield, idx) => {
                                const globalIndex = displayRows.indexOf(metafield);
                                return renderMetafieldRow(metafield, globalIndex);
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              {sectionData.metafields.filter((_, mfIdx) => mfIdx % 2 === 1).map((metafield, idx) => {
                                const globalIndex = displayRows.indexOf(metafield);
                                return renderMetafieldRow(metafield, globalIndex);
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                        <tbody>
                          {sectionData.metafields.map((metafield, idx) => {
                            const globalIndex = displayRows.indexOf(metafield);
                            return renderMetafieldRow(metafield, globalIndex);
                          })}
                        </tbody>
                      </table>
                    )
                  ) : (
                    <p style={{ marginTop: "10px", color: styling.specificationTextColor || styling.valueTextColor || "#000000", fontStyle: "italic" }}>
                      Metafields does not exist in this section
                    </p>
                  )}
                </div>
              );
            })}
            {hasMore && !showAll && (
              <div style={{ textAlign: "center", marginTop: "12px" }}>
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
          </>
        )}
        </div> {/* Închide div-ul pentru conținutul collapsible */}
      </div>
    );
  };

  return (
    <s-page heading={isNew ? "Creează Template Nou" : `Editează: ${template?.name}`}>
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
            data-save-bar
            data-discard-confirmation
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
                console.log("onSubmit - Updated splitViewPerSection:", splitViewPerSectionInput.value, "from state:", splitViewPerSectionValue);
              } else {
                console.error("onSubmit - splitViewPerSection input not found!");
              }
              if (splitViewPerMetafieldInput) {
                splitViewPerMetafieldInput.value = splitViewPerMetafieldValue ? "true" : "false";
                console.log("onSubmit - Updated splitViewPerMetafield:", splitViewPerMetafieldInput.value, "from state:", splitViewPerMetafieldValue);
              } else {
                console.error("onSubmit - splitViewPerMetafield input not found!");
              }
              
              // Actualizează valorile pentru seeMoreHideFromPC și seeMoreHideFromMobile
              const seeMoreHideFromPCInput = e.currentTarget.querySelector('input[name="seeMoreHideFromPC"]');
              const seeMoreHideFromMobileInput = e.currentTarget.querySelector('input[name="seeMoreHideFromMobile"]');
              
              if (seeMoreHideFromPCInput) {
                seeMoreHideFromPCInput.value = seeMoreHideFromPC ? "true" : "false";
                console.log("onSubmit - Updated seeMoreHideFromPC:", seeMoreHideFromPCInput.value);
              }
              if (seeMoreHideFromMobileInput) {
                seeMoreHideFromMobileInput.value = seeMoreHideFromMobile ? "true" : "false";
                console.log("onSubmit - Updated seeMoreHideFromMobile:", seeMoreHideFromMobileInput.value);
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
              // Resetează flag-ul ÎNAINTE de a schimba state-urile pentru a preveni declanșarea evenimentelor change
              isInitialMount.current = true;
              
              setTemplateName(initialFormState.current.templateName);
              setIsActive(initialFormState.current.isActive);
              setIsAccordion(initialFormState.current.isAccordion);
              setIsAccordionHideFromPC(initialFormState.current.isAccordionHideFromPC);
              setIsAccordionHideFromMobile(initialFormState.current.isAccordionHideFromMobile);
              setSeeMoreEnabled(initialFormState.current.seeMoreEnabled);
              setSeeMoreHideFromPC(initialFormState.current.seeMoreHideFromPC);
              setSeeMoreHideFromMobile(initialFormState.current.seeMoreHideFromMobile);
              setSplitViewPerSection(initialFormState.current.splitViewPerSection);
              setSplitViewPerMetafield(initialFormState.current.splitViewPerMetafield);
              setTableName(initialFormState.current.tableName);
              setIsCollapsible(initialFormState.current.isCollapsible);
              setCollapsibleOnPC(initialFormState.current.collapsibleOnPC);
              setCollapsibleOnMobile(initialFormState.current.collapsibleOnMobile);
              setSections(JSON.parse(JSON.stringify(initialFormState.current.sections)));
              setStyling(JSON.parse(JSON.stringify(initialFormState.current.styling)));
              setFormKey(prev => prev + 1);
              
              // După ce state-urile s-au resetat, resetează flag-ul pentru a permite detectarea modificărilor viitoare
              setTimeout(() => {
                isInitialMount.current = false;
              }, 300);
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
            <input type="hidden" name="backgroundColor" value={styling.backgroundColor} />
            <input type="hidden" name="specificationTextColor" value={styling.specificationTextColor} />
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
                        value={mf.metafieldDefinitionId || mf.id}
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
                    </div>
                    ))}
                </div>
                ))}

          </Form>

      {/* Secțiuni de bază - Informații și Metafield-uri */}
      <div style={{ marginBottom: "20px" }}>
        <s-section heading="Basic information">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value || e.currentTarget?.value || "")}
              required
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
              checked={isCollapsible}
              onChange={(e) => {
                const newValue = e.target.checked;
                setIsCollapsible(newValue);
                // Dacă dezactivezi collapsible, dezactivează și opțiunile PC/Mobile
                if (!newValue) {
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
                  label="Collapsible table just on PC"
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

        <s-section heading="Sections and Metafields">
          <s-stack direction="block" gap="base">
            {sections.map((section, sectionIndex) => (
              <s-box
                key={`section-${sectionIndex}-${section.heading || ""}-${formKey}`}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
                style={{ position: "relative", overflow: "visible" }}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-heading level="3">Section {sectionIndex + 1}</s-heading>
                    <s-stack direction="inline" gap="tight" alignment="center">
                      {sections.length > 1 && (
                        <>
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
                        </>
                      )}
                    </s-stack>
                  </s-stack>
                  <s-stack gap="tight" alignment="center">
                    {sections.length > 1 && (
                        <>
                          <div style={{ minWidth: "140px" }}>
                            <span>Reorder Section: </span>
                            <s-select
                              id={`section-position-${sectionIndex}`}
                              label={`Section ${sectionIndex + 1} position`}
                              labelAccessibilityVisibility="exclusive"
                              value={(sectionIndex + 1).toString()}
                              key={`section-position-select-${sectionIndex}-${formKey}`}
                            >
                              {sections.map((_, idx) => (
                                <s-option key={idx} value={(idx + 1).toString()}>
                                  Position {idx + 1}
                                </s-option>
                              ))}
                            </s-select>
                          </div>
                        </>
                      )}
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
                  />

                  <s-stack direction="block" gap="tight">
                    <s-text emphasis="strong">Metafields:</s-text>
                    {section.metafields && section.metafields.length > 0 ? (
                      <div style={{ width: "100%", border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ backgroundColor: "#f6f6f7", borderBottom: "2px solid #e1e3e5" }}>
                              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", fontSize: "14px", color: "#202223", width: "40px" }}>
                                {/* Drag handle column */}
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", fontSize: "14px", color: "#202223" }}>
                                Spec Name
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", fontSize: "14px", color: "#202223" }}>
                                Spec Definition
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: "600", fontSize: "14px", color: "#202223", width: "100px" }}>
                                Hide from PC
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: "600", fontSize: "14px", color: "#202223", width: "100px" }}>
                                Hide from Mobile
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: "600", fontSize: "14px", color: "#202223", width: "100px" }}>
                                Prefix
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: "600", fontSize: "14px", color: "#202223", width: "100px" }}>
                                Suffix
                              </th>
                              <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: "600", fontSize: "14px", color: "#202223", width: "120px" }}>
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.metafields.map((metafield, mfIndex) => {
                              const mfDef = metafieldDefinitions.find(
                                (mf) => mf.id === metafield.metafieldDefinitionId
                              );
                              // Forțează re-renderizarea când se schimbă valorile
                              const metafieldKey = `${sectionIndex}-${mfIndex}-${metafield.customName || ""}-${metafield.tooltipEnabled}-${metafield.tooltipText || ""}-${metafield.prefix || ""}-${metafield.suffix || ""}`;
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
                                  <td style={{ padding: "12px 8px", verticalAlign: "middle", width: "40px", textAlign: "center" }}>
                                    <s-icon type="drag-handle" color="subdued" size="small" />
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                                    <s-text>
                                      {mfDef
                                        ? (metafield.customName || mfDef.name || `${mfDef.namespace}.${mfDef.key}`)
                                        : "Metafield deleted"}
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
                                    </s-text>
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                                    <s-text style={{ color: "#6d7175", fontSize: "13px" }}>
                                      {mfDef
                                        ? `${mfDef.namespace}.${mfDef.key} (${mfDef.ownerType})`
                                        : "N/A"}
                                    </s-text>
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "center" }}>
                                    {metafield.hideFromPC ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "24px",
                                        height: "24px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "12px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "center" }}>
                                    {metafield.hideFromMobile ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "24px",
                                        height: "24px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "12px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "center" }}>
                                    {metafield.prefix && metafield.prefix.trim() !== "" ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "24px",
                                        height: "24px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "12px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "center" }}>
                                    {metafield.suffix && metafield.suffix.trim() !== "" ? (
                                      <span style={{ 
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "24px",
                                        height: "24px",
                                        borderRadius: "50%",
                                        backgroundColor: "#008060",
                                        color: "#ffffff",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        lineHeight: "1"
                                      }}>
                                        ✓
                                      </span>
                                    ) : (
                                      <span style={{ color: "#6d7175", fontSize: "12px" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right" }}>
                                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
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
                    ) : (
                      <s-text style={{ color: "#6d7175", fontStyle: "italic" }}>
                        No metafields added in this section
                      </s-text>
                    )}

                    <div
                      style={{ position: "relative", width: "100%" }}
                      data-metafield-selector
                    >
                      <s-button
                        type="button"
                        variant="secondary"
                        icon = "search"
                        onClick={() =>
                          setOpenSelectIndex(
                            openSelectIndex === sectionIndex ? null : sectionIndex
                          )
                      }
                      >
                        {openSelectIndex === sectionIndex
                          ? "Close the list"
                          : getAvailableMetafields(sectionIndex).length > 0
                          ? `Select metafields (${getAvailableMetafields(sectionIndex).length} available)`
                          : "No any metafields available"}
                      </s-button>
                      {openSelectIndex === sectionIndex &&
                        getAvailableMetafields(sectionIndex).length > 0 && (
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
                              maxHeight: "600px",
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                              border: "1px solid #e1e3e5",
                              display: "flex",
                              flexDirection: "column",
                            }}
                          >
                            <s-stack direction="block" gap="base" style={{ flexShrink: 0 }}>
                              <s-text emphasis="strong">
                                Select metafields ({getAvailableMetafields(sectionIndex).length} available):
                              </s-text>
                              <s-text-field
                                label="Search metafields"
                                value={metafieldSearchTerm[sectionIndex] || ""}
                                onChange={(e) => {
                                  setMetafieldSearchTerm({
                                    ...metafieldSearchTerm,
                                    [sectionIndex]: e.target.value,
                                  });
                                }}
                                placeholder="Search by name, namespace, key..."
                                autoComplete="off"
                              />
                            </s-stack>
                            <div
                              style={{ 
                                maxHeight: "400px", 
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
                              <s-stack
                                direction="block"
                                gap="tight"
                              >
                                {getFilteredMetafields(sectionIndex).length === 0 ? (
                                  <s-text tone="subdued" style={{ padding: "16px", textAlign: "center" }}>
                                    {metafieldSearchTerm[sectionIndex] 
                                      ? "No metafields found that match the search"
                                      : "No metafields available"}
                                  </s-text>
                                ) : (
                                  getFilteredMetafields(sectionIndex).map((mf) => {
                                  const isSelected =
                                    selectedMetafieldsForSection[
                                      `${sectionIndex}_${mf.id}`
                                    ];
                                  const metafieldLabel = `${mf.namespace}.${mf.key} (${mf.ownerType})${mf.name ? ` - ${mf.name}` : ""}`;
                                  return (
                                    <s-checkbox
                                      key={mf.id}
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
                                })
                                )}
                              </s-stack>
                            </div>
                            <s-stack direction="inline" gap="tight" style={{ flexShrink: 0, marginTop: "12px" }}>
                                <s-button
                                  type="button"
                                  variant="primary"
                                  onClick={() => {
                                    addSelectedMetafieldsToSection(sectionIndex);
                                    setOpenSelectIndex(null);
                                  }}
                                >
                                  Add Selected
                                </s-button>
                                <s-button
                                  type="button"
                                  variant="tertiary"
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
                                </s-button>
                              </s-stack>
                              <div style={{ marginTop: "12px", padding: "8px 12px", backgroundColor: "#f6f6f7", borderRadius: "4px", fontSize: "13px", color: "#6d7175" }}>
                                <s-text>
                                  If you are not able to see a specific metafield already created in the store in this list, please{" "}
                                  <a 
                                    href="/app/sync" 
                                    style={{ color: "#008060", textDecoration: "underline", cursor: "pointer" }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      navigate("/app/sync");
                                    }}
                                  >
                                    Sync metafields from this page → Data Sync
                                  </a>
                                </s-text>
                              </div>
                          </s-box>
                        )}
                    </div>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}

            <s-button 
              type="button" 
              onClick={addSection}
              variant="success"
              icon="add"
            >
               Add New Section
            </s-button>
          </s-stack>
          
          {/* Setări pentru afișare */}
          <s-stack direction="block" gap="base" style={{ marginTop: "24px" }}>
            <s-switch
              id="accordion-switch"
              name="isAccordion"
              checked={isAccordion}
              onChange={(e) => {
                const newValue = e.target.checked;
                setIsAccordion(newValue);
                // Dacă dezactivezi accordion, resetează și flag-urile hide
                if (!newValue) {
                  setIsAccordionHideFromPC(false);
                  setIsAccordionHideFromMobile(false);
                }
              }}
              value={isAccordion ? "true" : "false"}
              label="Show as accordion (expandable)"
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
                    label="Show as accordion just on mobile"
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
                    label="Show as accordion just on PC"
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
                // Dacă dezactivezi seeMore, resetează și flag-urile hide
                if (!newValue) {
                  setSeeMoreHideFromPC(false);
                  setSeeMoreHideFromMobile(false);
                }
              }}
              value={seeMoreEnabled ? "true" : "false"}
              label="See more button (Show first 10 rows)"
            />
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
                </s-stack>
              </s-box>
            )}
          </s-stack>
        </s-section>
      </div>

      <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 400px)", minHeight: "600px" }}>
        {/* Partea stângă - Stiluri (30%) */}
        <div style={{ width: "30%", overflowY: "auto", paddingRight: "10px" }}>
        <s-section heading="Styles">
          <s-stack direction="block" gap="base">
            {/* 1. Section Styling */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading level="3">Section Styling</s-heading>
                <s-stack direction="block" gap="base">
              <s-color-field
                label="Background Color"
                name="backgroundColor"
                    value={styling.backgroundColor}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      setStyling((prev) => ({
                        ...prev,
                        backgroundColor: value,
                      }));
                    }}
                  />
                  
                  {/* Section Border */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="section-border-switch"
                      label="Section Border"
                      checked={styling.sectionBorderEnabled}
                onChange={(e) => {
                        setStyling((prev) => ({
                          ...prev,
                          sectionBorderEnabled: e.target.checked,
                        }));
                      }}
                    />
                    {styling.sectionBorderEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
              <s-color-field
                            label="Section Border Color"
                            name="sectionBorderColor"
                            value={styling.sectionBorderColor}
                alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                sectionBorderColor: value,
                              }));
                            }}
                          />
                          <s-select
                            name="sectionBorderStyle"
                            label="Stil Section Border"
                            value={styling.sectionBorderStyle}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, sectionBorderStyle: value }));
                              }
                            }}
                onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, sectionBorderStyle: value }));
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
                              value={pxToNumber(styling.borderWidth)}
                              onChange={(value) => {
                                setStyling((prev) => ({
                                  ...prev,
                                  borderWidth: numberToPx(value),
                                }));
                              }}
                              min={0}
                              max={20}
                              step={1}
                              output
                            />
                            <input
                              type="hidden"
                              name="borderWidth"
                              value={styling.borderWidth}
                            />
                          </div>
                          <div style={{ width: "100%" }}>
                            <RangeSlider
                              label="Border Round Corners"
                              value={pxToNumber(styling.borderRadius)}
                              onChange={(value) => {
                                setStyling((prev) => ({
                                  ...prev,
                                  borderRadius: numberToPx(value),
                                }));
                              }}
                              min={0}
                              max={50}
                              step={1}
                              output
                            />
                            <input
                              type="hidden"
                              name="borderRadius"
                              value={styling.borderRadius}
                            />
                          </div>
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>

                  <div style={{ width: "100%" }}>
                    <RangeSlider
                      label="Padding"
                      value={pxToNumber(styling.padding)}
                      onChange={(value) => {
                        setStyling((prev) => ({
                          ...prev,
                          padding: numberToPx(value),
                        }));
                      }}
                      min={0}
                      max={50}
                      step={1}
                      output
                    />
                    <input
                      type="hidden"
                      name="padding"
                      value={styling.padding}
                    />
                  </div>
                </s-stack>
              </s-stack>
            </s-box>

            {/* 2. Header Styling */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading level="3">Header Styling</s-heading>
                <s-stack direction="block" gap="base">
              <s-color-field
                label="Heading Color"
                name="headingColor"
                    value={styling.headingColor}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      setStyling((prev) => ({
                        ...prev,
                        headingColor: value,
                      }));
                    }}
                  />
            <s-stack direction="inline" gap="base">
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Heading Font Size"
                        value={pxToNumber(styling.headingFontSize)}
                        onChange={(value) => {
                          setStyling((prev) => ({
                            ...prev,
                            headingFontSize: numberToPx(value),
                          }));
                        }}
                        min={8}
                        max={72}
                        step={1}
                        output
                      />
                      <input
                        type="hidden"
                        name="headingFontSize"
                value={styling.headingFontSize}
              />
                    </div>
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Heading Font Weight"
                        value={parseInt(styling.headingFontWeight) || 400}
                        onChange={(value) => {
                          setStyling((prev) => ({
                            ...prev,
                            headingFontWeight: value.toString(),
                          }));
                        }}
                        min={100}
                        max={900}
                        step={100}
                        output
                      />
                      <input
                        type="hidden"
                        name="headingFontWeight"
                value={styling.headingFontWeight}
              />
                    </div>
              <s-select
                name="headingFontFamily"
                label="Heading Font"
                value={styling.headingFontFamily}
                      onInput={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          setStyling((prev) => ({ ...prev, headingFontFamily: value }));
                        }
                      }}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          setStyling((prev) => ({ ...prev, headingFontFamily: value }));
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
                </s-stack>
              </s-stack>
            </s-box>

            {/* 3. Spec Styling */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading level="3">Spec Styling</s-heading>
                <s-stack direction="block" gap="base">
                  <s-color-field
                    label="Specification Text Color"
                    name="specificationTextColor"
                    value={styling.specificationTextColor || "#000000"}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      setStyling((prev) => ({
                        ...prev,
                        specificationTextColor: value,
                      }));
                    }}
                  />
                  <s-color-field
                    label="Value Text Color"
                    name="valueTextColor"
                    value={styling.valueTextColor || "#000000"}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      setStyling((prev) => ({
                        ...prev,
                        valueTextColor: value,
                      }));
                    }}
                  />
            <s-stack direction="inline" gap="base">
                    <div style={{ width: "100%" }}>
                      <RangeSlider
                label="Font Size Text"
                        value={pxToNumber(styling.textFontSize)}
                        onChange={(value) => {
                          setStyling((prev) => ({
                            ...prev,
                            textFontSize: numberToPx(value),
                          }));
                        }}
                        min={8}
                        max={48}
                        step={1}
                        output
                      />
                      <input
                        type="hidden"
                        name="textFontSize"
                value={styling.textFontSize}
              />
                    </div>
              <s-select
                name="textFontFamily"
                label="Font Text"
                value={styling.textFontFamily}
                      onInput={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          setStyling((prev) => ({ ...prev, textFontFamily: value }));
                        }
                      }}
                      onChange={(e) => {
                        const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                        if (value !== undefined) {
                          setStyling((prev) => ({ ...prev, textFontFamily: value }));
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
                  {!styling.rowBackgroundEnabled && !styling.columnBackgroundEnabled && (
                    <s-color-field
                      label="Background TD"
                      name="tdBackgroundColor"
                      value={styling.tdBackgroundColor}
                      alpha
                      onChange={(event) => {
                        const value = event.currentTarget?.value || event.target?.value;
                        if (!value) return;
                        setStyling((prev) => ({
                          ...prev,
                          tdBackgroundColor: value,
                        }));
                      }}
                    />
                  )}

                  {/* Row Background (Odd/Even) */}
                  <s-stack direction="block" gap="tight">
                    <s-switch
                      id="row-background-switch"
                      label="Row Background (Odd/Even)"
                      checked={styling.rowBackgroundEnabled}
                      disabled={styling.columnBackgroundEnabled}
                      onChange={(e) => {
                        setStyling((prev) => ({
                          ...prev,
                          rowBackgroundEnabled: e.target.checked,
                          // Mutual exclusivity: dacă row e activat, column e dezactivat
                          columnBackgroundEnabled: e.target.checked ? false : prev.columnBackgroundEnabled,
                        }));
                      }}
                    />
                    {styling.rowBackgroundEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
                          <s-color-field
                            label="Odd Row Background"
                            name="oddRowBackgroundColor"
                            value={styling.oddRowBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                oddRowBackgroundColor: value,
                              }));
                            }}
                          />
                          <s-color-field
                            label="Even Row Background"
                            name="evenRowBackgroundColor"
                            value={styling.evenRowBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                evenRowBackgroundColor: value,
                              }));
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
                      checked={styling.columnBackgroundEnabled}
                      disabled={styling.rowBackgroundEnabled}
                      onChange={(e) => {
                        setStyling((prev) => ({
                          ...prev,
                          columnBackgroundEnabled: e.target.checked,
                          // Mutual exclusivity: dacă column e activat, row e dezactivat
                          rowBackgroundEnabled: e.target.checked ? false : prev.rowBackgroundEnabled,
                        }));
                      }}
                    />
                    {styling.columnBackgroundEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
                          <s-color-field
                            label="Odd Column Background (Spec)"
                            name="oddColumnBackgroundColor"
                            value={styling.oddColumnBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                oddColumnBackgroundColor: value,
                              }));
                            }}
                          />
                          <s-color-field
                            label="Even Column Background (Value)"
                            name="evenColumnBackgroundColor"
                            value={styling.evenColumnBackgroundColor}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                evenColumnBackgroundColor: value,
                              }));
                            }}
                          />
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>

                  {/* Text Transform */}
                  <s-select
                    name="textTransform"
                    label="Text Transform"
                    value={styling.textTransform}
                    onInput={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, textTransform: value }));
                      }
                    }}
                    onChange={(e) => {
                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                      if (value !== undefined) {
                        setStyling((prev) => ({ ...prev, textTransform: value }));
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
                      checked={styling.rowBorderEnabled}
                      onChange={(e) => {
                        setStyling((prev) => ({
                          ...prev,
                          rowBorderEnabled: e.target.checked,
                        }));
                      }}
                    />
                    {styling.rowBorderEnabled && (
                      <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                        <s-stack direction="inline" gap="base">
              <s-color-field
                            label="Culoare Row Border"
                            name="rowBorderColor"
                            value={styling.rowBorderColor}
                alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                rowBorderColor: value,
                              }));
                }}
              />
              <s-select
                            name="rowBorderStyle"
                            label="Stil Row Border"
                            value={styling.rowBorderStyle}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, rowBorderStyle: value }));
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, rowBorderStyle: value }));
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
                            value={pxToNumber(styling.rowBorderWidth)}
                            onChange={(value) => {
                              setStyling((prev) => ({
                                ...prev,
                                rowBorderWidth: numberToPx(value),
                              }));
                            }}
                            min={0}
                            max={20}
                            step={1}
                            output
                          />
                          <input
                            type="hidden"
                            name="rowBorderWidth"
                            value={styling.rowBorderWidth}
                          />
                        </div>
                      </s-stack>
                    )}
                  </s-stack>
                </s-stack>
              </s-stack>
            </s-box>
            
            {/* 4. See More Button Styling */}
            {seeMoreEnabled && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="base">
                  <s-heading level="3">See More Button Styling</s-heading>
                  <s-stack direction="block" gap="base"> 
                          <s-color-field
                            label="Button Text Color"
                            name="seeMoreButtonColor"
                            value={styling.seeMoreButtonColor || "#000000"}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                seeMoreButtonColor: value,
                              }));
                            }}
                          />
                          
                          <s-color-field
                            label="Button Background"
                            name="seeMoreButtonBackground"
                            value={styling.seeMoreButtonBackground || "transparent"}
                            alpha
                            onChange={(event) => {
                              const value = event.currentTarget?.value || event.target?.value;
                              if (!value) return;
                              setStyling((prev) => ({
                                ...prev,
                                seeMoreButtonBackground: value,
                              }));
                            }}
                          />
                          
                          <s-stack direction="inline" gap="base">
                            <div style={{ width: "100%" }}>
                              <RangeSlider
                                label="Font Size"
                                value={pxToNumber(styling.seeMoreButtonFontSize || "14px")}
                                onChange={(value) => {
                                  setStyling((prev) => ({
                                    ...prev,
                                    seeMoreButtonFontSize: numberToPx(value),
                                  }));
                                }}
                                min={8}
                                max={48}
                                step={1}
                                output
                              />
                              <input
                                type="hidden"
                                name="seeMoreButtonFontSize"
                                value={styling.seeMoreButtonFontSize || "14px"}
                              />
                            </div>
                            <div style={{ width: "100%" }}>
                              <RangeSlider
                                label="Padding"
                                value={pxToNumber(styling.seeMoreButtonPadding || "8px")}
                                onChange={(value) => {
                                  setStyling((prev) => ({
                                    ...prev,
                                    seeMoreButtonPadding: numberToPx(value),
                                  }));
                                }}
                                min={0}
                                max={40}
                                step={1}
                                output
                              />
                              <input
                                type="hidden"
                                name="seeMoreButtonPadding"
                                value={styling.seeMoreButtonPadding || "8px"}
                              />
                            </div>
                          </s-stack>
                          
                          <s-select
                            name="seeMoreButtonFontStyle"
                            label="Font Style"
                            value={styling.seeMoreButtonFontStyle || "normal"}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, seeMoreButtonFontStyle: value }));
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, seeMoreButtonFontStyle: value }));
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
                            value={styling.seeMoreButtonFontFamily || "Arial"}
                            onInput={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, seeMoreButtonFontFamily: value }));
                              }
                            }}
                            onChange={(e) => {
                              const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                              if (value !== undefined) {
                                setStyling((prev) => ({ ...prev, seeMoreButtonFontFamily: value }));
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
                              value={pxToNumber(styling.seeMoreButtonBorderRadius || "0px")}
                              onChange={(value) => {
                                setStyling((prev) => ({
                                  ...prev,
                                  seeMoreButtonBorderRadius: numberToPx(value),
                                }));
                              }}
                              min={0}
                              max={50}
                              step={1}
                              output
                            />
                            <input
                              type="hidden"
                              name="seeMoreButtonBorderRadius"
                              value={styling.seeMoreButtonBorderRadius || "0px"}
                            />
                          </div>
                          
                          {/* Button Border */}
                          <s-stack direction="block" gap="tight">
                            <s-switch
                              id="see-more-button-border-switch"
                              label="Button Border"
                              checked={styling.seeMoreButtonBorderEnabled || false}
                              onChange={(e) => {
                                setStyling((prev) => ({
                                  ...prev,
                                  seeMoreButtonBorderEnabled: e.target.checked,
                                }));
                              }}
                            />
                            {styling.seeMoreButtonBorderEnabled && (
                              <s-stack direction="block" gap="base" style={{ marginLeft: "24px" }}>
                                <s-stack direction="inline" gap="base">
                                  <div style={{ width: "100%" }}>
                                    <RangeSlider
                                      label="Border Width"
                                      value={pxToNumber(styling.seeMoreButtonBorderWidth || "1px")}
                                      onChange={(value) => {
                                        setStyling((prev) => ({
                                          ...prev,
                                          seeMoreButtonBorderWidth: numberToPx(value),
                                        }));
                                      }}
                                      min={0}
                                      max={10}
                                      step={1}
                                      output
                                    />
                                    <input
                                      type="hidden"
                                      name="seeMoreButtonBorderWidth"
                                      value={styling.seeMoreButtonBorderWidth || "1px"}
                                    />
                                  </div>
                                  <s-select
                                    name="seeMoreButtonBorderStyle"
                                    label="Border Style"
                                    value={styling.seeMoreButtonBorderStyle || "solid"}
                                    onInput={(e) => {
                                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                                      if (value !== undefined) {
                                        setStyling((prev) => ({ ...prev, seeMoreButtonBorderStyle: value }));
                                      }
                                    }}
                                    onChange={(e) => {
                                      const value = e.currentTarget?.value || e.target?.value || e.detail?.value;
                                      if (value !== undefined) {
                                        setStyling((prev) => ({ ...prev, seeMoreButtonBorderStyle: value }));
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
                                  value={styling.seeMoreButtonBorderColor || "#000000"}
                                  alpha
                                  onChange={(event) => {
                                    const value = event.currentTarget?.value || event.target?.value;
                                    if (!value) return;
                                    setStyling((prev) => ({
                                      ...prev,
                                      seeMoreButtonBorderColor: value,
                                    }));
                                  }}
                                />
                              </s-stack>
                            )}
                          </s-stack>
                        </s-stack>
                      </s-stack>
                    </s-box>
                  )}
          </s-stack>
        </s-section>
        </div>

        {/* Partea dreaptă - Preview (70%) */}
        <div style={{ width: "70%", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "20px", backgroundColor: "#f6f6f7", overflowY: "auto" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>Preview</h2>
          </div>
          <div style={{ backgroundColor: "#ffffff", padding: "20px", borderRadius: "4px", minHeight: "400px" }}>
            <PreviewTable 
              styling={styling} 
              sections={sections} 
              isAccordion={isAccordion} 
              seeMoreEnabled={seeMoreEnabled} 
              splitViewPerSection={splitViewPerSection} 
              splitViewPerMetafield={splitViewPerMetafield}
              tableName={tableName}
              isCollapsible={isCollapsible}
              collapsibleOnPC={collapsibleOnPC}
              collapsibleOnMobile={collapsibleOnMobile}
            />
          </div>
        </div>
      </div>

      {/* Modal pentru editare metafield */}
      {editingMetafield && (() => {
        const section = sections[editingMetafield.sectionIndex];
        const metafield = section?.metafields?.[editingMetafield.metafieldIndex];
        const mfDef = metafieldDefinitions?.find(
          (mf) => mf.id === metafield?.metafieldDefinitionId
        );
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
                setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false, prefix: "", suffix: "" });
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
                  Edit Metafield: {mfDef ? `${mfDef.namespace}.${mfDef.key}` : "Unknown"}
                </s-heading>
                
                <s-text-field
                  label="Custom name (only for this template)"
                  value={metafieldEditData.customName}
                  onChange={(e) =>
                    setMetafieldEditData({
                      ...metafieldEditData,
                      customName: e.target.value,
                    })
                  }
                  placeholder={mfDef?.name || `${mfDef?.namespace}.${mfDef?.key}`}
                  helpText="If left blank, the default name of the metafield will be used"
                />

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
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
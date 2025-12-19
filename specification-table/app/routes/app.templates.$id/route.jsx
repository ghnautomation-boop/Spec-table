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
  const { session } = await authenticate.admin(request);
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
  
  // Debug logging
  console.log("Form submission - seeMore values:", {
    seeMoreEnabled,
    seeMoreHideFromPC,
    seeMoreHideFromMobile,
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
    textColor: formData.get("textColor") || "#000000",
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
    textTransform: formData.get("textTransform") || "none",
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
        
        console.log(`Metafield ${j} in section ${i}:`, {
          metafieldId,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
        });
        
        metafields.push({
          metafieldDefinitionId: metafieldId,
          customName,
          tooltipEnabled,
          tooltipText,
          hideFromPC,
          hideFromMobile,
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
          sections,
        },
        session.shop
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
          sections,
        },
        session.shop
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
    hideFromMobile: false
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
      }))
    })) : [{ heading: "", metafields: [] }],
    isActive: template?.isActive !== undefined ? template.isActive : true,
    isAccordion: template?.isAccordion || false,
    isAccordionHideFromPC: template?.isAccordionHideFromPC || false,
    isAccordionHideFromMobile: template?.isAccordionHideFromMobile || false,
    seeMoreEnabled: template?.seeMoreEnabled || false,
    seeMoreHideFromPC: template?.seeMoreHideFromPC || false,
    seeMoreHideFromMobile: template?.seeMoreHideFromMobile || false,
    styling: template?.styling ? JSON.parse(template.styling) : {
      backgroundColor: "#ffffff",
      textColor: "#000000",
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

  const [styling, setStyling] = useState(
    template?.styling
      ? JSON.parse(template.styling)
      : {
          backgroundColor: "#ffffff",
          textColor: "#000000",
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
          textTransform: "none",
        }
  );

  // Sincronizează state-ul când se încarcă template-ul
  useEffect(() => {
    if (template?.styling) {
      const parsedStyling = JSON.parse(template.styling);
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
        seeMoreHideFromMobile !== initialFormState.current.seeMoreHideFromMobile) {
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
            currentMf.hideFromMobile !== initialMf.hideFromMobile) {
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
      seeMoreEnabled, seeMoreHideFromPC, seeMoreHideFromMobile, sections, styling]);


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

    // Declanșează change pe toate celelalte hidden inputs
    const otherInputs = [
      'input[name="isActive"]',
      'input[name="isAccordion"]',
      'input[name="isAccordionHideFromPC"]',
      'input[name="isAccordionHideFromMobile"]',
      'input[name="seeMoreEnabled"]',
      'input[name="seeMoreHideFromPC"]',
      'input[name="seeMoreHideFromMobile"]',
      // Styling inputs
      'input[name="backgroundColor"]',
      'input[name="textColor"]',
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
      seeMoreHideFromPC, seeMoreHideFromMobile, styling, triggerFormChanges, shopify]);

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

  const updateMetafieldData = (sectionIndex, metafieldIndex, data) => {
    const newSections = [...sections];
    if (!newSections[sectionIndex].metafields[metafieldIndex]) {
      return;
    }
    
    // Tratează valorile goale corect
    const customName = data.customName && data.customName.trim() !== "" ? data.customName.trim() : null;
    const tooltipText = data.tooltipText && data.tooltipText.trim() !== "" ? data.tooltipText.trim() : null;
    
    console.log("Updating metafield data:", {
      sectionIndex,
      metafieldIndex,
      customName,
      tooltipEnabled: data.tooltipEnabled,
      tooltipText,
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
    };
    setSections(newSections);
    // Incrementează formKey pentru a forța re-renderizarea formularului și hidden inputs-urilor
    setFormKey(prev => prev + 1);
    setEditingMetafield(null);
    setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false });
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
            borderBottom: `1px solid ${styling.textColor || "#000000"}`,
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
  const PreviewTable = ({ styling, sections, isAccordion, seeMoreEnabled }) => {
    const [showAll, setShowAll] = useState(!seeMoreEnabled);
    
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
      color: styling.textColor,
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
      const rowBackground = styling.rowBackgroundEnabled
        ? (isOdd ? styling.oddRowBackgroundColor : styling.evenRowBackgroundColor)
        : styling.tdBackgroundColor;
      
      return (
        <tr key={`${metafield.sectionIndex}-${metafield.mfIndex}`} style={{ borderBottom: styling.rowBorderEnabled ? `${styling.rowBorderWidth} ${styling.rowBorderStyle} ${styling.rowBorderColor}` : "none" }}>
          <td
            style={{
              padding: "8px",
              fontWeight: "bold",
              width: "40%",
              color: styling.textColor,
              fontFamily: styling.textFontFamily,
              fontSize: styling.textFontSize,
              backgroundColor: rowBackground,
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
              color: styling.textColor,
              fontFamily: styling.textFontFamily,
              fontSize: styling.textFontSize,
              backgroundColor: rowBackground,
              textTransform: styling.textTransform,
            }}
          >
            Example value
          </td>
        </tr>
      );
    };

    return (
      <div style={containerStyle}>
        {sections.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: styling.textColor }}>
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
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: styling.textColor || "#000000",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease" }}>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {Object.entries(groupedBySection).map(([sectionIndex, sectionData]) => {
              const sectionIdx = parseInt(sectionIndex);
              return (
                <div key={sectionIdx} style={{ marginBottom: sectionIdx < sections.length - 1 ? "20px" : "0" }}>
                  <h3 style={headingStyle}>{sectionData.heading}</h3>
                  {sectionData.metafields && sectionData.metafields.length > 0 ? (
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                      <tbody>
                        {sectionData.metafields.map((metafield, idx) => {
                          const globalIndex = displayRows.indexOf(metafield);
                          return renderMetafieldRow(metafield, globalIndex);
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ marginTop: "10px", color: styling.textColor, fontStyle: "italic" }}>
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
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: styling.textColor || "#000000",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", transition: "transform 0.3s ease" }}>
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
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
                });
              });
              
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
            <input type="hidden" name="backgroundColor" value={styling.backgroundColor} />
            <input type="hidden" name="textColor" value={styling.textColor} />
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
            <input type="hidden" name="textTransform" value={styling.textTransform} />
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

        <s-section heading="Sections and Metafields">
          <s-stack direction="block" gap="base">
            {sections.map((section, sectionIndex) => (
              <s-box
                key={sectionIndex}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
                style={{ position: "relative", overflow: "visible" }}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-heading level="3">Section {sectionIndex + 1}</s-heading>
                    {sections.length > 1 && (
                      <s-button
                        type="button"
                        variant="primary"
                        icon="delete"
                        tone="critical"
                        onClick={() => removeSection(sectionIndex)}
                      >
                          Delete Section
                      </s-button>
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
                              const metafieldKey = `${sectionIndex}-${mfIndex}-${metafield.customName || ""}-${metafield.tooltipEnabled}-${metafield.tooltipText || ""}`;
                              return (
                                <tr 
                                  key={metafieldKey}
                                  style={{ 
                                    borderBottom: mfIndex < section.metafields.length - 1 ? "1px solid #e1e3e5" : "none",
                                    backgroundColor: mfIndex % 2 === 0 ? "#ffffff" : "#fafbfb"
                                  }}
                                >
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
                    label="Text Color"
                    name="textColor"
                    value={styling.textColor}
                    alpha
                    onChange={(event) => {
                      const value = event.currentTarget?.value || event.target?.value;
                      if (!value) return;
                      setStyling((prev) => ({
                        ...prev,
                        textColor: value,
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

                  {/* Background TD - se afișează doar când Row Background este dezactivat */}
                  {!styling.rowBackgroundEnabled && (
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
                      onChange={(e) => {
                        setStyling((prev) => ({
                          ...prev,
                          rowBackgroundEnabled: e.target.checked,
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
          </s-stack>
        </s-section>
        </div>

        {/* Partea dreaptă - Preview (70%) */}
        <div style={{ width: "70%", border: "1px solid #e1e3e5", borderRadius: "8px", padding: "20px", backgroundColor: "#f6f6f7", overflowY: "auto" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>Preview</h2>
          </div>
          <div style={{ backgroundColor: "#ffffff", padding: "20px", borderRadius: "4px", minHeight: "400px" }}>
            <PreviewTable styling={styling} sections={sections} isAccordion={isAccordion} seeMoreEnabled={seeMoreEnabled} />
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
                setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "" });
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
                      setMetafieldEditData({ customName: "", tooltipEnabled: false, tooltipText: "", hideFromPC: false, hideFromMobile: false });
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
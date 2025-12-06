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

  for (let i = 0; i < sectionCount; i++) {
    const heading = formData.get(`section_${i}_heading`);
    if (!heading) continue;

    const metafieldCount = parseInt(
      formData.get(`section_${i}_metafieldCount`) || "0"
    );
    const metafields = [];

    for (let j = 0; j < metafieldCount; j++) {
      const metafieldId = formData.get(`section_${i}_metafield_${j}`);
      if (metafieldId) {
        metafields.push({
          metafieldDefinitionId: metafieldId,
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

  const [sections, setSections] = useState(
    template?.sections || [
      {
        heading: "",
        metafields: [],
      },
    ]
  );

  const [isActive, setIsActive] = useState(
    template?.isActive !== undefined ? template.isActive : true
  );
  const [isAccordion, setIsAccordion] = useState(
    template?.isAccordion || false
  );

  const [openSelectIndex, setOpenSelectIndex] = useState(null);
  const [selectedMetafieldsForSection, setSelectedMetafieldsForSection] = useState({});
  const [metafieldSearchTerm, setMetafieldSearchTerm] = useState({});
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [templateName, setTemplateName] = useState(template?.name || "");

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
    if (template?.name) {
      setTemplateName(template.name);
    }
  }, [template]);

  // Monitorizează salvarea cu succes
  useEffect(() => {
    if (actionData?.success) {
      setShowSuccessBanner(true);
      // Dacă există redirect, navighează după 1.5 secunde pentru a permite utilizatorului să vadă banner-ul
      if (actionData?.redirect) {
        const timer = setTimeout(() => {
          navigate(actionData.redirect);
        }, 1500);
        return () => clearTimeout(timer);
      } else {
        // Ascunde banner-ul după 5 secunde dacă nu există redirect
        const timer = setTimeout(() => {
          setShowSuccessBanner(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [actionData, navigate]);



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
        `Template ${isNew ? "creat" : "actualizat"} cu succes!`
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

  // Component pentru preview
  const PreviewTable = ({ styling, sections, isAccordion }) => {
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

    return (
      <div style={containerStyle}>
        {sections.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: styling.textColor }}>
            <p>Adaugă secțiuni pentru a vedea preview-ul</p>
          </div>
        ) : (
          sections.map((section, sectionIndex) => {
            if (!section.heading) return null;
            
            return (
              <div key={sectionIndex} style={{ marginBottom: sectionIndex < sections.length - 1 ? "20px" : "0" }}>
                <h3 style={headingStyle}>{section.heading}</h3>
                {section.metafields && section.metafields.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                    <tbody>
                      {section.metafields.map((metafield, mfIndex) => {
                        const mfDef = metafieldDefinitions?.find(
                          (mf) => mf.id === metafield.metafieldDefinitionId
                        );
                        const metafieldName = mfDef
                          ? (mfDef.name || `${mfDef.namespace}.${mfDef.key}`)
                          : "Metafield";
                        const isOdd = mfIndex % 2 === 0; // 0-based index, so 0, 2, 4 are odd rows
                        const rowBackground = styling.rowBackgroundEnabled
                          ? (isOdd ? styling.oddRowBackgroundColor : styling.evenRowBackgroundColor)
                          : styling.tdBackgroundColor;
                        
                        return (
                          <tr key={mfIndex} style={{ borderBottom: styling.rowBorderEnabled ? `${styling.rowBorderWidth} ${styling.rowBorderStyle} ${styling.rowBorderColor}` : "none" }}>
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
                              {metafieldName}:
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
                              Valoare exemplu
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ marginTop: "10px", color: styling.textColor, fontStyle: "italic" }}>
                    Nu există metafield-uri în această secțiune
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <s-page heading={isNew ? "Creează Template Nou" : `Editează: ${template?.name}`}>
      {/* Banner de succes */}
      {showSuccessBanner && (
        <div style={{ marginBottom: "16px" }}>
          <s-banner heading="Template saved" tone="success" dismissible={true} onDismiss={() => setShowSuccessBanner(false)}>
            Modifications has been saved.
          </s-banner>
        </div>
      )}

      {/* Bară fixă cu butoanele de acțiune */}
      <div style={{ 
        position: "sticky", 
        top: 0, 
        zIndex: 100, 
        backgroundColor: "#ffffff", 
        padding: "16px 0", 
        borderBottom: "1px solid #e1e3e5",
        marginBottom: "20px"
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <s-button
            type="button"
            variant="tertiary"
            onClick={() => navigate("/app/templates")}
          >
            Anulează
          </s-button>
          <Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="name" value={templateName} />
        <input type="hidden" name="sectionCount" value={sections.length} />
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <input type="hidden" name="isAccordion" value={isAccordion ? "true" : "false"} />
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
                <input type="hidden" name={`section_${sectionIndex}_heading`} value={section.heading || ""} />
                <input type="hidden" name={`section_${sectionIndex}_metafieldCount`} value={section.metafields?.length || 0} />
                {section.metafields?.map((mf, mfIndex) => (
                  <input key={mfIndex} type="hidden" name={`section_${sectionIndex}_metafield_${mfIndex}`} value={mf.metafieldDefinitionId || mf.id} />
                ))}
              </div>
            ))}
            <s-button type="submit" variant="primary">
              {isNew ? "Creează Template" : "Salvează Modificări"}
            </s-button>
          </Form>
        </div>
      </div>

      {/* Secțiuni de bază - Informații și Metafield-uri */}
      <div style={{ marginBottom: "20px" }}>
        <s-section heading="Informații de bază">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Nume Template"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value || e.currentTarget?.value || "")}
              required
            />
            <s-checkbox
              name="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              value={isActive ? "true" : "false"}
              label = "Template activ"	
            >
            </s-checkbox>
            <s-checkbox
              name="isAccordion"
              checked={isAccordion}
              onChange={(e) => setIsAccordion(e.target.checked)}
              value={isAccordion ? "true" : "false"}
              label = "Afișează ca accordion (expandabil)"
            >
            </s-checkbox>
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
                    {section.metafields?.map((metafield, mfIndex) => {
                      const mfDef = metafieldDefinitions.find(
                        (mf) => mf.id === metafield.metafieldDefinitionId
                      );
                      return (
                        <s-box
                          key={mfIndex}
                          padding="tight"
                          borderWidth="base"
                          borderRadius="base"
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                            <s-text style={{ flex: "1" }}>
                              {mfDef
                                ? `${mfDef.namespace}.${mfDef.key} (${mfDef.ownerType})${mfDef.name ? ` - ${mfDef.name}` : ""}`
                                : "Metafield deleted"}
                            </s-text>
                            <s-button
                              type="button"
                              variant="primary"
                              tone="critical"
                              icon="delete"
                              onClick={() =>
                                removeMetafieldFromSection(sectionIndex, mfIndex)
                              }
                              style={{ marginLeft: "16px", flexShrink: 0 }}
                            >
                              
                            </s-button>
                            <input
                              type="hidden"
                              name={`section_${sectionIndex}_metafield_${mfIndex}`}
                              value={metafield.metafieldDefinitionId}
                            />
                          </div>
                        </s-box>
                      );
                    })}

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
                                Selectează metafield-uri ({getAvailableMetafields(sectionIndex).length} disponibile):
                              </s-text>
                              <s-text-field
                                label="Caută metafield-uri"
                                value={metafieldSearchTerm[sectionIndex] || ""}
                                onChange={(e) => {
                                  setMetafieldSearchTerm({
                                    ...metafieldSearchTerm,
                                    [sectionIndex]: e.target.value,
                                  });
                                }}
                                placeholder="Caută după nume, namespace, key..."
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
                                      ? "Nu s-au găsit metafield-uri care să corespundă căutării"
                                      : "Nu există metafield-uri disponibile"}
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
                                  Adaugă Selectate
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
                                  Anulează
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
            >
              ➕ Add New Section
            </s-button>
          </s-stack>
        </s-section>
      </div>

      <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 400px)", minHeight: "600px" }}>
        {/* Partea stângă - Stiluri (30%) */}
        <div style={{ width: "30%", overflowY: "auto", paddingRight: "10px" }}>
        <s-section heading="Stiluri">
          <s-stack direction="block" gap="base">
            {/* 1. Section Styling */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading level="3">Section Styling</s-heading>
                <s-stack direction="block" gap="base">
              <s-color-field
                label="Culoare Background"
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
                            label="Culoare Section Border"
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
                label="Culoare Heading"
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
                label="Mărime Font Heading"
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
                label="Grosime Font Heading"
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
                label="Font Heading"
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
                    label="Culoare Text"
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
                label="Mărime Font Text"
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
            <PreviewTable styling={styling} sections={sections} isAccordion={isAccordion} />
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


// Funcție principală pentru inițializarea tabelului de specificații
window.initSpecificationTable = function(containerId, templateData) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('[SpecificationTable] Container not found:', containerId);
    return;
  }

  const imageHeight = container.getAttribute('data-image-height') || '100';

  // Verifică dacă există template din metaobject (din parametru sau din variabilă globală)
  let templateStructureJson, templateStylingJson, templateSettingsJson, templateIdValue;
  
  if (templateData) {
    // Folosim datele din parametru
    templateStructureJson = templateData.structure;
    templateStylingJson = templateData.styling;
    templateSettingsJson = templateData.settings;
    templateIdValue = templateData.id;
  } else {
    // Încearcă să citească din data-attributes (fallback)
    templateStructureJson = container.getAttribute('data-template-structure');
    templateStylingJson = container.getAttribute('data-template-styling');
    templateSettingsJson = container.getAttribute('data-template-settings');
    templateIdValue = container.getAttribute('data-template-id');
  }

  // Verifică dacă există template din metaobject
  if (!templateStructureJson || !templateStylingJson || !templateSettingsJson) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No template found.</div>';
    return;
  }

  try {
    // Parsează JSON-urile din metaobject
    // Dacă sunt deja obiecte, le folosim direct; altfel le parsează
    const templateStructure = typeof templateStructureJson === 'string' ? JSON.parse(templateStructureJson) : templateStructureJson;
    let templateStyling = typeof templateStylingJson === 'string' ? JSON.parse(templateStylingJson) : templateStylingJson;
    const templateSettings = typeof templateSettingsJson === 'string' ? JSON.parse(templateSettingsJson) : templateSettingsJson;
    
    // Debug: verifică dacă seeMoreButtonText există în styling
    if (!templateStyling.seeMoreButtonText) {
      console.warn('[initSpecificationTable] seeMoreButtonText not found in templateStyling. Available keys:', Object.keys(templateStyling));
      console.warn('[initSpecificationTable] templateStylingJson:', templateStylingJson);
      console.warn('[initSpecificationTable] Parsed templateStyling:', JSON.stringify(templateStyling, null, 2));
    }

    // Construiește obiectul template
    const template = {
      id: templateIdValue,
      structure: templateStructure,
      styling: templateStyling,
      settings: templateSettings,
      sections: templateStructure.sections || [],
      isAccordion: templateSettings.isAccordion || false,
      isAccordionHideFromPC: templateSettings.isAccordionHideFromPC || false,
      isAccordionHideFromMobile: templateSettings.isAccordionHideFromMobile || false,
      seeMoreEnabled: templateSettings.seeMoreEnabled || false,
      seeMoreHideFromPC: templateSettings.seeMoreHideFromPC || false,
      seeMoreHideFromMobile: templateSettings.seeMoreHideFromMobile || false,
      splitViewPerSection: templateSettings.splitViewPerSection || false,
      splitViewPerMetafield: templateSettings.splitViewPerMetafield || false,
      tableName: templateSettings.tableName || "Specifications",
      isCollapsible: templateSettings.isCollapsible || false,
      collapsibleOnPC: templateSettings.collapsibleOnPC || false,
      collapsibleOnMobile: templateSettings.collapsibleOnMobile || false
    };

    // Salvează template-ul în window.templateData pentru a fi accesat mai târziu (pentru See Less button, etc.)
    if (!window.templateData) {
      window.templateData = {};
    }
    window.templateData[templateIdValue] = {
      structure: templateStructure,
      styling: templateStyling,
      settings: templateSettings,
      id: templateIdValue
    };
    
    // Debug: verifică dacă seeLessButtonStyle și seeLessButtonText există în styling
    console.log('[initSpecificationTable] Template styling keys:', Object.keys(templateStyling));
    console.log('[initSpecificationTable] seeLessButtonStyle:', templateStyling.seeLessButtonStyle);
    console.log('[initSpecificationTable] seeLessButtonText:', templateStyling.seeLessButtonText);
    console.log('[initSpecificationTable] seeMoreButtonStyle:', templateStyling.seeMoreButtonStyle);

    // Construiește obiectul cu metafield-urile din Liquid folosind template-ul
    if (window.buildMetafieldsFromTemplate) {
      window.buildMetafieldsFromTemplate(template, []);
    }

    // Renderizează template-ul
    try {
      renderTemplate(container, template);
    } catch (error) {
      console.error('[SpecificationTable] Error rendering template:', error);
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff0000;">Error rendering template.</div>';
      return;
    }

    // Populează valorile metafield-urilor din obiectul JavaScript construit în Liquid
    updateMetafieldValuesFromLiquid(container);

    // Adaugă listener pentru schimbarea variantei (pentru actualizare în timp real)
    setupVariantChangeListener(container, template);
  } catch (error) {
    console.error('[SpecificationTable] Error parsing template:', error);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff0000;">Error loading template.</div>';
  }
};

// Funcție helper pentru a escapa HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Funcție pentru a actualiza valorile metafield-urilor din Liquid
function updateMetafieldValuesFromLiquid(container) {
  const templateContainer = container.querySelector('[id^="specification-table-"]');
  if (!templateContainer) return;

  const metafieldCells = templateContainer.querySelectorAll('td[data-namespace][data-key]');
  const productSpecCells = templateContainer.querySelectorAll('td[data-product-spec-type]');
  const productMetafields = window.productMetafieldsData || {};
  const variantMetafields = window.variantMetafieldsData || {};
  const productSpecs = window.productSpecsFromLiquid || {};

  // Obține varianta curentă din URL
  function getCurrentVariantId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('variant');
  }

  const currentVariantId = getCurrentVariantId();

  // Procesează product specs
  productSpecCells.forEach(cell => {
    const productSpecType = cell.dataset.productSpecType;
    const valueElement = cell.querySelector('[data-product-spec-value]');
    if (!valueElement) return;

    // Extrage prefix și suffix din data-attributes
    const prefix = valueElement.getAttribute('data-prefix') || '';
    const suffix = valueElement.getAttribute('data-suffix') || '';

    let value = null;
    if (productSpecs[productSpecType] !== undefined) {
      value = productSpecs[productSpecType];
    }

    // Formatează valoarea în funcție de tipul product spec
    let formattedValue = value;
    if (value !== null && value !== undefined) {
      if (productSpecType === 'compare_at_price' && typeof value === 'number') {
        // Formatează prețul
        formattedValue = (value / 100).toFixed(2);
      } else if (productSpecType === 'weight' && typeof value === 'number') {
        // Formatează greutatea - weight este în grame în Shopify
        // Trebuie să convertim în unitatea de măsură setată
        const weightUnit = productSpecs.weight_unit || 'kg';
        let convertedWeight = value;
        
        // Conversie în funcție de unitate
        if (weightUnit === 'kg') {
          // Convertim din grame în kg (1 kg = 1000 g)
          convertedWeight = (value / 1000).toFixed(2);
        } else if (weightUnit === 'g') {
          // Rămâne în grame
          convertedWeight = value.toFixed(2);
        } else if (weightUnit === 'lb') {
          // Convertim din grame în lire (1 lb = 453.592 g)
          convertedWeight = (value / 453.592).toFixed(2);
        } else if (weightUnit === 'oz') {
          // Convertim din grame în uncii (1 oz = 28.3495 g)
          convertedWeight = (value / 28.3495).toFixed(2);
        } else {
          // Pentru alte unități necunoscute, afișăm valoarea originală
          convertedWeight = value.toFixed(2);
        }
        
        formattedValue = convertedWeight + ' ' + weightUnit;
      } else if (productSpecType === 'inventory_quantity') {
        // Pentru inventory_quantity, afișăm valoarea chiar dacă este 0
        if (value === null || value === undefined) {
          formattedValue = '0';
        } else {
          formattedValue = value.toString();
        }
      } else {
        formattedValue = String(value);
      }
    }

    // Randare diferită în funcție de tipul product spec
    renderMetafieldValue(valueElement, formattedValue, 'single_line_text_field', 'PRODUCT', null, null, container.getAttribute('data-image-height') || '100', prefix, suffix);
  });

  // Procesează metafields normale
  metafieldCells.forEach(cell => {
    const namespace = cell.dataset.namespace;
    const key = cell.dataset.key;
    const ownerType = cell.dataset.ownerType || 'PRODUCT';
    const metafieldType = cell.dataset.type || 'single_line_text_field';
    const valueElement = cell.querySelector('[data-metafield-value]');
    if (!valueElement) return;

    // Extrage prefix și suffix din data-attributes
    const prefix = valueElement.getAttribute('data-prefix') || '';
    const suffix = valueElement.getAttribute('data-suffix') || '';

    let value = null;

    // Prioritizează metafield-urile VARIANT dacă există pentru varianta curentă
    if (ownerType === 'VARIANT') {
      if (currentVariantId && variantMetafields[currentVariantId] &&
          variantMetafields[currentVariantId][namespace] &&
          variantMetafields[currentVariantId][namespace][key] !== undefined) {
        value = variantMetafields[currentVariantId][namespace][key];
      } else {
        const firstVariantId = Object.keys(variantMetafields)[0];
        if (firstVariantId && variantMetafields[firstVariantId] &&
            variantMetafields[firstVariantId][namespace] &&
            variantMetafields[firstVariantId][namespace][key] !== undefined) {
          value = variantMetafields[firstVariantId][namespace][key];
        }
      }
    }

    // Dacă nu am găsit valoarea pentru VARIANT, folosește PRODUCT metafield
    if (value === null && ownerType === 'PRODUCT' && productMetafields[namespace] && productMetafields[namespace][key] !== undefined) {
      value = productMetafields[namespace][key];
    } else if (value === null && productMetafields[namespace] && productMetafields[namespace][key] !== undefined) {
      value = productMetafields[namespace][key];
    }

    // Randare diferită în funcție de tipul metafield-ului
    renderMetafieldValue(valueElement, value, metafieldType, ownerType, namespace, key, container.getAttribute('data-image-height') || '100', prefix, suffix);
  });
}

// Funcție pentru a randa valoarea metafield-ului în funcție de tip
function renderMetafieldValue(element, value, metafieldType, ownerType, namespace, key, imageHeight, prefix, suffix) {
  if (value === null || value === undefined || value === '') {
    element.innerHTML = 'N/A';
    return;
  }

  const height = imageHeight || '100';

  function applyPrefixSuffix(textValue, prefixValue, suffixValue) {
    if (!textValue) return textValue;
    let result = String(textValue);
    if (prefixValue && prefixValue.trim() !== '') {
      result = prefixValue.trim() + ' ' + result;
    }
    if (suffixValue && suffixValue.trim() !== '') {
      result = result + ' ' + suffixValue.trim();
    }
    return result;
  }

  if (metafieldType === 'multi_line_text_field' || metafieldType === 'single_line_text_field') {
    if (typeof value === 'object') {
      element.textContent = JSON.stringify(value);
    } else {
      const formattedValue = applyPrefixSuffix(value, prefix, suffix);
      element.textContent = formattedValue;
    }
  } else if (metafieldType === 'file_reference') {
    if (value && value !== '' && value !== 'null') {
      element.innerHTML = '<img src="' + escapeHtml(String(value)) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" />';
    } else {
      element.innerHTML = 'N/A';
    }
  } else if (metafieldType === 'product_reference') {
    if (value && typeof value === 'object') {
      const productImage = value.featured_image || value.image || '';
      const productTitle = value.title || '';
      let html = '';
      if (productImage && productImage !== 'null') {
        html += '<div style="display:flex;align-items:center;"><img src="' + escapeHtml(String(productImage)) + '" alt="' + escapeHtml(productTitle) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" />';
      }
      if (productTitle) {
        html += '<span style="font-weight:bold;margin-left:30px">' + escapeHtml(productTitle) + '</span></div>';
      }
      element.innerHTML = html || 'N/A';
    } else {
      element.innerHTML = 'N/A';
    }
  } else if (metafieldType === 'collection_reference') {
    if (value && typeof value === 'object') {
      const collectionImage = value.featured_image || value.image || '';
      const collectionTitle = value.title || '';
      let html = '';
      if (collectionImage && collectionImage !== 'null') {
        html += '<div><img src="' + escapeHtml(String(collectionImage)) + '" alt="' + escapeHtml(collectionTitle) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" /></div>';
      }
      if (collectionTitle) {
        html += '<div style="font-weight:bold;text-align:center;">' + escapeHtml(collectionTitle) + '</div>';
      }
      element.innerHTML = html || 'N/A';
    } else {
      element.innerHTML = 'N/A';
    }
  } else if (metafieldType === 'dimension') {
    if (typeof value === 'object') {
      element.textContent = JSON.stringify(value);
    } else {
      const formattedValue = applyPrefixSuffix(value, prefix, suffix);
      element.textContent = formattedValue;
    }
  } else {
    if (typeof value === 'object') {
      element.textContent = JSON.stringify(value);
    } else {
      const formattedValue = applyPrefixSuffix(value, prefix, suffix);
      element.textContent = formattedValue;
    }
  }
}

// Funcție pentru a asculta schimbările de variantă
function setupVariantChangeListener(container, template) {
  let currentVariantId = null;

  function getVariantIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('variant');
  }

  function updateVariantMetafields(variantId) {
    if (variantId && window.allVariantMetafieldsFromLiquid && window.allVariantMetafieldsFromLiquid[variantId]) {
      updateMetafieldValuesFromLiquid(container);
    } else {
      updateMetafieldValuesFromLiquid(container);
    }
  }

  currentVariantId = getVariantIdFromUrl();
  if (currentVariantId) {
    updateVariantMetafields(currentVariantId);
  }

  let lastVariantId = currentVariantId;
  setInterval(() => {
    const newVariantId = getVariantIdFromUrl();
    if (newVariantId !== lastVariantId) {
      lastVariantId = newVariantId;
      currentVariantId = newVariantId;
      updateVariantMetafields(newVariantId);
    }
  }, 100);

  document.addEventListener('variant:change', (event) => {
    if (event.detail && event.detail.variantId) {
      currentVariantId = event.detail.variantId;
      updateVariantMetafields(currentVariantId);
    }
  });

  const observer = new MutationObserver(() => {
    const newVariantId = getVariantIdFromUrl();
    if (newVariantId !== currentVariantId) {
      currentVariantId = newVariantId;
      updateVariantMetafields(newVariantId);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-variant-id', 'data-selected-variant']
  });
}

// Helper function pentru a obține styling-ul pentru un device specific
function getDeviceStyling(styling, device) {
  // Dacă styling-ul are structura nouă (mobile, tablet, desktop)
  if (styling && (styling.mobile || styling.tablet || styling.desktop)) {
    return styling[device] || styling.desktop || {};
  }
  // Backward compatibility: dacă nu are structura nouă, folosește styling-ul direct
  return styling || {};
}

// Funcție pentru a construi CSS variables pentru un device specific
function buildCSSVarsForDevice(deviceStyling, columnRatio) {
  let cssVars = '--dc-bg-color: ' + (deviceStyling.backgroundColor || '#ffffff') + '; ';
  const specTextColor = deviceStyling.specificationTextColor || deviceStyling.textColor || '#000000';
  const valueTextColor = deviceStyling.valueTextColor || deviceStyling.textColor || '#000000';
  cssVars += '--dc-specification-text-color: ' + specTextColor + '; ';
  cssVars += '--dc-value-text-color: ' + valueTextColor + '; ';
  cssVars += '--dc-heading-color: ' + (deviceStyling.headingColor || '#000000') + '; ';
  cssVars += '--dc-heading-font-size: ' + (deviceStyling.headingFontSize || '18px') + '; ';
  cssVars += '--dc-heading-font-weight: ' + (deviceStyling.headingFontWeight || 'bold') + '; ';
  cssVars += '--dc-heading-font-family: ' + (deviceStyling.headingFontFamily || 'inherit') + '; ';
  cssVars += '--dc-text-font-size: ' + (deviceStyling.textFontSize || '14px') + '; ';
  cssVars += '--dc-text-font-family: ' + (deviceStyling.textFontFamily || 'inherit') + '; ';
  cssVars += '--dc-text-transform: ' + (deviceStyling.textTransform || 'none') + '; ';
  cssVars += '--dc-border-radius: ' + (deviceStyling.borderRadius || '0px') + '; ';
  cssVars += '--dc-padding: ' + (deviceStyling.padding || '20px') + '; ';
  cssVars += '--dc-first-column-width: ' + columnRatio + '%; ';
  cssVars += '--dc-column-ratio: ' + columnRatio + '%; ';
  cssVars += '--dc-table-width: ' + (deviceStyling.tableWidth || '100') + '%; ';
  cssVars += '--dc-table-margin-top: ' + (deviceStyling.tableMarginTop || '0') + 'px; ';
  cssVars += '--dc-table-margin-bottom: ' + (deviceStyling.tableMarginBottom || '0') + 'px; ';
  cssVars += '--dc-header-text-align: ' + (deviceStyling.headerTextAlign || 'left') + '; ';
  cssVars += '--dc-spec-spacing: ' + (deviceStyling.specSpacing || '10') + 'px; ';
  if (deviceStyling.headerBottomBorderEnabled) {
    cssVars += '--dc-header-bottom-border: ' + (deviceStyling.headerBottomBorderWidth || '1px') + ' ' + (deviceStyling.headerBottomBorderStyle || 'solid') + ' ' + (deviceStyling.headerBottomBorderColor || '#000000') + '; ';
  } else {
    cssVars += '--dc-header-bottom-border: none; ';
  }
  if (deviceStyling.sectionBorderEnabled) {
    // Folosește borderWidth dacă există, altfel sectionBorderWidth, altfel default '1px'
    const borderWidth = deviceStyling.borderWidth || deviceStyling.sectionBorderWidth || '1px';
    cssVars += '--dc-border: ' + borderWidth + ' ' + (deviceStyling.sectionBorderStyle || 'solid') + ' ' + (deviceStyling.sectionBorderColor || '#000000') + '; ';
  } else {
    cssVars += '--dc-border: none; ';
  }
  cssVars += '--dc-row-border: ' + (deviceStyling.rowBorderEnabled ? (deviceStyling.rowBorderWidth || '1px') + ' ' + (deviceStyling.rowBorderStyle || 'solid') + ' ' + (deviceStyling.rowBorderColor || '#000000') : 'none') + '; ';
  cssVars += '--dc-odd-row-bg: ' + (deviceStyling.oddRowBackgroundColor || '#f0f0f0') + '; ';
  cssVars += '--dc-even-row-bg: ' + (deviceStyling.evenRowBackgroundColor || '#ffffff') + '; ';
  cssVars += '--dc-odd-column-bg: ' + (deviceStyling.oddColumnBackgroundColor || '#ff0000') + '; ';
  cssVars += '--dc-even-column-bg: ' + (deviceStyling.evenColumnBackgroundColor || '#00ff00') + '; ';
  cssVars += '--dc-td-bg: ' + (deviceStyling.tdBackgroundColor || 'transparent') + '; ';
  cssVars += '--dc-row-bg-enabled: ' + (deviceStyling.rowBackgroundEnabled ? '1' : '0') + '; ';
  cssVars += '--dc-column-bg-enabled: ' + (deviceStyling.columnBackgroundEnabled ? '1' : '0') + '; ';
  cssVars += '--dc-see-more-button-color: ' + (deviceStyling.seeMoreButtonColor || '#000000') + '; ';
  cssVars += '--dc-see-more-button-background: ' + (deviceStyling.seeMoreButtonBackground || 'transparent') + '; ';
  cssVars += '--dc-see-more-button-font-size: ' + (deviceStyling.seeMoreButtonFontSize || '14px') + '; ';
  cssVars += '--dc-see-more-button-font-family: ' + (deviceStyling.seeMoreButtonFontFamily || 'Arial') + '; ';
  cssVars += '--dc-see-more-button-padding: ' + (deviceStyling.seeMoreButtonPadding || '8px') + '; ';
  cssVars += '--dc-see-more-button-border-radius: ' + (deviceStyling.seeMoreButtonBorderRadius || '0px') + '; ';
  if (deviceStyling.seeMoreButtonBorderEnabled) {
    cssVars += '--dc-see-more-button-border: ' + (deviceStyling.seeMoreButtonBorderWidth || '1px') + ' ' + (deviceStyling.seeMoreButtonBorderStyle || 'solid') + ' ' + (deviceStyling.seeMoreButtonBorderColor || '#000000') + '; ';
  } else {
    cssVars += '--dc-see-more-button-border: none; ';
  }
  return cssVars;
}

// Funcție pentru a randa template-ul
function renderTemplate(container, template) {
  let styling = template.styling || {};
  
  // Parse styling dacă este string
  if (typeof styling === 'string') {
    try {
      styling = JSON.parse(styling);
    } catch (e) {
      console.error('[renderTemplate] Error parsing styling:', e);
      styling = {};
    }
  }
  
  // Verifică dacă are structura nouă (mobile, tablet, desktop)
  const hasDeviceSpecificStyling = styling && (styling.mobile || styling.tablet || styling.desktop);
  
  // Obține styling-ul pentru fiecare device
  const mobileStyling = hasDeviceSpecificStyling ? getDeviceStyling(styling, 'mobile') : styling;
  const tabletStyling = hasDeviceSpecificStyling ? getDeviceStyling(styling, 'tablet') : styling;
  const desktopStyling = hasDeviceSpecificStyling ? getDeviceStyling(styling, 'desktop') : styling;
  
  // Folosește columnRatio din styling, fallback la firstColumnWidth din dataset, apoi default 40
  // Pentru backward compatibility, folosim desktop styling pentru columnRatio
  const columnRatio = desktopStyling.columnRatio || styling.columnRatio || container.dataset.firstColumnWidth || '40';
  const escapedTemplateId = escapeHtml(template.id);
  
  // Debug: verifică dacă seeMoreButtonText există în styling
  if (!desktopStyling.seeMoreButtonText && !styling.seeMoreButtonText) {
    console.warn('[renderTemplate] seeMoreButtonText not found in styling. Available keys:', Object.keys(styling));
  }

  // Generează media queries pentru device-specific styling
  let mediaQueriesCSS = '';
  let cssVars = '';
  let containerInlineStyle = '';
  
  if (hasDeviceSpecificStyling) {
    // Debug: log pentru a verifica structura
    console.log('[renderTemplate] Device-specific styling detected:', {
      hasMobile: !!styling.mobile,
      hasTablet: !!styling.tablet,
      hasDesktop: !!styling.desktop,
      mobileBg: mobileStyling.backgroundColor,
      tabletBg: tabletStyling.backgroundColor,
      desktopBg: desktopStyling.backgroundColor
    });
    
    // Când avem device-specific styling, NU setăm width/margin în inline style
    // Le setăm DOAR în media queries pentru a permite suprascrierea corectă
    // Nu setăm nimic în inline style pentru width/margin când avem device-specific styling
    containerInlineStyle = ''; // Nu setăm width/margin în inline style
    
    // Mobile styles (< 768px) - setăm toate CSS variables-urile + width/margin
    const mobileVars = buildCSSVarsForDevice(mobileStyling, mobileStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (max-width: 767px) { #specification-table-' + escapedTemplateId + ' { ' + mobileVars + 'width: ' + (mobileStyling.tableWidth || '100') + '% !important; margin-top: ' + (mobileStyling.tableMarginTop || '0') + 'px !important; margin-bottom: ' + (mobileStyling.tableMarginBottom || '0') + 'px !important; } } ';
    
    // Tablet styles (768px - 1023px) - setăm toate CSS variables-urile + width/margin
    const tabletVars = buildCSSVarsForDevice(tabletStyling, tabletStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (min-width: 768px) and (max-width: 1023px) { #specification-table-' + escapedTemplateId + ' { ' + tabletVars + 'width: ' + (tabletStyling.tableWidth || '100') + '% !important; margin-top: ' + (tabletStyling.tableMarginTop || '0') + 'px !important; margin-bottom: ' + (tabletStyling.tableMarginBottom || '0') + 'px !important; } } ';
    
    // Desktop styles (>= 1024px) - setăm toate CSS variables-urile + width/margin
    const desktopVars = buildCSSVarsForDevice(desktopStyling, desktopStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (min-width: 1024px) { #specification-table-' + escapedTemplateId + ' { ' + desktopVars + 'width: ' + (desktopStyling.tableWidth || '100') + '% !important; margin-top: ' + (desktopStyling.tableMarginTop || '0') + 'px !important; margin-bottom: ' + (desktopStyling.tableMarginBottom || '0') + 'px !important; } } ';
  } else {
    // Backward compatibility: folosim styling-ul direct în inline style
    console.log('[renderTemplate] No device-specific styling, using backward compatibility');
    cssVars = buildCSSVarsForDevice(styling, columnRatio);
    containerInlineStyle = 'width: ' + (styling.tableWidth || '100') + '%; margin-top: ' + (styling.tableMarginTop || '0') + 'px; margin-bottom: ' + (styling.tableMarginBottom || '0') + 'px; ';
  }
  
  // Adaugă style tag cu media queries dacă există
  // IMPORTANT: Style tag-ul trebuie să fie înainte de div pentru a funcționa corect
  let html = '';
  if (mediaQueriesCSS) {
    html += '<style id="spec-table-styles-' + escapedTemplateId + '">' + mediaQueriesCSS + '</style>';
  }
  
  // Când avem device-specific styling, nu setăm CSS variables în inline style
  // Le setăm doar în media queries
  html += '<div id="specification-table-' + escapedTemplateId + '" class="dc_container" style="' + (hasDeviceSpecificStyling ? containerInlineStyle : cssVars + containerInlineStyle) + '">';

  // Adaugă header-ul cu numele tabelului și butonul de collapsible (dacă este activat)
  const isCollapsible = template.isCollapsible === true || template.isCollapsible === 'true';
  const collapsibleOnPC = template.collapsibleOnPC === true || template.collapsibleOnPC === 'true';
  const collapsibleOnMobile = template.collapsibleOnMobile === true || template.collapsibleOnMobile === 'true';
  const tableName = template.tableName || "Specifications";
  const arrowDownSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; transition: transform 0.3s ease;"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  if (isCollapsible) {
    // Determină clasele CSS pentru collapsible
    let collapsibleClasses = 'dc_collapsible_header';
    if (collapsibleOnPC && !collapsibleOnMobile) {
      collapsibleClasses += ' dc_collapsible_pc_only';
    } else if (collapsibleOnMobile && !collapsibleOnPC) {
      collapsibleClasses += ' dc_collapsible_mobile_only';
    } else {
      collapsibleClasses += ' dc_collapsible_all';
    }

    html += '<div class="' + collapsibleClasses + '">';
    html += '<div class="dc_collapsible_title" onclick="toggleSpecificationTable(\'' + escapedTemplateId + '\')">';
    html += '<span class="dc_collapsible_name">' + escapeHtml(tableName) + '</span>';
    html += '<span class="dc_collapsible_arrow" id="spec-table-arrow-' + escapedTemplateId + '">' + arrowDownSvg + '</span>';
    html += '</div>';
    html += '</div>';
    
    // Wrap conținutul tabelului într-un div care poate fi ascuns/afișat
    html += '<div id="spec-table-content-' + escapedTemplateId + '" class="dc_collapsible_content dc_collapsible_collapsed">';
  } else {
    // Dacă nu este collapsible, afișează doar numele tabelului
    html += '<div class="dc_table_name_header">';
    html += '<h2 class="dc_table_name">' + escapeHtml(tableName) + '</h2>';
    html += '</div>';
  }

  // Colectează toate metafields-urile din toate secțiunile
  const allMetafieldsWithSection = [];
  const sectionHideWhenEmpty = {};
  template.sections.forEach((section, sectionIndex) => {
    sectionHideWhenEmpty[sectionIndex] = section.hideSectionWhenEmpty !== undefined && section.hideSectionWhenEmpty !== null ? section.hideSectionWhenEmpty : true;

    if (section.metafields && section.metafields.length > 0) {
      section.metafields.forEach((metafield, mfIndex) => {
        // Dacă este product spec, folosește structura pentru product spec
        if (metafield.type === 'product_spec') {
          allMetafieldsWithSection.push({
            type: 'product_spec',
            productSpecType: metafield.productSpecType,
            namespace: null,
            key: null,
            ownerType: null,
            name: null,
            metafieldType: null,
            customName: metafield.customName,
            tooltipEnabled: metafield.tooltipEnabled,
            tooltipText: metafield.tooltipText,
            hideFromPC: metafield.hideFromPC !== undefined ? metafield.hideFromPC : false,
            hideFromMobile: metafield.hideFromMobile !== undefined ? metafield.hideFromMobile : false,
            prefix: metafield.prefix || null,
            suffix: metafield.suffix || null,
            sectionIndex: sectionIndex,
            sectionHeading: section.heading,
            mfIndex: mfIndex
          });
        } else {
          // Altfel, este metafield normal
          allMetafieldsWithSection.push({
            type: 'metafield',
            namespace: metafield.namespace,
            key: metafield.key,
            ownerType: metafield.ownerType,
            name: metafield.name,
            metafieldType: metafield.metafieldType || metafield.type,
            productSpecType: null,
            customName: metafield.customName,
            tooltipEnabled: metafield.tooltipEnabled,
            tooltipText: metafield.tooltipText,
            hideFromPC: metafield.hideFromPC !== undefined ? metafield.hideFromPC : false,
            hideFromMobile: metafield.hideFromMobile !== undefined ? metafield.hideFromMobile : false,
            prefix: metafield.prefix || null,
            suffix: metafield.suffix || null,
            sectionIndex: sectionIndex,
            sectionHeading: section.heading,
            mfIndex: mfIndex
          });
        }
      });
    }
  });

  const seeMoreEnabled = template.seeMoreEnabled || false;
  const seeMoreHideFromPC = template.seeMoreHideFromPC === true || template.seeMoreHideFromPC === 'true';
  const seeMoreHideFromMobile = template.seeMoreHideFromMobile === true || template.seeMoreHideFromMobile === 'true';
  const splitViewPerSection = template.splitViewPerSection === true || template.splitViewPerSection === 'true';
  const splitViewPerMetafield = template.splitViewPerMetafield === true || template.splitViewPerMetafield === 'true';

  // Determină limita pentru "See More" bazată pe split view
  // Pentru splitViewPerMetafield: metafields-urile sunt distribuite în 2 coloane, deci 20 total (10 pe coloană)
  // Pentru splitViewPerSection: secțiunile sunt distribuite în 2 coloane, deci trebuie să calculăm separat per coloană (10 pe coloană)
  // Pentru ambele: limita totală este 20, dar pentru splitViewPerSection va fi recalculată per coloană
  const seeMoreLimit = splitViewPerMetafield ? 20 : (splitViewPerSection ? 20 : 10);

  const productMetafields = window.productMetafieldsData || {};
  const variantMetafields = window.variantMetafieldsData || {};

  function metafieldHasValue(metafield) {
    // Dacă este product spec, verifică în productSpecsFromLiquid
    if (metafield.type === 'product_spec') {
      const productSpecs = window.productSpecsFromLiquid || {};
      const value = productSpecs[metafield.productSpecType];
      
      // Pentru inventory_quantity, acceptăm și valoarea 0
      if (metafield.productSpecType === 'inventory_quantity') {
        return value !== null && value !== undefined && value !== '';
      }
      
      return value !== null &&
             value !== undefined &&
             value !== '' &&
             (typeof value !== 'string' || value.trim() !== '') &&
             value !== 'null' &&
             value !== 'undefined' &&
             (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
    }
    
    // Altfel, este metafield normal
    let hasValue = false;
    let value = null;

    if (metafield.ownerType === 'PRODUCT') {
      if (productMetafields[metafield.namespace] &&
          productMetafields[metafield.namespace][metafield.key] !== undefined) {
        value = productMetafields[metafield.namespace][metafield.key];
        hasValue = value !== null &&
                  value !== undefined &&
                  value !== '' &&
                  (typeof value !== 'string' || value.trim() !== '') &&
                  value !== 'null' &&
                  value !== 'undefined' &&
                  (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');

        if (hasValue && typeof value === 'object') {
          hasValue = value.title || value.featured_image || value.image;
        }
      }
    } else if (metafield.ownerType === 'VARIANT') {
      Object.keys(variantMetafields).forEach(variantId => {
        if (!hasValue && variantMetafields[variantId] &&
            variantMetafields[variantId][metafield.namespace] &&
            variantMetafields[variantId][metafield.namespace][metafield.key] !== undefined) {
          value = variantMetafields[variantId][metafield.namespace][metafield.key];
          hasValue = value !== null &&
                    value !== undefined &&
                    value !== '' &&
                    (typeof value !== 'string' || value.trim() !== '') &&
                    value !== 'null' &&
                    value !== 'undefined' &&
                    (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');

          if (hasValue && typeof value === 'object') {
            hasValue = value.title || value.featured_image || value.image;
          }
        }
      });
    }

    return hasValue;
  }

  const visibleMetafields = allMetafieldsWithSection.filter(metafield => metafieldHasValue(metafield));
  const totalVisibleRows = visibleMetafields.length;

  let displayRowsPC = visibleMetafields;
  let displayRowsMobile = visibleMetafields;
  let hasMorePC = false;
  let hasMoreMobile = false;

  if (seeMoreEnabled) {
    if (seeMoreHideFromPC) {
      displayRowsPC = visibleMetafields;
      displayRowsMobile = visibleMetafields.slice(0, seeMoreLimit);
      hasMorePC = false;
      hasMoreMobile = totalVisibleRows > seeMoreLimit;
    } else if (seeMoreHideFromMobile) {
      displayRowsPC = visibleMetafields.slice(0, seeMoreLimit);
      displayRowsMobile = visibleMetafields;
      hasMorePC = totalVisibleRows > seeMoreLimit;
      hasMoreMobile = false;
    } else {
      displayRowsPC = visibleMetafields.slice(0, seeMoreLimit);
      displayRowsMobile = visibleMetafields.slice(0, seeMoreLimit);
      hasMorePC = totalVisibleRows > seeMoreLimit;
      hasMoreMobile = totalVisibleRows > seeMoreLimit;
    }
  } else {
    displayRowsPC = visibleMetafields;
    displayRowsMobile = visibleMetafields;
  }

  const allGroupedBySection = {};
  allMetafieldsWithSection.forEach(item => {
    if (!allGroupedBySection[item.sectionIndex]) {
      allGroupedBySection[item.sectionIndex] = {
        heading: item.sectionHeading,
        allMetafields: [],
        displayMetafieldsPC: [],
        displayMetafieldsMobile: [],
        hiddenMetafieldsPC: [],
        hiddenMetafieldsMobile: []
      };
    }
    allGroupedBySection[item.sectionIndex].allMetafields.push(item);
  });

  // Debug: verifică displayRows
  console.log('[renderTemplate] displayRowsPC count:', displayRowsPC.length);
  console.log('[renderTemplate] displayRowsMobile count:', displayRowsMobile.length);
  console.log('[renderTemplate] visibleMetafields count:', visibleMetafields.length);
  console.log('[renderTemplate] allMetafieldsWithSection count:', allMetafieldsWithSection.length);
  
  displayRowsPC.forEach(item => {
    if (allGroupedBySection[item.sectionIndex]) {
      allGroupedBySection[item.sectionIndex].displayMetafieldsPC.push(item);
    } else {
      console.warn('[renderTemplate] Section index not found in allGroupedBySection:', item.sectionIndex, 'Available keys:', Object.keys(allGroupedBySection));
    }
  });
  displayRowsMobile.forEach(item => {
    if (allGroupedBySection[item.sectionIndex]) {
      allGroupedBySection[item.sectionIndex].displayMetafieldsMobile.push(item);
    } else {
      console.warn('[renderTemplate] Section index not found in allGroupedBySection:', item.sectionIndex, 'Available keys:', Object.keys(allGroupedBySection));
    }
  });
  
  // Debug: verifică allGroupedBySection după populare
  console.log('[renderTemplate] allGroupedBySection after populating displayMetafields:', 
    Object.keys(allGroupedBySection).map(key => ({
      sectionIndex: key,
      heading: allGroupedBySection[key].heading,
      displayMetafieldsPC: allGroupedBySection[key].displayMetafieldsPC.length,
      displayMetafieldsMobile: allGroupedBySection[key].displayMetafieldsMobile.length
    }))
  );

  if (hasMorePC) {
    const hiddenRowsPC = visibleMetafields.slice(seeMoreLimit);
    hiddenRowsPC.forEach(item => {
      allGroupedBySection[item.sectionIndex].hiddenMetafieldsPC.push(item);
    });
  }
  if (hasMoreMobile) {
    const hiddenRowsMobile = visibleMetafields.slice(seeMoreLimit);
    hiddenRowsMobile.forEach(item => {
      allGroupedBySection[item.sectionIndex].hiddenMetafieldsMobile.push(item);
    });
  }

  // Definește variabilele pentru split view per section în afara blocului condițional
  let sectionsToRender = [];
  let leftColumnSections = [];
  let rightColumnSections = [];

  if (splitViewPerSection) {
    sectionsToRender = [];
    Object.keys(allGroupedBySection).forEach(sectionIndex => {
      const sectionIdx = parseInt(sectionIndex);
      const sectionData = allGroupedBySection[sectionIndex];
      const sectionVisibleMetafields = visibleMetafields.filter(mf => mf.sectionIndex === sectionIdx);
      const shouldHideSection = sectionHideWhenEmpty[sectionIdx] && sectionVisibleMetafields.length === 0;

      if (!shouldHideSection &&
          (sectionData.displayMetafieldsPC.length > 0 || sectionData.displayMetafieldsMobile.length > 0 ||
           sectionData.hiddenMetafieldsPC.length > 0 || sectionData.hiddenMetafieldsMobile.length > 0)) {
        sectionsToRender.push({ sectionIndex: sectionIdx, sectionData });
      }
    });

    // Calculează numărul de metafields vizibile pentru fiecare secțiune
    // PĂSTREAZĂ ordinea inițială a secțiunilor (sortate după sectionIndex)
    const sectionsWithCount = sectionsToRender
      .map(section => {
        const sectionIdx = section.sectionIndex;
        const sectionVisibleMetafields = visibleMetafields.filter(mf => mf.sectionIndex === sectionIdx);
        return {
          ...section,
          metafieldCount: sectionVisibleMetafields.length
        };
      })
      .sort((a, b) => a.sectionIndex - b.sectionIndex); // Sortează după ordinea inițială (sectionIndex)

    // Funcție helper pentru a calcula suma metafields-urilor pentru o combinație de secțiuni
    const getTotalCount = (sections) => sections.reduce((sum, s) => sum + s.metafieldCount, 0);

    // Găsește cea mai echilibrată distribuție folosind un algoritm de backtracking simplificat
    // pentru un număr mic de secțiuni (max 10-15), acest algoritm este eficient
    let bestLeft = [];
    let bestRight = [];
    let bestDiff = Infinity;

    // Funcție recursivă pentru a găsi cea mai bună distribuție
    function findBestDistribution(index, left, right) {
      if (index >= sectionsWithCount.length) {
        const leftTotal = getTotalCount(left);
        const rightTotal = getTotalCount(right);
        const diff = Math.abs(leftTotal - rightTotal);
        
        // Preferă distribuția cu diferența mai mică
        // Dacă diferența este egală, preferă coloana stângă să fie mai mare sau egală
        const shouldUpdate = diff < bestDiff || 
          (diff === bestDiff && (
            // Dacă diferența este egală, preferă coloana stângă să fie >= dreapta
            (leftTotal >= rightTotal && (bestLeft.length === 0 || getTotalCount(bestLeft) < rightTotal)) ||
            // Sau dacă ambele sunt echilibrate, preferă cea cu prima secțiune cu index mai mic în stânga
            (leftTotal === rightTotal && left.length > 0 && (bestLeft.length === 0 || left[0].sectionIndex < bestLeft[0]?.sectionIndex))
          ));
        
        if (shouldUpdate) {
          bestDiff = diff;
          bestLeft = [...left];
          bestRight = [...right];
        }
        return;
      }

      const currentSection = sectionsWithCount[index];
      const leftTotal = getTotalCount(left);
      const rightTotal = getTotalCount(right);

      // Dacă diferența este deja mare, nu mai are sens să continuăm pe acest path
      if (Math.abs(leftTotal - rightTotal) > bestDiff + currentSection.metafieldCount) {
        return;
      }

      // Preferă să plaseze în stânga dacă stânga este mai mică sau egală cu dreapta
      // Astfel, coloana stângă va fi întotdeauna >= coloana dreaptă când este posibil
      if (leftTotal <= rightTotal) {
        // Încearcă mai întâi să plaseze în stânga
        findBestDistribution(index + 1, [...left, currentSection], right);
        // Apoi încearcă dreapta doar dacă este necesar
        findBestDistribution(index + 1, left, [...right, currentSection]);
      } else {
        // Dacă stânga este deja mai mare, preferă dreapta
        findBestDistribution(index + 1, left, [...right, currentSection]);
        findBestDistribution(index + 1, [...left, currentSection], right);
      }
    }

    // Pentru un număr mic de secțiuni, folosește algoritmul de backtracking
    // Pentru un număr mare, folosește algoritmul greedy
    if (sectionsWithCount.length <= 10) {
      findBestDistribution(0, [], []);
    } else {
      // Fallback la algoritm greedy pentru multe secțiuni
      // Sortează secțiunile descrescător după numărul de metafields pentru o distribuție mai bună
      const sortedSections = [...sectionsWithCount].sort((a, b) => b.metafieldCount - a.metafieldCount);
      
      bestLeft = [];
      bestRight = [];
      let leftColumnTotal = 0;
      let rightColumnTotal = 0;

      sortedSections.forEach(section => {
        // Preferă coloana stângă dacă este mai mică sau egală cu dreapta
        // Astfel, coloana stângă va fi întotdeauna >= coloana dreaptă
        if (leftColumnTotal <= rightColumnTotal) {
          bestLeft.push(section);
          leftColumnTotal += section.metafieldCount;
        } else {
          bestRight.push(section);
          rightColumnTotal += section.metafieldCount;
        }
      });
    }

    // Sortează secțiunile din fiecare coloană după sectionIndex pentru a păstra ordinea inițială
    leftColumnSections = bestLeft.sort((a, b) => a.sectionIndex - b.sectionIndex);
    rightColumnSections = bestRight.sort((a, b) => a.sectionIndex - b.sectionIndex);

    // Pentru splitViewPerSection, recalculăm displayMetafieldsPC și displayMetafieldsMobile per coloană
    // Limita este de 10 metafields per coloană (nu 20 total)
    if (seeMoreEnabled && splitViewPerSection) {
      const perColumnLimit = 10; // 10 metafields per coloană pentru splitViewPerSection
      
      // Recalculează pentru coloana stângă
      let leftColumnMetafieldsCount = 0;
      leftColumnSections.forEach(({ sectionIndex }) => {
        const sectionData = allGroupedBySection[sectionIndex];
        const sectionVisibleMetafields = visibleMetafields.filter(mf => mf.sectionIndex === sectionIndex);
        
        if (leftColumnMetafieldsCount < perColumnLimit) {
          const remaining = perColumnLimit - leftColumnMetafieldsCount;
          const displayCount = Math.min(remaining, sectionVisibleMetafields.length);
          
          // Recalculează displayMetafieldsPC și displayMetafieldsMobile pentru această secțiune
          sectionData.displayMetafieldsPC = sectionVisibleMetafields.slice(0, displayCount);
          sectionData.displayMetafieldsMobile = sectionVisibleMetafields.slice(0, displayCount);
          sectionData.hiddenMetafieldsPC = sectionVisibleMetafields.slice(displayCount);
          sectionData.hiddenMetafieldsMobile = sectionVisibleMetafields.slice(displayCount);
          
          leftColumnMetafieldsCount += displayCount;
        } else {
          // Toate metafields-urile din această secțiune sunt hidden
          sectionData.displayMetafieldsPC = [];
          sectionData.displayMetafieldsMobile = [];
          sectionData.hiddenMetafieldsPC = sectionVisibleMetafields;
          sectionData.hiddenMetafieldsMobile = sectionVisibleMetafields;
        }
      });
      
      // Recalculează pentru coloana dreaptă
      let rightColumnMetafieldsCount = 0;
      rightColumnSections.forEach(({ sectionIndex }) => {
        const sectionData = allGroupedBySection[sectionIndex];
        const sectionVisibleMetafields = visibleMetafields.filter(mf => mf.sectionIndex === sectionIndex);
        
        if (rightColumnMetafieldsCount < perColumnLimit) {
          const remaining = perColumnLimit - rightColumnMetafieldsCount;
          const displayCount = Math.min(remaining, sectionVisibleMetafields.length);
          
          // Recalculează displayMetafieldsPC și displayMetafieldsMobile pentru această secțiune
          sectionData.displayMetafieldsPC = sectionVisibleMetafields.slice(0, displayCount);
          sectionData.displayMetafieldsMobile = sectionVisibleMetafields.slice(0, displayCount);
          sectionData.hiddenMetafieldsPC = sectionVisibleMetafields.slice(displayCount);
          sectionData.hiddenMetafieldsMobile = sectionVisibleMetafields.slice(displayCount);
          
          rightColumnMetafieldsCount += displayCount;
        } else {
          // Toate metafields-urile din această secțiune sunt hidden
          sectionData.displayMetafieldsPC = [];
          sectionData.displayMetafieldsMobile = [];
          sectionData.hiddenMetafieldsPC = sectionVisibleMetafields;
          sectionData.hiddenMetafieldsMobile = sectionVisibleMetafields;
        }
      });
      
      // Recalculează hasMorePC și hasMoreMobile bazat pe coloane
      const leftColumnHasMore = leftColumnSections.some(({ sectionIndex }) => {
        const sectionData = allGroupedBySection[sectionIndex];
        return sectionData.hiddenMetafieldsPC.length > 0 || sectionData.hiddenMetafieldsMobile.length > 0;
      });
      const rightColumnHasMore = rightColumnSections.some(({ sectionIndex }) => {
        const sectionData = allGroupedBySection[sectionIndex];
        return sectionData.hiddenMetafieldsPC.length > 0 || sectionData.hiddenMetafieldsMobile.length > 0;
      });
      
      hasMorePC = leftColumnHasMore || rightColumnHasMore;
      hasMoreMobile = leftColumnHasMore || rightColumnHasMore;
    }
  }

  // Funcție helper pentru a converti hex color în RGB
  function hexToRgb(hex) {
    let r = 255, g = 255, b = 255;
    if (hex && hex.startsWith('#')) {
      let hexValue = hex.slice(1);
      if (hexValue.length === 3) {
        hexValue = hexValue.split('').map(c => c + c).join('');
      }
      if (hexValue.length === 6) {
        r = parseInt(hexValue.slice(0, 2), 16);
        g = parseInt(hexValue.slice(2, 4), 16);
        b = parseInt(hexValue.slice(4, 6), 16);
      }
    }
    return { r, g, b };
  }
  
  // Creează fog gradient pentru fiecare device folosind background-ul corect
  function createFogGradient(bgColor) {
    const { r, g, b } = hexToRgb(bgColor || '#ffffff');
    return 'linear-gradient(to bottom, rgba(' + r + ', ' + g + ', ' + b + ', 0) 0%, rgba(' + r + ', ' + g + ', ' + b + ', 0.8) 50%, rgba(' + r + ', ' + g + ', ' + b + ', 1) 100%)';
  }
  
  // Obține fog gradient-urile pentru fiecare device
  let fogGradientMobile, fogGradientTablet, fogGradientDesktop;
  if (hasDeviceSpecificStyling) {
    fogGradientMobile = createFogGradient(mobileStyling.backgroundColor);
    fogGradientTablet = createFogGradient(tabletStyling.backgroundColor);
    fogGradientDesktop = createFogGradient(desktopStyling.backgroundColor);
  } else {
    // Backward compatibility: folosește un singur fog gradient
    const fogGradient = createFogGradient(styling.backgroundColor);
    fogGradientMobile = fogGradient;
    fogGradientTablet = fogGradient;
    fogGradientDesktop = fogGradient;
  }

  // Wrap secțiunile într-un div cu position relative pentru overlay
  html += '<div style="position: relative;">';
  
  if (splitViewPerSection) {
    if (sectionsToRender.length > 0) {
      html += '<div class="dc_split_view_sections" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';
      html += '<div class="dc_split_view_column dc_split_view_left">';
      leftColumnSections.forEach(({ sectionIndex, sectionData }) => {
        html += renderSection(sectionData, styling, columnRatio, escapedTemplateId, sectionIndex, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
      });
      html += '</div>';
      html += '<div class="dc_split_view_column dc_split_view_right">';
      rightColumnSections.forEach(({ sectionIndex, sectionData }) => {
        html += renderSection(sectionData, styling, columnRatio, escapedTemplateId, sectionIndex, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
      });
      html += '</div>';
      html += '</div>';
    }
  } else {
    Object.keys(allGroupedBySection).forEach(sectionIndex => {
        const sectionIdx = parseInt(sectionIndex);
        const sectionData = allGroupedBySection[sectionIndex];

        if (sectionData.displayMetafieldsPC.length === 0 && sectionData.displayMetafieldsMobile.length === 0 &&
            sectionData.hiddenMetafieldsPC.length === 0 && sectionData.hiddenMetafieldsMobile.length === 0) {
          return;
        }

      html += renderSection(sectionData, styling, columnRatio, escapedTemplateId, sectionIdx, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
    });
  }
  
  // Adaugă fog overlay în interiorul wrapper-ului cu secțiunile (comun pentru ambele cazuri)
  // Folosim fog-uri separate pentru mobile, tablet și desktop cu background-uri diferite
  if (hasMorePC || hasMoreMobile) {
    if (hasMorePC) {
      // Fog pentru desktop (>= 1024px) și tablet (768px - 1023px)
      html += '<div class="dc_see_more_fog_overlay dc_see_more_fog_overlay_pc" style="position: absolute; left: 0; right: 0; height: 250px; pointer-events: none; z-index: 1;">';
      // Desktop fog (>= 1024px)
      html += '<span class="dc_fog_desktop" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; background: ' + fogGradientDesktop + '; display: block;"></span>';
      // Tablet fog (768px - 1023px)
      html += '<span class="dc_fog_tablet" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; background: ' + fogGradientTablet + '; display: none;"></span>';
      html += '</div>';
    }
    if (hasMoreMobile) {
      // Fog pentru mobile (< 768px)
      html += '<div class="dc_see_more_fog_overlay dc_see_more_fog_overlay_mobile" style="position: absolute; left: 0; right: 0; height: 250px; pointer-events: none; z-index: 1;">';
      html += '<span class="dc_fog_mobile" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; background: ' + fogGradientMobile + '; display: block;"></span>';
      html += '</div>';
    }
  }
  
  html += '</div>'; // Închide wrapper-ul cu position relative

  // Obține seeMoreButtonStyle și seeMoreButtonText din styling
  // Verifică atât în styling direct, cât și în nested objects
  const seeMoreButtonStyle = styling?.seeMoreButtonStyle || styling?.see_more_button_style || 'arrow';
  const seeMoreButtonText = styling?.seeMoreButtonText || styling?.see_more_button_text || 'See More';
  const showArrow = seeMoreButtonStyle === 'arrow' || seeMoreButtonStyle === 'arrow+text';
  const showText = seeMoreButtonStyle === 'text' || seeMoreButtonStyle === 'arrow+text';
  
  // Debug logging pentru a vedea ce se întâmplă
  console.log('[See More Button Debug]', {
    seeMoreButtonStyle,
    seeMoreButtonText,
    showArrow,
    showText,
    stylingKeys: Object.keys(styling || {}),
    hasSeeMoreButtonText: !!(styling?.seeMoreButtonText),
    stylingSeeMoreButtonText: styling?.seeMoreButtonText
  });

  if (hasMorePC || hasMoreMobile) {
    if (hasMorePC) {
      html += '<div class="dc_see_more dc_see_more_pc" style="position: relative; z-index: 2;">';
      html += '<button class="dc_see_more_button" onclick="showAllTableRows(\'' + escapedTemplateId + '\', event, \'pc\')">';
      if (showArrow) {
        html += '<span id="see-more-arrow-pc-' + escapedTemplateId + '" class="dc_see_more_arrow">' + arrowDownSvg + '</span>';
      }
      if (showText && seeMoreButtonText) {
        const escapedText = escapeHtml(String(seeMoreButtonText));
        html += '<span class="dc_see_more_text" style="display: inline-block;">' + escapedText + '</span>';
      }
      html += '</button>';
      html += '</div>';
    }

    if (hasMoreMobile) {
      html += '<div class="dc_see_more dc_see_more_mobile" style="position: relative; z-index: 2;">';
      html += '<button class="dc_see_more_button" onclick="showAllTableRows(\'' + escapedTemplateId + '\', event, \'mobile\')">';
      if (showArrow) {
        html += '<span id="see-more-arrow-mobile-' + escapedTemplateId + '" class="dc_see_more_arrow">' + arrowDownSvg + '</span>';
      }
      if (showText && seeMoreButtonText) {
        const escapedText = escapeHtml(String(seeMoreButtonText));
        html += '<span class="dc_see_more_text" style="display: inline-block;">' + escapedText + '</span>';
      }
      html += '</button>';
      html += '</div>';
    }

    html += '<div id="spec-table-hidden-' + escapedTemplateId + '" class="dc_hidden">';
    Object.keys(allGroupedBySection).forEach(sectionIndex => {
      const sectionIdx = parseInt(sectionIndex);
      const sectionData = allGroupedBySection[sectionIndex];

      if (sectionData.hiddenMetafieldsPC.length > 0) {
        html += '<div id="spec-hidden-section-pc-' + escapedTemplateId + '-' + sectionIdx + '" data-section-index="' + sectionIdx + '" data-device="pc" data-section-heading="' + escapeHtml(sectionData.heading) + '">';
        html += '<table style="display: none;"><tbody>';
        html += renderHiddenRowsAsTable(sectionData.hiddenMetafieldsPC, styling, escapedTemplateId, sectionIdx, allMetafieldsWithSection);
        html += '</tbody></table>';
        html += '</div>';
      }

      if (sectionData.hiddenMetafieldsMobile.length > 0) {
        html += '<div id="spec-hidden-section-mobile-' + escapedTemplateId + '-' + sectionIdx + '" data-section-index="' + sectionIdx + '" data-device="mobile" data-section-heading="' + escapeHtml(sectionData.heading) + '">';
        html += '<table style="display: none;"><tbody>';
        html += renderHiddenRowsAsTable(sectionData.hiddenMetafieldsMobile, styling, escapedTemplateId, sectionIdx, allMetafieldsWithSection);
        html += '</tbody></table>';
        html += '</div>';
      }
    });
    html += '</div>';
  }

  // Închide div-ul pentru conținutul collapsible (dacă este activat)
  if (isCollapsible) {
    html += '</div>'; // Închide dc_collapsible_content
  }

  html += '</div>'; // Închide dc_container

  try {
    container.innerHTML = html;
  } catch (error) {
    throw error;
  }
}

// Funcție pentru a randa o secțiune
function renderSection(sectionData, styling, columnRatio, escapedTemplateId, sectionIdx, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg) {
  const isAccordionHideFromPC = template.isAccordionHideFromPC === true || template.isAccordionHideFromPC === 'true';
  const isAccordionHideFromMobile = template.isAccordionHideFromMobile === true || template.isAccordionHideFromMobile === 'true';
  const showAccordionPC = template.isAccordion && !isAccordionHideFromPC;
  const showAccordionMobile = template.isAccordion && !isAccordionHideFromMobile;

  // Verifică dacă există metafields de afișat pentru PC
  const hasDisplayMetafieldsPC = sectionData.displayMetafieldsPC && sectionData.displayMetafieldsPC.length > 0;
  // Verifică dacă există metafields de afișat pentru Mobile
  const hasDisplayMetafieldsMobile = sectionData.displayMetafieldsMobile && sectionData.displayMetafieldsMobile.length > 0;

  // IMPORTANT: Afișăm secțiunea DOAR dacă are metafields de afișat (displayMetafields)
  // Dacă toate metafields-urile sunt hidden, secțiunea nu se afișează deloc până la apăsarea "See More"
  if (!hasDisplayMetafieldsPC && !hasDisplayMetafieldsMobile) {
    return '';
  }

  let html = '<div class="dc_section">';
  html += '<div class="dc_accordion_pc_version">';
  if (hasDisplayMetafieldsPC) {
    if (showAccordionPC) {
      html += '<div class="dc_section_header" onclick="toggleSpecSection(' + sectionIdx + ', \'' + escapedTemplateId + '\', \'pc\')">';
      html += '<span>' + escapeHtml(sectionData.heading) + '</span>';
      html += '<span class="dc_accordion_arrow" id="spec-arrow-pc-' + escapedTemplateId + '-' + sectionIdx + '">' + arrowDownSvg + '</span>';
      html += '</div>';
      html += '<div id="spec-section-pc-' + escapedTemplateId + '-' + sectionIdx + '" class="dc_section_content" style="display: none;">';
      html += renderSectionTable(sectionData, styling, columnRatio, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsPC, 'pc', splitViewPerMetafield);
      html += '</div>';
    } else {
      // Folosește CSS variables pentru a permite media queries să suprascrie stilurile
      // CSS variables sunt setate în media queries pentru fiecare device
      const headerTextAlignStyle = 'text-align: var(--dc-header-text-align, left); ';
      const headerBottomBorderStyle = 'border-bottom: var(--dc-header-bottom-border, none); ';
      const headingInlineStyle = headerTextAlignStyle + headerBottomBorderStyle;
      
      html += '<h3 class="dc_heading" style="' + headingInlineStyle + '">';
      html += escapeHtml(sectionData.heading);
      html += '</h3>';
      html += renderSectionTable(sectionData, styling, columnRatio, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsPC, 'pc', splitViewPerMetafield);
    }
  }
  html += '</div>';
  html += '<div class="dc_accordion_mobile_version">';
  if (hasDisplayMetafieldsMobile) {
    if (showAccordionMobile) {
      html += '<div class="dc_section_header" onclick="toggleSpecSection(' + sectionIdx + ', \'' + escapedTemplateId + '\', \'mobile\')">';
      html += '<span>' + escapeHtml(sectionData.heading) + '</span>';
      html += '<span class="dc_accordion_arrow" id="spec-arrow-mobile-' + escapedTemplateId + '-' + sectionIdx + '">' + arrowDownSvg + '</span>';
      html += '</div>';
      html += '<div id="spec-section-mobile-' + escapedTemplateId + '-' + sectionIdx + '" class="dc_section_content" style="display: none;">';
      html += renderSectionTable(sectionData, styling, columnRatio, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsMobile, 'mobile', splitViewPerMetafield);
      html += '</div>';
    } else {
      // Folosește CSS variables pentru a permite media queries să suprascrie stilurile
      const headerTextAlignStyle = 'text-align: var(--dc-header-text-align, left); ';
      const headerBottomBorderStyle = 'border-bottom: var(--dc-header-bottom-border, none); ';
      const headingInlineStyle = headerTextAlignStyle + headerBottomBorderStyle;
      
      html += '<h3 class="dc_heading" style="' + headingInlineStyle + '">';
      html += escapeHtml(sectionData.heading);
      html += '</h3>';
      html += renderSectionTable(sectionData, styling, columnRatio, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsMobile, 'mobile', splitViewPerMetafield);
    }
  }
  html += '</div>';
  html += '</div>';
  return html;
}

// Funcție pentru a randa tabelul unei secțiuni
function renderSectionTable(section, styling, columnRatio, seeMoreEnabled, templateId, sectionIndex, allMetafieldsWithSection, displayMetafields, device, splitViewPerMetafield) {
  const deviceSuffix = device ? '-' + device : '';
  const tableId = 'spec-table' + deviceSuffix + '-' + templateId + '-' + sectionIndex;

  if (splitViewPerMetafield && displayMetafields.length > 0) {
    const leftColumnMetafields = [];
    const rightColumnMetafields = [];
    displayMetafields.forEach((metafield, index) => {
      if (index % 2 === 0) {
        leftColumnMetafields.push(metafield);
      } else {
        rightColumnMetafields.push(metafield);
      }
    });

    let html = '<div id="' + tableId + '-container" class="dc_table_container dc_split_view_metafields" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';
    html += '<div class="dc_split_view_metafield_column dc_split_view_metafield_left">';
    html += '<table class="dc_table" id="' + tableId + '-left">';
    html += '<tbody id="' + tableId + '-tbody-left">';
    html += renderMetafieldsRows(leftColumnMetafields, styling, allMetafieldsWithSection);
    html += '</tbody></table>';
    html += '</div>';
    html += '<div class="dc_split_view_metafield_column dc_split_view_metafield_right">';
    html += '<table class="dc_table" id="' + tableId + '-right">';
    html += '<tbody id="' + tableId + '-tbody-right">';
    html += renderMetafieldsRows(rightColumnMetafields, styling, allMetafieldsWithSection);
    html += '</tbody></table>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  let html = '<div id="' + tableId + '-container" class="dc_table_container">';
  html += '<table class="dc_table" id="' + tableId + '">';
  html += '<tbody id="' + tableId + '-tbody">';
  html += renderMetafieldsRows(displayMetafields, styling, allMetafieldsWithSection);
  html += '</tbody></table>';
  html += '</div>';
  return html;
}

// Funcție pentru a randa rândurile de metafields
function renderMetafieldsRows(metafields, styling, allMetafieldsWithSection) {
  let rowsHtml = '';
  const productMetafields = window.productMetafieldsData || {};
  const variantMetafields = window.variantMetafieldsData || {};

  metafields.forEach((metafield, index) => {
    let hasValue = false;
    let value = null;

    // Dacă este product spec, verifică în productSpecsFromLiquid
    if (metafield.type === 'product_spec') {
      const productSpecs = window.productSpecsFromLiquid || {};
      if (productSpecs[metafield.productSpecType] !== undefined) {
        value = productSpecs[metafield.productSpecType];
        
        // Pentru inventory_quantity, acceptăm și valoarea 0
        if (metafield.productSpecType === 'inventory_quantity') {
          hasValue = value !== null && value !== undefined && value !== '';
        } else {
          hasValue = value !== null &&
                    value !== undefined &&
                    value !== '' &&
                    (typeof value !== 'string' || value.trim() !== '') &&
                    value !== 'null' &&
                    value !== 'undefined' &&
                    (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
        }
      }
    } else if (metafield.ownerType === 'PRODUCT') {
      if (productMetafields[metafield.namespace] &&
          productMetafields[metafield.namespace][metafield.key] !== undefined) {
        value = productMetafields[metafield.namespace][metafield.key];
        hasValue = value !== null &&
                  value !== undefined &&
                  value !== '' &&
                  (typeof value !== 'string' || value.trim() !== '') &&
                  value !== 'null' &&
                  value !== 'undefined' &&
                  (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
        if (hasValue && typeof value === 'object') {
          hasValue = value.title || value.featured_image || value.image;
        }
      }
    } else if (metafield.ownerType === 'VARIANT') {
      Object.keys(variantMetafields).forEach(variantId => {
        if (!hasValue && variantMetafields[variantId] &&
            variantMetafields[variantId][metafield.namespace] &&
            variantMetafields[variantId][metafield.namespace][metafield.key] !== undefined) {
          value = variantMetafields[variantId][metafield.namespace][metafield.key];
          hasValue = value !== null &&
                    value !== undefined &&
                    value !== '' &&
                    (typeof value !== 'string' || value.trim() !== '') &&
                    value !== 'null' &&
                    value !== 'undefined' &&
                    (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
          if (hasValue && typeof value === 'object') {
            hasValue = value.title || value.featured_image || value.image;
          }
        }
      });
    }

    const globalIndex = allMetafieldsWithSection.indexOf(metafield);
    const isOdd = globalIndex !== -1 && globalIndex % 2 === 0;

    // Folosește CSS variables pentru background colors (sunt setate în media queries)
    // CSS variables pentru background sunt deja setate pe container prin media queries
    // Folosim CSS variables pentru a permite device-specific styling
    let specBackgroundStyle = '';
    let valueBackgroundStyle = '';
    
    // Determină dacă avem device-specific styling
    const hasDeviceSpecificStyling = styling && (styling.mobile || styling.tablet || styling.desktop);
    
    if (hasDeviceSpecificStyling) {
      // Device-specific styling: folosim CSS variables pentru background colors
      // CSS variables-urile sunt deja setate în media queries pe container
      // Folosim CSS variables pentru a permite device-specific styling
      // Pentru row/column backgrounds, folosim CSS variables-urile setate în media queries
      if (styling.columnBackgroundEnabled || (styling.desktop && styling.desktop.columnBackgroundEnabled)) {
        // Column backgrounds: folosim CSS variables
        specBackgroundStyle = 'background-color: var(--dc-odd-column-bg, transparent); ';
        valueBackgroundStyle = 'background-color: var(--dc-even-column-bg, transparent); ';
      } else if (styling.rowBackgroundEnabled || (styling.desktop && styling.desktop.rowBackgroundEnabled)) {
        // Row backgrounds: folosim CSS variables bazat pe odd/even
        specBackgroundStyle = 'background-color: var(--dc-' + (isOdd ? 'odd' : 'even') + '-row-bg, transparent); ';
        valueBackgroundStyle = 'background-color: var(--dc-' + (isOdd ? 'odd' : 'even') + '-row-bg, transparent); ';
      } else {
        // TD background: folosim CSS variable
        specBackgroundStyle = 'background-color: var(--dc-td-bg, transparent); ';
        valueBackgroundStyle = 'background-color: var(--dc-td-bg, transparent); ';
      }
    } else {
      // Backward compatibility: folosim logica veche cu valori directe
      if (styling.columnBackgroundEnabled) {
        specBackgroundStyle = 'background-color: ' + (styling.oddColumnBackgroundColor || '#ff0000') + '; ';
        valueBackgroundStyle = 'background-color: ' + (styling.evenColumnBackgroundColor || '#00ff00') + '; ';
      } else if (styling.rowBackgroundEnabled) {
        const rowBackground = isOdd ? (styling.oddRowBackgroundColor || '#f0f0f0') : (styling.evenRowBackgroundColor || '#ffffff');
        specBackgroundStyle = 'background-color: ' + rowBackground + '; ';
        valueBackgroundStyle = 'background-color: ' + rowBackground + '; ';
      } else if (styling.tdBackgroundColor && styling.tdBackgroundColor !== 'transparent') {
        specBackgroundStyle = 'background-color: ' + styling.tdBackgroundColor + '; ';
        valueBackgroundStyle = 'background-color: ' + styling.tdBackgroundColor + '; ';
      }
    }

    const hideFromPC = metafield.hideFromPC === true || metafield.hideFromPC === 'true';
    const hideFromMobile = metafield.hideFromMobile === true || metafield.hideFromMobile === 'true';

    let rowClasses = 'dc_table_tr';
    if (hideFromPC) {
      rowClasses += ' dc_hide_from_pc';
    }
    if (hideFromMobile) {
      rowClasses += ' dc_hide_from_mobile';
    }
    if (!hasValue) {
      rowClasses += ' dc_hidden';
    }

    // Aplică specSpacing (row padding) - folosește CSS variable pentru device-specific styling
    // CSS variable este deja setat pe container prin media queries
    const specSpacingStyle = 'padding-top: var(--dc-spec-spacing, 10px); padding-bottom: var(--dc-spec-spacing, 10px); ';

    rowsHtml += '<tr class="' + rowClasses + '">';
    rowsHtml += '<td class="dc_table_td_label" style="' + specSpacingStyle + (specBackgroundStyle ? ' ' + specBackgroundStyle : '') + '">';
    // Dacă este product spec, folosește numele corespunzător
    let displayName;
    if (metafield.type === 'product_spec') {
      const productSpecLabels = {
        'vendor': 'Vendor',
        'inventory_quantity': 'Stock quantity',
        'weight': 'Weight',
        'sku': 'SKU',
        'barcode': 'Barcode',
        'variant_sku': 'Variant SKU',
        'compare_at_price': 'Compare at price',
        'product_type': 'Product category',
        'collection_names': 'Collection name'
      };
      displayName = metafield.customName || productSpecLabels[metafield.productSpecType] || metafield.productSpecType;
    } else {
      displayName = metafield.customName || metafield.name || metafield.namespace + '.' + metafield.key;
    }
    let nameHtml = escapeHtml(displayName);
    if (metafield.tooltipEnabled && metafield.tooltipText) {
      nameHtml += ' <span class="dc_tooltip" title="' + escapeHtml(metafield.tooltipText) + '" data-tooltip-text="' + escapeHtml(metafield.tooltipText) + '" data-metafield-name="' + escapeHtml(displayName) + '">i</span>';
    }
    rowsHtml += nameHtml + '  :';
    rowsHtml += '</td>';
    const prefixValue = (metafield.prefix !== null && metafield.prefix !== undefined) ? String(metafield.prefix) : '';
    const suffixValue = (metafield.suffix !== null && metafield.suffix !== undefined) ? String(metafield.suffix) : '';
    // Dacă este product spec, folosește data-product-spec-type
    // Aplică specSpacing și pe celula de valoare
    const valueSpacingStyle = 'padding-top: ' + (styling.specSpacing || '10') + 'px; padding-bottom: ' + (styling.specSpacing || '10') + 'px; ';
    if (metafield.type === 'product_spec') {
      rowsHtml += '<td class="dc_table_td_value" style="' + valueSpacingStyle + (valueBackgroundStyle ? ' ' + valueBackgroundStyle : '') + '" data-product-spec-type="' + escapeHtml(metafield.productSpecType) + '">';
      rowsHtml += '<span data-product-spec-value data-product-spec-type="' + escapeHtml(metafield.productSpecType) + '" data-prefix="' + escapeHtml(prefixValue) + '" data-suffix="' + escapeHtml(suffixValue) + '">Loading...</span>';
      rowsHtml += '</td>';
      rowsHtml += '</tr>';
    } else {
      rowsHtml += '<td class="dc_table_td_value" style="' + valueSpacingStyle + (valueBackgroundStyle ? ' ' + valueBackgroundStyle : '') + '" data-namespace="' + escapeHtml(metafield.namespace) + '" data-key="' + escapeHtml(metafield.key) + '" data-owner-type="' + escapeHtml(metafield.ownerType || 'PRODUCT') + '" data-type="' + escapeHtml(metafield.metafieldType || metafield.type || 'single_line_text_field') + '">';
      rowsHtml += '<span data-metafield-value data-namespace="' + escapeHtml(metafield.namespace) + '" data-key="' + escapeHtml(metafield.key) + '" data-owner-type="' + escapeHtml(metafield.ownerType || 'PRODUCT') + '" data-type="' + escapeHtml(metafield.metafieldType || metafield.type || 'single_line_text_field') + '" data-prefix="' + escapeHtml(prefixValue) + '" data-suffix="' + escapeHtml(suffixValue) + '">Loading...</span>';
      rowsHtml += '</td>';
      rowsHtml += '</tr>';
    }
  });

  return rowsHtml;
}

// Funcție pentru a randa rândurile ascunse
function renderHiddenRowsAsTable(metafields, styling, templateId, sectionIndex, allMetafieldsWithSection) {
  return renderMetafieldsRows(metafields, styling, allMetafieldsWithSection);
}

// Funcție globală pentru "See more"
window.showAllTableRows = function(templateId, event, device) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const hiddenContainer = document.getElementById('spec-table-hidden-' + templateId);
  if (!hiddenContainer) {
    return;
  }

  const selector = '[id^="spec-hidden-section-' + device + '-' + templateId + '-"]';
  const hiddenSections = hiddenContainer.querySelectorAll(selector);

  // Găsește container-ul principal al tabelului o singură dată
  const mainContainer = document.getElementById('specification-table-' + templateId);
  if (!mainContainer) {
    console.warn('[showAllTableRows] Main container not found for templateId:', templateId);
    return;
  }

  hiddenSections.forEach(sectionContainer => {
    const sectionIndex = sectionContainer.getAttribute('data-section-index');
    const tableId = 'spec-table-' + device + '-' + templateId + '-' + sectionIndex;

    // Caută container-ul tabelului - poate fi în split view sections sau în structura normală
    let deviceContainer = document.querySelector('#' + tableId + '-container');
    
    if (!deviceContainer) {
      // Încearcă să găsească în split view sections
      deviceContainer = document.querySelector('.dc_split_view_sections #' + tableId + '-container');
    }

    if (!deviceContainer) {
      // Încearcă să găsească în structura normală (fără split view)
      const seeMoreVersionClass = device === 'pc' ? 'dc_see_more_pc_version' : 'dc_see_more_mobile_version';
      deviceContainer = document.querySelector('.' + seeMoreVersionClass + ' #' + tableId + '-container');
    }

    if (!deviceContainer) {
      const accordionVersionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
      deviceContainer = document.querySelector('.' + accordionVersionClass + ' #' + tableId + '-container');
    }

    // Dacă container-ul există dar este ascuns, îl afișăm din nou
    // De asemenea, afișăm heading-ul dacă a fost ascuns anterior
    if (deviceContainer) {
      if (deviceContainer.style.display === 'none') {
        deviceContainer.style.display = '';
      }
      // Afișăm și heading-ul dacă există și este ascuns
      const versionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
      const allSections = mainContainer.querySelectorAll('.dc_section');
      allSections.forEach(sectionDiv => {
        const versionDiv = sectionDiv.querySelector('.' + versionClass);
        if (versionDiv) {
          const sectionContainerCheck = versionDiv.querySelector('#' + tableId + '-container');
          if (sectionContainerCheck === deviceContainer) {
            const heading = versionDiv.querySelector('h3.dc_heading');
            const sectionHeader = versionDiv.querySelector('.dc_section_header');
            if (heading && heading.style.display === 'none') {
              heading.style.display = '';
            }
            if (sectionHeader && sectionHeader.style.display === 'none') {
              sectionHeader.style.display = '';
            }
          }
        }
      });
    }

    // Dacă container-ul nu există, înseamnă că secțiunea nu a fost renderizată deloc (toate metafields-urile erau hidden)
    // Trebuie să creăm secțiunea și container-ul
    if (!deviceContainer) {

      // Verifică dacă este split view per section
      const splitViewSections = mainContainer.querySelector('.dc_split_view_sections');
      if (splitViewSections) {
        // Găsește coloanele existente
        let leftColumn = splitViewSections.querySelector('.dc_split_view_left');
        let rightColumn = splitViewSections.querySelector('.dc_split_view_right');
        
        // Dacă nu există coloane, le creăm
        if (!leftColumn) {
          leftColumn = document.createElement('div');
          leftColumn.className = 'dc_split_view_column dc_split_view_left';
          splitViewSections.appendChild(leftColumn);
        }
        if (!rightColumn) {
          rightColumn = document.createElement('div');
          rightColumn.className = 'dc_split_view_column dc_split_view_right';
          splitViewSections.appendChild(rightColumn);
        }
        
        // Determină în ce coloană ar trebui să fie secțiunea bazat pe distribuția optimă
        // Colectează toate secțiunile existente din ambele coloane cu indexurile lor
        const leftSectionIndices = Array.from(leftColumn.querySelectorAll('.dc_section')).map(section => {
          const sectionContainer = section.querySelector('[id$="-container"]');
          if (sectionContainer) {
            const id = sectionContainer.id;
            // Caută pattern-ul: spec-table-{device}-{templateId}-{sectionIndex}-container
            const match = id.match(/spec-table-(?:pc|mobile)-\d+-(\d+)-container/);
            return match ? parseInt(match[1]) : null;
          }
          return null;
        }).filter(idx => idx !== null).sort((a, b) => a - b);
        
        const rightSectionIndices = Array.from(rightColumn.querySelectorAll('.dc_section')).map(section => {
          const sectionContainer = section.querySelector('[id$="-container"]');
          if (sectionContainer) {
            const id = sectionContainer.id;
            const match = id.match(/spec-table-(?:pc|mobile)-\d+-(\d+)-container/);
            return match ? parseInt(match[1]) : null;
          }
          return null;
        }).filter(idx => idx !== null).sort((a, b) => a - b);
        
        const currentSectionIndex = parseInt(sectionIndex);
        
        // Determină coloana bazat pe distribuția optimă
        // Ideea: dacă există o "găură" în distribuție (de ex. Section 1, 2 în stânga, Section 4 în dreapta),
        // atunci Section 3 ar trebui să fie în stânga pentru a menține ordinea
        const maxLeftIndex = leftSectionIndices.length > 0 ? Math.max(...leftSectionIndices) : -1;
        const minRightIndex = rightSectionIndices.length > 0 ? Math.min(...rightSectionIndices) : Infinity;
        
        let column;
        // Dacă există o "găură" între stânga și dreapta (de ex. maxLeftIndex < currentSectionIndex < minRightIndex),
        // atunci secțiunea curentă ar trebui să fie în stânga pentru a menține ordinea
        if (maxLeftIndex < currentSectionIndex && currentSectionIndex < minRightIndex) {
          // Există o găură, punem secțiunea în stânga
          column = leftColumn;
        } else if (currentSectionIndex <= maxLeftIndex) {
          // Secțiunea este mai mică sau egală cu maxLeftIndex, o punem în stânga
          column = leftColumn;
        } else if (currentSectionIndex >= minRightIndex) {
          // Secțiunea este mai mare sau egală cu minRightIndex, o punem în dreapta
          column = rightColumn;
        } else {
          // Fallback: folosim logica simplă bazată pe număr
          const leftSections = leftSectionIndices.length;
          const rightSections = rightSectionIndices.length;
          column = leftSections <= rightSections ? leftColumn : rightColumn;
        }

        // Creează secțiunea
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'dc_section';
        
        const versionDiv = document.createElement('div');
        versionDiv.className = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
        
        // Creează heading-ul
        const heading = document.createElement('h3');
        heading.className = 'dc_heading';
        heading.textContent = sectionContainer.getAttribute('data-section-heading') || 'Section ' + sectionIndex;
        
        // Creează container-ul tabelului
        deviceContainer = document.createElement('div');
        deviceContainer.id = tableId + '-container';
        
        versionDiv.appendChild(heading);
        versionDiv.appendChild(deviceContainer);
        sectionDiv.appendChild(versionDiv);
        column.appendChild(sectionDiv);
      } else {
        // Structură normală (fără split view)
        const versionDiv = document.createElement('div');
        versionDiv.className = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
        
        // Creează heading-ul
        const heading = document.createElement('h3');
        heading.className = 'dc_heading';
        heading.textContent = sectionContainer.getAttribute('data-section-heading') || 'Section ' + sectionIndex;
        
        // Creează secțiunea
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'dc_section';
        
        // Creează container-ul tabelului
        deviceContainer = document.createElement('div');
        deviceContainer.id = tableId + '-container';
        
        versionDiv.appendChild(heading);
        versionDiv.appendChild(deviceContainer);
        sectionDiv.appendChild(versionDiv);
        mainContainer.appendChild(sectionDiv);
      }
    }

    // Verifică dacă există deja tbody-urile în container (pentru split view per metafield sau tabel normal)
    // Pentru split view per metafield, există două tabele separate: tableId + '-left' și tableId + '-right'
    // Pentru tabel normal, există un singur tabel: tableId
    let tbodyLeft = deviceContainer.querySelector('#' + tableId + '-tbody-left');
    let tbodyRight = deviceContainer.querySelector('#' + tableId + '-tbody-right');
    let tbody = deviceContainer.querySelector('#' + tableId + '-tbody');

    // Verifică dacă există deja tbody-uri cu -tbody-left și -tbody-right în alte secțiuni pentru a determina dacă este split view per metafield
    const existingTableWithSplit = mainContainer.querySelector('table[id^="spec-table-' + device + '-' + templateId + '-"] tbody[id$="-tbody-left"]');
    const isSplitViewPerMetafield = existingTableWithSplit !== null;

    if (!tbody && !tbodyLeft && !tbodyRight) {
      // Nu există tbody-uri, trebuie să creăm structura
      if (isSplitViewPerMetafield) {
        // Split view per metafield: două tabele separate
        const containerDiv = document.createElement('div');
        containerDiv.id = tableId + '-container';
        containerDiv.className = 'dc_table_container dc_split_view_metafields';
        containerDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 20px;';
        
        // Tabel stânga
        const leftDiv = document.createElement('div');
        leftDiv.className = 'dc_split_view_metafield_column dc_split_view_metafield_left';
        const leftTable = document.createElement('table');
        leftTable.className = 'dc_table';
        leftTable.id = tableId + '-left';
        tbodyLeft = document.createElement('tbody');
        tbodyLeft.id = tableId + '-tbody-left';
        leftTable.appendChild(tbodyLeft);
        leftDiv.appendChild(leftTable);
        
        // Tabel dreapta
        const rightDiv = document.createElement('div');
        rightDiv.className = 'dc_split_view_metafield_column dc_split_view_metafield_right';
        const rightTable = document.createElement('table');
        rightTable.className = 'dc_table';
        rightTable.id = tableId + '-right';
        tbodyRight = document.createElement('tbody');
        tbodyRight.id = tableId + '-tbody-right';
        rightTable.appendChild(tbodyRight);
        rightDiv.appendChild(rightTable);
        
        containerDiv.appendChild(leftDiv);
        containerDiv.appendChild(rightDiv);
        deviceContainer.appendChild(containerDiv);
      } else {
        // Tabel normal: un singur tabel
        const table = document.createElement('table');
        table.className = 'dc_table';
        table.id = tableId;
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        tbody = document.createElement('tbody');
        tbody.id = tableId + '-tbody';
        table.appendChild(tbody);
        deviceContainer.appendChild(table);
      }
    } else if (isSplitViewPerMetafield && (!tbodyLeft || !tbodyRight)) {
      // Este split view per metafield dar nu găsește tbody-urile, le recreează
      if (!tbodyLeft) {
        const leftTable = deviceContainer.querySelector('#' + tableId + '-left');
        if (leftTable) {
          tbodyLeft = document.createElement('tbody');
          tbodyLeft.id = tableId + '-tbody-left';
          leftTable.appendChild(tbodyLeft);
        }
      }
      if (!tbodyRight) {
        const rightTable = deviceContainer.querySelector('#' + tableId + '-right');
        if (rightTable) {
          tbodyRight = document.createElement('tbody');
          tbodyRight.id = tableId + '-tbody-right';
          rightTable.appendChild(tbodyRight);
        }
      }
    }

    const tempTable = sectionContainer.querySelector('table');
    if (!tempTable) {
      console.warn('[showAllTableRows] Temp table not found for section:', sectionIndex);
      return;
    }

    const tempTbody = tempTable.querySelector('tbody');
    if (!tempTbody) {
      console.warn('[showAllTableRows] Temp tbody not found for section:', sectionIndex);
      return;
    }

    const rows = Array.from(tempTbody.querySelectorAll('tr'));
    console.log('[showAllTableRows] Found', rows.length, 'rows for section', sectionIndex, 'tableId:', tableId);

    if (rows.length === 0) {
      console.warn('[showAllTableRows] No rows found in tempTbody for section:', sectionIndex);
      return;
    }

    if (tbodyLeft && tbodyRight) {
      // Split view per metafield: distribuie rândurile alternativ între cele două coloane
      rows.forEach((row, index) => {
        // Marchează rândurile mutate cu un atribut pentru a le identifica în showLessTableRows
        row.setAttribute('data-see-more-added', 'true');
        if (index % 2 === 0) {
          tbodyLeft.appendChild(row);
        } else {
          tbodyRight.appendChild(row);
        }
      });
      console.log('[showAllTableRows] Added', rows.length, 'rows to split view tbody for section:', sectionIndex);
    } else if (tbody) {
      // Tabel normal: adaugă toate rândurile în tbody
      rows.forEach(row => {
        // Marchează rândurile mutate cu un atribut pentru a le identifica în showLessTableRows
        row.setAttribute('data-see-more-added', 'true');
        tbody.appendChild(row);
      });
      console.log('[showAllTableRows] Added', rows.length, 'rows to normal tbody for section:', sectionIndex);
    } else {
      console.warn('[showAllTableRows] No tbody found for tableId:', tableId, 'section:', sectionIndex);
      console.warn('[showAllTableRows] tbodyLeft:', tbodyLeft, 'tbodyRight:', tbodyRight, 'tbody:', tbody);
      return;
    }
  });

  const button = event ? event.target.closest('button') : document.querySelector('.dc_see_more_' + device + ' .dc_see_more_button');
  if (button) {
    button.style.display = 'none';
  }

  // Ascunde overlay-ul de ceată când se apasă "See More"
  const fogOverlay = document.querySelector('.dc_see_more_fog_overlay_' + device);
  if (fogOverlay) {
    fogOverlay.style.display = 'none';
  }

  const arrow = document.getElementById('see-more-arrow-' + device + '-' + templateId);
  if (arrow) {
    arrow.style.transform = 'rotate(180deg)';
  }

  const container = document.getElementById('specification-table-' + templateId);
  if (container) {
    updateMetafieldValuesFromLiquid(container);
    
    // Obține setările din template
    const templateData = window.templateData && window.templateData[templateId];
    const styling = templateData ? templateData.styling : {};
    const settings = templateData ? templateData.settings : {};
    
    // Verifică dacă butonul "See Less" trebuie să fie ascuns pentru acest device
    const seeLessHideFromPC = settings.seeLessHideFromPC === true || settings.seeLessHideFromPC === 'true';
    const seeLessHideFromMobile = settings.seeLessHideFromMobile === true || settings.seeLessHideFromMobile === 'true';
    
    // Verifică dacă butonul trebuie să fie afișat pentru acest device
    const shouldShowForPC = device === 'pc' && !seeLessHideFromPC;
    const shouldShowForMobile = device === 'mobile' && !seeLessHideFromMobile;
    
    if (!shouldShowForPC && !shouldShowForMobile) {
      // Butonul trebuie să fie ascuns pentru acest device
      console.log('[See Less Button] Hidden for device:', device, 'seeLessHideFromPC:', seeLessHideFromPC, 'seeLessHideFromMobile:', seeLessHideFromMobile);
      return;
    }
    
    // Verifică dacă este split view per section
    const splitViewSections = container.querySelector('.dc_split_view_sections');
    const isSplitViewPerSection = splitViewSections !== null;
    
    let insertTarget = null;
    
    if (isSplitViewPerSection) {
      // Pentru split view per section, plasează butonul după container-ul .dc_split_view_sections
      // Astfel, butonul va apărea în mijloc, sub ambele coloane
      insertTarget = splitViewSections;
    } else {
      // Pentru layout normal, găsește ultima secțiune care a fost extinsă
      const allSections = container.querySelectorAll('.dc_section');
      let lastExtendedSection = null;
      let lastExtendedSectionIndex = -1;
      
      allSections.forEach((section, index) => {
        const versionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
        const versionDiv = section.querySelector('.' + versionClass);
        if (versionDiv) {
          const deviceContainer = versionDiv.querySelector('[id$="-container"]');
          if (deviceContainer) {
            const tbody = deviceContainer.querySelector('tbody');
            const tbodyLeft = deviceContainer.querySelector('tbody[id$="-tbody-left"]');
            const tbodyRight = deviceContainer.querySelector('tbody[id$="-tbody-right"]');
            
            let hasExtendedRows = false;
            if (tbody) {
              hasExtendedRows = tbody.querySelectorAll('tr[data-see-more-added="true"]').length > 0;
            } else if (tbodyLeft && tbodyRight) {
              hasExtendedRows = tbodyLeft.querySelectorAll('tr[data-see-more-added="true"]').length > 0 ||
                               tbodyRight.querySelectorAll('tr[data-see-more-added="true"]').length > 0;
            }
            
            if (hasExtendedRows && index > lastExtendedSectionIndex) {
              lastExtendedSection = section;
              lastExtendedSectionIndex = index;
            }
          }
        }
      });
      
      // Dacă nu găsim o secțiune extinsă, folosim ultima secțiune din container
      if (!lastExtendedSection && allSections.length > 0) {
        lastExtendedSection = allSections[allSections.length - 1];
      }
      
      insertTarget = lastExtendedSection;
    }
    
    // Verifică dacă butonul "Show Less" nu există deja
    let seeLessContainer = container.querySelector('.dc_see_less_' + device);
    if (!seeLessContainer) {
      seeLessContainer = document.createElement('div');
      seeLessContainer.className = 'dc_see_less dc_see_less_' + device;
      seeLessContainer.style.cssText = 'position: relative; z-index: 2; text-align: center; margin-top: 12px;';
      
      const seeLessButton = document.createElement('button');
      seeLessButton.className = 'dc_see_less_button';
      seeLessButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        showLessTableRows(templateId, e, device);
      };
      
      const seeLessButtonStyle = styling.seeLessButtonStyle || styling.seeMoreButtonStyle || 'arrow';
      const seeLessButtonText = styling.seeLessButtonText || 'See Less';
      const showArrow = seeLessButtonStyle === 'arrow' || seeLessButtonStyle === 'arrow+text';
      const showText = seeLessButtonStyle === 'text' || seeLessButtonStyle === 'arrow+text';
      
      // Aplică stilurile (folosește aceleași ca pentru See More)
      seeLessButton.style.cssText = 
        'background: ' + (styling.seeMoreButtonBackground || 'transparent') + '; ' +
        'border: ' + (styling.seeMoreButtonBorderEnabled 
          ? (styling.seeMoreButtonBorderWidth || '1px') + ' ' + (styling.seeMoreButtonBorderStyle || 'solid') + ' ' + (styling.seeMoreButtonBorderColor || '#000000')
          : 'none') + '; ' +
        'cursor: pointer; ' +
        'padding: ' + (styling.seeMoreButtonPadding || '8px') + '; ' +
        'display: inline-flex; ' +
        'align-items: center; ' +
        'justify-content: center; ' +
        'gap: 8px; ' +
        'color: ' + (styling.seeMoreButtonColor || '#000000') + '; ' +
        'font-size: ' + (styling.seeMoreButtonFontSize || '14px') + '; ' +
        'font-family: ' + (styling.seeMoreButtonFontFamily || 'Arial') + '; ' +
        'font-style: ' + ((styling.seeMoreButtonFontStyle === 'italic' || styling.seeMoreButtonFontStyle === 'bold italic') ? 'italic' : 'normal') + '; ' +
        'font-weight: ' + ((styling.seeMoreButtonFontStyle === 'bold' || styling.seeMoreButtonFontStyle === 'bold italic') ? 'bold' : 'normal') + '; ' +
        'border-radius: ' + (styling.seeMoreButtonBorderRadius || '0px') + '; ' +
        'width: 100%; ' +
        'transition: opacity 0.2s ease;';
      
      if (showArrow) {
        const arrowSpan = document.createElement('span');
        arrowSpan.id = 'see-less-arrow-' + device + '-' + templateId;
        arrowSpan.className = 'dc_see_less_arrow';
        arrowSpan.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; transition: transform 0.3s ease; transform: rotate(180deg);"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        seeLessButton.appendChild(arrowSpan);
      }
      
      if (showText && seeLessButtonText) {
        const textSpan = document.createElement('span');
        textSpan.className = 'dc_see_less_text';
        textSpan.style.cssText = 'display: inline-block;';
        textSpan.textContent = String(seeLessButtonText);
        seeLessButton.appendChild(textSpan);
      }
      
      seeLessContainer.appendChild(seeLessButton);
      
      // Inserează butonul "Show Less" în locația corectă
      if (isSplitViewPerSection && insertTarget) {
        // Pentru split view per section, inserează după container-ul .dc_split_view_sections
        insertTarget.parentNode.insertBefore(seeLessContainer, insertTarget.nextSibling);
      } else if (insertTarget) {
        // Pentru layout normal, inserează la sfârșitul ultimei secțiuni extinse
        insertTarget.appendChild(seeLessContainer);
      } else {
        // Fallback: inserează după container-ul principal
        container.appendChild(seeLessContainer);
      }
    } else {
      // Mută butonul existent în locația corectă
      if (isSplitViewPerSection && insertTarget) {
        // Pentru split view per section, mută după container-ul .dc_split_view_sections
        if (seeLessContainer.parentNode !== insertTarget.parentNode || 
            seeLessContainer.nextSibling !== insertTarget.nextSibling) {
          insertTarget.parentNode.insertBefore(seeLessContainer, insertTarget.nextSibling);
        }
      } else if (insertTarget) {
        // Pentru layout normal, mută la sfârșitul ultimei secțiuni extinse
        if (seeLessContainer.parentNode !== insertTarget) {
          insertTarget.appendChild(seeLessContainer);
        }
      }
      seeLessContainer.style.display = 'block';
    }
  }
};

// Funcție globală pentru "Show Less"
window.showLessTableRows = function(templateId, event, device) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const mainContainer = document.getElementById('specification-table-' + templateId);
  if (!mainContainer) {
    console.warn('[showLessTableRows] Main container not found for templateId:', templateId);
    return;
  }

  // Găsește toate rândurile care trebuie ascunse (cele care au fost adăugate de "See More")
  const hiddenContainer = document.getElementById('spec-table-hidden-' + templateId);
  if (!hiddenContainer) {
    return;
  }

  const selector = '[id^="spec-hidden-section-' + device + '-' + templateId + '-"]';
  const hiddenSections = hiddenContainer.querySelectorAll(selector);

  // Recolectează rândurile care trebuie ascunse
  hiddenSections.forEach(sectionContainer => {
    const sectionIndex = sectionContainer.getAttribute('data-section-index');
    const tableId = 'spec-table-' + device + '-' + templateId + '-' + sectionIndex;

    // Găsește container-ul tabelului
    let deviceContainer = document.querySelector('#' + tableId + '-container');
    if (!deviceContainer) {
      deviceContainer = document.querySelector('.dc_split_view_sections #' + tableId + '-container');
    }
    if (!deviceContainer) {
      const seeMoreVersionClass = device === 'pc' ? 'dc_see_more_pc_version' : 'dc_see_more_mobile_version';
      deviceContainer = document.querySelector('.' + seeMoreVersionClass + ' #' + tableId + '-container');
    }
    if (!deviceContainer) {
      const accordionVersionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
      deviceContainer = document.querySelector('.' + accordionVersionClass + ' #' + tableId + '-container');
    }

    if (!deviceContainer) {
      return;
    }

    // Găsește tbody-urile
    const tbody = deviceContainer.querySelector('tbody');
    const tbodyLeft = deviceContainer.querySelector('tbody[id$="-tbody-left"]');
    const tbodyRight = deviceContainer.querySelector('tbody[id$="-tbody-right"]');

    // Găsește tabelul temporar cu rândurile ascunse
    const tempTable = sectionContainer.querySelector('table');
    if (!tempTable) {
      return;
    }

    const tempTbody = tempTable.querySelector('tbody');
    if (!tempTbody) {
      return;
    }

    // Colectează toate rândurile care au fost adăugate de "See More" (marcate cu data-see-more-added)
    const rowsToHide = [];
    
    if (tbodyLeft && tbodyRight) {
      // Split view per metafield: colectăm toate rândurile marcate din ambele coloane
      const leftRows = Array.from(tbodyLeft.querySelectorAll('tr[data-see-more-added="true"]'));
      const rightRows = Array.from(tbodyRight.querySelectorAll('tr[data-see-more-added="true"]'));
      rowsToHide.push(...leftRows, ...rightRows);
    } else if (tbody) {
      // Tabel normal: colectăm toate rândurile marcate din tbody
      const allRows = Array.from(tbody.querySelectorAll('tr[data-see-more-added="true"]'));
      rowsToHide.push(...allRows);
    }

    // Mută rândurile înapoi în container-ul ascuns
    rowsToHide.forEach(row => {
      // Elimină atributul de marcare
      row.removeAttribute('data-see-more-added');
      tempTbody.appendChild(row);
    });

    // Verifică dacă secțiunea mai are rânduri vizibile după mutarea rândurilor înapoi
    // Dacă nu mai are rânduri vizibile, ascunde și heading-ul secțiunii
    let hasVisibleRows = false;
    if (tbodyLeft && tbodyRight) {
      const leftVisibleRows = tbodyLeft.querySelectorAll('tr:not([data-see-more-added="true"])');
      const rightVisibleRows = tbodyRight.querySelectorAll('tr:not([data-see-more-added="true"])');
      hasVisibleRows = leftVisibleRows.length > 0 || rightVisibleRows.length > 0;
    } else if (tbody) {
      const visibleRows = tbody.querySelectorAll('tr:not([data-see-more-added="true"])');
      hasVisibleRows = visibleRows.length > 0;
    }

    // Dacă secțiunea nu mai are rânduri vizibile, ascunde heading-ul
    if (!hasVisibleRows) {
      // Găsește secțiunea în DOM bazat pe sectionIndex
      const versionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
      const allSections = mainContainer.querySelectorAll('.dc_section');
      
      allSections.forEach(sectionDiv => {
        const versionDiv = sectionDiv.querySelector('.' + versionClass);
        if (versionDiv) {
          // Verifică dacă această secțiune conține container-ul tabelului pentru această secțiune
          const sectionContainerCheck = versionDiv.querySelector('#' + tableId + '-container');
          if (sectionContainerCheck) {
            // Ascunde heading-ul (h3 sau dc_section_header)
            const heading = versionDiv.querySelector('h3.dc_heading');
            const sectionHeader = versionDiv.querySelector('.dc_section_header');
            if (heading) {
              heading.style.display = 'none';
            }
            if (sectionHeader) {
              sectionHeader.style.display = 'none';
            }
            // NU ascundem container-ul tabelului, doar heading-ul
            // Container-ul trebuie să rămână vizibil (chiar dacă este gol) pentru ca "See More" să funcționeze din nou
          }
        }
      });
    }
  });

  // Afișează din nou butonul "See More"
  const seeMoreButton = mainContainer.querySelector('.dc_see_more_' + device + ' .dc_see_more_button');
  if (seeMoreButton) {
    seeMoreButton.style.display = '';
  }

  // Afișează din nou overlay-ul de ceată
  const fogOverlay = mainContainer.querySelector('.dc_see_more_fog_overlay_' + device);
  if (fogOverlay) {
    fogOverlay.style.display = '';
  }

  // Resetează arrow-ul
  const arrow = document.getElementById('see-more-arrow-' + device + '-' + templateId);
  if (arrow) {
    arrow.style.transform = 'rotate(0deg)';
  }

  // Ascunde butonul "Show Less"
  const seeLessContainer = mainContainer.querySelector('.dc_see_less_' + device);
  if (seeLessContainer) {
    seeLessContainer.style.display = 'none';
  }
};

// Funcție globală pentru toggle collapsible table
window.toggleSpecificationTable = function(templateId) {
  const content = document.getElementById('spec-table-content-' + templateId);
  const arrow = document.getElementById('spec-table-arrow-' + templateId);
  
  if (content && arrow) {
    const isCollapsed = content.classList.contains('dc_collapsible_collapsed');
    
    if (isCollapsed) {
      content.classList.remove('dc_collapsible_collapsed');
      content.classList.add('dc_collapsible_expanded');
      arrow.style.transform = 'rotate(180deg)';
    } else {
      content.classList.remove('dc_collapsible_expanded');
      content.classList.add('dc_collapsible_collapsed');
      arrow.style.transform = 'rotate(0deg)';
    }
  }
};

// Funcție globală pentru toggle accordion
window.toggleSpecSection = function(sectionIndex, templateId, device) {
  if (!device) {
    const section = document.getElementById('spec-section-' + templateId + '-' + sectionIndex);
    const arrow = document.getElementById('spec-arrow-' + templateId + '-' + sectionIndex);
    if (section) {
      const isHidden = section.style.display === 'none' || section.style.display === '';
      section.style.display = isHidden ? 'block' : 'none';
      if (arrow) {
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
    return;
  }

  const section = document.getElementById('spec-section-' + device + '-' + templateId + '-' + sectionIndex);
  const arrow = document.getElementById('spec-arrow-' + device + '-' + templateId + '-' + sectionIndex);
  if (section) {
    const isHidden = section.style.display === 'none' || section.style.display === '';
    section.style.display = isHidden ? 'block' : 'none';
    if (arrow) {
      arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }
};

// Funcție pentru afișarea tooltip-ului pe mobil
function showTooltipOnMobile(tooltipText, metafieldName, event) {
  const overlay = document.createElement('div');
  overlay.className = 'dc_tooltip_overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';

  const popup = document.createElement('div');
  popup.className = 'dc_tooltip_popup';
  popup.style.cssText = 'background-color: #ffffff; border-radius: 8px; padding: 20px; max-width: 90%; max-height: 80%; overflow-y: auto; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); position: relative;';

  const nameElement = document.createElement('div');
  nameElement.style.cssText = 'text-align: center; font-weight: bold; font-size: 16px; color: #202223; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e1e3e5;';
  nameElement.textContent = metafieldName + ':';
  popup.appendChild(nameElement);

  const textElement = document.createElement('div');
  textElement.style.cssText = 'color: #202223; font-size: 14px; line-height: 1.5;';
  textElement.textContent = tooltipText;
  popup.appendChild(textElement);

  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = 'position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; color: #6d7175; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0;';
  closeButton.onclick = function() {
    document.body.removeChild(overlay);
  };
  popup.appendChild(closeButton);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  overlay.onclick = function(e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
}

// Event listener pentru tooltip pe mobil
document.addEventListener('click', function(event) {
  const tooltip = event.target.closest('.dc_tooltip');
  if (tooltip) {
    const isMobile = 'ontouchstart' in window || window.innerWidth <= 768;
    if (isMobile) {
      const tooltipText = tooltip.getAttribute('data-tooltip-text') || tooltip.getAttribute('title');
      const metafieldName = tooltip.getAttribute('data-metafield-name') || '';
      if (tooltipText) {
        showTooltipOnMobile(tooltipText, metafieldName, event);
      }
    }
  }
});


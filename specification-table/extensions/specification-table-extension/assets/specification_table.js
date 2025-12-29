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
    const templateStyling = typeof templateStylingJson === 'string' ? JSON.parse(templateStylingJson) : templateStylingJson;
    const templateSettings = typeof templateSettingsJson === 'string' ? JSON.parse(templateSettingsJson) : templateSettingsJson;

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
      splitViewPerMetafield: templateSettings.splitViewPerMetafield || false
    };

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
  const productMetafields = window.productMetafieldsData || {};
  const variantMetafields = window.variantMetafieldsData || {};

  // Obține varianta curentă din URL
  function getCurrentVariantId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('variant');
  }

  const currentVariantId = getCurrentVariantId();

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

// Funcție pentru a randa template-ul
function renderTemplate(container, template) {
  const styling = template.styling;
  const firstColumnWidth = container.dataset.firstColumnWidth || '40';
  const escapedTemplateId = escapeHtml(template.id);

  // Construiește CSS variables pentru stilurile dinamice
  let cssVars = '--dc-bg-color: ' + (styling.backgroundColor || '#ffffff') + '; ';
  const specTextColor = styling.specificationTextColor || styling.textColor || '#000000';
  const valueTextColor = styling.valueTextColor || styling.textColor || '#000000';
  cssVars += '--dc-specification-text-color: ' + specTextColor + '; ';
  cssVars += '--dc-value-text-color: ' + valueTextColor + '; ';
  cssVars += '--dc-heading-color: ' + (styling.headingColor || '#000000') + '; ';
  cssVars += '--dc-heading-font-size: ' + (styling.headingFontSize || '18px') + '; ';
  cssVars += '--dc-heading-font-weight: ' + (styling.headingFontWeight || 'bold') + '; ';
  cssVars += '--dc-heading-font-family: ' + (styling.headingFontFamily || 'inherit') + '; ';
  cssVars += '--dc-text-font-size: ' + (styling.textFontSize || '14px') + '; ';
  cssVars += '--dc-text-font-family: ' + (styling.textFontFamily || 'inherit') + '; ';
  cssVars += '--dc-text-transform: ' + (styling.textTransform || 'none') + '; ';
  cssVars += '--dc-border-radius: ' + (styling.borderRadius || '0px') + '; ';
  cssVars += '--dc-padding: ' + (styling.padding || '20px') + '; ';
  cssVars += '--dc-first-column-width: ' + firstColumnWidth + '%; ';
  if (styling.sectionBorderEnabled) {
    cssVars += '--dc-border: ' + (styling.sectionBorderWidth || '1px') + ' ' + (styling.sectionBorderStyle || 'solid') + ' ' + (styling.sectionBorderColor || '#000000') + '; ';
  } else {
    cssVars += '--dc-border: none; ';
  }
  cssVars += '--dc-row-border: ' + (styling.rowBorderEnabled ? (styling.rowBorderWidth || '1px') + ' ' + (styling.rowBorderStyle || 'solid') + ' ' + (styling.rowBorderColor || '#000000') : 'none') + '; ';
  cssVars += '--dc-odd-row-bg: ' + (styling.oddRowBackgroundColor || '#f0f0f0') + '; ';
  cssVars += '--dc-even-row-bg: ' + (styling.evenRowBackgroundColor || '#ffffff') + '; ';
  cssVars += '--dc-odd-column-bg: ' + (styling.oddColumnBackgroundColor || '#ff0000') + '; ';
  cssVars += '--dc-even-column-bg: ' + (styling.evenColumnBackgroundColor || '#00ff00') + '; ';
  cssVars += '--dc-td-bg: ' + (styling.tdBackgroundColor || 'transparent') + '; ';
  cssVars += '--dc-row-bg-enabled: ' + (styling.rowBackgroundEnabled ? '1' : '0') + '; ';
  cssVars += '--dc-column-bg-enabled: ' + (styling.columnBackgroundEnabled ? '1' : '0') + '; ';
  cssVars += '--dc-see-more-button-color: ' + (styling.seeMoreButtonColor || '#000000') + '; ';
  cssVars += '--dc-see-more-button-background: ' + (styling.seeMoreButtonBackground || 'transparent') + '; ';
  cssVars += '--dc-see-more-button-font-size: ' + (styling.seeMoreButtonFontSize || '14px') + '; ';
  cssVars += '--dc-see-more-button-font-family: ' + (styling.seeMoreButtonFontFamily || 'Arial') + '; ';
  cssVars += '--dc-see-more-button-padding: ' + (styling.seeMoreButtonPadding || '8px') + '; ';
  cssVars += '--dc-see-more-button-border-radius: ' + (styling.seeMoreButtonBorderRadius || '0px') + '; ';
  if (styling.seeMoreButtonBorderEnabled) {
    cssVars += '--dc-see-more-button-border: ' + (styling.seeMoreButtonBorderWidth || '1px') + ' ' + (styling.seeMoreButtonBorderStyle || 'solid') + ' ' + (styling.seeMoreButtonBorderColor || '#000000') + '; ';
  } else {
    cssVars += '--dc-see-more-button-border: none; ';
  }

  let html = '<div id="specification-table-' + escapedTemplateId + '" class="dc_container" style="' + cssVars + '">';

  // Colectează toate metafields-urile din toate secțiunile
  const allMetafieldsWithSection = [];
  const sectionHideWhenEmpty = {};
  template.sections.forEach((section, sectionIndex) => {
    sectionHideWhenEmpty[sectionIndex] = section.hideSectionWhenEmpty !== undefined && section.hideSectionWhenEmpty !== null ? section.hideSectionWhenEmpty : true;

    if (section.metafields && section.metafields.length > 0) {
      section.metafields.forEach((metafield, mfIndex) => {
        allMetafieldsWithSection.push({
          namespace: metafield.namespace,
          key: metafield.key,
          ownerType: metafield.ownerType,
          name: metafield.name,
          type: metafield.type,
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
      });
    }
  });

  const seeMoreEnabled = template.seeMoreEnabled || false;
  const seeMoreHideFromPC = template.seeMoreHideFromPC === true || template.seeMoreHideFromPC === 'true';
  const seeMoreHideFromMobile = template.seeMoreHideFromMobile === true || template.seeMoreHideFromMobile === 'true';

  const productMetafields = window.productMetafieldsData || {};
  const variantMetafields = window.variantMetafieldsData || {};

  function metafieldHasValue(metafield) {
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

  let displayRowsPC = allMetafieldsWithSection;
  let displayRowsMobile = allMetafieldsWithSection;
  let hasMorePC = false;
  let hasMoreMobile = false;

  if (seeMoreEnabled) {
    if (seeMoreHideFromPC) {
      displayRowsPC = visibleMetafields;
      displayRowsMobile = visibleMetafields.slice(0, 10);
      hasMorePC = false;
      hasMoreMobile = totalVisibleRows > 10;
    } else if (seeMoreHideFromMobile) {
      displayRowsPC = visibleMetafields.slice(0, 10);
      displayRowsMobile = visibleMetafields;
      hasMorePC = totalVisibleRows > 10;
      hasMoreMobile = false;
    } else {
      displayRowsPC = visibleMetafields.slice(0, 10);
      displayRowsMobile = visibleMetafields.slice(0, 10);
      hasMorePC = totalVisibleRows > 10;
      hasMoreMobile = totalVisibleRows > 10;
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

  displayRowsPC.forEach(item => {
    allGroupedBySection[item.sectionIndex].displayMetafieldsPC.push(item);
  });
  displayRowsMobile.forEach(item => {
    allGroupedBySection[item.sectionIndex].displayMetafieldsMobile.push(item);
  });

  if (hasMorePC) {
    const hiddenRowsPC = visibleMetafields.slice(10);
    hiddenRowsPC.forEach(item => {
      allGroupedBySection[item.sectionIndex].hiddenMetafieldsPC.push(item);
    });
  }
  if (hasMoreMobile) {
    const hiddenRowsMobile = visibleMetafields.slice(10);
    hiddenRowsMobile.forEach(item => {
      allGroupedBySection[item.sectionIndex].hiddenMetafieldsMobile.push(item);
    });
  }

  const arrowDownSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; transition: transform 0.3s ease;"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const splitViewPerSection = template.splitViewPerSection === true || template.splitViewPerSection === 'true';
  const splitViewPerMetafield = template.splitViewPerMetafield === true || template.splitViewPerMetafield === 'true';

  if (splitViewPerSection) {
    const sectionsToRender = [];
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

    const leftColumnSections = [];
    const rightColumnSections = [];
    sectionsToRender.forEach((section, index) => {
      if (index % 2 === 0) {
        leftColumnSections.push(section);
      } else {
        rightColumnSections.push(section);
      }
    });

    if (sectionsToRender.length > 0) {
      html += '<div class="dc_split_view_sections" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';
      html += '<div class="dc_split_view_column dc_split_view_left">';
      leftColumnSections.forEach(({ sectionIndex, sectionData }) => {
        html += renderSection(sectionData, styling, firstColumnWidth, escapedTemplateId, sectionIndex, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
      });
      html += '</div>';
      html += '<div class="dc_split_view_column dc_split_view_right">';
      rightColumnSections.forEach(({ sectionIndex, sectionData }) => {
        html += renderSection(sectionData, styling, firstColumnWidth, escapedTemplateId, sectionIndex, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
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

      html += renderSection(sectionData, styling, firstColumnWidth, escapedTemplateId, sectionIdx, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg);
    });
  }

  const seeMoreButtonStyle = styling.seeMoreButtonStyle || 'arrow';
  const seeMoreButtonText = styling.seeMoreButtonText || 'See More';
  const showArrow = seeMoreButtonStyle === 'arrow' || seeMoreButtonStyle === 'arrow+text';
  const showText = seeMoreButtonStyle === 'text' || seeMoreButtonStyle === 'arrow+text';

  if (hasMorePC || hasMoreMobile) {
    if (hasMorePC) {
      html += '<div class="dc_see_more dc_see_more_pc">';
      html += '<button class="dc_see_more_button" onclick="showAllTableRows(\'' + escapedTemplateId + '\', event, \'pc\')">';
      if (showArrow) {
        html += '<span id="see-more-arrow-pc-' + escapedTemplateId + '" class="dc_see_more_arrow">' + arrowDownSvg + '</span>';
      }
      if (showText) {
        html += '<span class="dc_see_more_text">' + escapeHtml(seeMoreButtonText) + '</span>';
      }
      html += '</button>';
      html += '</div>';
    }

    if (hasMoreMobile) {
      html += '<div class="dc_see_more dc_see_more_mobile">';
      html += '<button class="dc_see_more_button" onclick="showAllTableRows(\'' + escapedTemplateId + '\', event, \'mobile\')">';
      if (showArrow) {
        html += '<span id="see-more-arrow-mobile-' + escapedTemplateId + '" class="dc_see_more_arrow">' + arrowDownSvg + '</span>';
      }
      if (showText) {
        html += '<span class="dc_see_more_text">' + escapeHtml(seeMoreButtonText) + '</span>';
      }
      html += '</button>';
      html += '</div>';
    }

    html += '<div id="spec-table-hidden-' + escapedTemplateId + '" class="dc_hidden">';
    Object.keys(allGroupedBySection).forEach(sectionIndex => {
      const sectionIdx = parseInt(sectionIndex);
      const sectionData = allGroupedBySection[sectionIndex];

      if (sectionData.hiddenMetafieldsPC.length > 0) {
        html += '<div id="spec-hidden-section-pc-' + escapedTemplateId + '-' + sectionIdx + '" data-section-index="' + sectionIdx + '" data-device="pc">';
        html += '<table style="display: none;"><tbody>';
        html += renderHiddenRowsAsTable(sectionData.hiddenMetafieldsPC, styling, escapedTemplateId, sectionIdx, allMetafieldsWithSection);
        html += '</tbody></table>';
        html += '</div>';
      }

      if (sectionData.hiddenMetafieldsMobile.length > 0) {
        html += '<div id="spec-hidden-section-mobile-' + escapedTemplateId + '-' + sectionIdx + '" data-section-index="' + sectionIdx + '" data-device="mobile">';
        html += '<table style="display: none;"><tbody>';
        html += renderHiddenRowsAsTable(sectionData.hiddenMetafieldsMobile, styling, escapedTemplateId, sectionIdx, allMetafieldsWithSection);
        html += '</tbody></table>';
        html += '</div>';
      }
    });
    html += '</div>';
  }

  html += '</div>';

  try {
    container.innerHTML = html;
  } catch (error) {
    throw error;
  }
}

// Funcție pentru a randa o secțiune
function renderSection(sectionData, styling, firstColumnWidth, escapedTemplateId, sectionIdx, allMetafieldsWithSection, template, splitViewPerMetafield, arrowDownSvg) {
  const isAccordionHideFromPC = template.isAccordionHideFromPC === true || template.isAccordionHideFromPC === 'true';
  const isAccordionHideFromMobile = template.isAccordionHideFromMobile === true || template.isAccordionHideFromMobile === 'true';
  const showAccordionPC = template.isAccordion && !isAccordionHideFromPC;
  const showAccordionMobile = template.isAccordion && !isAccordionHideFromMobile;

  let html = '<div class="dc_section">';
  html += '<div class="dc_accordion_pc_version">';
  if (showAccordionPC) {
    html += '<div class="dc_section_header" onclick="toggleSpecSection(' + sectionIdx + ', \'' + escapedTemplateId + '\', \'pc\')">';
    html += '<span>' + escapeHtml(sectionData.heading) + '</span>';
    html += '<span class="dc_accordion_arrow" id="spec-arrow-pc-' + escapedTemplateId + '-' + sectionIdx + '">' + arrowDownSvg + '</span>';
    html += '</div>';
    html += '<div id="spec-section-pc-' + escapedTemplateId + '-' + sectionIdx + '" class="dc_section_content" style="display: none;">';
    html += renderSectionTable(sectionData, styling, firstColumnWidth, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsPC, 'pc', splitViewPerMetafield);
    html += '</div>';
  } else {
    html += '<h3 class="dc_heading">';
    html += escapeHtml(sectionData.heading);
    html += '</h3>';
    html += renderSectionTable(sectionData, styling, firstColumnWidth, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsPC, 'pc', splitViewPerMetafield);
  }
  html += '</div>';
  html += '<div class="dc_accordion_mobile_version">';
  if (showAccordionMobile) {
    html += '<div class="dc_section_header" onclick="toggleSpecSection(' + sectionIdx + ', \'' + escapedTemplateId + '\', \'mobile\')">';
    html += '<span>' + escapeHtml(sectionData.heading) + '</span>';
    html += '<span class="dc_accordion_arrow" id="spec-arrow-mobile-' + escapedTemplateId + '-' + sectionIdx + '">' + arrowDownSvg + '</span>';
    html += '</div>';
    html += '<div id="spec-section-mobile-' + escapedTemplateId + '-' + sectionIdx + '" class="dc_section_content" style="display: none;">';
    html += renderSectionTable(sectionData, styling, firstColumnWidth, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsMobile, 'mobile', splitViewPerMetafield);
    html += '</div>';
  } else {
    html += '<h3 class="dc_heading">';
    html += escapeHtml(sectionData.heading);
    html += '</h3>';
    html += renderSectionTable(sectionData, styling, firstColumnWidth, false, escapedTemplateId, sectionIdx, allMetafieldsWithSection, sectionData.displayMetafieldsMobile, 'mobile', splitViewPerMetafield);
  }
  html += '</div>';
  html += '</div>';
  return html;
}

// Funcție pentru a randa tabelul unei secțiuni
function renderSectionTable(section, styling, firstColumnWidth, seeMoreEnabled, templateId, sectionIndex, allMetafieldsWithSection, displayMetafields, device, splitViewPerMetafield) {
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

    const globalIndex = allMetafieldsWithSection.indexOf(metafield);
    const isOdd = globalIndex !== -1 && globalIndex % 2 === 0;

    let specBackgroundStyle = '';
    let valueBackgroundStyle = '';
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

    rowsHtml += '<tr class="' + rowClasses + '">';
    rowsHtml += '<td class="dc_table_td_label"' + (specBackgroundStyle ? ' style="' + specBackgroundStyle + '"' : '') + '>';
    const displayName = metafield.customName || metafield.name || metafield.namespace + '.' + metafield.key;
    let nameHtml = escapeHtml(displayName);
    if (metafield.tooltipEnabled && metafield.tooltipText) {
      nameHtml += ' <span class="dc_tooltip" title="' + escapeHtml(metafield.tooltipText) + '" data-tooltip-text="' + escapeHtml(metafield.tooltipText) + '" data-metafield-name="' + escapeHtml(displayName) + '">i</span>';
    }
    rowsHtml += nameHtml + '  :';
    rowsHtml += '</td>';
    const prefixValue = (metafield.prefix !== null && metafield.prefix !== undefined) ? String(metafield.prefix) : '';
    const suffixValue = (metafield.suffix !== null && metafield.suffix !== undefined) ? String(metafield.suffix) : '';
    rowsHtml += '<td class="dc_table_td_value"' + (valueBackgroundStyle ? ' style="' + valueBackgroundStyle + '"' : '') + ' data-namespace="' + escapeHtml(metafield.namespace) + '" data-key="' + escapeHtml(metafield.key) + '" data-owner-type="' + escapeHtml(metafield.ownerType || 'PRODUCT') + '" data-type="' + escapeHtml(metafield.type || 'single_line_text_field') + '">';
    rowsHtml += '<span data-metafield-value data-namespace="' + escapeHtml(metafield.namespace) + '" data-key="' + escapeHtml(metafield.key) + '" data-owner-type="' + escapeHtml(metafield.ownerType || 'PRODUCT') + '" data-type="' + escapeHtml(metafield.type || 'single_line_text_field') + '" data-prefix="' + escapeHtml(prefixValue) + '" data-suffix="' + escapeHtml(suffixValue) + '">Loading...</span>';
    rowsHtml += '</td>';
    rowsHtml += '</tr>';
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

  hiddenSections.forEach(sectionContainer => {
    const sectionIndex = sectionContainer.getAttribute('data-section-index');
    const tableId = 'spec-table-' + device + '-' + templateId + '-' + sectionIndex;

    const seeMoreVersionClass = device === 'pc' ? 'dc_see_more_pc_version' : 'dc_see_more_mobile_version';
    let deviceContainer = document.querySelector('.' + seeMoreVersionClass + ' #' + tableId + '-container');

    if (!deviceContainer) {
      const accordionVersionClass = device === 'pc' ? 'dc_accordion_pc_version' : 'dc_accordion_mobile_version';
      deviceContainer = document.querySelector('.' + accordionVersionClass + ' #' + tableId + '-container');
    }

    if (!deviceContainer) {
      return;
    }

    const tbody = deviceContainer.querySelector('#' + tableId + '-tbody');

    if (!tbody) {
      return;
    }

    const tempTable = sectionContainer.querySelector('table');
    if (tempTable) {
      const tempTbody = tempTable.querySelector('tbody');
      if (tempTbody) {
        const rows = Array.from(tempTbody.querySelectorAll('tr'));
        rows.forEach(row => {
          tbody.appendChild(row);
        });
      }
    }
  });

  const button = event ? event.target.closest('button') : document.querySelector('.dc_see_more_' + device + ' .dc_see_more_button');
  if (button) {
    button.style.display = 'none';
  }

  const arrow = document.getElementById('see-more-arrow-' + device + '-' + templateId);
  if (arrow) {
    arrow.style.transform = 'rotate(180deg)';
  }

  const container = document.getElementById('specification-table-container-' + templateId);
  if (container) {
    updateMetafieldValuesFromLiquid(container);
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


// Funcție principală pentru inițializarea tabelului de specificații
window.initSpecificationTable = function(containerId, templateData) {
  const container = document.getElementById(containerId);
  if (!container) {
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
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;"></div>';
    return;
  }

  try {
    // Parsează JSON-urile din metaobject
    // Dacă sunt deja obiecte, le folosim direct; altfel le parsează
    const templateStructure = typeof templateStructureJson === 'string' ? JSON.parse(templateStructureJson) : templateStructureJson;
    let templateStyling = typeof templateStylingJson === 'string' ? JSON.parse(templateStylingJson) : templateStylingJson;
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
    

    // Construiește obiectul cu metafield-urile din Liquid folosind template-ul
    if (window.buildMetafieldsFromTemplate) {
      window.buildMetafieldsFromTemplate(template, []);
    }

    // Renderizează template-ul
    try {
      renderTemplate(container, template);
    } catch (error) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff0000;">Error rendering template.</div>';
      return;
    }

    // Populează valorile metafield-urilor din obiectul JavaScript construit în Liquid
    updateMetafieldValuesFromLiquid(container);

    // Adaugă listener pentru schimbarea variantei (pentru actualizare în timp real)
    setupVariantChangeListener(container, template);
  } catch (error) {
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

  // Funcție helper pentru a determina dacă un container ar trebui să fie scrollabil
  // bazat pe width-ul disponibil vs width-ul necesar
  function shouldMakeScrollable(element, itemCount, itemWidth = 200, gap = 15) {
    // Obține width-ul disponibil al celulei
    const tdElement = element.closest('td');
    if (!tdElement) return itemCount >= 4; // Fallback la logica veche
    
    // Calculează width-ul necesar pentru toate itemele
    const totalWidthNeeded = (itemCount * itemWidth) + ((itemCount - 1) * gap);
    
    // Obține width-ul disponibil (folosind requestAnimationFrame pentru a asigura că DOM-ul este actualizat)
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const availableWidth = tdElement.offsetWidth || tdElement.clientWidth;
        // Dacă width-ul necesar depășește width-ul disponibil, face scrollabil
        const shouldScroll = totalWidthNeeded > availableWidth;
        resolve(shouldScroll);
      });
    });
  }

  // Funcție helper pentru a crea un container scrollabil
  function createScrollableContainer(items, createItemHtml, className = 'dc-scrollable-list') {
    const containerHtml = '<div class="' + className + '" style="display: flex; overflow-x: auto; overflow-y: hidden; gap: 15px; padding: 5px 0; width: 100%; max-width: 100%; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: #ccc #f0f0f0;">' +
      items.map(item => createItemHtml(item)).join('') +
      '</div>';
    return containerHtml;
  }

  // Funcție helper pentru a configura elementul și celula tabelului pentru scrollabil
  function configureScrollableElement(element) {
    element.style.display = 'block';
    element.style.width = '100%';
    element.style.maxWidth = '100%';
    element.style.overflow = 'visible';
    
    const tdElement = element.closest('td');
    if (tdElement) {
      tdElement.classList.add('dc-has-product-list');
      tdElement.style.overflow = 'visible';
      tdElement.style.maxWidth = '100%';
      tdElement.style.width = 'auto';
      tdElement.style.minWidth = '0';
      tdElement.style.position = 'relative';
      
      const tableElement = tdElement.closest('table');
      if (tableElement) {
        tableElement.style.tableLayout = 'fixed';
        tableElement.style.width = '100%';
        const labelCell = tdElement.previousElementSibling || tdElement.parentElement.querySelector('.dc_table_td_label');
        if (labelCell) {
          const computedWidth = getComputedStyle(labelCell).width;
          labelCell.style.width = computedWidth;
          labelCell.style.minWidth = computedWidth;
          labelCell.style.maxWidth = computedWidth;
        }
      }
    }
  }

  if (metafieldType === 'multi_line_text_field' || metafieldType === 'single_line_text_field' || 
      metafieldType === 'list.multi_line_text_field' || metafieldType === 'list.single_line_text_field') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.textContent = 'N/A';
      return;
    }
    
    if (isList) {
      // Pentru liste, afișează fiecare item pe o linie nouă sau separate prin virgulă
      const formattedItems = items.map(item => {
        const itemValue = typeof item === 'object' ? JSON.stringify(item) : String(item);
        return applyPrefixSuffix(itemValue, prefix, suffix);
      });
      element.textContent = formattedItems.join(', ');
      element.style.whiteSpace = 'pre-wrap';
    } else {
      // Un singur item
      const itemValue = typeof items[0] === 'object' ? JSON.stringify(items[0]) : String(items[0]);
      const formattedValue = applyPrefixSuffix(itemValue, prefix, suffix);
      element.textContent = formattedValue;
    }
  } else if (metafieldType === 'file_reference' || metafieldType === 'list.file_reference') {
    // Verifică dacă este o listă (array) sau un singur fișier
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const files = isList ? parsedValue : (parsedValue ? [parsedValue] : []);
    
    if (files.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    // Funcție helper pentru a crea HTML-ul unui fișier
    function createFileItem(fileItem) {
      // Dacă este string (imagine), returnează HTML pentru imagine
      if (typeof fileItem === 'string') {
        return '<img src="' + escapeHtml(String(fileItem)) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" />';
      }
      
      // Dacă este obiect
      if (typeof fileItem === 'object' && fileItem.url) {
        // Verifică media_type - IMPORTANT: generic_file trebuie tratat primul pentru a nu fi confundat cu image
        if (fileItem.media_type === 'generic_file') {
          // Este generic_file (PDF, DOC, etc.) - afișează link de download
          const fileUrl = fileItem.url;
          const filename = fileItem.filename || (fileUrl.split('/').pop().split('?')[0]);
          const ext = filename.split('.').pop().toLowerCase();
          
          // Determină iconița în funcție de extensie
          let icon = '📎';
          if (ext === 'pdf') {
            icon = '📄';
          } else if (ext === 'zip' || ext === 'rar' || ext === '7z') {
            icon = '🗜️';
          } else if (ext === 'doc' || ext === 'docx') {
            icon = '📝';
          } else if (ext === 'xls' || ext === 'xlsx') {
            icon = '📊';
          } else if (ext === 'txt') {
            icon = '📄';
          } else if (ext === 'csv') {
            icon = '📊';
          }
          
          // Asigură URL-ul absolut
          let downloadUrl = fileUrl;
          if (!downloadUrl.includes('http')) {
            downloadUrl = 'https:' + downloadUrl;
          }
          
          const displayName = fileItem.alt || filename;
          return '<div class="dc-file" style="display: flex; align-items: center; gap: 8px;">' +
            '<span class="dc-file__icon" aria-hidden="true" style="font-size: 1.2em;">' + icon + '</span>' +
            '<a class="dc-file__link" href="' + escapeHtml(downloadUrl) + '" download target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">' +
            escapeHtml(displayName) +
            '</a>' +
            '</div>';
        } else if (fileItem.media_type === 'video') {
          // Este video
          const videoUrl = fileItem.url;
          let finalVideoUrl = videoUrl;
          if (!finalVideoUrl.includes('http')) {
            finalVideoUrl = 'https:' + finalVideoUrl;
          }
          return '<video controls style="max-width: 100%; max-height: ' + height + 'px; object-fit: contain;" preload="metadata">' +
            '<source src="' + escapeHtml(finalVideoUrl) + '" type="video/mp4">' +
            '<source src="' + escapeHtml(finalVideoUrl) + '" type="video/webm">' +
            '<source src="' + escapeHtml(finalVideoUrl) + '" type="video/ogg">' +
            'Browser-ul tău nu suportă tag-ul video.' +
            '</video>';
        } else if (fileItem.media_type === 'image') {
          // Este imagine
          const imageUrl = fileItem.url;
          return '<img src="' + escapeHtml(String(imageUrl)) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" />';
        } else if (!fileItem.media_type && fileItem.filename) {
          // Nu are media_type dar are filename - presupunem că este generic_file
          const fileUrl = fileItem.url;
          const filename = fileItem.filename || (fileUrl.split('/').pop().split('?')[0]);
          const ext = filename.split('.').pop().toLowerCase();
          
          // Determină iconița în funcție de extensie
          let icon = '📎';
          if (ext === 'pdf') {
            icon = '📄';
          } else if (ext === 'zip' || ext === 'rar' || ext === '7z') {
            icon = '🗜️';
          } else if (ext === 'doc' || ext === 'docx') {
            icon = '📝';
          } else if (ext === 'xls' || ext === 'xlsx') {
            icon = '📊';
          } else if (ext === 'txt') {
            icon = '📄';
          } else if (ext === 'csv') {
            icon = '📊';
          }
          
          // Asigură URL-ul absolut
          let downloadUrl = fileUrl;
          if (!downloadUrl.includes('http')) {
            downloadUrl = 'https:' + downloadUrl;
          }
          
          const displayName = fileItem.alt || filename;
          return '<div class="dc-file" style="display: flex; align-items: center; gap: 8px;">' +
            '<span class="dc-file__icon" aria-hidden="true" style="font-size: 1.2em;">' + icon + '</span>' +
            '<a class="dc-file__link" href="' + escapeHtml(downloadUrl) + '" download target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">' +
            escapeHtml(displayName) +
            '</a>' +
            '</div>';
        } else {
          // Nu are media_type și nu are filename - presupunem că este imagine (comportament vechi)
          const imageUrl = fileItem.url;
          return '<img src="' + escapeHtml(String(imageUrl)) + '" style="max-width: 100%; height: ' + height + 'px; object-fit: contain;" />';
        }
      }
      
      return '';
    }
    
    // Dacă este o listă, verifică tipurile de fișiere
    if (isList && files.length > 0) {
      // Verifică dacă toate fișierele sunt generic_file (pentru afișare verticală cu divider)
      const allGenericFiles = files.every(file => {
        if (typeof file === 'string') return false; // String-urile sunt imagini
        if (typeof file === 'object' && file.url) {
          // Dacă are media_type explicit generic_file
          if (file.media_type === 'generic_file') return true;
          // Dacă nu are media_type dar are filename, presupunem că este generic_file
          if (!file.media_type && file.filename) return true;
          // Dacă are media_type image sau video, nu este generic_file
          if (file.media_type === 'image' || file.media_type === 'video') return false;
        }
        return false;
      });
      
      if (allGenericFiles) {
        // Afișează unul sub altul cu divider
        let containerHtml = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        files.forEach((file, index) => {
          containerHtml += createFileItem(file);
          if (index < files.length - 1) {
            containerHtml += '<div style="border-top: 1px solid #e0e0e0; margin: 5px 0;"></div>';
          }
        });
        containerHtml += '</div>';
        element.innerHTML = containerHtml;
        element.style.display = 'block';
      } else {
        // Pentru imagini și video, verifică dacă ar trebui să fie scrollabil
        // Estimează width-ul unui item (imagine/video) - folosim height ca referință
        const estimatedItemWidth = parseInt(height) || 200;
        shouldMakeScrollable(element, files.length, estimatedItemWidth, 15).then(shouldScroll => {
          if (shouldScroll) {
            const containerHtml = createScrollableContainer(files, createFileItem, 'dc-file-list-scrollable');
            element.innerHTML = containerHtml;
            configureScrollableElement(element);
          } else {
            let containerHtml = '<div style="display: flex; gap: 15px; flex-wrap: wrap;">';
            files.forEach(file => {
              containerHtml += createFileItem(file);
            });
            containerHtml += '</div>';
            element.innerHTML = containerHtml;
            element.style.display = 'flex';
            element.style.alignItems = 'flex-start';
          }
        });
      }
    } else {
      // Un singur fișier
      element.innerHTML = createFileItem(files[0]);
    }
  } else if (metafieldType === 'product_reference' || metafieldType === 'list.product_reference') {
    // Verifică dacă este o listă (array) sau un singur produs
    // Pentru variant metafields, valoarea poate veni ca string JSON, deci încercăm să o parsăm
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const products = isList ? parsedValue : (parsedValue ? [parsedValue] : []);
    
    if (products.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    // Funcție helper pentru a crea HTML-ul unui card de produs
    function createProductCard(product) {
      const productImage = product.featured_image || product.image || '';
      const productTitle = product.title || '';
      const productUrl = product.url || '';
      let cardHtml = '';
      
      if (productUrl && productUrl !== 'null') {
        cardHtml += '<a href="' + escapeHtml(String(productUrl)) + '" style="text-decoration: none; color: inherit; display: inline-block;">';
      }
      cardHtml += '<div style="display: flex; flex-direction: column; align-items: center; padding: 10px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); background: #fff; max-width: 200px; min-width: 200px; flex-shrink: 0;">';
      if (productImage && productImage !== 'null') {
        cardHtml += '<img src="' + escapeHtml(String(productImage)) + '" alt="' + escapeHtml(productTitle) + '" style="width: 100%; height: ' + height + 'px; object-fit: contain; border-radius: 4px; margin-bottom: 8px;" />';
      }
      if (productTitle) {
        cardHtml += '<span style="font-weight: bold; text-align: center; font-size: 14px; line-height: 1.4;">' + escapeHtml(productTitle) + '</span>';
      }
      cardHtml += '</div>';
      if (productUrl && productUrl !== 'null') {
        cardHtml += '</a>';
      }
      return cardHtml;
    }
    
    // Determină dacă ar trebui să fie scrollabil bazat pe width
    shouldMakeScrollable(element, products.length, 200, 15).then(shouldScroll => {
      if (shouldScroll) {
        // Creează un container scrollabil orizontal
        const containerHtml = createScrollableContainer(products, createProductCard, 'dc-product-list-scrollable');
        element.innerHTML = containerHtml;
        configureScrollableElement(element);
      } else {
        // Afișează într-un flex container normal cu wrap
        let containerHtml = '<div style="display: flex; gap: 15px; flex-wrap: wrap;">';
        products.forEach(product => {
          containerHtml += createProductCard(product);
        });
        containerHtml += '</div>';
        element.innerHTML = containerHtml;
        element.style.display = 'flex';
        element.style.alignItems = 'flex-start';
      }
    });
  } else if (metafieldType === 'collection_reference' || metafieldType === 'list.collection_reference') {
    // Verifică dacă este o listă (array) sau o singură colecție
    // Pentru variant metafields, valoarea poate veni ca string JSON, deci încercăm să o parsăm
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const collections = isList ? parsedValue : (parsedValue ? [parsedValue] : []);
    
    if (collections.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    // Funcție helper pentru a crea HTML-ul unui card de colecție
    function createCollectionCard(collection) {
      const collectionImage = collection.featured_image || collection.image || '';
      const collectionTitle = collection.title || '';
      const collectionUrl = collection.url || '';
      let cardHtml = '';
      
      if (collectionUrl && collectionUrl !== 'null') {
        cardHtml += '<a href="' + escapeHtml(String(collectionUrl)) + '" style="text-decoration: none; color: inherit; display: inline-block;">';
      }
      cardHtml += '<div style="display: flex; flex-direction: column; align-items: center; padding: 10px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); background: #fff; max-width: 200px; min-width: 200px; flex-shrink: 0;">';
      if (collectionImage && collectionImage !== 'null') {
        cardHtml += '<img src="' + escapeHtml(String(collectionImage)) + '" alt="' + escapeHtml(collectionTitle) + '" style="width: 100%; height: ' + height + 'px; object-fit: contain; border-radius: 4px; margin-bottom: 8px;" />';
      }
      if (collectionTitle) {
        cardHtml += '<span style="font-weight: bold; text-align: center; font-size: 14px; line-height: 1.4;">' + escapeHtml(collectionTitle) + '</span>';
      }
      cardHtml += '</div>';
      if (collectionUrl && collectionUrl !== 'null') {
        cardHtml += '</a>';
      }
      return cardHtml;
    }
    
    // Determină dacă ar trebui să fie scrollabil bazat pe width
    shouldMakeScrollable(element, collections.length, 200, 15).then(shouldScroll => {
      if (shouldScroll) {
        // Creează un container scrollabil orizontal
        const containerHtml = createScrollableContainer(collections, createCollectionCard, 'dc-collection-list-scrollable');
        element.innerHTML = containerHtml;
        configureScrollableElement(element);
      } else {
        // Afișează într-un flex container normal cu wrap
        let containerHtml = '<div style="display: flex; gap: 15px; flex-wrap: wrap;">';
        collections.forEach(collection => {
          containerHtml += createCollectionCard(collection);
        });
        containerHtml += '</div>';
        element.innerHTML = containerHtml;
        element.style.display = 'flex';
        element.style.alignItems = 'flex-start';
      }
    });
  } else if (metafieldType === 'dimension' || metafieldType === 'list.dimension') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.textContent = 'N/A';
      return;
    }
    
    const formatDimension = (dim) => {
      if (typeof dim === 'object' && dim.value !== undefined && dim.unit !== undefined) {
        return dim.value + ' ' + dim.unit;
      } else if (typeof dim === 'object' && dim.value !== undefined) {
        return String(dim.value);
      } else if (typeof dim === 'object') {
        return JSON.stringify(dim);
      } else {
        return String(dim);
      }
    };
    
    if (isList) {
      const formattedItems = items.map(item => {
        const formatted = formatDimension(item);
        return applyPrefixSuffix(formatted, prefix, suffix);
      });
      element.textContent = formattedItems.join(', ');
    } else {
      const formatted = formatDimension(items[0]);
      const formattedValue = applyPrefixSuffix(formatted, prefix, suffix);
      element.textContent = formattedValue;
    }
  } else if (metafieldType === 'volume' || metafieldType === 'list.volume') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined && parsedValue !== '' ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.textContent = 'N/A';
      return;
    }
    
    const formatVolume = (vol) => {
      if (typeof vol === 'object' && vol.value !== undefined) {
        const volumeValue = vol.value;
        const volumeUnit = vol.unit || '';
        return volumeUnit ? volumeValue + ' ' + volumeUnit : String(volumeValue);
      } else if (typeof vol === 'object') {
        return JSON.stringify(vol);
      } else {
        return String(vol);
      }
    };
    
    if (isList) {
      const formattedItems = items.map(item => {
        const formatted = formatVolume(item);
        return applyPrefixSuffix(formatted, prefix, suffix);
      });
      element.textContent = formattedItems.join(', ');
    } else {
      const formatted = formatVolume(items[0]);
      const formattedValue = applyPrefixSuffix(formatted, prefix, suffix);
      element.textContent = formattedValue;
    }
  } else if (metafieldType === 'url' || metafieldType === 'link' || metafieldType === 'list.url' || metafieldType === 'list.link') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined && parsedValue !== '' && parsedValue !== 'null' ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    const createLink = (item) => {
      let url = '';
      let linkText = '';
      
      if (typeof item === 'object' && item.url) {
        // Pentru link type, folosește url și text din obiect
        url = String(item.url);
        linkText = item.text || url;
      } else {
        // Pentru url type sau string simplu
        url = String(item);
        linkText = url;
      }
      
      // Asigură URL-ul absolut
      if (!url.includes('http://') && !url.includes('https://')) {
        url = 'https://' + url;
      }
      
      const formattedText = applyPrefixSuffix(linkText, prefix, suffix);
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">' +
        escapeHtml(formattedText) +
        '</a>';
    };
    
    if (isList) {
      // Pentru liste, afișează fiecare link pe o linie nouă sau separate
      const linksHtml = items.map(item => createLink(item)).join('<br>');
      element.innerHTML = linksHtml;
    } else {
      element.innerHTML = createLink(items[0]);
    }
  } else if (metafieldType === 'boolean' || metafieldType === 'list.boolean') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    const createBooleanIcon = (boolVal) => {
      const boolValue = boolVal === true || boolVal === 'true' || boolVal === 1 || boolVal === '1';
      if (boolValue) {
        return '<span style="color: #22c55e; font-size: 1.2em; font-weight: bold;" aria-label="true">✓</span>';
      } else {
        return '<span style="color: #ef4444; font-size: 1.2em; font-weight: bold;" aria-label="false">✗</span>';
      }
    };
    
    if (isList) {
      const iconsHtml = items.map(item => createBooleanIcon(item)).join(' ');
      element.innerHTML = iconsHtml;
    } else {
      element.innerHTML = createBooleanIcon(items[0]);
    }
  } else if (metafieldType === 'color' || metafieldType === 'list.color') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined && parsedValue !== '' && parsedValue !== 'null' ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    const createColorCircle = (colorVal) => {
      let colorValue = String(colorVal).trim();
      
      // Asigură că culoarea începe cu # dacă nu are deja
      if (!colorValue.startsWith('#')) {
        colorValue = '#' + colorValue;
      }
      
      // Validează formatul culorii (hex de 3 sau 6 caractere)
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (!hexColorRegex.test(colorValue)) {
        // Dacă nu este un format valid, afișează valoarea ca text
        return '<span>' + escapeHtml(colorValue) + '</span>';
      }
      
      // Randează un cerc colorat cu border negru
      return '<span style="width: 24px; height: 24px; border-radius: 50%; background-color: ' + escapeHtml(colorValue) + '; border: 2px solid #1a1a1a; display: inline-block; margin-right: 8px;" aria-label="Color: ' + escapeHtml(colorValue) + '"></span>';
    };
    
    if (isList) {
      const circlesHtml = items.map(item => createColorCircle(item)).join('');
      element.innerHTML = circlesHtml;
    } else {
      element.innerHTML = createColorCircle(items[0]);
    }
  } else if (metafieldType === 'money' || metafieldType === 'list.money') {
    // Pentru metafield-uri de tip money, împărțim amount la 100 și formatăm cu 2 zecimale
    if (value !== null && value !== undefined && value !== '') {
      let displayValue = '';
      if (typeof value === 'object' && value.amount !== undefined) {
        // Dacă este obiect cu amount și currency_code, împărțim amount la 100
        const amount = parseFloat(value.amount) || 0;
        const currencyCode = value.currency_code || '';
        const formattedAmount = (amount / 100).toFixed(2);
        displayValue = currencyCode ? formattedAmount + ' ' + currencyCode : formattedAmount;
      } else if (typeof value === 'object') {
        // Dacă este obiect fără proprietăți clare, încearcă să extragă amount
        const amount = parseFloat(value.amount || value.value || 0) || 0;
        displayValue = (amount / 100).toFixed(2);
      } else {
        // Dacă este un număr direct, împărțim la 100
        const amount = parseFloat(value) || 0;
        displayValue = (amount / 100).toFixed(2);
      }
      const formattedValue = applyPrefixSuffix(displayValue, prefix, suffix);
      element.textContent = formattedValue;
    } else {
      element.textContent = 'N/A';
    }
  } else if (metafieldType === 'rating' || metafieldType === 'list.rating') {
    // Verifică dacă este o listă (array) sau o singură valoare
    let parsedValue = value;
    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
      }
    }
    
    const isList = Array.isArray(parsedValue);
    const items = isList ? parsedValue : (parsedValue !== null && parsedValue !== undefined && parsedValue !== '' && parsedValue !== 'null' ? [parsedValue] : []);
    
    if (items.length === 0) {
      element.innerHTML = 'N/A';
      return;
    }
    
    const createRatingStars = (ratingVal) => {
      let ratingData = null;
      
      if (typeof ratingVal === 'object') {
        ratingData = ratingVal;
      } else if (typeof ratingVal === 'string') {
        try {
          ratingData = JSON.parse(ratingVal);
        } catch (e) {
          const numValue = parseFloat(ratingVal);
          if (!isNaN(numValue)) {
            ratingData = { value: numValue, scale_max: 5, scale_min: 1 };
          }
        }
      }
      
      if (ratingData && ratingData.value !== undefined) {
        const ratingValue = parseFloat(ratingData.value) || 0;
        const scaleMax = parseFloat(ratingData.scale_max) || 5;
        const scaleMin = parseFloat(ratingData.scale_min) || 1;
        
        const fullStars = Math.floor(ratingValue);
        const emptyStars = Math.max(0, Math.floor(scaleMax) - fullStars);
        
        let starsHtml = '<div style="display: inline-flex; align-items: center; gap: 2px;">';
        for (let i = 0; i < fullStars; i++) {
          starsHtml += '<span style="color: #fbbf24; font-size: 1.2em;" aria-hidden="true">★</span>';
        }
        for (let i = 0; i < emptyStars; i++) {
          starsHtml += '<span style="color: #d1d5db; font-size: 1.2em;" aria-hidden="true">★</span>';
        }
        starsHtml += '</div>';
        return starsHtml;
      }
      return 'N/A';
    };
    
    if (isList) {
      const starsHtml = items.map(item => createRatingStars(item)).join(' ');
      element.innerHTML = starsHtml;
    } else {
      element.innerHTML = createRatingStars(items[0]);
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
      styling = {};
    }
  }
  
  // Citește setările din schema (data-attributes)
  const schemaMaxWidth = parseInt(container.getAttribute('data-max-width')) || 0;
  const schemaAlignment = container.getAttribute('data-alignment') || 'left';
  const schemaMarginTop = parseInt(container.getAttribute('data-margin-top')) || 0;
  const schemaMarginLeft = parseInt(container.getAttribute('data-margin-left')) || 0;
  
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
  

  // Generează media queries pentru device-specific styling
  let mediaQueriesCSS = '';
  let cssVars = '';
  let containerInlineStyle = '';
  
  if (hasDeviceSpecificStyling) {
    // Când avem device-specific styling, NU setăm width/margin în inline style
    // Le setăm DOAR în media queries pentru a permite suprascrierea corectă
    // Nu setăm nimic în inline style pentru width/margin când avem device-specific styling
    containerInlineStyle = ''; // Nu setăm width/margin în inline style
    
    // Helper function pentru a construi stilurile combinate
    const buildCombinedStyles = (deviceStyling) => {
      const templateWidth = deviceStyling.tableWidth || '100';
      const templateMarginTop = parseInt(deviceStyling.tableMarginTop || '0');
      const templateAlignment = deviceStyling.tableAlignment || schemaAlignment;
      
      let widthStyle = '';
      if (schemaMaxWidth > 0) {
        widthStyle = 'max-width: ' + schemaMaxWidth + 'px !important; width: ' + templateWidth + '% !important; ';
      } else {
        widthStyle = 'width: ' + templateWidth + '% !important; ';
      }
      
      const combinedMarginTop = (templateMarginTop + schemaMarginTop) + 'px';
      let alignmentStyle = '';
      if (templateAlignment === 'center') {
        alignmentStyle = 'margin-left: auto !important; margin-right: auto !important; ';
      } else if (templateAlignment === 'right') {
        alignmentStyle = 'margin-left: auto !important; margin-right: ' + schemaMarginLeft + 'px !important; ';
      } else {
        alignmentStyle = 'margin-left: ' + schemaMarginLeft + 'px !important; ';
      }
      
      return widthStyle + 'margin-top: ' + combinedMarginTop + ' !important; margin-bottom: ' + (deviceStyling.tableMarginBottom || '0') + 'px !important; ' + alignmentStyle;
    };
    
    // Mobile styles (< 768px) - setăm toate CSS variables-urile + width/margin
    const mobileVars = buildCSSVarsForDevice(mobileStyling, mobileStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (max-width: 767px) { #specification-table-' + escapedTemplateId + ' { ' + mobileVars + buildCombinedStyles(mobileStyling) + '} } ';
    
    // Tablet styles (768px - 1023px) - setăm toate CSS variables-urile + width/margin
    const tabletVars = buildCSSVarsForDevice(tabletStyling, tabletStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (min-width: 768px) and (max-width: 1023px) { #specification-table-' + escapedTemplateId + ' { ' + tabletVars + buildCombinedStyles(tabletStyling) + '} } ';
    
    // Desktop styles (>= 1024px) - setăm toate CSS variables-urile + width/margin
    const desktopVars = buildCSSVarsForDevice(desktopStyling, desktopStyling.columnRatio || columnRatio);
    mediaQueriesCSS += '@media (min-width: 1024px) { #specification-table-' + escapedTemplateId + ' { ' + desktopVars + buildCombinedStyles(desktopStyling) + '} } ';
  } else {
    // Backward compatibility: folosim styling-ul direct în inline style
    cssVars = buildCSSVarsForDevice(styling, columnRatio);
    
    const templateWidth = styling.tableWidth || '100';
    const templateMarginTop = parseInt(styling.tableMarginTop || '0');
    const templateAlignment = styling.tableAlignment || schemaAlignment;
    
    let widthStyle = '';
    if (schemaMaxWidth > 0) {
      widthStyle = 'max-width: ' + schemaMaxWidth + 'px; width: ' + templateWidth + '%; ';
    } else {
      widthStyle = 'width: ' + templateWidth + '%; ';
    }
    
    const combinedMarginTop = (templateMarginTop + schemaMarginTop) + 'px';
    let alignmentStyle = '';
    if (templateAlignment === 'center') {
      alignmentStyle = 'margin-left: auto; margin-right: auto; ';
    } else if (templateAlignment === 'right') {
      alignmentStyle = 'margin-left: auto; margin-right: ' + schemaMarginLeft + 'px; ';
    } else {
      alignmentStyle = 'margin-left: ' + schemaMarginLeft + 'px; ';
    }
    
    containerInlineStyle = widthStyle + 'margin-top: ' + combinedMarginTop + '; margin-bottom: ' + (styling.tableMarginBottom || '0') + 'px; ' + alignmentStyle;
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
    const tableNameHeaderTextAlignStyle = 'text-align: var(--dc-header-text-align, left); ';
    html += '<div class="dc_table_name_header">';
    html += '<h2 class="dc_table_name" style="' + tableNameHeaderTextAlignStyle + '">' + escapeHtml(tableName) + '</h2>';
    html += '</div>';
  }

  // Colectează toate metafields-urile din toate secțiunile
  const allMetafieldsWithSection = [];
  const sectionHideWhenEmpty = {};
  template.sections.forEach((section, sectionIndex) => {
    sectionHideWhenEmpty[sectionIndex] = section.hideSectionWhenEmpty !== undefined && section.hideSectionWhenEmpty !== null ? section.hideSectionWhenEmpty : true;

    if (section.metafields && section.metafields.length > 0) {
      section.metafields.forEach((metafield, mfIndex) => {
        // Dacă este custom_spec, folosește structura pentru custom spec
        if (metafield.type === 'custom_spec') {
          allMetafieldsWithSection.push({
            type: 'custom_spec',
            customName: metafield.customName,
            customValue: metafield.customValue,
            productSpecType: null,
            namespace: null,
            key: null,
            ownerType: null,
            name: null,
            metafieldType: null,
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
        } else if (metafield.type === 'product_spec') {
          // Dacă este product spec, folosește structura pentru product spec
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
    // Dacă este custom_spec, verifică dacă are customValue
    if (metafield.type === 'custom_spec') {
      return metafield.customValue !== null &&
             metafield.customValue !== undefined &&
             metafield.customValue !== '' &&
             (typeof metafield.customValue !== 'string' || metafield.customValue.trim() !== '') &&
             metafield.customName !== null &&
             metafield.customName !== undefined &&
             metafield.customName !== '' &&
             (typeof metafield.customName !== 'string' || metafield.customName.trim() !== '');
    }
    
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
        
        // Verifică dacă valoarea există și nu este null/undefined
        if (value === null || value === undefined || value === '') {
          hasValue = false;
        } else if (typeof value === 'object') {
          // Pentru obiecte (file_reference, product_reference, collection_reference, rating, volume, dimension, weight)
          // Dacă are url, este file_reference - afișează-l întotdeauna
          if (value.url) {
            hasValue = true;
          } else if (value.value !== undefined && value.scale_max !== undefined) {
            // Pentru rating, verifică dacă value există și nu este null/0
            hasValue = value.value !== null && value.value !== undefined && value.value !== '' && parseFloat(value.value) > 0;
          } else if (value.value !== undefined && value.unit !== undefined) {
            // Pentru volume, dimension sau weight, verifică dacă value există
            hasValue = value.value !== null && value.value !== undefined && value.value !== '';
          } else if (value.amount !== undefined) {
            // Pentru money, verifică dacă amount există și nu este 0
            const amountValue = parseFloat(value.amount) || 0;
            hasValue = value.amount !== null && value.amount !== undefined && value.amount !== '' && amountValue > 0;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else {
            // Pentru product_reference sau collection_reference, verifică title, featured_image sau image
            hasValue = !!(value.title || value.featured_image || value.image);
          }
        } else {
          // Pentru string-uri și alte tipuri primitive
          hasValue = value !== 'null' &&
                    value !== 'undefined' &&
                    (typeof value !== 'string' || value.trim() !== '') &&
                    (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
        }
      }
    } else if (metafield.ownerType === 'VARIANT') {
      Object.keys(variantMetafields).forEach(variantId => {
        if (!hasValue && variantMetafields[variantId] &&
            variantMetafields[variantId][metafield.namespace] &&
            variantMetafields[variantId][metafield.namespace][metafield.key] !== undefined) {
          value = variantMetafields[variantId][metafield.namespace][metafield.key];
          
          // Verifică dacă valoarea există și nu este null/undefined
          if (value === null || value === undefined || value === '') {
            hasValue = false;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else if (typeof value === 'object') {
            // Pentru obiecte (file_reference, product_reference, collection_reference, rating, volume, dimension, weight)
            // Dacă are url, este file_reference (imagine, video sau fișier) - afișează-l întotdeauna
            if (value.url) {
              hasValue = true;
            } else if (value.value !== undefined && value.scale_max !== undefined) {
              // Pentru rating, verifică dacă value există și nu este null/0
              hasValue = value.value !== null && value.value !== undefined && value.value !== '' && parseFloat(value.value) > 0;
            } else if (value.value !== undefined && value.unit !== undefined) {
              // Pentru volume, dimension sau weight, verifică dacă value există
              hasValue = value.value !== null && value.value !== undefined && value.value !== '';
            } else if (value.amount !== undefined) {
              // Pentru money, verifică dacă amount există și nu este 0
              const amountValue = parseFloat(value.amount) || 0;
              hasValue = value.amount !== null && value.amount !== undefined && value.amount !== '' && amountValue > 0;
            } else {
              // Pentru product_reference sau collection_reference, verifică title, featured_image sau image
              hasValue = !!(value.title || value.featured_image || value.image);
            }
          } else {
            // Pentru string-uri și alte tipuri primitive
            hasValue = value !== 'null' &&
                      value !== 'undefined' &&
                      (typeof value !== 'string' || value.trim() !== '') &&
                      (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
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

  displayRowsPC.forEach(item => {
    if (allGroupedBySection[item.sectionIndex]) {
      allGroupedBySection[item.sectionIndex].displayMetafieldsPC.push(item);
    }
  });
  displayRowsMobile.forEach(item => {
    if (allGroupedBySection[item.sectionIndex]) {
      allGroupedBySection[item.sectionIndex].displayMetafieldsMobile.push(item);
    }
  });

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
  // Contor pentru metafields-urile care sunt efectiv afișate (care au valoare)
  // Acest contor este folosit pentru calculul odd/even
  let visibleRowIndex = 0;

  metafields.forEach((metafield, index) => {
    
    let hasValue = false;
    let value = null;

    // Dacă este custom_spec, folosește customValue direct
    if (metafield.type === 'custom_spec') {
      value = metafield.customValue;
      hasValue = value !== null &&
                 value !== undefined &&
                 value !== '' &&
                 (typeof value !== 'string' || value.trim() !== '') &&
                 metafield.customName !== null &&
                 metafield.customName !== undefined &&
                 metafield.customName !== '' &&
                 (typeof metafield.customName !== 'string' || metafield.customName.trim() !== '');
    } else if (metafield.type === 'product_spec') {
      // Dacă este product spec, verifică în productSpecsFromLiquid
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
        
        // Verifică dacă valoarea există și nu este null/undefined
        if (value === null || value === undefined || value === '') {
          hasValue = false;
        } else if (typeof value === 'object') {
          // Pentru obiecte (file_reference, product_reference, collection_reference, rating, volume, dimension, weight)
          // Dacă are url, este file_reference - afișează-l întotdeauna
          if (value.url) {
            hasValue = true;
          } else if (value.value !== undefined && value.scale_max !== undefined) {
            // Pentru rating, verifică dacă value există și nu este null/0
            hasValue = value.value !== null && value.value !== undefined && value.value !== '' && parseFloat(value.value) > 0;
          } else if (value.value !== undefined && value.unit !== undefined) {
            // Pentru volume, dimension sau weight, verifică dacă value există
            hasValue = value.value !== null && value.value !== undefined && value.value !== '';
          } else if (value.amount !== undefined) {
            // Pentru money, verifică dacă amount există și nu este 0
            const amountValue = parseFloat(value.amount) || 0;
            hasValue = value.amount !== null && value.amount !== undefined && value.amount !== '' && amountValue > 0;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else {
            // Pentru product_reference sau collection_reference, verifică title, featured_image sau image
            hasValue = !!(value.title || value.featured_image || value.image);
          }
        } else {
          // Pentru string-uri și alte tipuri primitive
          hasValue = value !== 'null' &&
                    value !== 'undefined' &&
                    (typeof value !== 'string' || value.trim() !== '') &&
                    (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
        }
      }
    } else if (metafield.ownerType === 'VARIANT') {
      Object.keys(variantMetafields).forEach(variantId => {
        if (!hasValue && variantMetafields[variantId] &&
            variantMetafields[variantId][metafield.namespace] &&
            variantMetafields[variantId][metafield.namespace][metafield.key] !== undefined) {
          value = variantMetafields[variantId][metafield.namespace][metafield.key];
          
          // Verifică dacă valoarea există și nu este null/undefined
          if (value === null || value === undefined || value === '') {
            hasValue = false;
          } else if (Array.isArray(value)) {
            // Pentru list.product_reference sau list.collection_reference, verifică dacă array-ul nu este gol
            hasValue = value.length > 0;
          } else if (typeof value === 'object') {
            // Pentru obiecte (file_reference, product_reference, collection_reference, rating, volume, dimension, weight)
            // Dacă are url, este file_reference (imagine, video sau fișier) - afișează-l întotdeauna
            if (value.url) {
              hasValue = true;
            } else if (value.value !== undefined && value.scale_max !== undefined) {
              // Pentru rating, verifică dacă value există și nu este null/0
              hasValue = value.value !== null && value.value !== undefined && value.value !== '' && parseFloat(value.value) > 0;
            } else if (value.value !== undefined && value.unit !== undefined) {
              // Pentru volume, dimension sau weight, verifică dacă value există
              hasValue = value.value !== null && value.value !== undefined && value.value !== '';
            } else if (value.amount !== undefined) {
              // Pentru money, verifică dacă amount există și nu este 0
              const amountValue = parseFloat(value.amount) || 0;
              hasValue = value.amount !== null && value.amount !== undefined && value.amount !== '' && amountValue > 0;
            } else {
              // Pentru product_reference sau collection_reference, verifică title, featured_image sau image
              hasValue = !!(value.title || value.featured_image || value.image);
            }
          } else {
            // Pentru string-uri și alte tipuri primitive
            hasValue = value !== 'null' &&
                      value !== 'undefined' &&
                      (typeof value !== 'string' || value.trim() !== '') &&
                      (typeof value !== 'string' || value.trim().toUpperCase() !== 'N/A');
          }
        }
      });
    }

    // Calculează odd/even bazat pe metafields-urile care sunt efectiv afișate (care au valoare)
    // Nu pe toate metafields-urile, pentru a evita problemele când unele metafields nu au valoare
    const isOdd = visibleRowIndex % 2 === 0;

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
    } else {
      // Incrementează contorul doar pentru metafields-urile care au valoare și sunt afișate
      visibleRowIndex++;
    }

    // Aplică specSpacing (row padding) - folosește CSS variable pentru device-specific styling
    // CSS variable este deja setat pe container prin media queries
    const specSpacingStyle = 'padding-top: var(--dc-spec-spacing, 10px); padding-bottom: var(--dc-spec-spacing, 10px); ';

    rowsHtml += '<tr class="' + rowClasses + '">';
    rowsHtml += '<td class="dc_table_td_label" style="' + specSpacingStyle + (specBackgroundStyle ? ' ' + specBackgroundStyle : '') + '">';
    // Dacă este custom_spec, product spec sau metafield normal, folosește numele corespunzător
    let displayName;
    if (metafield.type === 'custom_spec') {
      displayName = metafield.customName || 'Custom Specification';
    } else if (metafield.type === 'product_spec') {
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
    // Dacă este custom_spec, product spec sau metafield normal, folosește structura corespunzătoare
    // Aplică specSpacing și pe celula de valoare
    const valueSpacingStyle = 'padding-top: ' + (styling.specSpacing || '10') + 'px; padding-bottom: ' + (styling.specSpacing || '10') + 'px; ';
    if (metafield.type === 'custom_spec') {
      // Pentru custom_spec, afișează direct valoarea cu prefix și suffix
      let formattedValue = metafield.customValue || '';
      if (prefixValue) {
        formattedValue = prefixValue + ' ' + formattedValue;
      }
      if (suffixValue) {
        formattedValue = formattedValue + ' ' + suffixValue;
      }
      rowsHtml += '<td class="dc_table_td_value" style="' + valueSpacingStyle + (valueBackgroundStyle ? ' ' + valueBackgroundStyle : '') + '" data-custom-spec="true">';
      rowsHtml += '<span>' + escapeHtml(formattedValue) + '</span>';
      rowsHtml += '</td>';
      rowsHtml += '</tr>';
    } else if (metafield.type === 'product_spec') {
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
      return;
    }

    const tempTbody = tempTable.querySelector('tbody');
    if (!tempTbody) {
      return;
    }

    const rows = Array.from(tempTbody.querySelectorAll('tr'));

    if (rows.length === 0) {
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
    } else if (tbody) {
      // Tabel normal: adaugă toate rândurile în tbody
      rows.forEach(row => {
        // Marchează rândurile mutate cu un atribut pentru a le identifica în showLessTableRows
        row.setAttribute('data-see-more-added', 'true');
        tbody.appendChild(row);
      });
    } else {
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


import { useLoaderData, useFetcher, Outlet, useLocation, Form } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import { getTemplates, deleteTemplate, getProducts, getCollections, saveTemplateAssignment, getAllAssignments } from "../../models/template.server.js";

// Helper functions pentru conversie ID-uri
function shopifyIdToGraphQL(shopifyId, resourceType = 'Product') {
  // shopifyId este deja normalizat (doar numărul)
  // Trebuie să-l convertim în format GraphQL: gid://shopify/Product/123
  if (!shopifyId) return null;
  const id = String(shopifyId).trim();
  if (!id) return null;
  return `gid://shopify/${resourceType}/${id}`;
}

function graphQLToShopifyId(graphQLId) {
  // Convertește gid://shopify/Product/123 în 123
  if (!graphQLId || typeof graphQLId !== 'string') return null;
  const match = graphQLId.match(/gid:\/\/shopify\/(?:Product|Collection|ProductVariant)\/(\d+)/);
  return match ? match[1] : graphQLId;
}

export const loader = async ({ request }) => {
  const perfStart = performance.now();
  const { session } = await authenticate.admin(request);
  const authTime = performance.now() - perfStart;
  
  if (process.env.NODE_ENV === "development") {
    console.log(`[PERF] Authentication: ${authTime.toFixed(2)}ms`);
  }
  
  // Paralelizează query-urile pentru performanță mai bună
  // Măsoară fiecare query individual dar le rulează în paralel
  const queryStart = performance.now();
  
  const templatesPromise = (async () => {
    const start = performance.now();
    const result = await getTemplates(session.shop);
    return { result, time: performance.now() - start };
  })();
  
  const productsPromise = (async () => {
    const start = performance.now();
    const result = await getProducts(session.shop);
    return { result, time: performance.now() - start };
  })();
  
  const collectionsPromise = (async () => {
    const start = performance.now();
    const result = await getCollections(session.shop);
    return { result, time: performance.now() - start };
  })();
  
  const assignmentsPromise = (async () => {
    const start = performance.now();
    const result = await getAllAssignments(session.shop);
    return { result, time: performance.now() - start };
  })();
  
  // Așteaptă toate query-urile în paralel
  const [templatesData, productsData, collectionsData, assignmentsData] = await Promise.all([
    templatesPromise,
    productsPromise,
    collectionsPromise,
    assignmentsPromise,
  ]);
  
  const templates = templatesData.result;
  const templatesTime = templatesData.time;
  const products = productsData.result;
  const productsTime = productsData.time;
  const collections = collectionsData.result;
  const collectionsTime = collectionsData.time;
  const allAssignments = assignmentsData.result;
  const assignmentsTime = assignmentsData.time;
  
  const queryTime = performance.now() - queryStart;
  
  // Măsoară timpul de procesare a datelor
  const processingStart = performance.now();
  
  const totalTime = performance.now() - perfStart;
  
  if (process.env.NODE_ENV === "development") {
    console.log("📊 [PERF] ========== SERVER PERFORMANCE REPORT ==========");
    console.log(`   🔐 Authentication: ${authTime.toFixed(2)}ms`);
    console.log(`   🗄️  Database Queries:`);
    console.log(`      - Templates: ${templatesTime.toFixed(2)}ms`);
    console.log(`      - Products: ${productsTime.toFixed(2)}ms`);
    console.log(`      - Collections: ${collectionsTime.toFixed(2)}ms`);
    console.log(`      - Assignments: ${assignmentsTime.toFixed(2)}ms`);
    console.log(`   ⏱️  Total Queries: ${queryTime.toFixed(2)}ms`);
    console.log(`   ⚙️  Data Processing: ${(performance.now() - processingStart).toFixed(2)}ms`);
    console.log(`   ⏱️  Total Server Time: ${totalTime.toFixed(2)}ms`);
    console.log("📊 =================================================");
  }

  // Creează map-uri pentru a verifica rapid ce este deja assignat
  const assignedCollections = new Set();
  const assignedProducts = new Set();
  let hasGlobalAssignment = false;
  let globalAssignmentTemplateId = null;

  allAssignments.forEach(assignment => {
    if (assignment.assignmentType === "DEFAULT") {
      hasGlobalAssignment = true;
      globalAssignmentTemplateId = assignment.templateId;
    } else {
      assignment.targets.forEach(target => {
        if (target.targetType === "COLLECTION") {
          assignedCollections.add(target.targetShopifyId);
        } else if (target.targetType === "PRODUCT") {
          assignedProducts.add(target.targetShopifyId);
        }
      });
    }
  });
  
  return { 
    templates, 
    products, 
    collections, 
    assignedCollections: Array.from(assignedCollections),
    assignedProducts: Array.from(assignedProducts),
    hasGlobalAssignment,
    globalAssignmentTemplateId,
    // Performance metrics pentru debugging (doar în development)
    ...(process.env.NODE_ENV === "development" && {
      _perf: {
        auth: authTime.toFixed(2),
        queries: {
          templates: templatesTime.toFixed(2),
          products: productsTime.toFixed(2),
          collections: collectionsTime.toFixed(2),
          assignments: assignmentsTime.toFixed(2),
          total: queryTime.toFixed(2),
        },
        processing: (performance.now() - processingStart).toFixed(2),
        total: totalTime.toFixed(2),
      },
    }),
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  const templateId = formData.get("templateId");

  if (actionType === "delete" && templateId) {
    try {
      await deleteTemplate(templateId, session.shop);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "assign" && templateId) {
    try {
      const assignmentType = formData.get("assignmentType");
      const targetIds = formData.getAll("targetIds");
      const isExcluded = formData.get("isExcluded") === "true";
      const result = await saveTemplateAssignment(templateId, assignmentType, targetIds, session.shop, isExcluded, admin);
      return { 
        success: true,
        autoAddedCount: result.autoAddedCount || 0,
        autoAddedType: result.autoAddedType || null
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "search") {
    const searchType = formData.get("searchType");
    const search = formData.get("search") || "";
    if (searchType === "products") {
      const products = await getProducts(session.shop, search);
      return { success: true, results: products };
    } else if (searchType === "collections") {
      const collections = await getCollections(session.shop, search);
      return { success: true, results: collections };
    }
  }

  return { success: false, error: "Invalid action" };
};

function TemplateAssignment({ template, products: initialProducts, collections: initialCollections, shopify, assignedCollections, assignedProducts, hasGlobalAssignment, globalAssignmentTemplateId }) {
  const fetcher = useFetcher();
  const assignment = template.assignments?.[0];
  // Determină tipul de assignment și dacă este except
  const getAssignmentTypeFromAssignment = () => {
    if (!assignment) return "NONE";
    if (assignment.assignmentType === "DEFAULT") return "GLOBAL";
    // Verifică dacă toate target-urile sunt excluded
    const allExcluded = assignment.targets?.every(t => t.isExcluded) || false;
    if (allExcluded && assignment.targets?.length > 0) {
      return assignment.assignmentType === "PRODUCT" ? "PRODUCT_EXCEPT" : "COLLECTION_EXCEPT";
    }
    return assignment.assignmentType;
  };

  const [assignmentType, setAssignmentType] = useState(getAssignmentTypeFromAssignment());
  const [selectedProducts, setSelectedProducts] = useState(
    assignment?.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [selectedCollections, setSelectedCollections] = useState(
    assignment?.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [excludedProducts, setExcludedProducts] = useState(
    assignment?.targets?.filter(t => t.targetType === "PRODUCT" && t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [excludedCollections, setExcludedCollections] = useState(
    assignment?.targets?.filter(t => t.targetType === "COLLECTION" && t.isExcluded).map(t => t.targetShopifyId) || []
  );
  
  // Logging pentru debugging
  useEffect(() => {
    console.log('[TemplateAssignment] Assignment loaded:', assignment);
    console.log('[TemplateAssignment] Selected products:', selectedProducts);
    console.log('[TemplateAssignment] Selected collections:', selectedCollections);
    console.log('[TemplateAssignment] Excluded products:', excludedProducts);
    console.log('[TemplateAssignment] Excluded collections:', excludedCollections);
  }, []);
  
  // Actualizează state-ul când assignment-ul se schimbă (după salvare)
  useEffect(() => {
    if (assignment?.targets) {
      const newSelectedProducts = assignment.targets
        .filter(t => t.targetType === "PRODUCT" && !t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      const newSelectedCollections = assignment.targets
        .filter(t => t.targetType === "COLLECTION" && !t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      const newExcludedProducts = assignment.targets
        .filter(t => t.targetType === "PRODUCT" && t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      const newExcludedCollections = assignment.targets
        .filter(t => t.targetType === "COLLECTION" && t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      
      setSelectedProducts(newSelectedProducts);
      setSelectedCollections(newSelectedCollections);
      setExcludedProducts(newExcludedProducts);
      setExcludedCollections(newExcludedCollections);
    }
  }, [assignment]);
  const [productSearch, setProductSearch] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [products, setProducts] = useState(initialProducts);
  const [collections, setCollections] = useState(initialCollections);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Cache pentru conflictele verificate (pentru a evita query-uri duplicate)
  const conflictsCacheRef = useRef({ products: new Set(assignedProducts), collections: new Set(assignedCollections) });
  
  // Stocare starea inițială pentru detectarea modificărilor
  const initialFormState = useRef({
    assignmentType: getAssignmentTypeFromAssignment(),
    selectedProducts: assignment?.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).map(t => t.targetShopifyId) || [],
    selectedCollections: assignment?.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).map(t => t.targetShopifyId) || [],
    excludedProducts: assignment?.targets?.filter(t => t.targetType === "PRODUCT" && t.isExcluded).map(t => t.targetShopifyId) || [],
    excludedCollections: assignment?.targets?.filter(t => t.targetType === "COLLECTION" && t.isExcluded).map(t => t.targetShopifyId) || [],
  });
  
  // Flag pentru a preveni declanșarea Save Bar la prima încărcare
  const isInitialMount = useRef(true);
  
  // Actualizează cache-ul când se schimbă assignedProducts/assignedCollections
  useEffect(() => {
    conflictsCacheRef.current.products = new Set(assignedProducts);
    conflictsCacheRef.current.collections = new Set(assignedCollections);
  }, [assignedProducts, assignedCollections]);

  // Funcție pentru a detecta dacă există modificări nesalvate
  const hasUnsavedChanges = useCallback(() => {
    // Compară assignmentType
    if (assignmentType !== initialFormState.current.assignmentType) {
      return true;
    }

    // Compară selectedProducts
    const currentProducts = JSON.stringify([...selectedProducts].sort());
    const initialProducts = JSON.stringify([...initialFormState.current.selectedProducts].sort());
    if (currentProducts !== initialProducts) {
      return true;
    }

    // Compară selectedCollections
    const currentCollections = JSON.stringify([...selectedCollections].sort());
    const initialCollections = JSON.stringify([...initialFormState.current.selectedCollections].sort());
    if (currentCollections !== initialCollections) {
      return true;
    }

    // Compară excludedProducts
    const currentExcludedProducts = JSON.stringify([...excludedProducts].sort());
    const initialExcludedProducts = JSON.stringify([...initialFormState.current.excludedProducts].sort());
    if (currentExcludedProducts !== initialExcludedProducts) {
      return true;
    }

    // Compară excludedCollections
    const currentExcludedCollections = JSON.stringify([...excludedCollections].sort());
    const initialExcludedCollections = JSON.stringify([...initialFormState.current.excludedCollections].sort());
    if (currentExcludedCollections !== initialExcludedCollections) {
      return true;
    }

    return false;
  }, [assignmentType, selectedProducts, selectedCollections, excludedProducts, excludedCollections]);

  // Ascunde Save Bar explicit la prima încărcare
  useEffect(() => {
    if (isInitialMount.current) {
      const hideSaveBar = () => {
        const form = document.querySelector(`form[data-save-bar][data-template-id="${template.id}"]`);
        if (form && typeof shopify?.saveBar?.hide === 'function') {
          shopify.saveBar.hide('save-bar').catch(() => {});
        }
      };
      
      hideSaveBar();
      const timeoutId = setTimeout(() => {
        hideSaveBar();
        isInitialMount.current = false;
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shopify, template.id]);

  // Monitorizează schimbările și declanșează evenimente change pentru Save Bar
  useEffect(() => {
    if (isInitialMount.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const form = document.querySelector(`form[data-save-bar][data-template-id="${template.id}"]`);
      if (form) {
        // Declanșează change pe toate hidden inputs pentru a activa Save Bar
        const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
        hiddenInputs.forEach(input => {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [assignmentType, selectedProducts, selectedCollections, excludedProducts, excludedCollections, template.id]);

  // Previne navigarea când există schimbări nesalvate
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Funcție pentru a obține textul de assignment info
  const getAssignmentInfo = () => {
    if (!assignment) {
      return "Not assigned";
    }
    
    if (assignment.assignmentType === "DEFAULT") {
      return "Assigned globally";
    }
    
    const productCount = assignment.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).length || 0;
    const excludedProductCount = assignment.targets?.filter(t => t.targetType === "PRODUCT" && t.isExcluded).length || 0;
    const collectionCount = assignment.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).length || 0;
    const excludedCollectionCount = assignment.targets?.filter(t => t.targetType === "COLLECTION" && t.isExcluded).length || 0;
    
    if (assignment.assignmentType === "PRODUCT") {
      if (excludedProductCount > 0) {
        return `Assigned to all products, except ${excludedProductCount} ${excludedProductCount === 1 ? "product" : "products"}`;
      }
      if (productCount > 0) {
        return `Assigned on ${productCount} ${productCount === 1 ? "product" : "products"}`;
      }
    }
    
    if (assignment.assignmentType === "COLLECTION") {
      if (excludedCollectionCount > 0) {
        return `Assigned to all collections, except ${excludedCollectionCount} ${excludedCollectionCount === 1 ? "collection" : "collections"}`;
      }
      if (collectionCount > 0) {
        return `Assigned on ${collectionCount} ${collectionCount === 1 ? "collection" : "collections"}`;
      }
    }
    
    return "Not assigned";
  };

  const handleAssignmentTypeChange = (type) => {
    // Verifică dacă există deja un template assignat global
    if (type === "GLOBAL" && hasGlobalAssignment && globalAssignmentTemplateId !== template.id) {
      shopify.toast.show("Another template is already assigned globally. Please unassign it first.", { isError: true });
      return;
    }
    setAssignmentType(type);
    if (type === "GLOBAL") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedProducts([]);
      setExcludedCollections([]);
    } else if (type === "PRODUCT_EXCEPT") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedCollections([]);
    } else if (type === "COLLECTION_EXCEPT") {
      setSelectedProducts([]);
      setSelectedCollections([]);
      setExcludedProducts([]);
    } else if (type === "PRODUCT") {
      setExcludedProducts([]);
      setExcludedCollections([]);
      setSelectedCollections([]);
    } else if (type === "COLLECTION") {
      setExcludedProducts([]);
      setExcludedCollections([]);
      setSelectedProducts([]);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    
    let targetIds = [];
    let isExcluded = false;
    let actualAssignmentType = assignmentType;
    
    if (assignmentType === "PRODUCT") {
      targetIds = selectedProducts;
      actualAssignmentType = "PRODUCT";
    } else if (assignmentType === "COLLECTION") {
      targetIds = selectedCollections;
      actualAssignmentType = "COLLECTION";
    } else if (assignmentType === "PRODUCT_EXCEPT") {
      // Pentru EXCEPT, salvăm doar excluderile
      // Server-ul va adăuga automat produsele deja assignate la alte template-uri
      targetIds = excludedProducts;
      isExcluded = true;
      actualAssignmentType = "PRODUCT";
    } else if (assignmentType === "COLLECTION_EXCEPT") {
      // Pentru EXCEPT, salvăm doar excluderile
      // Server-ul va adăuga automat colecțiile deja assignate la alte template-uri
      targetIds = excludedCollections;
      isExcluded = true;
      actualAssignmentType = "COLLECTION";
    } else if (assignmentType === "GLOBAL") {
      actualAssignmentType = "DEFAULT";
    }

    const formData = new FormData();
    formData.append("action", "assign");
    formData.append("templateId", template.id);
    formData.append("assignmentType", actualAssignmentType);
    formData.append("isExcluded", isExcluded ? "true" : "false");
    targetIds.forEach(id => {
      formData.append("targetIds", id);
    });

    fetcher.submit(formData, { method: "POST" });
  };

  // Resetare starea inițială după salvare sau discard
  const handleReset = useCallback(() => {
    initialFormState.current = {
      assignmentType: assignmentType,
      selectedProducts: [...selectedProducts],
      selectedCollections: [...selectedCollections],
      excludedProducts: [...excludedProducts],
      excludedCollections: [...excludedCollections],
    };
    isInitialMount.current = true;
    setTimeout(() => {
      isInitialMount.current = false;
    }, 100);
  }, [assignmentType, selectedProducts, selectedCollections, excludedProducts, excludedCollections]);

  // Funcție pentru deschiderea Resource Picker pentru produse
  const handleOpenProductPicker = useCallback(async () => {
    try {
      console.log('[Resource Picker] Current selectedProducts:', selectedProducts);
      
      // Pregătește preselection: convertim shopifyId-urile selectate în format GraphQL
      const preselectedIds = selectedProducts
        .map(id => shopifyIdToGraphQL(id, 'Product'))
        .filter(Boolean);
      
      console.log('[Resource Picker] Opening product picker with preselectedIds:', preselectedIds);
      console.log('[Resource Picker] Formatted selectionIds:', preselectedIds.map(id => ({ id })));
      
      const result = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
        selectionIds: preselectedIds.length > 0 ? preselectedIds.map(id => ({ id })) : undefined,
      });
      
      console.log('[Resource Picker] Result:', result);
      
      if (result && result.selection) {
        // Convertește ID-urile din format GraphQL în shopifyId normalizat
        // result.selection poate fi un array de obiecte {id: "gid://..."} sau un array de string-uri
        const newSelectedIds = result.selection
          .map(item => {
            const gid = typeof item === 'string' ? item : (item.id || item);
            return graphQLToShopifyId(gid);
          })
          .filter(Boolean);
        
        console.log('[Resource Picker] Converted IDs:', newSelectedIds);
        
        // Verifică conflictele pentru toate selecțiile (nu doar cele noi)
        // Excludem resursele care sunt deja assignate la template-ul curent
        const currentTemplateIds = new Set(selectedProducts);
        const conflicts = newSelectedIds.filter(id => 
          conflictsCacheRef.current.products.has(id) && !currentTemplateIds.has(id)
        );
        
        // Elimină resursele care sunt în conflict (assignate la alte template-uri)
        const validSelectedIds = newSelectedIds.filter(id => 
          !conflictsCacheRef.current.products.has(id) || currentTemplateIds.has(id)
        );
        
        // Actualizează cache-ul pentru ID-urile eliminate (nu mai sunt în conflicte)
        const previousIds = new Set(selectedProducts);
        const removedIds = selectedProducts.filter(id => !validSelectedIds.includes(id));
        removedIds.forEach(id => conflictsCacheRef.current.products.delete(id));
        
        // Actualizează state-ul doar cu resursele valide
        setSelectedProducts(validSelectedIds);
        
        // Afișează notificare detaliată dacă au fost eliminate resurse
        if (conflicts.length > 0) {
          if (conflicts.length <= 1) {
            // Pentru 4 sau mai puține, afișează fiecare produs
            const conflictProducts = conflicts
              .map(id => {
                const product = products.find(p => String(p.shopifyId) === String(id));
                return product ? product.title : `Product ${id}`;
              })
              .filter(Boolean);
            
            conflictProducts.forEach((productName, index) => {
              setTimeout(() => {
                shopify.toast.show(
                  `Product "${productName}" was excluded from selection because it is assigned to another product template.`,
                  { isError: false }
                );
              }, index * 100); // Delay pentru a afișa notificările secvențial
            });
          } else {
            // Pentru mai mult de 4, afișează numărul total
            shopify.toast.show(
              `${conflicts.length} products have been removed from the selection because they are already assigned to another product template.`,
              { isError: false }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error opening product picker:', error);
      shopify.toast.show('Failed to open product picker. Please try again.', { isError: true });
    }
  }, [selectedProducts, shopify, products]);
  
  // Funcție pentru deschiderea Resource Picker pentru colecții
  const handleOpenCollectionPicker = useCallback(async () => {
    try {
      console.log('[Resource Picker] Current selectedCollections:', selectedCollections);
      
      // Pregătește preselection: convertim shopifyId-urile selectate în format GraphQL
      const preselectedIds = selectedCollections
        .map(id => shopifyIdToGraphQL(id, 'Collection'))
        .filter(Boolean);
      
      console.log('[Resource Picker] Opening collection picker with preselectedIds:', preselectedIds);
      console.log('[Resource Picker] Formatted selectionIds:', preselectedIds.map(id => ({ id })));
      
      const result = await shopify.resourcePicker({
        type: 'collection',
        multiple: true,
        selectionIds: preselectedIds.length > 0 ? preselectedIds.map(id => ({ id })) : undefined,
      });
      
      console.log('[Resource Picker] Result:', result);
      
      if (result && result.selection) {
        // Convertește ID-urile din format GraphQL în shopifyId normalizat
        // result.selection poate fi un array de obiecte {id: "gid://..."} sau un array de string-uri
        const newSelectedIds = result.selection
          .map(item => {
            const gid = typeof item === 'string' ? item : (item.id || item);
            return graphQLToShopifyId(gid);
          })
          .filter(Boolean);
        
        console.log('[Resource Picker] Converted IDs:', newSelectedIds);
        
        // Verifică conflictele pentru toate selecțiile (nu doar cele noi)
        // Excludem resursele care sunt deja assignate la template-ul curent
        const currentTemplateIds = new Set(selectedCollections);
        const conflicts = newSelectedIds.filter(id => 
          conflictsCacheRef.current.collections.has(id) && !currentTemplateIds.has(id)
        );
        
        // Elimină resursele care sunt în conflict (assignate la alte template-uri)
        const validSelectedIds = newSelectedIds.filter(id => 
          !conflictsCacheRef.current.collections.has(id) || currentTemplateIds.has(id)
        );
        
        // Actualizează cache-ul pentru ID-urile eliminate (nu mai sunt în conflicte)
        const previousIds = new Set(selectedCollections);
        const removedIds = selectedCollections.filter(id => !validSelectedIds.includes(id));
        removedIds.forEach(id => conflictsCacheRef.current.collections.delete(id));
        
        // Actualizează state-ul doar cu resursele valide
        setSelectedCollections(validSelectedIds);
        
        // Afișează notificare detaliată dacă au fost eliminate resurse
        if (conflicts.length > 0) {
          if (conflicts.length <= 4) {
            // Pentru 4 sau mai puține, afișează fiecare colecție
            const conflictCollections = conflicts
              .map(id => {
                const collection = collections.find(c => String(c.shopifyId) === String(id));
                return collection ? collection.title : `Collection ${id}`;
              })
              .filter(Boolean);
            
            conflictCollections.forEach((collectionName, index) => {
              setTimeout(() => {
                shopify.toast.show(
                  `Collection "${collectionName}" was excluded from selection because it is assigned to another collection template.`,
                  { isError: false }
                );
              }, index * 100); // Delay pentru a afișa notificările secvențial
            });
          } else {
            // Pentru mai mult de 4, afișează numărul total
            shopify.toast.show(
              `${conflicts.length} collections have been removed from the selection because they are already assigned to another collection template.`,
              { isError: false }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error opening collection picker:', error);
      shopify.toast.show('Failed to open collection picker. Please try again.', { isError: true });
    }
  }, [selectedCollections, shopify, collections]);
  
  // Funcție pentru deschiderea Resource Picker pentru excluderea produselor
  const handleOpenProductExcludePicker = useCallback(async () => {
    try {
      console.log('[Resource Picker] Current excludedProducts:', excludedProducts);
      
      const preselectedIds = excludedProducts
        .map(id => shopifyIdToGraphQL(id, 'Product'))
        .filter(Boolean);
      
      console.log('[Resource Picker] Opening product exclude picker with preselectedIds:', preselectedIds);
      console.log('[Resource Picker] Formatted selectionIds:', preselectedIds.map(id => ({ id })));
      
      const result = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
        selectionIds: preselectedIds.length > 0 ? preselectedIds.map(id => ({ id })) : undefined,
      });
      
      console.log('[Resource Picker] Result:', result);
      
      if (result && result.selection) {
        // Convertește ID-urile din format GraphQL în shopifyId normalizat
        // result.selection poate fi un array de obiecte {id: "gid://..."} sau un array de string-uri
        const newExcludedIds = result.selection
          .map(item => {
            const gid = typeof item === 'string' ? item : (item.id || item);
            return graphQLToShopifyId(gid);
          })
          .filter(Boolean);
        
        console.log('[Resource Picker] Converted excluded IDs:', newExcludedIds);
        
        setExcludedProducts(newExcludedIds);
      }
    } catch (error) {
      console.error('Error opening product exclude picker:', error);
      shopify.toast.show('Failed to open product picker. Please try again.', { isError: true });
    }
  }, [excludedProducts, shopify]);
  
  // Funcție pentru deschiderea Resource Picker pentru excluderea colecțiilor
  const handleOpenCollectionExcludePicker = useCallback(async () => {
    try {
      console.log('[Resource Picker] Current excludedCollections:', excludedCollections);
      
      const preselectedIds = excludedCollections
        .map(id => shopifyIdToGraphQL(id, 'Collection'))
        .filter(Boolean);
      
      console.log('[Resource Picker] Opening collection exclude picker with preselectedIds:', preselectedIds);
      console.log('[Resource Picker] Formatted selectionIds:', preselectedIds.map(id => ({ id })));
      
      const result = await shopify.resourcePicker({
        type: 'collection',
        multiple: true,
        selectionIds: preselectedIds.length > 0 ? preselectedIds.map(id => ({ id })) : undefined,
      });
      
      console.log('[Resource Picker] Result:', result);
      
      if (result && result.selection) {
        // Convertește ID-urile din format GraphQL în shopifyId normalizat
        // result.selection poate fi un array de obiecte {id: "gid://..."} sau un array de string-uri
        const newExcludedIds = result.selection
          .map(item => {
            const gid = typeof item === 'string' ? item : (item.id || item);
            return graphQLToShopifyId(gid);
          })
          .filter(Boolean);
        
        console.log('[Resource Picker] Converted excluded IDs:', newExcludedIds);
        
        setExcludedCollections(newExcludedIds);
      }
    } catch (error) {
      console.error('Error opening collection exclude picker:', error);
      shopify.toast.show('Failed to open collection picker. Please try again.', { isError: true });
    }
  }, [excludedCollections, shopify]);

  const handleProductSearch = (search) => {
    setProductSearch(search);
    if (search.length > 0) {
      fetcher.submit(
        { action: "search", searchType: "products", search },
        { method: "POST" }
      );
    } else {
      setProducts(initialProducts);
    }
  };

  const handleCollectionSearch = (search) => {
    setCollectionSearch(search);
    if (search.length > 0) {
      fetcher.submit(
        { action: "search", searchType: "collections", search },
        { method: "POST" }
      );
    } else {
      setCollections(initialCollections);
    }
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.results) {
      if (fetcher.formData?.get("searchType") === "products") {
        setProducts(fetcher.data.results);
      } else if (fetcher.formData?.get("searchType") === "collections") {
        setCollections(fetcher.data.results);
      }
    }
  }, [fetcher.data]);

  // Toast notifications pentru save assignment
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Verifică dacă este un răspuns de la action-ul de assign
      // (nu are results, deci nu este search)
      if (fetcher.data.success !== undefined && !fetcher.data.results) {
        if (fetcher.data.success) {
          // Verifică dacă au fost adăugate automat resurse
          const autoAddedCount = fetcher.data.autoAddedCount || 0;
          const autoAddedType = fetcher.data.autoAddedType;
          
          if (autoAddedCount > 0 && autoAddedType) {
            const resourceType = autoAddedType === "PRODUCT" ? "products" : "collections";
            const resourceTypeSingular = autoAddedType === "PRODUCT" ? "product" : "collection";
            const templateType = autoAddedType === "PRODUCT" ? "Product" : "Collection";
            
            const message = `${autoAddedCount} ${autoAddedCount === 1 ? resourceTypeSingular : resourceType} ${autoAddedCount === 1 ? 'has' : 'have'} been automatically added to exclusions because ${autoAddedCount === 1 ? 'it was' : 'they were'} already assigned to another ${templateType} template.`;
            shopify.toast.show(message);
          } else {
            shopify.toast.show("Assignment saved successfully");
          }
          
          // Resetează starea inițială și reîncarcă pagina
          handleReset();
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          shopify.toast.show(fetcher.data.error || "An error occurred", { isError: true });
        }
      }
    }
  }, [fetcher.state, fetcher.data, shopify, handleReset]);

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
      <Form
        data-save-bar
        data-discard-confirmation
        data-template-id={template.id}
        onSubmit={handleSave}
        onReset={handleReset}
        method="POST"
      >
        {/* Hidden inputs pentru Save Bar */}
        <input type="hidden" name="action" value="assign" />
        <input type="hidden" name="templateId" value={template.id} />
        <input type="hidden" name="assignmentType" value={assignmentType === "GLOBAL" ? "DEFAULT" : (assignmentType === "PRODUCT_EXCEPT" || assignmentType === "COLLECTION_EXCEPT" ? (assignmentType === "PRODUCT_EXCEPT" ? "PRODUCT" : "COLLECTION") : assignmentType)} />
        <input type="hidden" name="isExcluded" value={assignmentType === "PRODUCT_EXCEPT" || assignmentType === "COLLECTION_EXCEPT" ? "true" : "false"} />
        {assignmentType === "PRODUCT" && selectedProducts.map(id => (
          <input key={id} type="hidden" name="targetIds" value={id} />
        ))}
        {assignmentType === "COLLECTION" && selectedCollections.map(id => (
          <input key={id} type="hidden" name="targetIds" value={id} />
        ))}
        {assignmentType === "PRODUCT_EXCEPT" && excludedProducts.map(id => (
          <input key={id} type="hidden" name="targetIds" value={id} />
        ))}
        {assignmentType === "COLLECTION_EXCEPT" && excludedCollections.map(id => (
          <input key={id} type="hidden" name="targetIds" value={id} />
        ))}

        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignment="space-between">
            <div>
              <s-text tone="subdued">{getAssignmentInfo()}</s-text>
            </div>
            <s-button
              type="button"
              variant="primary"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? "Hide" : "Show"}
            </s-button>
          </s-stack>

          {isExpanded && (
            <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="tight">
              <s-checkbox
                checked={assignmentType === "GLOBAL"}
                disabled={hasGlobalAssignment && globalAssignmentTemplateId !== template.id}
                onChange={() => handleAssignmentTypeChange("GLOBAL")}
                label={hasGlobalAssignment && globalAssignmentTemplateId !== template.id 
                  ? "Assign this template globally (another template is already assigned globally)" 
                  : "Assign this template globally"}
              />
              <s-checkbox
                checked={assignmentType === "COLLECTION"}
                onChange={() => handleAssignmentTypeChange("COLLECTION")}
                label="Assign to collections"
              />
              <s-checkbox
                checked={assignmentType === "COLLECTION_EXCEPT"}
                onChange={() => handleAssignmentTypeChange("COLLECTION_EXCEPT")}
                label="Assign to collections, except:"
              />
              <s-checkbox
                checked={assignmentType === "PRODUCT"}
                onChange={() => handleAssignmentTypeChange("PRODUCT")}
                label="Assign to products"
              />
              <s-checkbox
                checked={assignmentType === "PRODUCT_EXCEPT"}
                onChange={() => handleAssignmentTypeChange("PRODUCT_EXCEPT")}
                label="Assign to products, except:"
              />
            </s-stack>

            {assignmentType === "COLLECTION" && (
              <s-stack direction="block" gap="base">
                <s-button type="button" variant="secondary" onClick={handleOpenCollectionPicker}>
                  {selectedCollections.length > 0 
                    ? `Select Collections (${selectedCollections.length} selected)` 
                    : "Select Collections"}
                </s-button>
                {selectedCollections.length > 0 && (
                  <s-text variant="bodyMd" tone="subdued">
                    {selectedCollections.length} {selectedCollections.length === 1 ? 'collection' : 'collections'} selected
                  </s-text>
                )}
              </s-stack>
            )}

            {assignmentType === "PRODUCT" && (
              <s-stack direction="block" gap="base">
                <s-button type="button" variant="secondary" onClick={handleOpenProductPicker}>
                  {selectedProducts.length > 0 
                    ? `Select Products (${selectedProducts.length} selected)` 
                    : "Select Products"}
                </s-button>
                {selectedProducts.length > 0 && (
                  <s-text variant="bodyMd" tone="subdued">
                    {selectedProducts.length} {selectedProducts.length === 1 ? 'product' : 'products'} selected
                  </s-text>
                )}
              </s-stack>
            )}

            {assignmentType === "PRODUCT_EXCEPT" && (
              <s-stack direction="block" gap="base">
                <s-button type="button" variant="secondary" onClick={handleOpenProductExcludePicker}>
                  {excludedProducts.length > 0 
                    ? `Select Products to Exclude (${excludedProducts.length} selected)` 
                    : "Select Products to Exclude"}
                </s-button>
                {excludedProducts.length > 0 && (
                  <s-text variant="bodyMd" tone="subdued">
                    {excludedProducts.length} {excludedProducts.length === 1 ? 'product' : 'products'} will be excluded
                  </s-text>
                )}
              </s-stack>
            )}

            {assignmentType === "COLLECTION_EXCEPT" && (
              <s-stack direction="block" gap="base">
                <s-button type="button" variant="secondary" onClick={handleOpenCollectionExcludePicker}>
                  {excludedCollections.length > 0 
                    ? `Select Collections to Exclude (${excludedCollections.length} selected)` 
                    : "Select Collections to Exclude"}
                </s-button>
                {excludedCollections.length > 0 && (
                  <s-text variant="bodyMd" tone="subdued">
                    {excludedCollections.length} {excludedCollections.length === 1 ? 'collection' : 'collections'} will be excluded
                  </s-text>
                )}
              </s-stack>
            )}
          </s-stack>
        )}
      </s-stack>
    </Form>
    </s-box>
  );
}

export default function TemplatesPage() {
  const loaderData = useLoaderData();
  const { templates, products, collections, assignedCollections, assignedProducts, hasGlobalAssignment, globalAssignmentTemplateId, _perf } = loaderData;
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const location = useLocation();

  // Afișează performance metrics în consola browser-ului (doar în development)
  useEffect(() => {
    if (_perf) {
      console.log("🚀 [PERF] Page Load Performance:", _perf);
      console.log(`   Authentication: ${_perf.auth}ms`);
      console.log(`   Database Queries: ${_perf.queries}ms`);
      console.log(`   Total Server Time: ${_perf.total}ms`);
    }
  }, [_perf]);

  useEffect(() => {
    if (fetcher.data?.success === false) {
      shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
    } else if (fetcher.data?.success) {
      shopify.toast.show("Template deleted successfully!");
      window.location.reload();
    }
  }, [fetcher.data, shopify]);

  const handleDelete = (templateId) => {
    if (confirm("You are about to delete this template. Are you sure you want to continue?")) {
      fetcher.submit(
        { templateId, action: "delete" },
        { method: "POST" }
      );
    }
  };

  const isOnDetailPage = location.pathname.includes("/templates/") && location.pathname !== "/app/templates";

  // Dacă suntem pe o pagină de detalii (new sau edit), afișăm doar Outlet
  if (isOnDetailPage) {
    return <Outlet />;
  }

  return (
    <s-page heading="Specification Templates">
        <s-button slot="primary-action" href="/app/templates/new" variant="primary">
          + Create New Template
        </s-button>

        {templates.length === 0 ? (
          <s-section>
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              backgroundColor: "#f6f6f7",
              borderRadius: "8px",
              border: "2px dashed #c9cccf"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "20px" }}>📋</div>
              <s-heading level="2" style={{ marginBottom: "16px" }}>
                You don't have any templates yet
              </s-heading>
              <s-paragraph tone="subdued" style={{ marginBottom: "24px", maxWidth: "500px", margin: "0 auto 24px" }}>
                Create your first template to start organizing your product metafields in a structured and professional way.
              </s-paragraph>
              <s-button href="/app/templates/new" variant="primary" size="large">
                + Create Your First Template
              </s-button>
            </div>
          </s-section>
        ) : (
          <s-section>
            <s-stack direction="block" gap="base">
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    padding: "24px",
                    border: "1px solid #e1e3e5",
                    borderRadius: "8px",
                    backgroundColor: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    transition: "box-shadow 0.2s ease",
                    marginBottom: "16px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
                  }}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" alignment="space-between" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <s-heading level="3" style={{ marginBottom: "8px" }}>
                          {template.name}
                        </s-heading>
                        <s-text tone="subdued" style={{ marginBottom: "12px" }}>
                          {template.sections.length} {template.sections.length === 1 ? "section" : "sections"},{" "}
                          {template.sections.reduce(
                            (acc, section) => acc + section.metafields.length,
                            0
                          )}{" "}
                          {template.sections.reduce((acc, section) => acc + section.metafields.length, 0) === 1 ? "metafield" : "metafields"}
                        </s-text>
                      </div>
                      <s-stack direction="inline" gap="tight" style={{ flexWrap: "wrap" }}>
                        <s-badge
                          status={template.isActive ? "success" : "critical"}
                          tone={template.isActive ? "success" : "critical"}
                        >
                          {template.isActive ? "✓ Active" : "⚠ Inactive"}
                        </s-badge>
                        {template.isAccordion && (
                          <s-badge tone="info">Accordion</s-badge>
                        )}
                      </s-stack>
                    </s-stack>
                    
                    <s-stack direction="inline" gap="tight" style={{ marginTop: "16px" }}>
                      <s-button
                        href={`/app/templates/${template.id}`}
                        variant="primary"
                        icon="edit"
                      >
                        Edit
                      </s-button>
                      <s-button
                        onClick={() => handleDelete(template.id)}
                        variant="critical"
                        icon="delete"
                        tone="critical"
                      >
                        Delete
                      </s-button>
                    </s-stack>
                    
                    <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e1e3e5" }}>
                      <TemplateAssignment
                        template={template}
                        products={products}
                        collections={collections}
                        shopify={shopify}
                        assignedCollections={assignedCollections}
                        assignedProducts={assignedProducts}
                        hasGlobalAssignment={hasGlobalAssignment}
                        globalAssignmentTemplateId={globalAssignmentTemplateId}
                      />
                    </div>
                  </s-stack>
                </div>
              ))}
            </s-stack>
          </s-section>
        )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


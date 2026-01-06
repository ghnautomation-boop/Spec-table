import { useLoaderData, useFetcher, Outlet, useLocation, Form, useRevalidator, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { SaveBar, Modal, TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../shopify.server";
import prisma from "../../db.server.js";
import { getTemplates, deleteTemplate, getProducts, getCollections, saveTemplateAssignment, getAllAssignments, duplicateTemplate, toggleTemplateActive } from "../../models/template.server.js";
import styles from "./styles.module.css";

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
      await deleteTemplate(templateId, session.shop, admin);
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
      const pendingActiveState = formData.get("pendingActiveState");
      
      console.log('[action:assign] Received formData:', {
        assignmentType,
        targetIdsCount: targetIds.length,
        targetIds: targetIds,
        isExcluded,
        pendingActiveState
      });
      
      // Dacă există o modificare nesalvată care face template-ul activ, salvăm-o mai întâi
      if (pendingActiveState === "true") {
        // Verifică dacă template-ul este deja activ în DB
        const shop = await prisma.shop.findUnique({
          where: { shopDomain: session.shop },
        });
        
        if (shop) {
          const template = await prisma.specificationTemplate.findFirst({
            where: {
              id: templateId,
              shopId: shop.id,
            },
          });
          
          // Dacă template-ul nu este activ în DB, îl activăm
          if (template && !template.isActive) {
            console.log('[action:assign] Activating template before assignment...');
            await toggleTemplateActive(templateId, session.shop, admin, true);
            // Așteaptă puțin pentru a se actualiza starea în DB
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('[action:assign] Template activated, proceeding with assignment...');
          }
        }
      }
      
      console.log('[action:assign] Calling saveTemplateAssignment with:', {
        templateId,
        assignmentType,
        targetIdsCount: targetIds.length,
        targetIds: targetIds
      });
      
      const result = await saveTemplateAssignment(templateId, assignmentType, targetIds, session.shop, isExcluded, admin);
      
      console.log('[action:assign] saveTemplateAssignment result:', result);
      
      // Verifică dacă assignment-ul s-a salvat corect în DB
      if (result.success) {
        const shop = await prisma.shop.findUnique({
          where: { shopDomain: session.shop },
        });
        
        if (shop) {
          const savedTemplate = await prisma.specificationTemplate.findFirst({
            where: {
              id: templateId,
              shopId: shop.id,
            },
            include: {
              assignments: {
                include: {
                  targets: true,
                },
              },
            },
          });
          
          console.log('[action:assign] Template after save:', {
            templateId: savedTemplate?.id,
            assignmentsCount: savedTemplate?.assignments?.length || 0,
            assignment: savedTemplate?.assignments?.[0],
            targetsCount: savedTemplate?.assignments?.[0]?.targets?.length || 0,
            targets: savedTemplate?.assignments?.[0]?.targets || []
          });
        }
      }
      return { 
        success: true,
        autoAddedCount: result.autoAddedCount || 0,
        autoAddedType: result.autoAddedType || null
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "duplicate" && templateId) {
    try {
      await duplicateTemplate(templateId, session.shop);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (actionType === "toggleActive" && templateId) {
    try {
      const newActiveState = formData.get("newActiveState");
      const targetState = newActiveState !== null ? newActiveState === "true" : null;
      await toggleTemplateActive(templateId, session.shop, admin, targetState);
      return { success: true };
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

function TemplateAssignment({ template, products: initialProducts, collections: initialCollections, shopify, assignedCollections, assignedProducts, hasGlobalAssignment, globalAssignmentTemplateId, pendingActiveChanges }) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const location = useLocation();
  const processedAssignmentRef = useRef(null);
  const assignment = template.assignments?.[0];
  // Determină tipul de assignment și dacă este except
  const getAssignmentTypeFromAssignment = () => {
    if (!assignment) return "NONE";
    if (assignment.assignmentType === "DEFAULT") return "GLOBAL";
    return assignment.assignmentType;
  };

  const [assignmentType, setAssignmentType] = useState(getAssignmentTypeFromAssignment());
  const [selectedProducts, setSelectedProducts] = useState(
    assignment?.targets?.filter(t => t.targetType === "PRODUCT" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  const [selectedCollections, setSelectedCollections] = useState(
    assignment?.targets?.filter(t => t.targetType === "COLLECTION" && !t.isExcluded).map(t => t.targetShopifyId) || []
  );
  
  // Logging pentru debugging
  useEffect(() => {
    console.log('[TemplateAssignment] Assignment loaded:', assignment);
    console.log('[TemplateAssignment] Selected products:', selectedProducts);
    console.log('[TemplateAssignment] Selected collections:', selectedCollections);
  }, [assignment, selectedProducts, selectedCollections]);
  
  // Actualizează state-ul când assignment-ul se schimbă (după salvare)
  useEffect(() => {
    if (assignment?.targets) {
      const newSelectedProducts = assignment.targets
        .filter(t => t.targetType === "PRODUCT" && !t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      const newSelectedCollections = assignment.targets
        .filter(t => t.targetType === "COLLECTION" && !t.isExcluded)
        .map(t => t.targetShopifyId) || [];
      
      setSelectedProducts(newSelectedProducts);
      setSelectedCollections(newSelectedCollections);
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

    return false;
  }, [assignmentType, selectedProducts, selectedCollections]);

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
  }, [assignmentType, selectedProducts, selectedCollections, template.id]);

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
    } else if (type === "PRODUCT") {
      setSelectedCollections([]);
    } else if (type === "COLLECTION") {
      setSelectedProducts([]);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    // Verifică dacă template-ul este activ în DB
    const isActiveInDB = template.isActive;
    // Verifică dacă există modificări nesalvate care îl fac activ
    const hasPendingActiveChange = pendingActiveChanges && pendingActiveChanges[template.id] !== undefined;
    const pendingActiveState = hasPendingActiveChange ? pendingActiveChanges[template.id] : null;
    
    let targetIds = [];
    let isExcluded = false;
    let actualAssignmentType = assignmentType;
    
    // Încearcă să obțină targetIds din form-ul HTML dacă state-ul este gol
    // (pentru cazul în care se face submit direct din contextual save bar)
    if (e.currentTarget) {
      const formDataFromForm = new FormData(e.currentTarget);
      const targetIdsFromForm = formDataFromForm.getAll("targetIds");
      
      if (assignmentType === "PRODUCT") {
        targetIds = selectedProducts.length > 0 ? selectedProducts : targetIdsFromForm;
        actualAssignmentType = "PRODUCT";
      } else if (assignmentType === "COLLECTION") {
        targetIds = selectedCollections.length > 0 ? selectedCollections : targetIdsFromForm;
        actualAssignmentType = "COLLECTION";
      } else if (assignmentType === "GLOBAL") {
        actualAssignmentType = "DEFAULT";
      }
    } else {
      // Fallback la logica veche
      if (assignmentType === "PRODUCT") {
        targetIds = selectedProducts;
        actualAssignmentType = "PRODUCT";
      } else if (assignmentType === "COLLECTION") {
        targetIds = selectedCollections;
        actualAssignmentType = "COLLECTION";
      } else if (assignmentType === "GLOBAL") {
        actualAssignmentType = "DEFAULT";
      }
    }

    // Debug: verifică dacă targetIds este gol
    console.log('[TemplateAssignment] handleSave called:', {
      assignmentType,
      actualAssignmentType,
      selectedProducts: selectedProducts.length,
      selectedCollections: selectedCollections.length,
      targetIds: targetIds.length,
      targetIdsArray: targetIds,
      hasPendingActiveChange,
      pendingActiveState,
      hasFormTarget: !!e.currentTarget
    });

    // Dacă nu există targetIds și nu este GLOBAL, nu facem nimic
    if (targetIds.length === 0 && actualAssignmentType !== "DEFAULT") {
      console.warn('[TemplateAssignment] No targetIds selected, skipping assignment');
      shopify.toast.show("Please select at least one product or collection", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("action", "assign");
    formData.append("templateId", template.id);
    formData.append("assignmentType", actualAssignmentType);
    formData.append("isExcluded", isExcluded ? "true" : "false");
    // Trimite starea de active/inactive dacă există modificări nesalvate
    if (hasPendingActiveChange) {
      formData.append("pendingActiveState", pendingActiveState.toString());
    }
    targetIds.forEach(id => {
      formData.append("targetIds", id);
    });

    console.log('[TemplateAssignment] Submitting formData:', {
      action: formData.get("action"),
      templateId: formData.get("templateId"),
      assignmentType: formData.get("assignmentType"),
      targetIdsCount: formData.getAll("targetIds").length,
      pendingActiveState: formData.get("pendingActiveState")
    });

    fetcher.submit(formData, { method: "POST" });
  };

  // Resetare starea inițială după salvare sau discard
  const handleReset = useCallback(() => {
    initialFormState.current = {
      assignmentType: assignmentType,
      selectedProducts: [...selectedProducts],
      selectedCollections: [...selectedCollections],
    };
    isInitialMount.current = true;
    setTimeout(() => {
      isInitialMount.current = false;
    }, 100);
  }, [assignmentType, selectedProducts, selectedCollections]);

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
        filter: {
          variants: false, // Nu afișa variantele, doar produsele principale
        },
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
        console.log('[Resource Picker] Setting selectedCollections to:', validSelectedIds);
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

  // Loading indicator pentru assignment-uri
  useEffect(() => {
    const isAssigning = fetcher.formData?.get("action") === "assign" && 
                       (fetcher.state === "submitting" || fetcher.state === "loading");
    
    if (isAssigning && shopify.loading) {
      shopify.loading(true);
    } else if (fetcher.state === "idle" && shopify.loading) {
      shopify.loading(false);
    }
    
    // Cleanup: asigură-te că loading-ul este oprit când componenta se demontează
    return () => {
      if (shopify.loading) {
        shopify.loading(false);
      }
    };
  }, [fetcher.state, fetcher.formData, shopify]);

  // Toast notifications pentru save assignment
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Verifică dacă este un răspuns de la action-ul de assign
      // (nu are results, deci nu este search)
      if (fetcher.data.success !== undefined && !fetcher.data.results) {
        // Creează un identificator unic pentru acest răspuns pentru a preveni re-executarea
        const responseId = JSON.stringify(fetcher.data);
        
        // Verifică dacă am procesat deja acest răspuns
        if (processedAssignmentRef.current === responseId) {
          return; // Nu procesa din nou același răspuns
        }
        
        if (fetcher.data.success) {
          // Marchează că am procesat acest răspuns
          processedAssignmentRef.current = responseId;
          
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
          
          // Resetează starea inițială și reîncarcă datele
          handleReset();
          // Reîncarcă datele fără să navigăm (suntem deja pe pagina corectă)
          setTimeout(() => {
            revalidator.revalidate();
          }, 500);
        } else {
          // Marchează că am procesat acest răspuns (chiar dacă e eroare)
          processedAssignmentRef.current = responseId;
          shopify.toast.show(fetcher.data.error || "An error occurred", { isError: true });
        }
      }
    }
    
    // Resetează flag-ul când fetcher.state devine "idle" și nu mai există date
    if (fetcher.state === "idle" && !fetcher.data) {
      processedAssignmentRef.current = null;
    }
  }, [fetcher.state, fetcher.data, shopify, handleReset, revalidator]);

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="base" suppressHydrationWarning>
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
        <input type="hidden" name="assignmentType" value={assignmentType === "GLOBAL" ? "DEFAULT" : assignmentType} />
        <input type="hidden" name="isExcluded" value="false" />
        {/* Trimite starea de active/inactive dacă există modificări nesalvate */}
        {pendingActiveChanges && pendingActiveChanges[template.id] !== undefined && (
          <input 
            type="hidden" 
            name="pendingActiveState" 
            value={pendingActiveChanges[template.id].toString()} 
            key={`pendingActiveState-${pendingActiveChanges[template.id]}`}
          />
        )}
        {assignmentType === "PRODUCT" && selectedProducts.map((id, index) => (
          <input key={`product-${id}-${index}`} type="hidden" name="targetIds" value={id} />
        ))}
        {assignmentType === "COLLECTION" && selectedCollections.map((id, index) => (
          <input key={`collection-${id}-${index}`} type="hidden" name="targetIds" value={id} />
        ))}

        <s-stack direction="block" gap="base">
          {(fetcher.state === "submitting" || fetcher.state === "loading") && fetcher.formData?.get("action") === "assign" && (
            <s-banner tone="info">
              <s-stack direction="inline" gap="small" alignItems="center" suppressHydrationWarning>
                <s-spinner accessibilityLabel="Saving assignment" size="base" suppressHydrationWarning />
                <s-text>Saving assignment... This may take a few moments.</s-text>
              </s-stack>
            </s-banner>
          )}
          <s-stack direction="inline" gap="base" alignment="space-between">
            <div>
              <s-text tone="subdued">{getAssignmentInfo()}</s-text>
            </div>
            <div className={styles.actionsColumn}>
              {(() => {
                // Butonul "Show" este disabled dacă template-ul este inactiv în DB
                // Nu folosim pendingActiveChanges pentru a determina starea butonului
                // Butonul devine enabled doar după ce se salvează modificarea de active/inactive
                const isActiveInDB = template.isActive;
                const hasPendingActiveChange = pendingActiveChanges && pendingActiveChanges[template.id] !== undefined;
                
                return (
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => setIsExpanded(!isExpanded)}
                    disabled={!isActiveInDB}
                    accessibilityLabel={isExpanded ? `Hide assignment options for template ${template.name}` : `Show assignment options for template ${template.name}`}
                  >
                    {isExpanded ? "Hide" : "Show"}
                  </s-button>
                );
              })()}
            </div>
            {(() => {
              const isActiveInDB = template.isActive;
              const hasPendingActiveChange = pendingActiveChanges && pendingActiveChanges[template.id] !== undefined;
              
              if (!isActiveInDB) {
                return (
                  <div className={styles.assignmentWarningMessage}>
                    <p className={styles.assignmentWarningText}>
                      {hasPendingActiveChange 
                        ? "Please save the Active/Inactive change first to enable assignments"
                        : "In order to assign this template to a resource you have to make it Active"}
                    </p>
                  </div>
                );
              }
              return null;
            })()}
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
                checked={assignmentType === "PRODUCT"}
                onChange={() => handleAssignmentTypeChange("PRODUCT")}
                label="Assign to products"
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
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const processedActionRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const createButtonRef = useRef(null);

  // Creează funcția globală IMEDIAT, înainte de orice altceva
  // Această funcție trebuie să fie disponibilă când s-page clonează butonul
  useEffect(() => {
    // Creează funcția globală imediat, fără să aștepte isMounted
    window.handleCreateNewTemplate = () => {
      navigate("/app/templates/new");
    };

    // Cleanup la unmount
    return () => {
      delete window.handleCreateNewTemplate;
    };
  }, [navigate]); // Nu depinde de isMounted, doar de navigate

  // Client-side mounting pentru a evita problemele de hidratare cu web components
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Folosim MutationObserver pentru a detecta când butonul este clonat în shadow DOM
  // și adăugăm event listener direct pe elementul clonat
  useEffect(() => {
    if (!isMounted) return;

    const attachListenerToClonedButton = () => {
      // Caută butonul clonat în shadow DOM al s-page
      const sPage = document.querySelector('s-page');
      if (!sPage) return;

      // Încearcă să găsească butonul în shadow root
      const shadowRoot = sPage.shadowRoot;
      if (shadowRoot) {
        const clonedButton = shadowRoot.querySelector('s-button[slot="primary-action"], button[slot="primary-action"], s-button, button');
        if (clonedButton) {
          const buttonText = clonedButton.textContent?.trim() || '';
          if (buttonText.includes('Create New Template') || buttonText.includes('+ Create New Template')) {
            // Șterge listener-ul vechi dacă există
            clonedButton.removeEventListener('click', handleClonedButtonClick);
            // Adaugă listener nou
            clonedButton.addEventListener('click', handleClonedButtonClick, true);
          }
        }
      }

      // Caută și în DOM normal (fallback)
      const normalButton = document.querySelector('s-button[slot="primary-action"]');
      if (normalButton && !normalButton.hasAttribute('data-listener-attached')) {
        const buttonText = normalButton.textContent?.trim() || '';
        if (buttonText.includes('Create New Template') || buttonText.includes('+ Create New Template')) {
          normalButton.setAttribute('data-listener-attached', 'true');
          normalButton.addEventListener('click', handleClonedButtonClick, true);
        }
      }
    };

    const handleClonedButtonClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      navigate("/app/templates/new");
      return false;
    };

    // Observă schimbările în DOM pentru a detecta când butonul este clonat
    const observer = new MutationObserver(() => {
      attachListenerToClonedButton();
    });

    // Observă schimbările în document
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['slot']
    });

    // Încearcă imediat să atașeze listener-ul
    setTimeout(attachListenerToClonedButton, 100);
    setTimeout(attachListenerToClonedButton, 500);
    setTimeout(attachListenerToClonedButton, 1000);

    return () => {
      observer.disconnect();
    };
  }, [isMounted, navigate]);



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
    if (fetcher.state === "idle" && fetcher.data) {
      // Creează un identificator unic pentru acest răspuns pentru a preveni re-executarea
      const responseId = JSON.stringify({ 
        success: fetcher.data.success, 
        actionType: fetcher.formData?.get("action"),
        templateId: fetcher.formData?.get("templateId")
      });
      
      // Verifică dacă am procesat deja acest răspuns
      if (processedActionRef.current === responseId) {
        return; // Nu procesa din nou același răspuns
      }
      
      if (fetcher.data?.success === false) {
        // Marchează că am procesat acest răspuns (chiar dacă e eroare)
        processedActionRef.current = responseId;
        shopify.toast.show(`Error: ${fetcher.data.error}`, { isError: true });
      } else if (fetcher.data?.success) {
        // Marchează că am procesat acest răspuns
        processedActionRef.current = responseId;
        
        const formData = fetcher.formData;
        const actionType = formData?.get("action");
        
        if (actionType === "delete") {
          shopify.toast.show("Template deleted successfully!");
        } else if (actionType === "duplicate") {
          shopify.toast.show("Template duplicated successfully!");
        } else if (actionType === "toggleActive") {
          shopify.toast.show("Template status updated successfully!");
        }
        
        // Folosim navigate() pentru navigare SPA (fără reload complet) pentru a păstra contextul App Bridge
        // Verifică dacă suntem deja pe pagina corectă pentru a preveni loop-uri
        const currentPath = window.location.pathname;
        if (currentPath === location.pathname) {
          // Suntem deja pe pagina corectă, doar revalidăm datele
          setTimeout(() => {
            revalidator.revalidate();
          }, 500);
        } else {
          // Navigăm la pagina corectă
          setTimeout(() => {
            navigate(location.pathname, { replace: true });
            revalidator.revalidate();
          }, 500);
        }
      }
    }
    
    // Resetează flag-ul când fetcher.state devine "idle" și nu mai există date
    if (fetcher.state === "idle" && !fetcher.data) {
      processedActionRef.current = null;
    }
  }, [fetcher.state, fetcher.data, fetcher.formData, shopify, navigate, location.pathname, revalidator]);

  const handleDelete = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    setTemplateToDelete({ id: templateId, name: template?.name || "this template" });
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      fetcher.submit(
        { templateId: templateToDelete.id, action: "delete" },
        { method: "POST" }
      );
      setDeleteModalOpen(false);
      setTemplateToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setTemplateToDelete(null);
  };

  const handleDuplicate = (templateId) => {
    fetcher.submit(
      { templateId, action: "duplicate" },
      { method: "POST" }
    );
  };

  // State pentru a ține minte modificările nesalvate de isActive
  const [pendingActiveChanges, setPendingActiveChanges] = useState({});
  
  const handleToggleActive = (templateId, currentActiveState) => {
    const newActiveState = !currentActiveState;
    
    // Salvează modificarea în state local
    setPendingActiveChanges(prev => ({
      ...prev,
      [templateId]: newActiveState
    }));
    
    // Afișează warning dacă se setează ca inactive
    if (!newActiveState && currentActiveState) {
      shopify.toast.show(
        "Warning: Setting this template to inactive will delete all its assignments (product, collection, and global) when you save.",
        { 
          isError: false,
          duration: 5000
        }
      );
    }
  };
  
  // Gestionează salvarea tuturor modificărilor
  const handleSaveAllChanges = async () => {
    const changes = Object.entries(pendingActiveChanges);
    if (changes.length === 0) return;
    
    // Salvează fiecare modificare
    for (const [templateId, newActiveState] of changes) {
      await fetcher.submit(
        { templateId, action: "toggleActive", newActiveState: newActiveState.toString() },
        { method: "POST" }
      );
    }
    
    // Șterge toate modificările din state
    setPendingActiveChanges({});
    
    // Ascunde save bar-ul
    if (shopify.saveBar && isMounted) {
      shopify.saveBar.hide('active-changes-save-bar').catch(() => {
        // Ignoră erorile dacă SaveBar nu este încă disponibil
      });
    }
  };
  
  // Gestionează anularea tuturor modificărilor
  const handleDiscardAllChanges = () => {
    // Șterge toate modificările din state
    setPendingActiveChanges({});
    
    // Ascunde save bar-ul
    if (shopify.saveBar && isMounted) {
      shopify.saveBar.hide('active-changes-save-bar').catch(() => {
        // Ignoră erorile dacă SaveBar nu este încă disponibil
      });
    }
  };
  
  // Afișează/ascunde contextual save bar când există modificări
  useEffect(() => {
    // Așteaptă până când componenta este montată pe client
    if (!isMounted) return;
    
    const hasChanges = Object.keys(pendingActiveChanges).length > 0;
    
    if (hasChanges && shopify.saveBar) {
      shopify.saveBar.show('active-changes-save-bar').catch(() => {
        // Ignoră erorile dacă SaveBar nu este încă disponibil
      });
    } else if (!hasChanges && shopify.saveBar) {
      shopify.saveBar.hide('active-changes-save-bar').catch(() => {
        // Ignoră erorile dacă SaveBar nu este încă disponibil
      });
    }
  }, [pendingActiveChanges, isMounted]);

  const isOnDetailPage = location.pathname.includes("/templates/") && location.pathname !== "/app/templates";

  // Dacă suntem pe o pagină de detalii (new sau edit), afișăm doar Outlet
  if (isOnDetailPage) {
    return <Outlet />;
  }

  const hasChanges = Object.keys(pendingActiveChanges).length > 0;

  // Render skeleton pe server pentru a evita problemele de hidratare
  if (!isMounted) {
    return (
      <div style={{ minHeight: "100vh", padding: "20px" }}>
        <h1>Specification Templates</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <s-page heading="Specification Templates">
        <SaveBar id="active-changes-save-bar">
          <button variant="primary" onClick={handleSaveAllChanges}>Save</button>
          <button onClick={handleDiscardAllChanges}>Discard</button>
        </SaveBar>
        <Modal id="delete-template-modal" open={deleteModalOpen}>
          <p style={{ fontFamily: "math", textAlign: "center" }}>Are you sure you want to delete "{templateToDelete?.name}"?</p>
          <p style={{ color: "#8b6914", fontSize: "14px", marginTop: "8px" }}>
            This action cannot be undone. All assignments (product, collection, and global) will be permanently deleted.
          </p>
          <TitleBar title="Delete template">
            <button variant="primary" tone="critical" onClick={confirmDelete}>
              Delete
            </button>
            <button onClick={cancelDelete}>Cancel</button>
          </TitleBar>
        </Modal>
        <s-button 
          slot="primary-action" 
          variant="primary" 
          size="large"
          ref={createButtonRef}
          onclick="window.handleCreateNewTemplate && window.handleCreateNewTemplate(); return false;"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate("/app/templates/new");
          }}
        >
          + Create New Template
        </s-button>

        {templates.length === 0 ? (
          <s-section suppressHydrationWarning>
            <div className={styles.emptyStateContainer}>
              <div className={styles.emptyStateIcon}>📋</div>
              <div className={styles.emptyStateParagraph}>
                <s-paragraph >
                  You don't have any templates yet
                </s-paragraph>
              </div>
              <div className={styles.emptyStateParagraph}>
                <s-paragraph tone="subdued">
                  Create your first template to start organizing your product metafields in a structured and professional way.
                </s-paragraph>
              </div>
              <s-button href="/app/templates/new" variant="primary" size="large">
                + Create Your First Template
              </s-button>
            </div>
          </s-section>
        ) : (
          <s-section suppressHydrationWarning>
            <s-stack direction="block" gap="base" suppressHydrationWarning>
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={styles.templateCard}
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" alignment="space-between">
                      <div className={styles.flexOne}>
                        <div className={styles.marginBottom8}>
                          <s-heading level="3">
                            {template.name}
                          </s-heading>
                        </div>
                        <div className={styles.marginBottom12}>
                          <s-text tone="subdued">
                            {template.sections.length} {template.sections.length === 1 ? "section" : "sections"},{" "}
                            {template.sections.reduce(
                              (acc, section) => acc + section.metafields.length,
                              0
                            )}{" "}
                            {template.sections.reduce((acc, section) => acc + section.metafields.length, 0) === 1 ? "metafield" : "metafields"}
                          </s-text>
                        </div>
                      </div>
                      <div className={styles.actionsColumn}>
                        <div className={styles.actionsRow}>
                          <s-text variant="bodyMd" tone="subdued">Active: </s-text>
                          <s-switch
                            checked={pendingActiveChanges[template.id] !== undefined 
                              ? pendingActiveChanges[template.id] 
                              : template.isActive}
                            onChange={() => handleToggleActive(template.id, 
                              pendingActiveChanges[template.id] !== undefined 
                                ? pendingActiveChanges[template.id] 
                                : template.isActive)}
                            accessibilityLabel={`Toggle active status for template ${template.name}`}
                          />
                        </div>
                        <div className={styles.actionsRowWithMargin}>
                          <s-button
                            href={`/app/templates/${template.id}`}
                            variant="primary"
                            icon="edit"
                          >
                            Edit
                          </s-button>
                          <s-button
                            onClick={() => handleDuplicate(template.id)}
                            variant="secondary"
                            icon="duplicate"
                          >
                            Duplicate
                          </s-button>
                          <s-button
                            onClick={() => handleDelete(template.id)}
                            variant="critical"
                            icon="delete"
                            tone="critical"
                          >
                            Delete
                          </s-button>
                        </div>
                      </div>
                    </s-stack>
                    
                    {pendingActiveChanges[template.id] === false && template.isActive && (
                      <div className={styles.warningBannerContainer}>
                        <div className={styles.warningBannerWrapper}>
                          <s-banner tone="warning">
                            <div className={styles.warningBannerText}>
                              <s-text>
                                Setting this template to inactive will delete all its assignments (product, collection, and global) when you save.
                              </s-text>
                            </div>
                          </s-banner>
                        </div>
                      </div>
                    )}
                    
                    <div className={styles.assignmentSection}>
                      <TemplateAssignment
                        template={template}
                        products={products}
                        collections={collections}
                        shopify={shopify}
                        assignedCollections={assignedCollections}
                        assignedProducts={assignedProducts}
                        hasGlobalAssignment={hasGlobalAssignment}
                        globalAssignmentTemplateId={globalAssignmentTemplateId}
                        pendingActiveChanges={pendingActiveChanges}
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
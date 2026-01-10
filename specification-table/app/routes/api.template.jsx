import { getTemplateForTarget } from "../models/template.server.js";
import { getMetafieldDefinitions } from "../models/template.server.js";

/**
 * Endpoint API public pentru a obține template-ul pentru un produs sau colecție
 * Accesibil din theme extension prin request HTTP
 */
export async function loader({ request }) {
  const perfStart = performance.now();
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  // IMPORTANT: collectionId poate veni ca "null" (string) sau null (object)
  // Trebuie să normalizăm pentru a obține valoarea corectă
  let collectionId = url.searchParams.get("collectionId");
  if (collectionId === "null" || collectionId === "" || collectionId === null) {
    collectionId = null;
  }
  const shop = url.searchParams.get("shop");



  if (!shop) {
    return Response.json(
      { error: "Shop parameter is required" },
      { status: 400 }
    );
  }

  try {
    const queryStart = performance.now();

    const template = await getTemplateForTarget(shop, productId, collectionId);
    const queryTime = performance.now() - queryStart;


    if (!template) {
      return Response.json({ template: null });
    }

    // Verifică dacă template-ul are structura corectă
    if (!template.sections || !Array.isArray(template.sections)) {
      console.error("Template missing sections:", template);
      return Response.json({ template: null });
    }

    // Parse styling JSON
    const styling = typeof template.styling === "string" 
      ? JSON.parse(template.styling) 
      : template.styling;

    // Formatează secțiunile pentru a fi ușor de folosit în Liquid
    const sections = template.sections.map(section => ({
      heading: section.heading,
      metafields: section.metafields.map(mf => {

        
        return {
          namespace: mf.metafieldDefinition.namespace,
          key: mf.metafieldDefinition.key,
          ownerType: mf.metafieldDefinition.ownerType,
          name: mf.metafieldDefinition.name || null,
          type: mf.metafieldDefinition.type,
          customName: mf.customName || null,
          tooltipEnabled: mf.tooltipEnabled === true,
          tooltipText: mf.tooltipText || null,
          // Asigură-te că valorile sunt boolean, nu string sau undefined
          hideFromPC: mf.hideFromPC === true,
          hideFromMobile: mf.hideFromMobile === true,
          prefix: mf.prefix || null,
          suffix: mf.suffix || null,
        };
      }),
    }));

    // Obține toate metafield definitions din baza de date pentru a construi codul Liquid
    // Acestea sunt toate metafield-urile cunoscute (nu doar cele din template)
    const metafieldQueryStart = performance.now();
    const allMetafieldDefinitions = await getMetafieldDefinitions(shop);
    const metafieldQueryTime = performance.now() - metafieldQueryStart;
    
    // Colectează toate metafield-urile unice din template
    const uniqueTemplateMetafields = new Map();
    sections.forEach(section => {
      section.metafields.forEach(mf => {
        const key = `${mf.namespace}.${mf.key}.${mf.ownerType}`;
        if (!uniqueTemplateMetafields.has(key)) {
          uniqueTemplateMetafields.set(key, mf);
        }
      });
    });

    const processingStart = performance.now();
    const response = Response.json({
      template: {
        id: template.id,
        name: template.name,
        isAccordion: template.isAccordion,
        isAccordionHideFromPC: template.isAccordionHideFromPC === true,
        isAccordionHideFromMobile: template.isAccordionHideFromMobile === true,
        seeMoreEnabled: template.seeMoreEnabled || false,
        seeMoreHideFromPC: template.seeMoreHideFromPC === true,
        seeMoreHideFromMobile: template.seeMoreHideFromMobile === true,
        splitViewPerSection: template.splitViewPerSection === true,
        splitViewPerMetafield: template.splitViewPerMetafield === true,
        styling,
        sections,
      },
      // Returnează și toate metafield definitions pentru a construi codul Liquid dinamic
      allMetafieldDefinitions: allMetafieldDefinitions.map(mf => ({
        namespace: mf.namespace,
        key: mf.key,
        ownerType: mf.ownerType,
        name: mf.name,
        type: mf.type,
      })),
      // Performance metrics (doar în development)
      ...(process.env.NODE_ENV === "development" && {
        _perf: {
          query: queryTime.toFixed(2),
          metafieldQuery: metafieldQueryTime.toFixed(2),
          processing: (performance.now() - processingStart).toFixed(2),
          total: (performance.now() - perfStart).toFixed(2),
        },
      }),
    });

    const totalTime = performance.now() - perfStart;

    // Logging detaliat pentru performanță


    // Adaugă CORS headers pentru a permite request-uri din theme extension
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return response;
  } catch (error) {
    console.error("Error getting template:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function options() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
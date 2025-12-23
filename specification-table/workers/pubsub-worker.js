/**
 * Google Cloud Pub/Sub Worker pentru procesarea webhook-urilor cu debouncing
 * 
 * Acest worker:
 * 1. Primește mesaje din Pub/Sub
 * 2. Așteaptă 5 secunde pentru a vedea dacă mai apar webhook-uri pentru același shop+resource
 * 3. Procesează ultimul webhook pentru fiecare resource
 * 
 * Rulează pe Cloud Run sau Cloud Functions
 */
import "@shopify/shopify-api/adapters/node";
import "@shopify/shopify-app-react-router/adapters/node";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Încarcă variabilele de mediu din .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, ".."); // Root-ul proiectului (specification-table)

// Încearcă să încarce .env din root-ul proiectului
config({ path: resolve(projectRoot, ".env") });

import "@shopify/shopify-app-react-router/adapters/node";
import { PubSub } from "@google-cloud/pubsub";
import { syncSingleProduct, syncSingleCollection, syncSingleMetafieldDefinition, syncProducts, syncCollections, syncMetafieldDefinitions } from "../app/models/sync.server.js";
import { logWebhookEvent } from "../app/models/webhook-logger.server.js";
import prisma from "../app/db.server.js";
import { shopifyApi, ApiVersion, GraphqlClient } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

// ============================================================================
// CONFIGURARE - Variabile de mediu și setări
// ============================================================================
// Toate variabilele de configurare sunt definite aici pentru ușurința modificării.
// Poți seta aceste valori în fișierul .env sau ca variabile de mediu.

// ----------------------------------------------------------------------------
// Google Cloud Pub/Sub Configuration
// ----------------------------------------------------------------------------
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "shopify-webhooks-481708";
// Project ID pentru Google Cloud Pub/Sub

const topicName = process.env.PUBSUB_TOPIC_NAME || "shopify-webhook";
// Numele topic-ului Pub/Sub unde se publică webhook-urile (trebuie să fie același cu publisher-ul)

const subscriptionName = process.env.PUBSUB_SUBSCRIPTION_NAME || "shopify-webhook-subscription";
// Numele subscription-ului Pub/Sub din care worker-ul primește mesajele

// ----------------------------------------------------------------------------
// Webhook Processing Configuration
// ----------------------------------------------------------------------------
const debounceDelay = parseInt(process.env.WEBHOOK_DEBOUNCE_DELAY || "5000", 10);
// Delay-ul pentru debouncing în milisecunde (default: 5000ms = 5 secunde)
// Worker-ul așteaptă acest timp după primirea unui webhook pentru a vedea dacă mai apar webhook-uri
// pentru același resource. Dacă apar, procesează doar ultimul.

const WEBHOOK_PROCESSING_DELAY_MS = parseInt(process.env.WEBHOOK_PROCESSING_DELAY_MS || "50", 10);
// Delay opțional între procesări de webhook-uri în milisecunde (default: 0ms = fără delay)
// Pentru volume mari (ex: 5000+ produse), poți seta un delay mic (ex: 50-100ms) pentru a evita suprasolicitarea

// ----------------------------------------------------------------------------
// Shopify API Rate Limiting Configuration
// ----------------------------------------------------------------------------
const SHOPIFY_RATE_LIMIT_REQUESTS_PER_SECOND = parseFloat(process.env.SHOPIFY_RATE_LIMIT_RPS || "5");
// Numărul maxim de request-uri per secundă către Shopify API (default: 2 req/s)
// Shopify permite ~2 requests/second pentru shop-uri mici, ~40 requests/second pentru shop-uri mari
// Recomandăm 2 req/s pentru siguranță (evită rate limiting)
// Pentru shop-uri mari, poți crește la 10-20 req/s

const SHOPIFY_MIN_DELAY_MS = Math.ceil(1000 / SHOPIFY_RATE_LIMIT_REQUESTS_PER_SECOND);
// Delay minim calculat automat între request-uri (în milisecunde)
// Ex: pentru 2 req/s = 500ms, pentru 10 req/s = 100ms

// ----------------------------------------------------------------------------
// Retry Configuration (pentru rate limit errors)
// ----------------------------------------------------------------------------
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || "5", 10);
// Numărul maxim de încercări de retry pentru rate limit errors (default: 5)
// Dacă un request primește 429 (rate limit), worker-ul va reîncerca până la acest număr

const INITIAL_RETRY_DELAY_MS = parseInt(process.env.INITIAL_RETRY_DELAY_MS || "1000", 10);
// Delay inițial pentru retry în milisecunde (default: 1000ms = 1 secundă)
// Delay-ul crește exponențial: 1s, 2s, 4s, 8s, 16s...

const MAX_RETRY_DELAY_MS = parseInt(process.env.MAX_RETRY_DELAY_MS || "30000", 10);
// Delay maxim pentru retry în milisecunde (default: 30000ms = 30 secunde)
// Chiar dacă calculul exponențial ar da mai mult, delay-ul nu va depăși această valoare

// ----------------------------------------------------------------------------
// Reconciliation Job Configuration
// ----------------------------------------------------------------------------
const RECONCILIATION_CHECK_INTERVAL_MS = parseInt(process.env.RECONCILIATION_CHECK_INTERVAL_MS || "300000", 10);
// Interval-ul de verificare pentru reconciliation job în milisecunde (default: 300000ms = 5 minute)
// La fiecare acest interval, worker-ul verifică dacă există shop-uri eligibile pentru reconciliation

const RECONCILIATION_COOLDOWN_MS = parseInt(process.env.RECONCILIATION_COOLDOWN_MS || "14400000", 10);
// Cooldown-ul per shop pentru reconciliation în milisecunde (default: 14400000ms = 4 ore)
// Un shop este eligibil pentru reconciliation dacă:
// - Nu a fost reconciliat niciodată, SAU
// - A trecut cel puțin acest timp de la ultimul check
// Pentru testare, poți reduce la 60000ms (1 minut)

// ----------------------------------------------------------------------------
// Retry Job Configuration (pentru webhook-uri failed)
// ----------------------------------------------------------------------------
const WEBHOOK_RETRY_INTERVAL_MS = parseInt(process.env.WEBHOOK_RETRY_INTERVAL_MS || "300000", 10);
// Interval-ul pentru retry job în milisecunde (default: 600000ms = 10 minute)
// La fiecare acest interval, worker-ul verifică webhook-urile failed și le reîncearcă

// ----------------------------------------------------------------------------
// Internal State (nu se configurează)
// ----------------------------------------------------------------------------
// Rate limiter: tracking ultimelor request-uri per shop
const shopRateLimiters = new Map(); // Key: shop, Value: { lastRequestTime, requestCount, windowStart }

// Validează variabilele de mediu necesare pentru Shopify API
const requiredEnvVars = {
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error(`[worker] ❌ Missing required environment variables: ${missingVars.join(", ")}`);
  console.error(`[worker] Please set these variables before running the worker.`);
  console.error(`[worker] You can set them in your .env file or as system environment variables.`);
  console.error(`[worker] If using Shopify CLI, run: shopify app dev`);
  process.exit(1);
}

// Inițializează Shopify API (folosim shopifyApi cu adapter-ul deja importat)
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25, // Folosește aceeași versiune ca în shopify.server.js
  scopes: process.env.SCOPES?.split(",") || [],
  hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, "") || "",
  isEmbeddedApp: true,
});

/**
 * Rate limiter: așteaptă dacă este necesar pentru a respecta rate limit-ul
 */
async function waitForRateLimit(shop) {
  const now = Date.now();
  
  if (!shopRateLimiters.has(shop)) {
    shopRateLimiters.set(shop, {
      lastRequestTime: 0,
      requestCount: 0,
      windowStart: now,
    });
  }
  
  const limiter = shopRateLimiters.get(shop);
  
  // Reset counter dacă a trecut o secundă
  if (now - limiter.windowStart >= 1000) {
    limiter.requestCount = 0;
    limiter.windowStart = now;
  }
  
  // Calculează când a fost ultimul request
  const timeSinceLastRequest = now - limiter.lastRequestTime;
  
  // Dacă am făcut prea multe request-uri în ultima secundă, așteaptă
  if (limiter.requestCount >= SHOPIFY_RATE_LIMIT_REQUESTS_PER_SECOND) {
    const waitTime = 1000 - (now - limiter.windowStart);
    if (waitTime > 0) {
      console.log(`[rate-limit] Rate limit reached for ${shop}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Reset după așteptare
      limiter.requestCount = 0;
      limiter.windowStart = Date.now();
    }
  }
  
  // Așteaptă delay-ul minim între request-uri
  if (timeSinceLastRequest < SHOPIFY_MIN_DELAY_MS) {
    const waitTime = SHOPIFY_MIN_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Actualizează limiter-ul
  limiter.lastRequestTime = Date.now();
  limiter.requestCount++;
}

/**
 * Retry cu exponential backoff pentru rate limit errors (429)
 */
async function retryWithBackoff(fn, maxAttempts = MAX_RETRY_ATTEMPTS, attempt = 1) {
  try {
    return await fn();
  } catch (error) {
    // Verifică dacă este rate limit error (429) sau cost limit error
    const isRateLimitError = 
      error.statusCode === 429 ||
      error.code === 429 ||
      (error.message && (
        error.message.includes('429') ||
        error.message.includes('rate limit') ||
        error.message.includes('Throttled') ||
        error.message.includes('Cost limit')
      ));
    
    if (isRateLimitError && attempt < maxAttempts) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
      const delay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
        MAX_RETRY_DELAY_MS
      );
      
      console.log(`[rate-limit] Rate limit error (429) for attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return retryWithBackoff(fn, maxAttempts, attempt + 1);
    }
    
    // Dacă nu este rate limit error sau am depășit max attempts, aruncă eroarea
    throw error;
  }
}

// Helper pentru a crea admin client din session
function createAdminClient(session) {
  // shopifyApi expune clients.Graphql ca class constructor
  // Trebuie să folosim `new` pentru a crea instanța
  const sessionObj = {
    shop: session.shop,
    accessToken: session.accessToken,
  };
  
  console.log(`[worker] Creating GraphQL client for shop: ${session.shop}`);
  
  // shopifyApi.clients.Graphql este o clasă, trebuie folosit `new`
  // Verifică dacă există clients
  if (!shopify.clients || !shopify.clients.Graphql) {
    throw new Error(`shopify.clients.Graphql is not available. shopify.clients:`, Object.keys(shopify.clients || {}));
  }
  
  const graphqlClient = new shopify.clients.Graphql({ session: sessionObj });
  
  // Client-ul din shopifyApi nu are metoda `graphql` direct, ci folosește `request`
  // Creăm un wrapper care expune metoda `graphql` pentru compatibilitate cu funcțiile existente
  // ADĂUGĂM rate limiting și retry logic aici
  const admin = {
    graphql: async (query, options = {}) => {
      const { variables } = options;
      
      // Rate limiting: așteaptă dacă este necesar
      await waitForRateLimit(session.shop);
      
      // Retry cu exponential backoff pentru rate limit errors
      return await retryWithBackoff(async () => {
        // Folosim client.request pentru a face query-ul GraphQL
        const response = await graphqlClient.request(query, { variables });
        
        // Returnează un obiect cu metoda json() pentru compatibilitate
        return {
          json: async () => response,
        };
      });
    },
  };
  
  console.log(`[worker] GraphQL client wrapper created with rate limiting (${SHOPIFY_RATE_LIMIT_REQUESTS_PER_SECOND} req/s)`);
  
  return admin;
}

// Map pentru a stoca webhook-urile în așteptare (pentru debouncing)
// Key: `${shop}-${resourceType}-${resourceId}`
// Value: { message, ackDeadline, timer }
const pendingWebhooks = new Map();

/**
 * Extrage resource ID și tipul din payload
 */
function extractResourceInfo(topic, payload) {
  // Simplificăm logica - recunoaștem direct topic-urile
  const topicUpper = topic.toUpperCase();
  
  console.log(`[worker] extractResourceInfo - topic: ${topic}, topicUpper: ${topicUpper}`);
  
  let resourceType = null;
  let action = null;
  let resourceId = null;
  
  // Metafield definitions - tratăm direct (verificăm exact match-ul primul)
  if (topicUpper === "METAFIELD_DEFINITIONS_CREATE" || topicUpper.includes("METAFIELD_DEFINITIONS_CREATE")) {
    resourceType = "metafield_definitions";
    action = "create";
    resourceId = payload?.id || payload?.admin_graphql_api_id;
    console.log(`[worker] Matched METAFIELD_DEFINITIONS_CREATE`);
  } else if (topicUpper === "METAFIELD_DEFINITIONS_UPDATE" || topicUpper.includes("METAFIELD_DEFINITIONS_UPDATE")) {
    resourceType = "metafield_definitions";
    action = "update";
    resourceId = payload?.id || payload?.admin_graphql_api_id;
    console.log(`[worker] Matched METAFIELD_DEFINITIONS_UPDATE`);
  } else if (topicUpper === "METAFIELD_DEFINITIONS_DELETE" || topicUpper.includes("METAFIELD_DEFINITIONS_DELETE")) {
    resourceType = "metafield_definitions";
    action = "delete";
    resourceId = payload?.id || payload?.admin_graphql_api_id;
    console.log(`[worker] Matched METAFIELD_DEFINITIONS_DELETE`);
  }
  // Products delete
  else if (topicUpper === "PRODUCTS_DELETE" || topicUpper.includes("PRODUCTS_DELETE")) {
    resourceType = "products";
    action = "delete";
    resourceId = payload?.admin_graphql_api_id || payload?.id;
  }
  // Collections delete
  else if (topicUpper === "COLLECTIONS_DELETE" || topicUpper.includes("COLLECTIONS_DELETE")) {
    resourceType = "collections";
    action = "delete";
    resourceId = payload?.admin_graphql_api_id || payload?.id;
  }
  // App events
  else if (topicUpper.startsWith("APP_")) {
    resourceType = "app";
    action = topicUpper.replace("APP_", "").toLowerCase();
    resourceId = "app";
  }
  // Fallback pentru alte formate (products/create, etc.)
  else {
    let normalizedTopic = topic.toLowerCase();
    if (normalizedTopic.includes("_")) {
      normalizedTopic = normalizedTopic.replace(/_/g, "/");
    }
    
    const topicParts = normalizedTopic.split("/");
    resourceType = topicParts[0];
    action = topicParts[1];
    
    if (resourceType === "products") {
      resourceId = payload?.admin_graphql_api_id || payload?.id;
    } else if (resourceType === "collections") {
      resourceId = payload?.admin_graphql_api_id || payload?.id;
    } else if (resourceType === "app") {
      resourceId = "app";
    }
  }
  
  console.log(`[worker] extractResourceInfo:`, { 
    originalTopic: topic, 
    resourceType, 
    action, 
    resourceId,
    payloadKeys: Object.keys(payload || {})
  });
  
  return { resourceType, action, resourceId };
}

/**
 * Procesează un webhook
 */
async function processWebhook(shop, topic, payload) {
  console.log(`[worker] Processing webhook: ${topic} for ${shop}`);
  console.log(`[worker] Payload preview:`, {
    hasPayload: !!payload,
    payloadType: typeof payload,
    admin_graphql_api_id: payload?.admin_graphql_api_id,
    id: payload?.id,
  });
  
  try {
    // Obține session și admin pentru shop
    // Notă: În worker, trebuie să obținem session-ul din DB
    const session = await prisma.session.findFirst({
      where: { shop },
      orderBy: { expires: "desc" },
    });
    
    if (!session || !session.accessToken) {
      console.error(`[worker] No valid session found for shop ${shop}`);
      throw new Error(`No valid session for shop ${shop}`);
    }
    
    console.log(`[worker] Found session for shop ${shop}, creating admin client...`);
    
    // Creează admin GraphQL client folosind session-ul din DB
    const admin = createAdminClient(session);
    console.log(`[worker] Admin client created successfully`);
    
    const { resourceType, action, resourceId } = extractResourceInfo(topic, payload);
    
    console.log(`[worker] Extracted resource info:`, { resourceType, action, resourceId, topic });
    
    // Procesează webhook-ul bazat pe tip
    if (resourceType === "products") {
      if (action === "delete") {
        // Handle delete
        // Pentru delete, payload-ul poate conține doar `id` (numeric), nu `admin_graphql_api_id`
        // Încercăm să extragem ID-ul din payload direct dacă resourceId nu este disponibil
        let productId = resourceId;
        if (!productId && payload) {
          productId = payload.id || payload.admin_graphql_api_id;
        }
        
        if (!productId) {
          const errorMsg = `No productId found for delete action. Payload keys: ${Object.keys(payload || {}).join(", ")}`;
          console.error(`[worker] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.log(`[worker] Deleting product: ${productId} for shop: ${shop}`);
        
        // Obține shop-ul pentru a avea shopId
        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
          select: { id: true },
        });
        
        if (!shopRecord) {
          const errorMsg = `Shop not found: ${shop}`;
          console.error(`[worker] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Convertim ID-ul în string pentru a putea lucra cu el
        const productIdStr = String(productId);
        
        // Construim GID-ul: gid://shopify/Product/7734681239603
        const productGid = `gid://shopify/Product/${productIdStr}`;
        
        // Ștergem folosind OR pentru a încerca ambele formate (GID și numeric ca string)
        const deleted = await prisma.product.deleteMany({
          where: {
            shopId: shopRecord.id,
            OR: [
              { shopifyId: productGid },
              { shopifyId: productIdStr },
              { shopifyId: { contains: productIdStr } },
            ],
          },
        });
        
        // Ștergem și din tabelele asociate
        if (deleted.count > 0) {
          // Ștergem din TemplateLookup (doar dacă produsul are template direct asignat)
          // NOTĂ: Nu mai ștergem produsele din colecții - acestea nu mai sunt stocate în TemplateLookup
          await prisma.templateLookup.deleteMany({
            where: {
              shopId: shopRecord.id,
              productId: productIdStr,
            },
          });
          
          // Ștergem din TemplateAssignmentTarget
          await prisma.templateAssignmentTarget.deleteMany({
            where: {
              targetShopifyId: productIdStr,
              targetType: "PRODUCT",
            },
          });
        }
        
        console.log(`[worker] Deleted ${deleted.count} product(s) and related records`);
      } else {
        // Create/Update
        if (resourceId) {
          console.log(`[worker] Syncing product: ${resourceId} for shop: ${shop}`);
          const result = await syncSingleProduct(admin, shop, resourceId);
          console.log(`[worker] Successfully synced product: ${resourceId}`, result);
        } else {
          console.warn(`[worker] No resourceId found for product ${action}, skipping sync`);
          console.log(`[worker] Payload keys:`, Object.keys(payload || {}));
        }
      }
    } else if (resourceType === "collections") {
      if (action === "delete") {
        // Handle delete
        // Pentru delete, payload-ul poate conține doar `id` (numeric), nu `admin_graphql_api_id`
        // Încercăm să extragem ID-ul din payload direct dacă resourceId nu este disponibil
        let collectionId = resourceId;
        if (!collectionId && payload) {
          collectionId = payload.id || payload.admin_graphql_api_id;
        }
        
        if (!collectionId) {
          const errorMsg = `No collectionId found for delete action. Payload keys: ${Object.keys(payload || {}).join(", ")}`;
          console.error(`[worker] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.log(`[worker] Deleting collection: ${collectionId} for shop: ${shop}`);
        
        // Obține shop-ul pentru a avea shopId
        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
          select: { id: true },
        });
        
        if (!shopRecord) {
          const errorMsg = `Shop not found: ${shop}`;
          console.error(`[worker] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Convertim ID-ul în string pentru a putea lucra cu el
        const collectionIdStr = String(collectionId);
        
        // Construim GID-ul: gid://shopify/Collection/7734681239603
        const collectionGid = `gid://shopify/Collection/${collectionIdStr}`;
        
        // Ștergem folosind OR pentru a încerca ambele formate (GID și numeric ca string)
        const deleted = await prisma.collection.deleteMany({
          where: {
            shopId: shopRecord.id,
            OR: [
              { shopifyId: collectionGid },
              { shopifyId: collectionIdStr },
              { shopifyId: { contains: collectionIdStr } },
            ],
          },
        });
        
        // Ștergem și din tabelele asociate
        if (deleted.count > 0) {
          // Ștergem din TemplateLookup
          await prisma.templateLookup.deleteMany({
            where: {
              shopId: shopRecord.id,
              collectionId: collectionIdStr,
            },
          });
          
          // Ștergem din TemplateAssignmentTarget
          await prisma.templateAssignmentTarget.deleteMany({
            where: {
              targetShopifyId: collectionIdStr,
              targetType: "COLLECTION",
            },
          });
        }
        
        console.log(`[worker] Deleted ${deleted.count} collection(s) and related records`);
      } else {
        // Create/Update
        if (resourceId) {
          console.log(`[worker] Syncing collection: ${resourceId} for shop: ${shop}`);
          const result = await syncSingleCollection(admin, shop, resourceId);
          console.log(`[worker] Successfully synced collection: ${resourceId}`, result);
        } else {
          console.warn(`[worker] No resourceId found for collection ${action}, skipping sync`);
          console.log(`[worker] Payload keys:`, Object.keys(payload || {}));
        }
      }
    } else if (resourceType === "metafield_definitions") {
      if (action === "delete") {
        // Handle delete
        // Pentru delete, trebuie să obținem namespace, key și ownerType din payload sau să facem query GraphQL
        const definitionId = resourceId || payload?.id || payload?.admin_graphql_api_id;
        if (!definitionId) {
          const errorMsg = `No definitionId found for delete action. Payload keys: ${Object.keys(payload || {}).join(", ")}`;
          console.error(`[worker] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        console.log(`[worker] Deleting metafield definition: ${definitionId} for shop: ${shop}`);
        
        // Obține shop-ul pentru a avea shopId
        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
          select: { id: true },
        });
        
        if (!shopRecord) {
          throw new Error(`Shop not found: ${shop}`);
        }
        
        // Pentru delete, trebuie să ștergem folosind namespace, key, ownerType și shopId
        // Dar nu avem aceste date direct în payload pentru delete
        // Trebuie să facem query GraphQL pentru a obține datele sau să le extragem din payload dacă există
        if (payload?.namespace && payload?.key && payload?.owner_type) {
          // Normalizează ownerType
          const normalizedOwnerType = 
            payload.owner_type === "PRODUCT_VARIANT" || payload.owner_type === "PRODUCTVARIANT"
              ? "VARIANT"
              : payload.owner_type;
          
          const deleted = await prisma.metafieldDefinition.deleteMany({
            where: {
              namespace: payload.namespace,
              key: payload.key,
              ownerType: normalizedOwnerType,
              shopId: shopRecord.id,
            },
          });
          console.log(`[worker] Deleted ${deleted.count} metafield definition(s) using namespace/key/ownerType`);
        } else {
          // Dacă nu avem namespace/key în payload, facem query GraphQL pentru a le obține
          // Construim GID-ul dacă nu este deja în format GID
          const definitionGid = definitionId.toString().startsWith('gid://') 
            ? definitionId 
            : `gid://shopify/MetafieldDefinition/${definitionId}`;
          
          console.log(`[worker] Fetching metafield definition for delete using GID: ${definitionGid}`);
          
          const query = `
            query GetMetafieldDefinitionById($id: ID!) {
              metafieldDefinition(id: $id) {
                id
                namespace
                key
                ownerType
              }
            }
          `;
          
          const response = await admin.graphql(query, { variables: { id: definitionGid } });
          const data = await response.json();
          
          if (data.errors) {
            console.error(`[worker] GraphQL errors:`, data.errors);
            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
          }
          
          if (data.data?.metafieldDefinition) {
            const def = data.data.metafieldDefinition;
            const normalizedOwnerType = 
              def.ownerType === "PRODUCT_VARIANT" || def.ownerType === "PRODUCTVARIANT"
                ? "VARIANT"
                : def.ownerType;
            
            console.log(`[worker] Deleting metafield definition:`, {
              namespace: def.namespace,
              key: def.key,
              ownerType: normalizedOwnerType
            });
            
            const deleted = await prisma.metafieldDefinition.deleteMany({
              where: {
                namespace: def.namespace,
                key: def.key,
                ownerType: normalizedOwnerType,
                shopId: shopRecord.id,
              },
            });
            console.log(`[worker] Deleted ${deleted.count} metafield definition(s) using GraphQL query`);
          } else {
            console.warn(`[worker] Metafield definition not found in Shopify: ${definitionId}`, data);
          }
        }
      } else {
        // Create/Update - simplificat
        if (payload) {
          console.log(`[worker] Processing metafield definition ${action} for shop: ${shop}`);
          
          // Payload-ul din webhook conține direct toate datele necesare
          // Conform documentației Shopify, webhook-ul pentru metafield definitions trimite:
          // - namespace
          // - key
          // - name
          // - owner_type (nu ownerType)
          // - type_name (nu type.name)
          // - id
          
          console.log(`[worker] Payload received:`, {
            namespace: payload.namespace,
            key: payload.key,
            name: payload.name,
            owner_type: payload.owner_type,
            type_name: payload.type_name,
            id: payload.id
          });
          
          // Verifică dacă avem toate datele necesare direct din payload
          if (payload.namespace && payload.key && payload.owner_type) {
            // Avem toate datele necesare din payload - folosim direct
            const metafieldDefinitionData = {
              namespace: payload.namespace,
              key: payload.key,
              name: payload.name || null,
              ownerType: payload.owner_type, // Webhook-ul trimite owner_type
              type: payload.type_name, // Webhook-ul trimite type_name
            };
            
            console.log(`[worker] Using payload data directly:`, metafieldDefinitionData);
            
            const result = await syncSingleMetafieldDefinition(admin, shop, metafieldDefinitionData);
            console.log(`[worker] Successfully synced metafield definition from payload`, result);
          } else {
            // Dacă nu avem toate datele, facem query GraphQL folosind ID-ul
            const definitionId = resourceId || payload?.id;
            if (definitionId) {
              console.log(`[worker] Fetching metafield definition data from GraphQL: ${definitionId}`);
              
              // Construim GID-ul dacă nu este deja în format GID
              const definitionGid = definitionId.toString().startsWith('gid://') 
                ? definitionId 
                : `gid://shopify/MetafieldDefinition/${definitionId}`;
              
              console.log(`[worker] Using GID: ${definitionGid}`);
              
              // Folosim query-ul corect conform documentației Shopify
              const query = `
                query GetMetafieldDefinitionById($id: ID!) {
                  metafieldDefinition(id: $id) {
                    id
                    name
                    namespace
                    key
                    type {
                      name
                    }
                    ownerType
                  }
                }
              `;
              
              const response = await admin.graphql(query, { variables: { id: definitionGid } });
              const data = await response.json();
              
              if (data.errors) {
                console.error(`[worker] GraphQL errors:`, data.errors);
                throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
              }
              
              if (data.data?.metafieldDefinition) {
                const def = data.data.metafieldDefinition;
                const metafieldDefinitionData = {
                  namespace: def.namespace,
                  key: def.key,
                  name: def.name || null,
                  ownerType: def.ownerType,
                  type: def.type?.name || def.type,
                };
                
                console.log(`[worker] Extracted from GraphQL:`, metafieldDefinitionData);
                
                const result = await syncSingleMetafieldDefinition(admin, shop, metafieldDefinitionData);
                console.log(`[worker] Successfully synced metafield definition from GraphQL`, result);
              } else {
                console.error(`[worker] Metafield definition not found in GraphQL response:`, data);
                throw new Error(`Metafield definition not found: ${definitionId}`);
              }
            } else {
              throw new Error(`No definitionId found in payload. Payload keys: ${Object.keys(payload).join(", ")}`);
            }
          }
        } else {
          console.warn(`[worker] No payload found for metafield definition ${action}, skipping sync`);
        }
      }
    } else {
      console.warn(`[worker] Unknown resource type: ${resourceType}, skipping processing`);
    }
    
    // Log success
    await logWebhookEvent(shop, topic, "success", null, { resourceId }, 0);
    console.log(`[worker] Successfully processed webhook: ${topic} for ${shop}`);
    
  } catch (error) {
    console.error(`[worker] Error processing webhook ${topic} for ${shop}:`, error);
    // Log error cu retryCount = 0 (prima încercare)
    await logWebhookEvent(shop, topic, "error", error.message, payload, 0, 0);
    throw error;
  }
}

/**
 * Procesează un mesaj cu debouncing
 */
function processMessageWithDebounce(message) {
  // Parsează mesajul din Pub/Sub
  let data;
  try {
    // Mesajul poate fi JSON string sau Buffer
    if (message.data) {
      // Dacă este Buffer, convertește-l la string și apoi parsează JSON
      const messageData = message.data.toString('utf8');
      data = JSON.parse(messageData);
    } else if (message.json) {
      // Dacă este deja un obiect JSON
      data = message.json;
    } else {
      console.error(`[worker] Message format not recognized:`, message);
      message.ack(); // Acknowledge mesajul invalid pentru a nu-l retrimite
      return;
    }
  } catch (error) {
    console.error(`[worker] Error parsing message:`, error);
    console.error(`[worker] Message data:`, message.data);
    message.ack(); // Acknowledge mesajul invalid
    return;
  }
  
  const { shop, topic, payload, webhookId } = data;
  
  const { resourceType, action, resourceId } = extractResourceInfo(topic, payload);
  const debounceKey = `${shop}-${resourceType}-${resourceId || "app"}`;
  
  // Pentru metafield_definitions, nu anulăm CREATE-ul când vine UPDATE-ul
  // pentru că CREATE-ul trebuie să fie procesat primul (să insereze în DB)
  // și apoi UPDATE-ul să actualizeze
  if (pendingWebhooks.has(debounceKey) && resourceType === "metafield_definitions") {
    const existing = pendingWebhooks.get(debounceKey);
    const existingAction = existing.action;
    
    // Dacă există un CREATE în așteptare și vine un UPDATE, procesăm CREATE-ul imediat
    // și apoi procesăm UPDATE-ul
    if (existingAction === "create" && action === "update") {
      console.log(`[worker] CREATE pending, processing it immediately before UPDATE`);
      clearTimeout(existing.timer);
      
      // Procesează CREATE-ul imediat
      (async () => {
        try {
          await processWebhook(shop, existing.topic, existing.payload);
          existing.message.ack();
          console.log(`[worker] Processed CREATE immediately`);
        } catch (error) {
          console.error(`[worker] Error processing CREATE immediately:`, error);
          existing.message.ack(); // Ack chiar și în caz de eroare pentru a evita loop-uri
        }
      })();
      
      // Continuă cu procesarea UPDATE-ului normal (cu debouncing)
    } else if (existingAction === action) {
      // Dacă acțiunea este aceeași (de ex. două UPDATE-uri), anulează pe cel vechi
      clearTimeout(existing.timer);
      existing.message.ack();
      console.log(`[worker] Cancelled previous ${action} webhook for ${debounceKey}, processing new one`);
    }
  } else if (pendingWebhooks.has(debounceKey)) {
    // Pentru alte resource types, comportamentul normal (anulează pe cel vechi)
    const existing = pendingWebhooks.get(debounceKey);
    clearTimeout(existing.timer);
    existing.message.ack();
    console.log(`[worker] Cancelled previous webhook for ${debounceKey}, processing new one`);
  }
  
  // NOTĂ: Nu extindem ack deadline-ul - lăsăm mesajul să expire natural
  // Dacă mesajul expiră înainte să fie procesat, Pub/Sub îl va retrimite automat
  // Ack deadline-ul default este 60 secunde, care este suficient pentru debouncing de 5 secunde
  
  // Creează un timer nou
  const timer = setTimeout(async () => {
    try {
      console.log(`[worker] Processing debounced webhook: ${debounceKey}`);
      
      // Throttling: așteaptă un delay opțional între procesări (pentru volume mari)
      if (WEBHOOK_PROCESSING_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, WEBHOOK_PROCESSING_DELAY_MS));
      }
      
      await processWebhook(shop, topic, payload);
      message.ack(); // Acknowledge mesajul după procesare cu succes
      console.log(`[worker] Successfully processed and acknowledged: ${debounceKey}`);
      pendingWebhooks.delete(debounceKey);
    } catch (error) {
      console.error(`[worker] Error in debounced processing for ${debounceKey}:`, error);
      console.error(`[worker] Error stack:`, error.stack);
      
      // Pentru a evita loop-uri infinite, facem ack chiar și în caz de eroare
      // Eroarea este deja logată și poate fi investigată ulterior
      // Dacă este o eroare critică, va trebui să o rezolvăm manual sau să facem retry manual
      try {
        message.ack();
        console.log(`[worker] Acknowledged message despite error to prevent infinite loop: ${debounceKey}`);
      } catch (ackError) {
        console.error(`[worker] Error acknowledging message:`, ackError);
      }
      
      pendingWebhooks.delete(debounceKey);
    }
  }, debounceDelay);
  
  // Stochează mesajul, timer-ul și acțiunea pentru a putea face logica specială
  pendingWebhooks.set(debounceKey, {
    message,
    timer,
    timestamp: Date.now(),
    topic,
    payload,
    action,
  });
  
  console.log(`[worker] Queued webhook for debouncing: ${debounceKey} (will process in ${debounceDelay}ms)`);
}

/**
 * Main worker function
 */
export async function startWorker() {
  console.log(`[worker] ========================================`);
  console.log(`[worker] Starting Pub/Sub worker...`);
  console.log(`[worker] Project ID: ${projectId}`);
  console.log(`[worker] Subscription: ${subscriptionName}`);
  console.log(`[worker] Debounce delay: ${debounceDelay}ms`);
  console.log(`[worker] ========================================`);
  
  // Inițializează Pub/Sub client cu credentials
  let pubsub;
  try {
    // Caută service account key
    let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) {
      const fs = await import("fs");
      const path = await import("path");
      const projectRoot = process.cwd();
      const files = fs.readdirSync(projectRoot);
      const keyFile = files.find(file => 
        file.startsWith("shopify-webhooks-") && file.endsWith(".json")
      );
      if (keyFile) {
        keyPath = path.join(projectRoot, keyFile);
        console.log(`[worker] Found service account key: ${keyFile}`);
      }
    }
    
    pubsub = keyPath 
      ? new PubSub({ projectId, keyFilename: keyPath })
      : new PubSub({ projectId });
  } catch (error) {
    console.error(`[worker] Error initializing Pub/Sub client:`, error);
    throw error;
  }
  
  // topicName este definit la începutul scriptului
  const topic = pubsub.topic(topicName);
  
  // Verifică dacă topic-ul există, dacă nu, îl creează
  const [topicExists] = await topic.exists();
  if (!topicExists) {
    try {
      await topic.create();
      console.log(`[worker] Created topic: ${topicName}`);
    } catch (error) {
      if (error.code !== 6) { // 6 = ALREADY_EXISTS
        throw error;
      }
      console.log(`[worker] Topic ${topicName} already exists`);
    }
  }
  
  // Creează subscription-ul prin topic (nu direct)
  const subscription = topic.subscription(subscriptionName);
  const [subscriptionExists] = await subscription.exists();
  
  if (!subscriptionExists) {
    try {
      await subscription.create({
        ackDeadlineSeconds: 60,
        messageRetentionDuration: { seconds: 604800 }, // 7 zile
      });
      console.log(`[worker] Created subscription: ${subscriptionName}`);
    } catch (error) {
      if (error.code !== 6) { // 6 = ALREADY_EXISTS
        throw error;
      }
      console.log(`[worker] Subscription ${subscriptionName} already exists`);
    }
  } else {
    console.log(`[worker] Subscription ${subscriptionName} already exists`);
  }
  
  // Setează message handler
  subscription.on("message", (message) => {
    console.log(`[worker] Received message:`, message.id);
    processMessageWithDebounce(message);
  });
  
  subscription.on("error", (error) => {
    console.error(`[worker] Subscription error:`, error);
  });
  
  console.log(`[worker] Worker started and listening for messages...`);
  
  // Pornește reconciliation job-ul (rulează la fiecare 5 minute)
  startReconciliationJob();
  
  // Pornește retry job-ul pentru webhook-urile failed (rulează la fiecare 10 minute)
  startRetryJob();
}

/**
 * Obține count-urile din Shopify pentru un shop
 */
/**
 * Obține count-urile din Shopify pentru un shop
 * NOUA LOGICĂ: Doar metafield definitions (nu mai facem reconciliation pentru products/collections)
 */
async function getShopifyCounts(admin) {
  const counts = {
    productMetafields: null,
    variantMetafields: null,
  };
  
  try {
    // Count metafield definitions (PRODUCT)
    counts.productMetafields = await countMetafieldDefinitions(admin, "PRODUCT");
    
    // Count metafield definitions (PRODUCTVARIANT)
    counts.variantMetafields = await countMetafieldDefinitions(admin, "PRODUCTVARIANT");
  } catch (error) {
    console.error(`[reconciliation] Error fetching Shopify counts:`, error);
  }
  
  return counts;
}

/**
 * Count metafield definitions by iterating through pages
 */
async function countMetafieldDefinitions(admin, ownerType) {
  let totalCount = 0;
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query getMetafieldDefinitions($cursor: String) {
        metafieldDefinitions(first: 250, after: $cursor, ownerType: ${ownerType}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
          }
        }
      }
    `;

    const variables = cursor ? { cursor } : {};
    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error(`[reconciliation] Error counting metafield definitions:`, data.errors);
      return null;
    }

    const definitions = data.data.metafieldDefinitions.nodes;
    const pageInfo = data.data.metafieldDefinitions.pageInfo;

    totalCount += definitions.length;
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return totalCount;
}

/**
 * Obține count-urile din App DB pentru un shop
 */
async function getAppCounts(shopId) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      _count: {
        select: {
          metafieldDefinitions: {
            where: {
              ownerType: "PRODUCT",
            },
          },
        },
      },
    },
  });
  
  if (!shop) {
    return null;
  }
  
  const variantMetafieldsCount = await prisma.metafieldDefinition.count({
    where: {
      shopId: shop.id,
      ownerType: "VARIANT",
    },
  });
  
  return {
    productMetafields: shop._count.metafieldDefinitions || 0,
    variantMetafields: variantMetafieldsCount || 0,
  };
}

/**
 * Actualizează SyncStatus pentru un shop
 * NOTĂ: Nu actualizează lastShopifyCheckAt aici - se face doar după reconciliation reușit
 */
async function updateSyncStatus(shopId, appCounts, shopifyCounts, updateLastCheck = false) {
  const mismatchDetails = [];
  let lastComparisonOk = true;
  
  // NOUA LOGICĂ: Doar metafield definitions (nu mai verificăm products/collections)
  if (appCounts.productMetafields !== shopifyCounts.productMetafields) {
    mismatchDetails.push(`ProductMetafields: App=${appCounts.productMetafields}, Shopify=${shopifyCounts.productMetafields}`);
    lastComparisonOk = false;
  }
  if (appCounts.variantMetafields !== shopifyCounts.variantMetafields) {
    mismatchDetails.push(`VariantMetafields: App=${appCounts.variantMetafields}, Shopify=${shopifyCounts.variantMetafields}`);
    lastComparisonOk = false;
  }
  
  const updateData = {
    appProductMetafields: appCounts.productMetafields,
    appVariantMetafields: appCounts.variantMetafields,
    shopifyProductMetafields: shopifyCounts.productMetafields,
    shopifyVariantMetafields: shopifyCounts.variantMetafields,
    lastAppUpdateAt: new Date(),
    lastComparisonOk,
    lastMismatchDetails: mismatchDetails.length > 0 ? mismatchDetails.join("; ") : null,
  };
  
  // Actualizează lastShopifyCheckAt doar dacă este explicit solicitat (după reconciliation reușit)
  if (updateLastCheck) {
    updateData.lastShopifyCheckAt = new Date();
  }
  
  await prisma.syncStatus.upsert({
    where: { shopId },
    update: updateData,
    create: {
      shopId,
      ...updateData,
      // Pentru create, setăm lastShopifyCheckAt doar dacă updateLastCheck este true
      lastShopifyCheckAt: updateLastCheck ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  return { lastComparisonOk, mismatchDetails };
}

/**
 * Face delta sync pentru un shop dacă există mismatch
 * Folosește sync incremental bazat pe updated_at pentru a economisi resurse
 */
async function performDeltaSync(admin, shopDomain, mismatchDetails, shopId) {
  console.log(`[reconciliation] Performing delta sync for ${shopDomain} due to mismatches`);
  
  // Obține SyncStatus pentru a determina data ultimului sync
  const syncStatus = await prisma.syncStatus.findUnique({
    where: { shopId },
    select: {
      lastFullSyncAt: true,
      lastShopifyCheckAt: true,
    },
  });
  
  // Folosim lastFullSyncAt dacă există, altfel lastShopifyCheckAt, altfel null (sync complet)
  const lastSyncDate = syncStatus?.lastFullSyncAt || syncStatus?.lastShopifyCheckAt;
  const updatedAfter = lastSyncDate ? lastSyncDate.toISOString() : null;
  
  if (updatedAfter) {
    console.log(`[reconciliation] Using incremental sync from ${updatedAfter}`);
  } else {
    console.log(`[reconciliation] No previous sync date found, performing full sync`);
  }
  
  // NOUA LOGICĂ: Doar metafield definitions (nu mai facem sync pentru products/collections)
  // Dacă există mismatch la metafield-uri, sincronizează metafield-urile
  // NOTĂ: Shopify nu suportă `updatedAt` pentru metafield definitions în GraphQL API,
  // deci facem întotdeauna sync complet (toate metafield-urile), indiferent de `updatedAfter`
  if (mismatchDetails.some(d => d.includes("Metafields"))) {
    console.log(`[reconciliation] Syncing metafield definitions for ${shopDomain} (full sync - Shopify doesn't support updatedAt for metafield definitions)`);
    try {
      // Parametrul updatedAfter este ignorat pentru metafield definitions
      await syncMetafieldDefinitions(admin, shopDomain, null);
      // Actualizează lastFullSyncAt după sync reușit
      await prisma.syncStatus.update({
        where: { shopId },
        data: { lastFullSyncAt: new Date() },
      });
      console.log(`[reconciliation] Metafield definitions sync completed, updated lastFullSyncAt`);
    } catch (error) {
      console.error(`[reconciliation] Error syncing metafield definitions:`, error);
    }
  }
}

/**
 * Rulează reconciliation pentru un shop
 */
async function reconcileShop(shopDomain) {
  console.log(`[reconciliation] Starting reconciliation for shop: ${shopDomain}`);
  
  try {
    // Obține session-ul pentru shop
    const session = await prisma.session.findFirst({
      where: { shop: shopDomain },
      orderBy: { expires: "desc" },
    });
    
    if (!session || !session.accessToken) {
      console.warn(`[reconciliation] No valid session found for shop ${shopDomain}, skipping`);
      return;
    }
    
    // Creează admin client
    const admin = createAdminClient(session);
    
    // Obține shop-ul din DB
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });
    
    if (!shop) {
      console.warn(`[reconciliation] Shop not found in DB: ${shopDomain}, skipping`);
      return;
    }
    
    // Obține count-urile
    const appCounts = await getAppCounts(shop.id);
    const shopifyCounts = await getShopifyCounts(admin);
    
    if (!appCounts) {
      console.warn(`[reconciliation] Could not get app counts for shop ${shopDomain}`);
      return;
    }
    
    // Actualizează SyncStatus (fără actualizarea lastShopifyCheckAt - o facem doar la succes)
    const { lastComparisonOk, mismatchDetails } = await updateSyncStatus(
      shop.id,
      appCounts,
      shopifyCounts,
      false // Nu actualizăm lastShopifyCheckAt încă
    );
    
    console.log(`[reconciliation] App counts:`, JSON.stringify(appCounts, null, 2));
    console.log(`[reconciliation] Shopify counts:`, JSON.stringify(shopifyCounts, null, 2));
    console.log(`[reconciliation] Last comparison OK:`, lastComparisonOk);
    if (mismatchDetails.length > 0) {
      console.log(`[reconciliation] Mismatches:`, mismatchDetails);
    } else {
      console.log(`[reconciliation] No mismatches detected, all counts match`);
    }
    
    // Dacă există mismatch, face delta sync
    if (!lastComparisonOk && mismatchDetails.length > 0) {
      console.log(`[reconciliation] Mismatch detected for ${shopDomain}, performing delta sync`);
      await performDeltaSync(admin, shopDomain, mismatchDetails, shop.id);
      
      // Re-verifică după sync
      const newAppCounts = await getAppCounts(shop.id);
      const newShopifyCounts = await getShopifyCounts(admin);
      console.log(`[reconciliation] After sync - App counts:`, JSON.stringify(newAppCounts, null, 2));
      console.log(`[reconciliation] After sync - Shopify counts:`, JSON.stringify(newShopifyCounts, null, 2));
      await updateSyncStatus(shop.id, newAppCounts, newShopifyCounts, false);
    }
    
    // Actualizează lastShopifyCheckAt doar după ce reconciliation-ul a reușit complet
    // (chiar dacă a existat mismatch și s-a făcut delta sync, considerăm că reconciliation-ul a reușit)
    await prisma.syncStatus.update({
      where: { shopId: shop.id },
      data: { lastShopifyCheckAt: new Date() },
    });
    
    console.log(`[reconciliation] Updated lastShopifyCheckAt for ${shopDomain}`);
  } catch (error) {
    console.error(`[reconciliation] Error reconciling shop ${shopDomain}:`, error);
    // Nu actualizăm lastShopifyCheckAt dacă reconciliation-ul eșuează
    console.log(`[reconciliation] Skipping lastShopifyCheckAt update due to error`);
  }
}

/**
 * Rulează reconciliation pentru shop-urile eligibile
 * Un shop este eligibil dacă:
 * - Nu a fost reconciliat niciodată (lastShopifyCheckAt IS NULL), SAU
 * - A trecut cel puțin 4 ore de la ultimul check (lastShopifyCheckAt < NOW() - 4 hours)
 */
async function runReconciliation() {
  console.log(`[reconciliation] ========================================`);
  console.log(`[reconciliation] Starting reconciliation job (checking eligible shops)...`);
  console.log(`[reconciliation] ========================================`);
  
  try {
    // Calculează data de referință (cooldown în urmă)
    // RECONCILIATION_COOLDOWN_MS este definit la începutul scriptului
    const cooldownAgo = new Date();
    cooldownAgo.setTime(cooldownAgo.getTime() - RECONCILIATION_COOLDOWN_MS);
    
    // Mai întâi, obține toate shop-urile pentru debugging
    const allShops = await prisma.shop.findMany({
      include: {
        syncStatus: {
          select: {
            lastShopifyCheckAt: true,
            lastFullSyncAt: true,
          },
        },
      },
    });
    
    console.log(`[reconciliation] Total shops in DB: ${allShops.length}`);
    console.log(`[reconciliation] Cooldown period: ${RECONCILIATION_COOLDOWN_MS / 1000 / 60} minutes`);
    console.log(`[reconciliation] Cooldown threshold: ${cooldownAgo.toISOString()}`);
    
    // Log detalii pentru fiecare shop
    for (const shop of allShops) {
      const lastCheck = shop.syncStatus?.lastShopifyCheckAt;
      const timeSinceLastCheck = lastCheck 
        ? Math.round((Date.now() - lastCheck.getTime()) / 1000 / 60) 
        : 'never';
      const isEligible = !lastCheck || (lastCheck && lastCheck < cooldownAgo);
      console.log(`[reconciliation] Shop ${shop.shopDomain}: lastCheck=${lastCheck ? lastCheck.toISOString() : 'never'}, timeSince=${timeSinceLastCheck}min, eligible=${isEligible}`);
    }
    
    // Obține shop-urile eligibile pentru reconciliation
    // Un shop este eligibil dacă nu a fost reconciliat niciodată SAU a trecut cooldown-ul de la ultimul check
    const eligibleShops = await prisma.shop.findMany({
      where: {
        OR: [
          {
            syncStatus: null, // Nu are SyncStatus (nu a fost reconciliat niciodată)
          },
          {
            syncStatus: {
              OR: [
                { lastShopifyCheckAt: null }, // Nu a fost reconciliat niciodată
                { lastShopifyCheckAt: { lt: cooldownAgo } }, // A trecut cooldown-ul de la ultimul check
              ],
            },
          },
        ],
      },
      select: {
        shopDomain: true,
        syncStatus: {
          select: {
            lastShopifyCheckAt: true,
          },
        },
      },
    });
    
    console.log(`[reconciliation] Found ${eligibleShops.length} eligible shops (out of ${allShops.length} total shops)`);
    
    if (eligibleShops.length === 0) {
      console.log(`[reconciliation] No shops need reconciliation at this time`);
      if (allShops.length > 0) {
        console.log(`[reconciliation] All shops were recently reconciled. Next reconciliation will run after cooldown period.`);
      } else {
        console.log(`[reconciliation] No shops found in database.`);
      }
      return;
    }
    
    // Rulează reconciliation pentru fiecare shop eligibil (secvențial pentru a evita rate limiting)
    for (const shop of eligibleShops) {
      const lastCheck = shop.syncStatus?.lastShopifyCheckAt;
      const timeSinceLastCheck = lastCheck 
        ? Math.round((Date.now() - lastCheck.getTime()) / 1000 / 60) 
        : 'never';
      console.log(`[reconciliation] Shop ${shop.shopDomain} - last check: ${lastCheck || 'never'} (${timeSinceLastCheck} minutes ago)`);
      
      await reconcileShop(shop.shopDomain);
      // Așteaptă puțin între shop-uri pentru a evita rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`[reconciliation] Reconciliation job completed for ${eligibleShops.length} shops`);
  } catch (error) {
    console.error(`[reconciliation] Error in reconciliation job:`, error);
  }
}

/**
 * Reîncearcă procesarea webhook-urilor failed
 * Găsește webhook-urile cu status="error" și retryCount < 3, și le reîncearcă
 */
async function retryFailedWebhooks() {
  console.log(`[retry] ========================================`);
  console.log(`[retry] Starting retry job for failed webhooks...`);
  console.log(`[retry] ========================================`);
  
  try {
    // Găsește webhook-urile failed care pot fi reîncercate (retryCount < 3)
    const failedWebhooks = await prisma.webhookEvent.findMany({
      where: {
        status: "error",
        retryCount: { lt: 3 },
      },
      include: {
        shop: {
          select: { shopDomain: true },
        },
      },
      orderBy: { createdAt: "asc" }, // Reîncearcă cele mai vechi primul
      take: 50, // Limitează la 50 per run pentru a evita overload
    });
    
    console.log(`[retry] Found ${failedWebhooks.length} failed webhooks to retry`);
    
    if (failedWebhooks.length === 0) {
      console.log(`[retry] No webhooks to retry`);
      return;
    }
    
    // Reîncearcă fiecare webhook failed
    for (const webhookEvent of failedWebhooks) {
      const shopDomain = webhookEvent.shop.shopDomain;
      const topic = webhookEvent.topic;
      const newRetryCount = webhookEvent.retryCount + 1;
      
      console.log(`[retry] Retrying webhook ${webhookEvent.id} (${topic}) for ${shopDomain} (attempt ${newRetryCount}/3)`);
      
      try {
        // Parsează payload-ul
        let payload = null;
        if (webhookEvent.payload) {
          try {
            payload = JSON.parse(webhookEvent.payload);
          } catch (e) {
            console.error(`[retry] Failed to parse payload for webhook ${webhookEvent.id}:`, e);
            // Marchează ca failed_permanently dacă nu putem parsa payload-ul
            await prisma.webhookEvent.update({
              where: { id: webhookEvent.id },
              data: {
                status: "failed_permanently",
                errorMessage: `Cannot parse payload: ${e.message}`,
                retryCount: 3,
                lastRetryAt: new Date(),
              },
            });
            continue;
          }
        }
        
        // Reîncearcă procesarea webhook-ului
        await processWebhook(shopDomain, topic, payload);
        
        // Dacă reușește, actualizează status-ul la "success"
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: "success",
            errorMessage: null,
            retryCount: newRetryCount,
            lastRetryAt: new Date(),
          },
        });
        
        console.log(`[retry] Successfully retried webhook ${webhookEvent.id}`);
      } catch (error) {
        console.error(`[retry] Error retrying webhook ${webhookEvent.id}:`, error);
        
        // Actualizează retryCount
        const updateData = {
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          errorMessage: error.message || webhookEvent.errorMessage,
        };
        
        // Dacă a atins limita de 3 încercări, marchează ca failed_permanently
        if (newRetryCount >= 3) {
          updateData.status = "failed_permanently";
          console.log(`[retry] Webhook ${webhookEvent.id} reached max retry count (3), marking as failed_permanently`);
        }
        
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: updateData,
        });
      }
      
      // Așteaptă puțin între retry-uri pentru a evita rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[retry] Retry job completed for ${failedWebhooks.length} webhooks`);
  } catch (error) {
    console.error(`[retry] Error in retry job:`, error);
  }
}

/**
 * Pornește retry job-ul pentru webhook-urile failed
 * Rulează la fiecare 10 minute pentru a reîncerca webhook-urile failed
 */
function startRetryJob() {
  // WEBHOOK_RETRY_INTERVAL_MS este definit la începutul scriptului
  
  console.log(`[retry] Starting webhook retry job scheduler`);
  console.log(`[retry] Retry interval: ${WEBHOOK_RETRY_INTERVAL_MS}ms = ${WEBHOOK_RETRY_INTERVAL_MS / 1000 / 60} minutes`);
  
  // Rulează imediat la start pentru a procesa webhook-urile failed care așteaptă
  retryFailedWebhooks().catch(console.error);
  
  // Apoi rulează la intervalul configurat
  setInterval(() => {
    retryFailedWebhooks().catch(console.error);
  }, WEBHOOK_RETRY_INTERVAL_MS);
  
  console.log(`[retry] Webhook retry job scheduler started`);
}

/**
 * Pornește reconciliation job-ul
 * Job-ul rulează la fiecare 5 minute și verifică shop-urile eligibile
 * Un shop este eligibil dacă nu a fost reconciliat niciodată SAU a trecut 4 ore de la ultimul check
 */
function startReconciliationJob() {
  // RECONCILIATION_CHECK_INTERVAL_MS și RECONCILIATION_COOLDOWN_MS sunt definite la începutul scriptului
  
  console.log(`[reconciliation] Starting reconciliation job scheduler`);
  console.log(`[reconciliation] Check interval: ${RECONCILIATION_CHECK_INTERVAL_MS}ms = ${RECONCILIATION_CHECK_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`[reconciliation] Reconciliation cooldown per shop: ${RECONCILIATION_COOLDOWN_MS}ms = ${RECONCILIATION_COOLDOWN_MS / 1000 / 60 / 60} hours`);
  
  // Rulează imediat la start pentru a procesa shop-urile care așteaptă
  runReconciliation().catch(console.error);
  
  // Apoi rulează la intervalul configurat pentru a verifica shop-urile eligibile
  setInterval(() => {
    runReconciliation().catch(console.error);
  }, RECONCILIATION_CHECK_INTERVAL_MS);
  
  console.log(`[reconciliation] Reconciliation job scheduler started`);
}

// Dacă rulează direct (nu importat)
// Verifică dacă fișierul este rulat direct
const isMainModule = process.argv[1] && (
  process.argv[1].includes('pubsub-worker.js') ||
  import.meta.url.includes('pubsub-worker.js')
);

if (isMainModule) {
  console.log(`[worker] Detected as main module, starting worker...`);
  startWorker().catch((error) => {
    console.error(`[worker] Fatal error:`, error);
    process.exit(1);
  });
} else {
  console.log(`[worker] Not running as main module (imported), skipping auto-start`);
}


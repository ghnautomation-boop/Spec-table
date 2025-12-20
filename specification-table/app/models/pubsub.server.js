/**
 * Google Cloud Pub/Sub Publisher pentru webhook-uri
 * 
 * Configurare necesară:
 * - GOOGLE_APPLICATION_CREDENTIALS: path către service account key JSON
 * - GOOGLE_CLOUD_PROJECT_ID: project ID (shopify-webhooks-481708)
 */

import { PubSub } from "@google-cloud/pubsub";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pubsubClient = null;

function getPubSubClient() {
  if (!pubsubClient) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "shopify-webhooks-481708";
    
    // Caută service account key în folderul proiectului
    // Încearcă mai întâi variabila de mediu, apoi fișierul din folderul proiectului
    let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (!keyPath) {
      try {
        // Caută fișierul service account key în folderul proiectului
        // Folosim process.cwd() pentru root-ul proiectului
        const projectRoot = process.cwd();
        
        // Caută fișiere care încep cu "shopify-webhooks-" și se termină cu ".json"
        const files = fs.readdirSync(projectRoot);
        const keyFile = files.find(file => 
          file.startsWith("shopify-webhooks-") && file.endsWith(".json")
        );
        
        if (keyFile) {
          keyPath = path.join(projectRoot, keyFile);
          console.log(`[pubsub] Found service account key: ${keyFile}`);
        }
      } catch (error) {
        console.warn(`[pubsub] Could not search for service account key:`, error.message);
      }
    }
    
    if (keyPath) {
      console.log(`[pubsub] Using service account key: ${keyPath}`);
      pubsubClient = new PubSub({
        projectId,
        keyFilename: keyPath,
      });
    } else {
      // Altfel, folosește default credentials (pentru Cloud Run/Cloud Functions)
      console.log(`[pubsub] Using default credentials (Cloud Run/Cloud Functions)`);
      pubsubClient = new PubSub({ projectId });
    }
  }
  
  return pubsubClient;
}

/**
 * Publică un webhook în Pub/Sub topic
 * @param {string} topicName - Numele topic-ului (ex: "shopify-webhooks")
 * @param {Object} webhookData - Datele webhook-ului
 * @param {string} webhookData.shop - Shop domain
 * @param {string} webhookData.topic - Webhook topic (ex: "products/create")
 * @param {Object} webhookData.payload - Payload-ul webhook-ului
 * @param {string} webhookData.webhookId - ID unic pentru webhook (pentru deduplicare)
 * @returns {Promise<string>} - Message ID
 */
export async function publishWebhook(topicName, webhookData) {
  try {
    const pubsub = getPubSubClient();
    const topic = pubsub.topic(topicName);
    
    // Verifică dacă topic-ul există, dacă nu, îl creează
    const [exists] = await topic.exists();
    if (!exists) {
      try {
        await topic.create();
        console.log(`[pubsub] Created topic: ${topicName}`);
      } catch (error) {
        // Dacă topic-ul a fost creat între timp de alt proces, ignoră eroarea
        if (error.code !== 6) { // 6 = ALREADY_EXISTS
          throw error;
        }
        console.log(`[pubsub] Topic ${topicName} already exists (created by another process)`);
      }
    }
    
    // Notă: Subscription-ul trebuie creat manual sau prin worker
    // Subscription-ul este necesar pentru a putea vedea și procesa mesajele
    
    // Mesajul pentru Pub/Sub
    const message = {
      json: {
        shop: webhookData.shop,
        topic: webhookData.topic,
        payload: webhookData.payload,
        webhookId: webhookData.webhookId || `${webhookData.shop}-${webhookData.topic}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      },
      // Attributes pentru filtering și routing
      attributes: {
        shop: webhookData.shop,
        topic: webhookData.topic,
        webhookId: webhookData.webhookId || `${webhookData.shop}-${webhookData.topic}-${Date.now()}`,
      },
    };
    
    const messageId = await topic.publishMessage(message);
    console.log(`[pubsub] Published webhook to ${topicName}:`, {
      messageId,
      shop: webhookData.shop,
      topic: webhookData.topic,
    });
    
    return messageId;
  } catch (error) {
    console.error(`[pubsub] Error publishing webhook to ${topicName}:`, error);
    throw error;
  }
}

/**
 * Publică un webhook în topic-ul corespunzător bazat pe tipul webhook-ului
 * @param {string} shop - Shop domain
 * @param {string} topic - Webhook topic (ex: "products/create")
 * @param {Object} payload - Payload-ul webhook-ului
 * @returns {Promise<string>} - Message ID
 */
export async function publishWebhookByTopic(shop, topic, payload) {
  // Topic-ul principal pentru toate webhook-urile
  // Folosește "shopify-webhook" (singular) conform PUBSUB_SETUP.md
  const topicName = process.env.PUBSUB_TOPIC_NAME || "shopify-webhook";
  
  // Generează un ID unic pentru webhook (pentru deduplicare)
  const webhookId = `${shop}-${topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return await publishWebhook(topicName, {
    shop,
    topic,
    payload,
    webhookId,
  });
}


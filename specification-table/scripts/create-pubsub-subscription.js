/**
 * Script pentru crearea subscription-ului Pub/Sub
 * Rulează: node scripts/create-pubsub-subscription.js
 */

import { PubSub } from "@google-cloud/pubsub";
import fs from "fs";
import path from "path";

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || "shopify-webhooks-481708";
const topicName = process.env.PUBSUB_TOPIC_NAME || "shopify-webhook";
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION_NAME || "shopify-webhook-subscription";

// Caută service account key
let keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  const projectRoot = process.cwd();
  const files = fs.readdirSync(projectRoot);
  const keyFile = files.find(file => 
    file.startsWith("shopify-webhooks-") && file.endsWith(".json")
  );
  if (keyFile) {
    keyPath = path.join(projectRoot, keyFile);
    console.log(`Found service account key: ${keyFile}`);
  }
}

const pubsub = keyPath 
  ? new PubSub({ projectId, keyFilename: keyPath })
  : new PubSub({ projectId });

async function createSubscription() {
  try {
    console.log(`Creating subscription: ${subscriptionName} for topic: ${topicName}`);
    
    // Verifică dacă topic-ul există
    const topic = pubsub.topic(topicName);
    const [topicExists] = await topic.exists();
    
    if (!topicExists) {
      console.log(`Topic ${topicName} does not exist. Creating it...`);
      await topic.create();
      console.log(`Topic ${topicName} created successfully.`);
    } else {
      console.log(`Topic ${topicName} already exists.`);
    }
    
    // Verifică dacă subscription-ul există
    const subscription = pubsub.subscription(subscriptionName);
    const [subscriptionExists] = await subscription.exists();
    
    if (subscriptionExists) {
      console.log(`Subscription ${subscriptionName} already exists.`);
      return;
    }
    
    // Creează subscription-ul
    await subscription.create({
      topic: topicName,
      ackDeadlineSeconds: 60, // 60 secunde pentru a procesa mesajul
      messageRetentionDuration: { seconds: 604800 }, // 7 zile retention
      expirationPolicy: null, // Fără expirare
    });
    
    console.log(`✅ Subscription ${subscriptionName} created successfully!`);
    console.log(`\nYou can now see messages in Google Cloud Console:`);
    console.log(`https://console.cloud.google.com/cloudpubsub/subscription/list?project=${projectId}`);
    
  } catch (error) {
    console.error("Error creating subscription:", error);
    process.exit(1);
  }
}

createSubscription();







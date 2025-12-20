# Google Cloud Pub/Sub Setup pentru Webhook Processing

## Configurare necesară

### 1. Environment Variables

Adaugă următoarele variabile de mediu:

```bash
# Google Cloud Project ID
GOOGLE_CLOUD_PROJECT_ID=shopify-webhooks-481708

# Path către service account key JSON (pentru local development)
# Opțional: dacă nu este setat, codul va căuta automat fișiere care încep cu "shopify-webhooks-" în folderul proiectului
GOOGLE_APPLICATION_CREDENTIALS=./shopify-webhooks-481708-40d620a674b2.json

# Pub/Sub Topic Name
PUBSUB_TOPIC_NAME=shopify-webhook

# Pub/Sub Subscription Name (pentru worker)
PUBSUB_SUBSCRIPTION_NAME=shopify-webhook-subscription

# Debounce delay în milisecunde (default: 5000ms = 5 secunde)
WEBHOOK_DEBOUNCE_DELAY=5000
```

### 2. Service Account Setup

1. **Creează Service Account:**
   ```bash
   gcloud iam service-accounts create shopify-webhooks-worker \
     --display-name="Shopify Webhooks Worker" \
     --project=shopify-webhooks-481708
   ```

2. **Acordă permisiuni necesare:**
   ```bash
   # Pub/Sub Publisher (pentru webhook handlers)
   gcloud projects add-iam-policy-binding shopify-webhooks-481708 \
     --member="serviceAccount:shopify-webhooks-worker@shopify-webhooks-481708.iam.gserviceaccount.com" \
     --role="roles/pubsub.publisher"

   # Pub/Sub Subscriber (pentru worker)
   gcloud projects add-iam-policy-binding shopify-webhooks-481708 \
     --member="serviceAccount:shopify-webhooks-worker@shopify-webhooks-481708.iam.gserviceaccount.com" \
     --role="roles/pubsub.subscriber"
   ```

3. **Creează și descarcă key:**
   ```bash
   gcloud iam service-accounts keys create service-account-key.json \
     --iam-account=shopify-webhooks-worker@shopify-webhooks-481708.iam.gserviceaccount.com \
     --project=shopify-webhooks-481708
   ```

### 3. Creare Topic și Subscription

Topic-ul și subscription-ul se creează automat când rulează codul, dar poți să le creezi manual:

```bash
# Creează topic
gcloud pubsub topics create shopify-webhooks \
  --project=shopify-webhooks-481708

# Creează subscription
gcloud pubsub subscriptions create shopify-webhooks-subscription \
  --topic=shopify-webhooks \
  --project=shopify-webhooks-481708 \
  --ack-deadline=60 \
  --message-retention-duration=7d
```

### 4. Deployment Worker

#### Opțiunea 1: Cloud Run

Creează `workers/Dockerfile`:
```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "workers/pubsub-worker.js"]
```

Deploy:
```bash
gcloud run deploy shopify-webhooks-worker \
  --source . \
  --platform managed \
  --region us-central1 \
  --service-account shopify-webhooks-worker@shopify-webhooks-481708.iam.gserviceaccount.com \
  --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=shopify-webhooks-481708,PUBSUB_TOPIC_NAME=shopify-webhooks,PUBSUB_SUBSCRIPTION_NAME=shopify-webhooks-subscription,WEBHOOK_DEBOUNCE_DELAY=5000" \
  --allow-unauthenticated
```

#### Opțiunea 2: Cloud Functions

Creează `workers/index.js`:
```javascript
import { startWorker } from './pubsub-worker.js';

export const processWebhooks = async (pubsubMessage, context) => {
  await startWorker();
};
```

Deploy:
```bash
gcloud functions deploy processWebhooks \
  --runtime nodejs20 \
  --trigger-topic shopify-webhooks \
  --service-account shopify-webhooks-worker@shopify-webhooks-481708.iam.gserviceaccount.com \
  --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=shopify-webhooks-481708"
```

### 5. Modificare Webhook Handlers

Înlocuiește webhook handlers-ii actuali cu versiunile care folosesc Pub/Sub:

- `webhooks.products.create.jsx` → folosește `publishWebhookByTopic()`
- `webhooks.products.update.jsx` → folosește `publishWebhookByTopic()`
- `webhooks.products.delete.jsx` → folosește `publishWebhookByTopic()`
- etc.

Exemplu în `webhooks.products.create.jsx`:
```javascript
import { publishWebhookByTopic } from "../models/pubsub.server.js";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  const payload = await request.json();
  
  // Publică în Pub/Sub și returnează 200 imediat
  await publishWebhookByTopic(shop, topic, payload);
  return new Response();
};
```

## Flow-ul complet

1. **Webhook primit de la Shopify** → Handler publică în Pub/Sub → Returnează 200
2. **Worker primește mesaj din Pub/Sub** → Așteaptă 5 secunde (debouncing)
3. **Dacă mai apar webhook-uri pentru același resource** → Anulează timer-ul vechi, pornește unul nou
4. **După 5 secunde fără webhook-uri noi** → Procesează ultimul webhook pentru resource
5. **Acknowledge mesajul** → Mesajul este marcat ca procesat

## Beneficii

- ✅ **Fast response**: Webhook handlers returnează 200 imediat
- ✅ **Debouncing**: Procesează doar ultimul webhook pentru fiecare resource
- ✅ **Scalabilitate**: Worker-ul poate scala automat
- ✅ **Fiabilitate**: Retry logic automat de la Pub/Sub
- ✅ **Monitoring**: Poți monitoriza mesajele în Google Cloud Console

## Monitoring

- **Pub/Sub Dashboard**: https://console.cloud.google.com/cloudpubsub/topic/list?project=shopify-webhooks-481708
- **Cloud Run/Cloud Functions Logs**: Vezi logs pentru worker
- **Metrics**: Număr de mesaje procesate, erori, latency, etc.


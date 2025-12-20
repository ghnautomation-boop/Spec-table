# Cum să rulezi Worker-ul Pub/Sub

## Pasul 1: Asigură-te că ai toate variabilele de mediu

Worker-ul are nevoie de:

```bash
# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=read_products,write_products,...
SHOPIFY_APP_URL=https://your-app-url.com

# Google Cloud Pub/Sub
GOOGLE_CLOUD_PROJECT_ID=shopify-webhooks-481708
PUBSUB_TOPIC_NAME=shopify-webhooks
PUBSUB_SUBSCRIPTION_NAME=shopify-webhooks-subscription
GOOGLE_APPLICATION_CREDENTIALS=./shopify-webhooks-*.json  # Opțional, auto-detectează

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Debounce delay (opțional, default 5000ms)
WEBHOOK_DEBOUNCE_DELAY=5000

# Rate limiting pentru Shopify API (opțional, default 2 requests/second)
# Shopify permite ~2 req/s pentru shop-uri mici, ~40 req/s pentru shop-uri mari
# Recomandăm 2 req/s pentru siguranță (evită rate limiting)
SHOPIFY_RATE_LIMIT_RPS=2

# Throttling între procesări de webhook-uri (opțional, default 0ms = fără delay)
# Pentru volume mari (ex: 5000+ produse), poți seta un delay mic (ex: 50-100ms)
# pentru a evita suprasolicitarea
WEBHOOK_PROCESSING_DELAY_MS=0

# Reconciliation interval (opțional, default 5 minute = 300000ms)
RECONCILIATION_CHECK_INTERVAL_MS=300000

# Reconciliation cooldown per shop (opțional, default 4 ore = 14400000ms)
RECONCILIATION_COOLDOWN_MS=14400000

# Retry interval pentru webhook-uri failed (opțional, default 10 minute = 600000ms)
WEBHOOK_RETRY_INTERVAL_MS=600000
```

## Pasul 2: Creează subscription-ul (dacă nu există)

```bash
npm run pubsub:create-subscription
```

Sau manual în Google Cloud Console.

## Pasul 3: Rulează worker-ul

**IMPORTANT:** Worker-ul necesită variabilele de mediu setate. Dacă folosești Shopify CLI, rulează:

```bash
shopify app dev
```

Apoi într-un alt terminal:

```bash
npm run worker
```

### Opțiunea 1: Cu npm script (recomandat)

```bash
npm run worker
```

**Notă:** Scriptul va încerca să încarce variabilele din `.env` dacă există.

### Opțiunea 2: Direct cu node (cu variabile de mediu)

```bash
# Setează variabilele de mediu manual
export SHOPIFY_API_KEY=...
export SHOPIFY_API_SECRET=...
export SHOPIFY_APP_URL=...
# ... etc

node workers/pubsub-worker.js
```

Sau folosește un fișier `.env` și rulează:

```bash
node --env-file=.env workers/pubsub-worker.js
```

### Opțiunea 3: Cu PM2 (pentru producție)

```bash
# Instalează PM2 global
npm install -g pm2

# Pornește worker-ul
pm2 start workers/pubsub-worker.js --name pubsub-worker

# Salvează configurația
pm2 save

# Configurează auto-start la boot
pm2 startup
```

## Verificare

După ce pornești worker-ul, ar trebui să vezi:

```
[worker] Starting Pub/Sub worker...
[worker] Project ID: shopify-webhooks-481708
[worker] Subscription: shopify-webhooks-subscription
[worker] Debounce delay: 5000ms
[worker] Worker started and listening for messages...
```

## Rate Limiting și Volume Mari

### Problema: Import de 5000+ produse

Când ai un import masiv (ex: 5000 de produse), Shopify trimite 5000 de webhook-uri aproape simultan. Fără rate limiting, worker-ul ar încerca să proceseze toate imediat, ceea ce poate duce la:

- **Rate limit errors (429)** de la Shopify API
- **Timeout-uri** și erori
- **Pierderea webhook-urilor** dacă nu sunt procesate corect

### Soluția implementată

Worker-ul include **rate limiting automat** care:

1. **Limitează request-urile către Shopify API:**
   - Default: **2 requests/second** per shop (configurabil)
   - Shopify permite ~2 req/s pentru shop-uri mici, ~40 req/s pentru shop-uri mari
   - Recomandăm 2 req/s pentru siguranță

2. **Retry cu exponential backoff:**
   - Dacă primești 429 (rate limit), worker-ul așteaptă și reîncearcă automat
   - Delay-ul crește exponențial: 1s, 2s, 4s, 8s, 16s (max 30s)
   - Max 5 încercări per request

3. **Throttling opțional între procesări:**
   - Poți adăuga un delay mic între procesări (ex: 50-100ms)
   - Ajută la volume foarte mari pentru a evita suprasolicitarea

### Configurare pentru volume mari

Pentru un import de 5000 de produse:

```bash
# Rate limiting: 2 requests/second (sigur pentru toate shop-urile)
SHOPIFY_RATE_LIMIT_RPS=2

# Throttling: 50ms delay între procesări (opțional, pentru volume foarte mari)
WEBHOOK_PROCESSING_DELAY_MS=50

# Debounce: 5 secunde (default, ajută la deduplicare)
WEBHOOK_DEBOUNCE_DELAY=5000
```

**Calcul pentru 5000 produse:**
- Cu 2 req/s: 5000 / 2 = **2500 secunde = ~42 minute**
- Cu delay de 50ms: +250 secunde = **~46 minute total**

**Notă:** Pentru shop-uri mari cu rate limit mai mare, poți crește `SHOPIFY_RATE_LIMIT_RPS` la 10-20, dar recomandăm să începi cu 2 pentru siguranță.

### Cum funcționează

1. **Pub/Sub primește toate webhook-urile** și le stochează în queue
2. **Worker-ul procesează secvențial** cu rate limiting:
   - Așteaptă delay-ul minim între request-uri (500ms pentru 2 req/s)
   - Verifică dacă a depășit limita de request-uri pe secundă
   - Dacă da, așteaptă până la următoarea secundă
3. **Dacă primești 429:**
   - Worker-ul detectează automat eroarea
   - Așteaptă cu exponential backoff
   - Reîncearcă până la 5 ori
4. **Mesajele rămân în Pub/Sub** până sunt procesate cu succes

### Monitorizare

Verifică logurile pentru rate limiting:

```
[rate-limit] Rate limit reached for shop.myshopify.com, waiting 500ms
[rate-limit] Rate limit error (429) for attempt 1/5, retrying in 1000ms...
[worker] Successfully processed webhook: products/create for shop.myshopify.com
```

## Reconciliation Job

Worker-ul include un job automat de reconciliation care rulează la fiecare 5 minute (configurabil prin `RECONCILIATION_CHECK_INTERVAL_MS`).

### Ce face reconciliation job-ul?

1. **Verifică count-urile** pentru fiecare shop:
   - Produse (App DB vs Shopify)
   - Colecții (App DB vs Shopify)
   - Metafield-uri pentru produse (App DB vs Shopify)
   - Metafield-uri pentru variante (App DB vs Shopify)

2. **Actualizează SyncStatus** cu count-urile actuale și detectează mismatch-urile

3. **Face delta sync** dacă există diferențe:
   - Sincronizează produsele dacă count-urile nu se potrivesc
   - Sincronizează colecțiile dacă count-urile nu se potrivesc
   - Sincronizează metafield-urile dacă count-urile nu se potrivesc

4. **Re-verifică** după sync pentru a confirma că totul este sincronizat

### Configurare

Poți configura intervalul de reconciliation prin variabila de mediu:

```bash
# 6 ore (default)
RECONCILIATION_INTERVAL_MS=21600000

# 12 ore
RECONCILIATION_INTERVAL_MS=43200000

# 1 oră (pentru testare)
RECONCILIATION_INTERVAL_MS=3600000
```

### Loguri

Reconciliation job-ul va loga:
- Start/end al job-ului
- Shop-urile procesate
- Count-urile găsite (App vs Shopify)
- Mismatch-urile detectate
- Delta sync-urile efectuate

Exemplu de loguri:
```
[reconciliation] ========================================
[reconciliation] Starting reconciliation job...
[reconciliation] ========================================
[reconciliation] Found 3 shops to reconcile
[reconciliation] Starting reconciliation for shop: shop1.myshopify.com
[reconciliation] Reconciliation complete for shop1.myshopify.com: { appCounts: {...}, shopifyCounts: {...}, lastComparisonOk: true }
[reconciliation] Reconciliation job completed
```

## Testare

1. **Creează un produs în Shopify**
2. **Verifică console logs:**
   ```
   [worker] Received message: <messageId>
   [worker] Processing webhook: products/create for shop.myshopify.com
   [worker] Successfully processed webhook: products/create for shop.myshopify.com
   ```
3. **Verifică database:** Produsul ar trebui să fie sincronizat
4. **Verifică Google Cloud Console → Subscription:** Mesajele ar trebui să dispară când sunt procesate
5. **Așteaptă reconciliation job:** După intervalul configurat, ar trebui să vezi loguri de reconciliation

## Debugging

### Worker-ul nu primește mesaje

1. Verifică că subscription-ul există:
   ```bash
   gcloud pubsub subscriptions list --project=shopify-webhooks-481708
   ```

2. Verifică că topic-ul există:
   ```bash
   gcloud pubsub topics list --project=shopify-webhooks-481708
   ```

3. Verifică credentials:
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ls -la shopify-webhooks-*.json
   ```

### Worker-ul primește mesaje dar nu le procesează

1. Verifică logs pentru erori
2. Verifică că session-ul există în DB pentru shop-ul respectiv
3. Verifică că `accessToken` este valid

### Mesajele se acumulează în subscription

- Worker-ul nu rulează sau s-a oprit
- Worker-ul are erori la procesare
- Verifică logs pentru detalii

## Producție

Pentru producție, recomandăm:

1. **Cloud Run** - pentru worker-ul care rulează continuu
2. **Cloud Functions** - pentru procesare event-driven
3. **Kubernetes** - pentru control complet

Vezi `PUBSUB_SETUP.md` pentru instrucțiuni de deployment.


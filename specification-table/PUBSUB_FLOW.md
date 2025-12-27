# Pub/Sub Flow - Cum funcționează sistemul

## Flow-ul complet:

```
1. Shopify → Webhook Handler → Pub/Sub Topic → Worker → Database
   └─ Returnează 200 imediat ─┘              └─ Procesează cu debouncing ─┘
```

## Unde vezi mesajele:

### 1. **În Google Cloud Console - Topic** (toate mesajele publicate)

**URL:** https://console.cloud.google.com/cloudpubsub/topic/detail/shopify-webhook?project=shopify-webhooks-481708

**Ce vezi aici:**
- ✅ **Toate mesajele publicate** de webhook handlers
- ✅ **Numărul total de mesaje** publicate
- ✅ **Mesajele rămân aici** chiar dacă sunt procesate

**Cum verifici:**
1. Deschide link-ul de mai sus
2. Click pe tab-ul "Messages" sau "Metrics"
3. Vezi graficul cu numărul de mesaje publicate

### 2. **În Google Cloud Console - Subscription** (mesajele neprocesate)

**URL:** https://console.cloud.google.com/cloudpubsub/subscription/detail/shopify-webhook-subscription?project=shopify-webhooks-481708

**Ce vezi aici:**
- ✅ **Mesajele neprocesate** (care așteaptă să fie procesate de worker)
- ✅ **Numărul de mesaje în queue** (unacked messages)
- ✅ **Mesajele dispar** când worker-ul le procesează cu succes

**Cum verifici:**
1. Deschide link-ul de mai sus
2. Click pe tab-ul "Messages"
3. Vezi mesajele care așteaptă procesare
4. Dacă worker-ul rulează, mesajele vor dispărea când sunt procesate

### 3. **În Console Logs** (aplicația ta)

**Ce vezi:**
```
[webhook] Received PRODUCTS_CREATE webhook for shop.myshopify.com
[pubsub] Published webhook to shopify-webhook: { messageId: '...', shop: '...', topic: '...' }
[webhook] Published to Pub/Sub: <messageId> for shop.myshopify.com
```

**Cum verifici:**
- Console-ul aplicației (terminal unde rulează `npm run dev`)
- Logs-urile arată că mesajele sunt publicate cu succes

### 4. **În Database** (după procesare)

**Ce vezi:**
- Produsele/colecțiile/metafield-urile sincronizate în DB
- Log-urile din `WebhookEvent` table cu status `"queued"` sau `"success"`

## Structura unui mesaj în Pub/Sub:

```json
{
  "shop": "ghnautomation-devmag.myshopify.com",
  "topic": "PRODUCTS_CREATE",
  "payload": {
    "admin_graphql_api_id": "gid://shopify/Product/123",
    "id": 123,
    "title": "Product Name",
    ...
  },
  "webhookId": "shop-topic-timestamp-random",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "retryCount": 0
}
```

## Status-uri:

1. **"queued"** - Mesajul a fost publicat în Pub/Sub, așteaptă procesare
2. **"success"** - Mesajul a fost procesat cu succes de worker
3. **"error"** - Eroare la publicare sau procesare

## Cum verifici dacă funcționează:

### Test 1: Verifică publicarea
1. Creează un produs în Shopify
2. Verifică console logs: ar trebui să vezi `[pubsub] Published webhook...`
3. Verifică Google Cloud Console → Topic → Metrics: ar trebui să vezi mesaje noi

### Test 2: Verifică subscription-ul
1. Deschide Google Cloud Console → Subscription
2. Ar trebui să vezi mesajele în queue (dacă worker-ul nu rulează)
3. Dacă worker-ul rulează, mesajele ar trebui să dispară când sunt procesate

### Test 3: Verifică procesarea
1. Rulează worker-ul: `node workers/pubsub-worker.js`
2. Creează un produs în Shopify
3. Verifică logs-urile worker-ului: ar trebui să vezi `[worker] Processing webhook...`
4. Verifică database: produsul ar trebui să fie sincronizat

## Notă importantă:

- **Fără subscription:** Mesajele sunt publicate în topic, dar nu pot fi procesate
- **Fără worker:** Mesajele se acumulează în subscription, dar nu sunt procesate
- **Cu worker:** Mesajele sunt procesate cu debouncing (așteaptă 5 secunde)

## Debugging:

Dacă nu vezi mesaje:
1. Verifică că webhook handlers-ii publică în Pub/Sub (vezi console logs)
2. Verifică că topic-ul există în Google Cloud Console
3. Verifică că subscription-ul există și este conectat la topic
4. Verifică credentials (service account key)








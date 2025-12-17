# Ghid Optimizări Performance

## Indexuri Necesare - Analiză Detaliată

### 1. TemplateAssignment - Indexuri Critice

**Problema**: Query-ul `getTemplateForTarget` caută assignment-uri după:
- `shopId` + `assignmentType`
- `shopId` + `templateId` + `assignmentType`

**Indexuri necesare**:
```prisma
model TemplateAssignment {
  // ... existing fields ...
  
  // Index compus pentru query-uri după shop + type
  @@index([shopId, assignmentType])
  
  // Index compus pentru query-uri după shop + template + type
  @@index([shopId, templateId, assignmentType])
  
  // Index existent (păstrează-l)
  @@index([shopId])
  @@index([templateId])
}
```

**Impact**: Query-urile vor fi 10-100x mai rapide.

---

### 2. TemplateAssignmentTarget - Indexuri Critice

**Problema**: Căutarea după `targetShopifyId` + `isExcluded` este lentă.

**Indexuri necesare**:
```prisma
model TemplateAssignmentTarget {
  // ... existing fields ...
  
  // Index compus pentru lookup rapid de target
  @@index([assignmentId, targetShopifyId, isExcluded])
  
  // Index pentru căutare directă după target
  @@index([targetShopifyId, targetType])
  
  // Indexuri existente (păstrează-le)
  @@index([assignmentId])
  @@index([targetShopifyId])
}
```

**Impact**: Lookup-ul de target va fi instant.

---

### 3. SpecificationTemplate - Index pentru Active Templates

**Problema**: Query-urile filtrează după `isActive`, dar nu există index.

**Index necesar**:
```prisma
model SpecificationTemplate {
  // ... existing fields ...
  
  // Index compus pentru query-uri active
  @@index([shopId, isActive])
  
  // Index existent (păstrează-l)
  @@index([shopId])
}
```

**Impact**: Query-urile pentru template-uri active vor fi 5-10x mai rapide.

---

### 4. TemplateSectionMetafield - Index pentru Ordering

**Problema**: Ordering-ul după `order` poate fi lent la multe metafields.

**Index necesar**:
```prisma
model TemplateSectionMetafield {
  // ... existing fields ...
  
  // Index pentru ordering eficient
  @@index([sectionId, order])
  
  // Index existent (păstrează-l)
  @@index([sectionId])
}
```

**Impact**: Ordering-ul va fi instant chiar și cu sute de metafields.

---

## Optimizare Query-uri - getTemplateForTarget

### Problema Actuală

```javascript
// ❌ INEFICIENT: Aduce TOATE assignment-urile și filtrează în memorie
const assignments = await prisma.templateAssignment.findMany({
  where: { shopId: shop.id },
  include: { /* multe JOIN-uri */ }
});

// Apoi filtrează în JavaScript
const productAssignment = assignments.find(a => {
  // ... filtering logic ...
});
```

**Probleme**:
1. Aduce toate datele din DB (ineficient)
2. Face JOIN-uri pentru toate assignment-urile (chiar și cele nefolosite)
3. Filtrare în memorie (lentă)

### Soluție Optimizată

```javascript
// ✅ EFICIENT: Query-uri specifice pentru fiecare caz

// 1. Caută direct assignment pentru produs
if (normalizedProductId) {
  const productAssignment = await prisma.templateAssignment.findFirst({
    where: {
      shopId: shop.id,
      assignmentType: "PRODUCT",
      template: { isActive: true },
      targets: {
        some: {
          targetShopifyId: normalizedProductId,
          isExcluded: false
        }
      }
    },
    include: {
      template: {
        include: {
          sections: {
            include: {
              metafields: {
                include: { metafieldDefinition: true },
                orderBy: { order: "asc" }
              }
            },
            orderBy: { order: "asc" }
          }
        }
      }
    }
  });
  
  if (productAssignment) return productAssignment.template;
  
  // Caută EXCEPT assignment
  const exceptAssignment = await prisma.templateAssignment.findFirst({
    where: {
      shopId: shop.id,
      assignmentType: "PRODUCT",
      template: { isActive: true },
      targets: {
        every: { isExcluded: true },
        none: {
          targetShopifyId: normalizedProductId,
          isExcluded: true
        }
      }
    },
    include: { /* same as above */ }
  });
  
  if (exceptAssignment) return exceptAssignment.template;
}

// Similar pentru collection și default...
```

**Beneficii**:
- Query-uri specifice (mai rapide)
- Doar datele necesare (mai puțină memorie)
- Folosește indexurile (mult mai rapid)

---

## Strategie Cache

### Ce să Cache-ui

#### 1. Template-uri Complete
```javascript
// Cache key: `template:${shopId}:${productId}:${collectionId}`
// TTL: 5-15 minute
// Invalidate: când se modifică template-ul sau assignment-urile
```

#### 2. Assignment Mappings
```javascript
// Cache key: `assignments:${shopId}`
// TTL: 10 minute
// Invalidate: când se modifică assignment-urile
```

#### 3. Metafield Definitions
```javascript
// Cache key: `metafields:${shopId}`
// TTL: 30 minute
// Invalidate: când se sincronizează metafield definitions
```

### Implementare Cache (Redis)

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Funcție helper pentru cache
async function getCached(key, fetchFn, ttl = 300) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

// Folosire în getTemplateForTarget
export async function getTemplateForTarget(shopDomain, productId, collectionId) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;
  
  const cacheKey = `template:${shop.id}:${productId || 'null'}:${collectionId || 'null'}`;
  
  return getCached(cacheKey, async () => {
    // ... query logic optimizat ...
  }, 300); // 5 minute TTL
}
```

---

## Monitoring Performance

### Query-uri Lente - Identificare

```javascript
// Adaugă logging pentru query-uri lente
prisma.$on('query', (e) => {
  if (e.duration > 100) { // > 100ms
    console.warn('Slow query:', {
      query: e.query,
      duration: e.duration,
      params: e.params
    });
  }
});
```

### Metrics Importante

1. **Query Duration**: < 50ms pentru query-uri simple, < 200ms pentru complexe
2. **Cache Hit Rate**: > 80% pentru template-uri
3. **Database Connections**: < 80% din pool size
4. **Response Time**: < 200ms pentru API calls

---

## Checklist Optimizări

- [ ] Migrare la PostgreSQL
- [ ] Adăugare indexuri compuse
- [ ] Optimizare query-uri (query-uri specifice în loc de filtering în memorie)
- [ ] Implementare cache Redis
- [ ] Monitoring query performance
- [ ] Connection pooling (Prisma face asta automat)
- [ ] Rate limiting pentru API endpoints
- [ ] CDN pentru template-uri statice (dacă e cazul)

---

## Estimări Performance După Optimizări

### Înainte
- Query time: 200-500ms
- Throughput: ~100 requests/sec
- Database load: 80-100%

### După Optimizări
- Query time: 20-50ms (cu cache: 5-10ms)
- Throughput: ~1000+ requests/sec
- Database load: 20-40%

**Îmbunătățire**: 10-20x mai rapid! 🚀







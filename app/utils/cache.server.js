/**
 * Simple in-memory cache pentru template-uri
 * În producție, înlocuiește cu Redis
 */

const cache = new Map();
export const CACHE_TTL = {
  TEMPLATE: 5 * 60 * 1000, // 5 minute
  METAFIELD_DEFINITIONS: 30 * 60 * 1000, // 30 minute
  ASSIGNMENTS: 10 * 60 * 1000, // 10 minute
};

/**
 * Obține valoare din cache
 */
export function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return item.value;
}

/**
 * Setează valoare în cache
 */
export function setCache(key, value, ttl = CACHE_TTL.TEMPLATE) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * Șterge valoare din cache
 */
export function deleteCache(key) {
  cache.delete(key);
}

/**
 * Șterge toate cheile care încep cu prefix
 */
export function deleteCacheByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Generează cache key pentru template
 */
export function getTemplateCacheKey(shopDomain, productId, collectionId) {
  return `template:${shopDomain}:${productId || 'null'}:${collectionId || 'null'}`;
}

/**
 * Generează cache key pentru metafield definitions
 */
export function getMetafieldDefinitionsCacheKey(shopDomain) {
  return `metafields:${shopDomain}`;
}


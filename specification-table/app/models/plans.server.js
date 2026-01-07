// Planurile pentru Shopify Billing API
// Definim aici doar pentru referință - array-ul complet este în app.plans/route.jsx
const PLANS = [
  {
    key: "starter",
    maxTemplates: 2, // Temporar setat la 2 pentru testare
  },
  {
    key: "growth",
    maxTemplates: 75,
  },
  {
    key: "scale",
    maxTemplates: 250,
  },
  {
    key: "scaleplus",
    maxTemplates: Infinity,
  },
];

// Funcție helper pentru a obține maxTemplates bazat pe plan key
// Această funcție este folosită doar în loader-uri (server-side)
export function getMaxTemplatesForPlan(planKey) {
  const plan = PLANS.find(p => p.key === planKey);
  return plan?.maxTemplates ?? Infinity;
}


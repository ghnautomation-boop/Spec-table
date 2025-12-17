/**
 * Utilitare pentru măsurarea performanței query-urilor
 */

export function measureTime(label) {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      if (process.env.NODE_ENV === "development") {
        console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
      }
      return duration;
    },
  };
}

export async function measureQuery(label, queryFn) {
  const timer = measureTime(label);
  try {
    const result = await queryFn();
    timer.end();
    return result;
  } catch (error) {
    timer.end();
    throw error;
  }
}







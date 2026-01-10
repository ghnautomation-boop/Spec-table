/**
 * Centralized logging utility for server-side code
 * Replaces console.log/warn/error with structured logging
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
  : (process.env.NODE_ENV === "production" ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG);

/**
 * Format log message with context
 */
function formatLog(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = Object.keys(context).length > 0 
    ? ` ${JSON.stringify(context)}` 
    : '';
  
  return `[${timestamp}] [${level}] ${message}${contextStr}`;
}

/**
 * Log error (always shown)
 */
export function logError(message, error = null, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    const errorContext = {
      ...context,
      ...(error && {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
      }),
    };
    console.error(formatLog('ERROR', message, errorContext));
  }
}

/**
 * Log warning (shown in production)
 */
export function logWarn(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    console.warn(formatLog('WARN', message, context));
  }
}

/**
 * Log info (only in development)
 */
export function logInfo(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    console.log(formatLog('INFO', message, context));
  }
}

/**
 * Log debug (only in development)
 */
export function logDebug(message, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    console.log(formatLog('DEBUG', message, context));
  }
}

/**
 * Performance logging helper
 */
export function logPerformance(operation, duration, context = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    logDebug(`Performance: ${operation}`, {
      ...context,
      duration: `${duration.toFixed(2)}ms`,
    });
  }
}



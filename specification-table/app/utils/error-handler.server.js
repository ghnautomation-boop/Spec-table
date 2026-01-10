/**
 * Centralized error handling utility
 * Provides consistent error handling across the application
 */

import { logError, logWarn } from "./logger.server.js";

/**
 * Application error types
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = null, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null, context = {}) {
    super(message, 400, 'VALIDATION_ERROR', { field, ...context });
  }
}

export class NotFoundError extends AppError {
  constructor(resource, context = {}) {
    super(`${resource} not found`, 404, 'NOT_FOUND', context);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', context = {}) {
    super(message, 401, 'UNAUTHORIZED', context);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', context = {}) {
    super(message, 403, 'FORBIDDEN', context);
  }
}

/**
 * Handle errors and return user-friendly response
 */
export function handleError(error, request = null) {
  // Log error
  const context = {
    url: request?.url,
    method: request?.method,
    ...(error.context || {}),
  };
  
  if (error instanceof AppError) {
    // Known application errors - log as warning
    logWarn(`Application error: ${error.message}`, {
      ...context,
      code: error.code,
      statusCode: error.statusCode,
    });
  } else {
    // Unknown errors - log as error
    logError('Unexpected error', error, context);
  }

  // Return appropriate response
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        context: error.context,
      }),
    };
  }

  // Unknown errors - don't expose details in production
  return {
    success: false,
    error: process.env.NODE_ENV === "production" 
      ? "An unexpected error occurred. Please try again later."
      : error.message,
    ...(process.env.NODE_ENV === "development" && {
      stack: error.stack,
    }),
  };
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error, args[0]?.request || null);
    }
  };
}

/**
 * Validate required fields
 */
export function validateRequired(data, fields) {
  const missing = fields.filter(field => {
    const value = typeof field === 'string' ? data[field] : field.value;
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    const fieldNames = missing.map(f => typeof f === 'string' ? f : f.name);
    throw new ValidationError(
      `Missing required fields: ${fieldNames.join(', ')}`,
      fieldNames[0]
    );
  }
}

/**
 * Validate data types
 */
export function validateType(value, expectedType, fieldName) {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new ValidationError(
      `Invalid type for ${fieldName}: expected ${expectedType}, got ${actualType}`,
      fieldName
    );
  }
}



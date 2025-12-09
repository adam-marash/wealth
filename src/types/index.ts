/**
 * Type Definitions Index
 * Centralized export for all type definitions
 */

export * from './transaction';
export * from './investment';
export * from './config';
export * from './report';

/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

/**
 * API Response Types
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

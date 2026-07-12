export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

export const POLLING_INTERVAL_MS = 4000;

export const ENTITY_COLORS: Record<string, string> = {
  PERSON: '#60a5fa',
  ORGANIZATION: '#34d399',
  PRODUCT: '#f97316',
  TECHNOLOGY: '#a78bfa',
  LOCATION: '#fbbf24',
  EVENT: '#f472b6',
  DATE: '#94a3b8',
  CONCEPT: '#e879f9',
  DOCUMENT: '#22d3ee',
  SYSTEM: '#fb923c',
  MODULE: '#c084fc',
  SERVICE: '#2dd4bf',
  COMPONENT: '#f87171',
  TEAM: '#60a5fa',
  PROJECT: '#a3e635',
  DATABASE: '#facc15',
  API: '#38bdf8',
  FRAMEWORK: '#818cf8',
  LIBRARY: '#fb7185',
  INFRASTRUCTURE: '#4ade80',
  DEPARTMENT: '#22d3ee',
  CLASS: '#e879f9',
  FUNCTION: '#c084fc',
  INTERFACE: '#f87171',
  SCHEMA: '#fbbf24',
  TABLE: '#a78bfa',
  FILE: '#60a5fa',
  REPOSITORY: '#34d399',
  SERVER: '#f97316',
  CLOUD: '#38bdf8',
  PROTOCOL: '#2dd4bf',
  ALGORITHM: '#e879f9',
  STANDARD: '#94a3b8',
  COMPANY: '#34d399',
  EMPLOYEE: '#60a5fa',
  USER: '#60a5fa',
  ROLE: '#c084fc',
  PERMISSION: '#f87171',
  CONFIGURATION: '#fbbf24',
  DEPLOYMENT: '#4ade80',
  RELEASE: '#a3e635',
  VERSION: '#fb923c',
  TEST: '#22d3ee',
  BUG: '#f87171',
  FEATURE: '#e879f9',
  REQUIREMENT: '#a78bfa',
  TASK: '#34d399',
  SPRINT: '#f97316',
  EPIC: '#fb7185',
  STORY: '#60a5fa',
  UNKNOWN: '#94a3b8',
};

export const ENTITY_TYPES = Object.keys(ENTITY_COLORS);

export const RELATIONSHIP_TYPES = [
  'WORKS_AT',
  'MANAGES',
  'PART_OF',
  'DEPENDS_ON',
  'CREATED_BY',
  'LOCATED_IN',
  'RELATED_TO',
  'COMPETES_WITH',
  'PARTNER_OF',
  'SUCCEEDED_BY',
  'BUILT_BY',
  'LEADS',
  'IMPLEMENTED_BY',
  'USES',
  'CONTAINS',
  'BELONGS_TO',
  'OWNS',
  'DEVELOPS',
  'DEPLOYS',
  'TESTS',
  'MAINTAINS',
  'SUPPORTS',
  'INTEGRATES_WITH',
  'CALLS',
  'INVOKES',
  'TRIGGERS',
  'REQUIRES',
  'EXTENDS',
  'IMPLEMENTS',
  'INHERITS',
  'COMPOSED_OF',
  'GENERATES',
  'PRODUCES',
  'CONSUMES',
  'SENDS',
  'RECEIVES',
  'STORES',
  'READS',
  'WRITES',
  'CONFIGURES',
  'MONITORS',
  'LOGS',
  'TRANSFORMS',
  'VALIDATES',
  'TRANSFERS',
  'ROUTES',
  'CONNECTS',
  'ASSIGNS',
  'DELEGATES',
  'AUTHORIZES',
  'AUTHENTICATES',
];

const EXTRA_COLORS: string[] = [
  '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316',
  '#10b981', '#a855f7', '#e11d48', '#0ea5e9', '#eab308',
  '#d946ef', '#3b82f6', '#2dd4bf', '#f43f5e', '#86efac',
  '#7dd3fc', '#fda4af', '#bef264', '#c4b5fd', '#fed7aa',
];

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function entityColor(type: string): string {
  if (!type) return '#94a3b8';
  const upper = type.toUpperCase();
  if (ENTITY_COLORS[upper]) return ENTITY_COLORS[upper];
  return EXTRA_COLORS[simpleHash(upper) % EXTRA_COLORS.length] || '#94a3b8';
}

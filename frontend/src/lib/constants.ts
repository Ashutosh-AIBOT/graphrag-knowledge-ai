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
];

export function entityColor(type: string): string {
  return ENTITY_COLORS[type?.toUpperCase()] || '#94a3b8';
}

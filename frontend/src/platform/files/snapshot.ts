import type { DataFreshness } from './dataFreshness';
import { FileDataError, fetchJson } from './fileDataService';

/** Shapes of the published catalog files (served by DB Catalog's API); only the fields the UI reads are declared. */
export type Evidence = 'confirmed' | 'inferred' | (string & {});

export interface EvidenceText {
  text: string;
  evidence: Evidence;
}

export interface CatalogDocument {
  id: string;
  title: string;
  path: string;
  table: string | null;
}

export interface CatalogTableEntry {
  id: string;
  schema: string;
  name: string;
  businessArea: string | null;
  purpose: EvidenceText | null;
  rowCount: number | null;
  columnCount: number;
  primaryKey: string[];
  detailsPath: string;
  relatedTables: string[];
}

export interface CatalogDatabase {
  database: {
    name: string;
    provider?: string;
    productVersion?: string;
    summary?: EvidenceText | null;
  };
  counts: { tables: number; relationships: number } & Record<string, number>;
  documents: CatalogDocument[];
  tables: CatalogTableEntry[];
  generatedAtUtc?: string | null;
  generationRunId?: string | null;
}

export interface CatalogColumn {
  ordinal: number;
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey: { table: string; column: string } | null;
  unique: boolean;
  identity: boolean;
  default: string | null;
  meaning: EvidenceText | null;
}

export interface CatalogTableRelationship {
  direction: 'incoming' | 'outgoing';
  relatedTable: string;
  columns: string[];
  relatedColumns: string[];
  cardinality: string;
  evidence: Evidence;
  meaning: string | null;
}

export interface CatalogIndex {
  name: string;
  columns: string[];
  includedColumns: string[];
  unique: boolean;
  clustered: boolean;
  filter: string | null;
}

export interface CatalogConstraint {
  name: string;
  type: string;
  columns: string[];
  definition: string | null;
  enforced: boolean;
}

export interface CatalogTable {
  id: string;
  schema: string;
  name: string;
  purpose: EvidenceText | null;
  recordMeaning: EvidenceText | null;
  rowCount: number | null;
  primaryKey: string[];
  columns: CatalogColumn[];
  relationships: CatalogTableRelationship[];
  indexes: CatalogIndex[];
  constraints: CatalogConstraint[];
  triggers: { name?: string }[];
}

export interface CatalogRelationship {
  name: string;
  from: { table: string; columns: string[] };
  to: { table: string; columns: string[] };
  cardinality: string;
  fromRequired: boolean;
  enforced: boolean;
  evidence: Evidence;
  meaning: string | null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const invalid = (path: string, detail: string): never => {
  throw new FileDataError('INVALID_DATA', path, `${path}: ${detail}`);
};

/** True when the catalog does not confirm the text as a database fact. */
export function isInferred(value: EvidenceText | null | undefined): boolean {
  return !!value && text(value.text) && value.evidence !== 'confirmed';
}

export const DATABASE_PATH = 'database.json';
export const RELATIONSHIPS_PATH = 'relationships.json';
export const BUSINESS_AREAS_PATH = 'business-areas.json';

export async function loadCatalog(): Promise<CatalogDatabase> {
  const value = await fetchJson(DATABASE_PATH);
  if (
    !record(value) ||
    !record(value.database) ||
    !text(value.database.name) ||
    !Array.isArray(value.tables)
  )
    return invalid(DATABASE_PATH, 'expected database and tables.');
  for (const table of value.tables as unknown[])
    if (
      !record(table) ||
      !text(table.id) ||
      !text(table.schema) ||
      !text(table.name) ||
      !text(table.detailsPath)
    )
      return invalid(DATABASE_PATH, 'invalid table entry.');
  return {
    ...(value as unknown as CatalogDatabase),
    counts: record(value.counts)
      ? (value.counts as CatalogDatabase['counts'])
      : { tables: 0, relationships: 0 },
    documents: Array.isArray(value.documents)
      ? (value.documents as CatalogDocument[])
      : [],
  };
}

export function freshnessOf(catalog: CatalogDatabase): DataFreshness {
  return {
    status: 'cached',
    generatedAtUtc: catalog.generatedAtUtc ?? null,
    snapshotId: catalog.generationRunId ?? null,
  };
}

export async function findCatalogTable(id: string): Promise<CatalogTableEntry> {
  const table = (await loadCatalog()).tables.find((t) => t.id === id);
  if (!table)
    throw new FileDataError(
      'NOT_FOUND',
      id,
      `Table ${id} is not in the catalog.`,
    );
  return table;
}

export async function loadTableFile(
  entry: CatalogTableEntry,
): Promise<CatalogTable> {
  const path = entry.detailsPath;
  const value = await fetchJson(path);
  if (!record(value) || !Array.isArray(value.columns))
    return invalid(path, 'expected columns.');
  if (value.id !== entry.id)
    return invalid(path, `file does not describe ${entry.id}.`);
  for (const column of value.columns as unknown[])
    if (!record(column) || !text(column.name) || !text(column.dataType))
      return invalid(path, 'invalid column.');
  return {
    ...(value as unknown as CatalogTable),
    primaryKey: Array.isArray(value.primaryKey)
      ? (value.primaryKey as string[])
      : [],
    relationships: Array.isArray(value.relationships)
      ? (value.relationships as CatalogTableRelationship[])
      : [],
    indexes: Array.isArray(value.indexes)
      ? (value.indexes as CatalogIndex[])
      : [],
    constraints: Array.isArray(value.constraints)
      ? (value.constraints as CatalogConstraint[])
      : [],
    triggers: Array.isArray(value.triggers)
      ? (value.triggers as CatalogTable['triggers'])
      : [],
  };
}

export async function loadRelationships(): Promise<CatalogRelationship[]> {
  const value = await fetchJson(RELATIONSHIPS_PATH);
  if (!record(value) || !Array.isArray(value.relationships))
    return invalid(RELATIONSHIPS_PATH, 'expected relationships.');
  for (const r of value.relationships as unknown[])
    if (
      !record(r) ||
      !record(r.from) ||
      !record(r.to) ||
      !text(r.from.table) ||
      !text(r.to.table)
    )
      return invalid(RELATIONSHIPS_PATH, 'invalid relationship.');
  return value.relationships as CatalogRelationship[];
}

/** Name of the catalog relationship that a per-table relationship entry describes, if any. */
export function relationshipName(
  relationships: CatalogRelationship[],
  tableId: string,
  link: CatalogTableRelationship,
): string | null {
  const [from, to] =
    link.direction === 'outgoing'
      ? [tableId, link.relatedTable]
      : [link.relatedTable, tableId];
  const [fromColumns, toColumns] =
    link.direction === 'outgoing'
      ? [link.columns, link.relatedColumns]
      : [link.relatedColumns, link.columns];
  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((c, i) => c === b[i]);
  return (
    relationships.find(
      (r) =>
        r.from.table === from &&
        r.to.table === to &&
        same(r.from.columns, fromColumns) &&
        same(r.to.columns, toColumns),
    )?.name ?? null
  );
}

export interface BusinessArea {
  id: string;
  name: string;
  description: string;
  /** The description is suggested, not confirmed by the database. */
  inferred: boolean;
  tableIds: string[];
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Business areas come from business-areas.json. Tables not in any area fall back to an area named
 * after the database; a missing business-areas file puts every table in that fallback area.
 */
export async function loadBusinessAreas(): Promise<BusinessArea[]> {
  const catalog = await loadCatalog();
  const inventory = catalog.tables.map((t) => t.id);
  let entries: unknown[] = [];
  try {
    const value = await fetchJson(BUSINESS_AREAS_PATH);
    if (record(value) && Array.isArray(value.businessAreas))
      entries = value.businessAreas;
  } catch (error) {
    if (!(error instanceof FileDataError && error.code === 'NOT_FOUND'))
      throw error;
  }

  const areas: BusinessArea[] = [];
  for (const entry of entries) {
    if (!record(entry) || !text(entry.name)) continue;
    const tableIds = (Array.isArray(entry.tables) ? entry.tables : []).filter(
      (id): id is string => typeof id === 'string' && inventory.includes(id),
    );
    const purpose = text(entry.purpose) ? entry.purpose : null;
    const evidence = text(entry.evidence) ? entry.evidence : 'inferred';
    areas.push({
      id: slug(entry.name),
      name: entry.name,
      description: purpose ?? 'Business area.',
      inferred: purpose === null || isInferred({ text: purpose, evidence }),
      tableIds: [...new Set(tableIds)],
    });
  }

  const unassigned = inventory.filter(
    (id) => !areas.some((a) => a.tableIds.includes(id)),
  );
  if (unassigned.length)
    areas.push({
      id: 'database',
      name: catalog.database.name,
      description: 'Tables not assigned to a business area in the catalog.',
      inferred: false,
      tableIds: unassigned,
    });
  return areas;
}

export async function areasByTableId(): Promise<
  Map<string, { id: string; name: string }[]>
> {
  const map = new Map<string, { id: string; name: string }[]>();
  for (const area of await loadBusinessAreas())
    for (const id of area.tableIds)
      map.set(id, [...(map.get(id) ?? []), { id: area.id, name: area.name }]);
  return map;
}

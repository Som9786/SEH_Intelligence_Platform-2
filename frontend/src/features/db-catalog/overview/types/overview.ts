import type { DataFreshness } from '../../../../platform/files/dataFreshness';

export interface BusinessAreaSummary {
  id: string;
  name: string;
  description: string;
  inferred: boolean;
  tableCount: number;
}

export interface DatabaseInfo {
  name: string;
  provider: string | null;
  version: string | null;
  summary: string | null;
  /** The summary is suggested, not confirmed by the database. */
  summaryInferred: boolean;
}

export interface OverviewSummary {
  databaseName: string;
  database: DatabaseInfo;
  freshness: DataFreshness;
  counts: {
    businessAreas: number;
    schemas: number;
    tables: number;
    columns: number;
    relationships: number;
    indexes: number;
    views: number;
    procedures: number;
    functions: number;
    triggers: number;
  };
  businessAreas: BusinessAreaSummary[];
}

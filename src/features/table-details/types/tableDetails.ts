/** "{schema}.{table}", e.g. "dbo.Customers" — stable across snapshot refreshes. */
export type TableId = string;

export interface TableListItem {
  id: TableId;
  schemaName: string;
  name: string;
  columnCount: number;
  areas: { id: string; name: string }[];
}
export interface TablePage {
  items: TableListItem[];
  meta: { page: number; pageSize: number; total: number };
  availableSchemas: { id: string; name: string }[];
}
export interface PrimaryKeySummary {
  constraintName: string;
  columnNames: string[];
}
export interface TableDetail extends Omit<TableListItem, 'areas'> {
  description: string | null;
  /** The description is suggested from names and data, not stored in the database. */
  descriptionInferred: boolean;
  rowCount: number | null;
  primaryKey: PrimaryKeySummary | null;
  foreignKeyCount: number;
  indexCount: number;
  triggerCount: number;
  refreshedAt: string | null;
}
export interface Column {
  /** "{tableId}#{name}" — a local correlation key, not sent to or from the backend. */
  id: string;
  tableId: TableId;
  ordinal: number;
  name: string;
  dataType: string;
  maxLength: number | 'MAX' | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isIdentity: boolean;
  defaultValue: string | null;
  description: string | null;
  /** The description is suggested from names and data, not stored in the database. */
  descriptionInferred: boolean;
}
export interface ColumnPair {
  sourceColumnId: string;
  sourceColumnName: string;
  targetColumnId: string;
  targetColumnName: string;
}
export interface PrimaryKey {
  id: string;
  constraintName: string;
  tableId: TableId;
  columnIds: string[];
}
export interface ForeignKey {
  id: string;
  constraintName: string;
  sourceTableId: TableId;
  targetTableId: TableId;
  targetSchemaName: string;
  targetTableName: string;
  columnPairs: ColumnPair[];
}
export interface TableIndex {
  id: string;
  name: string;
  tableId: TableId;
  columnIds: string[];
  includedColumnIds: string[];
  isUnique: boolean;
  isUniqueConstraint: boolean;
  isClustered: boolean;
  filter: string | null;
}
export interface KeysResponse {
  tableId: TableId;
  primaryKeys: PrimaryKey[];
  foreignKeys: ForeignKey[];
  indexes: TableIndex[];
}
export interface ColumnsResponse {
  tableId: TableId;
  items: Column[];
}
interface RelationshipBase {
  id: string;
  direction: 'incoming' | 'outgoing';
  sourceTableId: TableId;
  sourceTableName: string;
  targetTableId: TableId;
  targetTableName: string;
  columnPairs: ColumnPair[];
}
export type Relationship =
  | (RelationshipBase & {
      kind: 'declaredForeignKey';
      status: 'confirmed';
      constraintName: string;
    })
  | (RelationshipBase & {
      kind: 'inferredJoin';
      status: 'inferred';
      confidencePercent: number | null;
      evidence: { type: string; explanation: string; provenance: string }[];
    });
export interface RelationshipsResponse {
  tableId: TableId;
  items: Relationship[];
}
export interface TableDocumentation {
  tableId: TableId;
  markdown: string;
  /** Catalog-relative path of the document; relative links inside it resolve against this. */
  path: string;
}
export interface TableRecord extends TableDetail {
  areas: { id: string; name: string }[];
  columns: Column[];
  keys: Omit<KeysResponse, 'tableId'>;
  relationships: Relationship[];
  documentation: TableDocumentation | null;
}
export interface ListFilters {
  q: string;
  schema: string;
  page: number;
  pageSize?: number;
}

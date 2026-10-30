import type { TableDetailsService } from '../../../features/table-details/services/TableDetailsService';
import type {
  Column,
  ForeignKey,
  Relationship,
  TableRecord,
} from '../../../features/table-details/types/tableDetails';
import { fetchOptionalMarkdown } from '../fileDataService';
import {
  areasByTableId,
  findCatalogTable,
  freshnessOf,
  isInferred,
  loadCatalog,
  loadRelationships,
  loadTableFile,
  relationshipName,
  type CatalogTableRelationship,
} from '../snapshot';
import { parseTableId } from '../tableId';

const pairs = (
  sourceTableId: string,
  sources: string[],
  targetTableId: string,
  targets: string[],
) =>
  sources.map((source, i) => ({
    sourceColumnId: `${sourceTableId}#${source}`,
    sourceColumnName: source,
    targetColumnId: `${targetTableId}#${targets[i] ?? ''}`,
    targetColumnName: targets[i] ?? '',
  }));

function mapRelationship(
  tableId: string,
  link: CatalogTableRelationship,
  name: string | null,
): Relationship {
  const outgoing = link.direction === 'outgoing';
  const sourceTableId = outgoing ? tableId : link.relatedTable;
  const targetTableId = outgoing ? link.relatedTable : tableId;
  const base = {
    id: `${link.direction}-${name ?? `${sourceTableId}-${targetTableId}-${link.columns.join('_')}`}`,
    direction: link.direction,
    sourceTableId,
    sourceTableName: sourceTableId,
    targetTableId,
    targetTableName: targetTableId,
    columnPairs: outgoing
      ? pairs(sourceTableId, link.columns, targetTableId, link.relatedColumns)
      : pairs(sourceTableId, link.relatedColumns, targetTableId, link.columns),
  };
  if (link.evidence === 'confirmed' && name)
    return {
      ...base,
      kind: 'declaredForeignKey',
      status: 'confirmed',
      constraintName: name,
    };
  return {
    ...base,
    kind: 'inferredJoin',
    status: 'inferred',
    confidencePercent: null,
    evidence: link.meaning
      ? [
          {
            type: link.cardinality,
            explanation: link.meaning,
            provenance: 'inferred',
          },
        ]
      : [],
  };
}

export const fileTableDetailsService: TableDetailsService = {
  async listTables(filters) {
    const [catalog, areas] = await Promise.all([
      loadCatalog(),
      areasByTableId(),
    ]);
    const q = filters.q.trim().toLocaleLowerCase();
    const pageSize = filters.pageSize ?? 25;
    const items = catalog.tables
      .filter((table) => !filters.schema || table.schema === filters.schema)
      .filter((table) => table.name.toLocaleLowerCase().includes(q))
      .sort(
        (a, b) =>
          a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name),
      )
      .map((table) => ({
        id: table.id,
        schemaName: table.schema,
        name: table.name,
        columnCount: table.columnCount ?? 0,
        areas: areas.get(table.id) ?? [],
      }));

    return {
      items: items.slice(
        (filters.page - 1) * pageSize,
        filters.page * pageSize,
      ),
      meta: { page: filters.page, pageSize, total: items.length },
      availableSchemas: [...new Set(catalog.tables.map((t) => t.schema))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, name })),
    };
  },

  async getTable(id) {
    const entry = await findCatalogTable(id);
    const catalog = await loadCatalog();
    const documentPath =
      catalog.documents.find((d) => d.table === entry.id)?.path ?? null;
    const [data, areas, allRelationships, markdown] = await Promise.all([
      loadTableFile(entry),
      areasByTableId(),
      loadRelationships(),
      fetchOptionalMarkdown(documentPath),
    ]);
    const tableId = entry.id;

    const columns: Column[] = data.columns.map((c) => ({
      id: `${tableId}#${c.name}`,
      tableId,
      ordinal: c.ordinal,
      name: c.name,
      // The catalog's dataType already carries length/precision, e.g. "nvarchar(100)".
      dataType: c.dataType,
      maxLength: null,
      precision: null,
      scale: null,
      nullable: c.nullable,
      isPrimaryKey: c.primaryKey === true,
      isForeignKey: c.foreignKey != null,
      isIdentity: c.identity === true,
      defaultValue: c.default ?? null,
      description: c.meaning?.text?.trim() || null,
      descriptionInferred: isInferred(c.meaning),
    }));

    const named = data.relationships.map((link) => ({
      link,
      name: relationshipName(allRelationships, tableId, link),
    }));
    const foreignKeys: ForeignKey[] = named
      .filter(
        ({ link, name }) =>
          link.direction === 'outgoing' &&
          link.evidence === 'confirmed' &&
          name,
      )
      .map(({ link, name }) => {
        const target = parseTableId(link.relatedTable);
        return {
          id: `fk-${name}`,
          constraintName: name!,
          sourceTableId: tableId,
          targetTableId: link.relatedTable,
          targetSchemaName: target.schema,
          targetTableName: target.table,
          columnPairs: pairs(
            tableId,
            link.columns,
            link.relatedTable,
            link.relatedColumns,
          ),
        };
      });

    const pkName =
      data.constraints.find((c) => c.type === 'primaryKey')?.name ??
      `PK_${entry.name}`;
    const primaryKeys = data.primaryKey.length
      ? [
          {
            id: `pk-${tableId}`,
            constraintName: pkName,
            tableId,
            columnIds: data.primaryKey.map((name) => `${tableId}#${name}`),
          },
        ]
      : [];
    const uniqueConstraints = new Set(
      data.constraints.filter((c) => c.type === 'unique').map((c) => c.name),
    );
    const indexes = data.indexes.map((ix) => ({
      id: `ix-${tableId}-${ix.name}`,
      name: ix.name,
      tableId,
      columnIds: ix.columns.map((c) => `${tableId}#${c}`),
      includedColumnIds: (ix.includedColumns ?? []).map(
        (c) => `${tableId}#${c}`,
      ),
      isUnique: ix.unique === true,
      isUniqueConstraint: uniqueConstraints.has(ix.name),
      isClustered: ix.clustered === true,
      filter: ix.filter ?? null,
    }));

    const record: TableRecord = {
      id: tableId,
      schemaName: entry.schema,
      name: entry.name,
      columnCount: columns.length,
      description: (data.purpose ?? entry.purpose)?.text?.trim() || null,
      descriptionInferred: isInferred(data.purpose ?? entry.purpose),
      rowCount: data.rowCount ?? entry.rowCount,
      primaryKey: data.primaryKey.length
        ? { constraintName: pkName, columnNames: data.primaryKey }
        : null,
      foreignKeyCount: foreignKeys.length,
      indexCount: indexes.length,
      triggerCount: data.triggers.length,
      refreshedAt: freshnessOf(catalog).generatedAtUtc,
      areas: areas.get(tableId) ?? [],
      columns,
      keys: { primaryKeys, foreignKeys, indexes },
      relationships: named.map(({ link, name }) =>
        mapRelationship(tableId, link, name),
      ),
      documentation:
        markdown && documentPath
          ? { tableId, markdown, path: documentPath }
          : null,
    };
    return record;
  },
};

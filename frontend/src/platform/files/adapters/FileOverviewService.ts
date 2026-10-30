import type { OverviewService } from '../../../features/db-catalog/overview/services/OverviewService';
import {
  freshnessOf,
  isInferred,
  loadBusinessAreas,
  loadCatalog,
  loadRelationships,
} from '../snapshot';

export const fileOverviewService: OverviewService = {
  async getSummary() {
    const [catalog, businessAreas, relationships] = await Promise.all([
      loadCatalog(),
      loadBusinessAreas(),
      loadRelationships(),
    ]);
    return {
      databaseName: catalog.database.name,
      database: {
        name: catalog.database.name,
        provider: catalog.database.provider ?? null,
        version: catalog.database.productVersion ?? null,
        summary: catalog.database.summary?.text?.trim() || null,
        summaryInferred: isInferred(catalog.database.summary),
      },
      freshness: freshnessOf(catalog),
      counts: {
        businessAreas: businessAreas.length,
        schemas: catalog.counts.schemas ?? 0,
        tables: catalog.tables.length,
        columns: catalog.counts.columns ?? 0,
        relationships: relationships.length,
        indexes: catalog.counts.indexes ?? 0,
        views: catalog.counts.views ?? 0,
        procedures: catalog.counts.procedures ?? 0,
        functions: catalog.counts.functions ?? 0,
        triggers: catalog.counts.triggers ?? 0,
      },
      businessAreas: businessAreas.map(
        ({ id, name, description, inferred, tableIds }) => ({
          id,
          name,
          description,
          inferred,
          tableCount: tableIds.length,
        }),
      ),
    };
  },
};

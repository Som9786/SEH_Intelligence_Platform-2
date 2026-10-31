import {
  buildRelationshipIndex,
  type RelationshipIndex,
} from '../../../features/db-catalog/table-details/utils/relationshipGraph';
import { isFileNotFound } from '../fileDataService';
import {
  loadCatalog,
  loadRelationships,
  loadTableFile,
  type CatalogRelationship,
} from '../snapshot';

export interface RelationshipGraphService {
  getRelationshipIndex(): Promise<RelationshipIndex>;
}

// The catalog does not change while the page is open, so the index is built once. A failed build
// is forgotten so Retry starts over.
let index: Promise<RelationshipIndex> | null = null;

/**
 * Scans every table file (not only the selected one), so incoming links are found even when the
 * referenced table's own file does not list them. relationships.json adds constraint names.
 */
async function build(): Promise<RelationshipIndex> {
  const catalog = await loadCatalog();
  const [tables, global] = await Promise.all([
    Promise.all(catalog.tables.map(loadTableFile)),
    loadRelationships().catch((error: unknown): CatalogRelationship[] => {
      if (isFileNotFound(error)) return [];
      throw error;
    }),
  ]);
  return buildRelationshipIndex(
    tables.map((t) => ({
      id: t.id,
      primaryKey: t.primaryKey,
      relationships: t.relationships,
    })),
    global,
  );
}

export const fileRelationshipGraphService: RelationshipGraphService = {
  getRelationshipIndex() {
    if (!index) {
      index = build();
      index.catch(() => {
        index = null;
      });
    }
    return index;
  },
};

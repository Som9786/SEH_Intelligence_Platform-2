import type { DatabaseDocumentation } from '../../../features/db-catalog/documentation/types/documentation';
import { FileDataError, fetchOptionalMarkdown } from '../fileDataService';
import { freshnessOf, loadCatalog } from '../snapshot';

export interface DocumentationService {
  getDatabaseDocumentation(document?: string): Promise<DatabaseDocumentation | null>;
}

export const fileDocumentationService: DocumentationService = {
  async getDatabaseDocumentation(document = 'database-overview') {
    const catalog = await loadCatalog();
    const path = catalog.documents.find((d) => d.id === document && d.table === null)?.path;
    if (!path) throw new FileDataError('NOT_FOUND', document, `Document ${document} is not in the catalog.`);
    const markdown = await fetchOptionalMarkdown(path);
    if (markdown === null) throw new FileDataError('NOT_FOUND', path);
    return { markdown, path, freshness: freshnessOf(catalog) };
  },
};

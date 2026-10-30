import type { DataFreshness } from '../../../platform/files/dataFreshness';

export interface DatabaseDocumentation {
  markdown: string;
  /** Catalog-relative path of the document; relative links inside it resolve against this. */
  path: string;
  freshness: DataFreshness;
}

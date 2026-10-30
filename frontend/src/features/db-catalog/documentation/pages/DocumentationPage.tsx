import { useSearchParams } from 'react-router';
import { BackToDbCatalog } from '../../components/BackToDbCatalog';
import { MarkdownDocument } from '../../../../shared/components/MarkdownDocument';
import { PageHeading } from '../../../../shared/components/PageHeading';
import { ResourceState } from '../../table-details/components/ResourceState';
import { useDatabaseDocumentation } from '../hooks/useDatabaseDocumentation';

const documents = [
  ['database-overview', 'Database overview'],
  ['business-areas', 'Business areas'],
  ['relationships', 'Relationship analysis'],
] as const;

export function DocumentationPage() {
  const [params, setParams] = useSearchParams();
  const document =
    documents.find(([id]) => id === params.get('document'))?.[0] ??
    'database-overview';
  const query = useDatabaseDocumentation(document);
  return (
    <div className="page-content">
      <PageHeading
        title="Documentation"
        description="Read the AI-generated documentation for this catalog."
        badge={
          <div className="td-actions">
            <BackToDbCatalog />
          </div>
        }
      />
      <div className="file-document-selector">
        <label htmlFor="document-select">Document</label>
        <select
          id="document-select"
          value={document}
          onChange={(e) => setParams({ document: e.target.value })}
        >
          {documents.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <ResourceState kind="loading" title="Loading documentation…" />
      ) : query.isError ? (
        <ResourceState
          kind="error"
          title="Documentation could not be loaded."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : !query.data ? (
        <ResourceState
          kind="empty"
          title="No documentation available for this database."
        />
      ) : (
        <article className="table-markdown" aria-label="Database documentation">
          <MarkdownDocument
            markdown={query.data.markdown}
            sourcePath={query.data.path}
          />
        </article>
      )}
    </div>
  );
}

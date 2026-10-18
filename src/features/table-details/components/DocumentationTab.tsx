import { MarkdownDocument } from '../../../shared/components/MarkdownDocument';
import type { TableDocumentation } from '../types/tableDetails';
import { ResourceState } from './ResourceState';

export function DocumentationTab({
  document,
}: {
  document: TableDocumentation | null;
}) {
  if (!document)
    return (
      <ResourceState
        kind="empty"
        title="No documentation available for this table."
      />
    );
  return (
    <article className="table-markdown" aria-label="Table documentation">
      <MarkdownDocument
        markdown={document.markdown}
        sourcePath={document.path}
      />
    </article>
  );
}

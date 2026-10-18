import { Check, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DownloadMenu } from '../../../shared/components/DownloadMenu';
import { MarkdownDocument } from '../../../shared/components/MarkdownDocument';
import { downloadBlob } from '../../../shared/utils/download';
import type { TableDocumentation } from '../types/tableDetails';
import { ResourceState } from './ResourceState';

/** A link that opens this table straight on its Documentation tab. */
function documentationLink(tableId: string) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({
    table: tableId,
    tab: 'Documentation',
  }).toString();
  url.hash = '';
  return url.toString();
}

export function DocumentationTab({
  document,
}: {
  document: TableDocumentation | null;
}) {
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!document)
    return (
      <ResourceState
        kind="empty"
        title="No documentation available for this table."
      />
    );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(documentationLink(document.tableId));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <>
      <div className="doc-share" role="group" aria-label="Share documentation">
        <span className="doc-share-status" aria-live="polite">
          {copied === 'done'
            ? 'Link copied'
            : copied === 'failed'
              ? 'Could not copy. Copy the address bar instead.'
              : ''}
        </span>
        <button
          type="button"
          className="td-action"
          onClick={() => void copyLink()}
        >
          {copied === 'done' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Link2 size={16} aria-hidden="true" />
          )}
          Copy link
        </button>
        <DownloadMenu
          label="Share"
          icon={Share2}
          options={[
            {
              label: 'Markdown file',
              hint: 'Opens in any text editor, wiki or Git repository',
              onSelect: () =>
                downloadBlob(
                  new Blob([document.markdown], { type: 'text/markdown' }),
                  `${document.tableId}.md`,
                ),
            },
            {
              label: 'Print or PDF',
              hint: 'Choose "Save as PDF" in the print dialog',
              onSelect: () => window.print(),
            },
          ]}
        />
      </div>
      <article className="table-markdown" aria-label="Table documentation">
        <MarkdownDocument
          markdown={document.markdown}
          sourcePath={document.path}
        />
      </article>
    </>
  );
}

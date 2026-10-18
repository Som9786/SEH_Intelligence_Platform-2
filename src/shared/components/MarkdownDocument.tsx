import { Children, isValidElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';
import { useQuery } from '@tanstack/react-query';
import { dataFileUrl } from '../../platform/files/fileDataService';
import {
  loadCatalog,
  type CatalogDocument,
} from '../../platform/files/snapshot';

function plainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? plainText(child.props.children)
        : typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : '',
    )
    .join('');
}

function headingId(children: ReactNode) {
  return plainText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Maps each catalog document path (e.g. "/documentation/customers.md") to the in-app route that shows it. */
function documentRoutes(documents: CatalogDocument[]): Map<string, string> {
  return new Map(
    documents.map((d) => [
      '/' + d.path,
      d.table
        ? `/table-details?table=${encodeURIComponent(d.table)}&tab=Documentation`
        : `/documentation?document=${encodeURIComponent(d.id)}`,
    ]),
  );
}

function documentLink(
  href: string | undefined,
  sourcePath: string,
  routes: Map<string, string>,
): string | undefined {
  if (
    !href ||
    href.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(href) ||
    href.startsWith('//')
  )
    return href;
  const url = new URL(href, `https://files.invalid/${sourcePath}`);
  const path = decodeURIComponent(url.pathname);
  const route = routes.get(path);
  if (route) return route + url.hash;
  // Catalog JSON is published beside the documents; files outside the catalog (e.g. ../extracted) are not.
  const json = /^\/((?:[^/]+\/)*[^/]+\.json)$/.exec(path);
  if (json && !json[1].toLowerCase().endsWith('.data.json'))
    return dataFileUrl(json[1]);
  return undefined;
}

export function MarkdownDocument({
  markdown,
  sourcePath,
}: {
  markdown: string;
  sourcePath: string;
}) {
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: loadCatalog });
  const routes = documentRoutes(catalog.data?.documents ?? []);
  return (
    <Markdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const code = Children.toArray(children)[0];
          if (
            isValidElement<{ className?: string; children?: ReactNode }>(
              code,
            ) &&
            code.props.className === 'language-mermaid'
          ) {
            return (
              <MermaidDiagram source={plainText(code.props.children).trim()} />
            );
          }
          return <pre>{children}</pre>;
        },
        a({ href, children }) {
          return (
            <a href={documentLink(href, sourcePath, routes)}>{children}</a>
          );
        },
        img({ alt }) {
          return <span>{alt ? `[Image: ${alt}]` : '[Image omitted]'}</span>;
        },
        h1({ children }) {
          return <h1 id={headingId(children)}>{children}</h1>;
        },
        h2({ children }) {
          return <h2 id={headingId(children)}>{children}</h2>;
        },
        h3({ children }) {
          return <h3 id={headingId(children)}>{children}</h3>;
        },
        h4({ children }) {
          return <h4 id={headingId(children)}>{children}</h4>;
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}

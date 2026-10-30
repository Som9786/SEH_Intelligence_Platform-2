import { Children, isValidElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';
import { useCatalog } from '../hooks/useCatalog';
import { dataFileUrl } from '../../platform/files/fileDataService';
import type { CatalogDocument } from '../../platform/files/snapshot';

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
        ? `/db-catalog/tables?table=${encodeURIComponent(d.table)}&tab=Documentation`
        : `/db-catalog/documentation?document=${encodeURIComponent(d.id)}`,
    ]),
  );
}

/** Where a link in a document goes: a page in the app (`to`, opened without reloading it) or an address (`href`). */
function documentLink(
  href: string | undefined,
  sourcePath: string,
  routes: Map<string, string>,
): { to: string } | { href: string | undefined } {
  if (
    !href ||
    href.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(href) ||
    href.startsWith('//')
  )
    return { href };
  const url = new URL(href, `https://files.invalid/${sourcePath}`);
  const path = decodeURIComponent(url.pathname);
  const route = routes.get(path);
  if (route) return { to: route + url.hash };
  // Catalog JSON is published beside the documents; files outside the catalog (e.g. ../extracted) are not.
  const json = /^\/((?:[^/]+\/)*[^/]+\.json)$/.exec(path);
  if (json && !json[1].toLowerCase().endsWith('.data.json'))
    return { href: dataFileUrl(json[1]) };
  return { href: undefined };
}

export function MarkdownDocument({
  markdown,
  sourcePath,
}: {
  markdown: string;
  sourcePath: string;
}) {
  const catalog = useCatalog();
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
          const link = documentLink(href, sourcePath, routes);
          return 'to' in link ? (
            <Link to={link.to}>{children}</Link>
          ) : (
            <a href={link.href}>{children}</a>
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

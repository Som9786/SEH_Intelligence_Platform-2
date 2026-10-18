export type KeyKind = 'pk' | 'fk' | 'identity';

interface KeyKindInfo {
  abbreviation: string;
  title: string;
  /** Shown in tooltips. No apostrophes or semicolons: it is also placed inside Mermaid labels. */
  definition: string;
}

/** What each indicator means. Used by the tooltips everywhere a key is shown. */
export const KEY_KINDS: Record<KeyKind, KeyKindInfo> = {
  pk: {
    abbreviation: 'PK',
    title: 'Primary key',
    definition: 'Uniquely identifies each row in this table.',
  },
  fk: {
    abbreviation: 'FK',
    title: 'Foreign key',
    definition: 'Links this column to a key in another table.',
  },
  identity: {
    abbreviation: 'ID',
    title: 'Identity',
    definition: 'The database generates this value automatically.',
  },
};

// The Lucide KeyRound and ArrowUpRight shapes (lucide-react 0.468) as SVG markup. Mermaid diagram labels
// cannot hold React components, so the diagram uses these copies of the same icons. Attributes use
// single quotes because Mermaid label text is parsed and double quotes or semicolons would break it.
const SHAPES: Record<'pk' | 'fk', string> = {
  pk:
    "<path d='M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'/>" +
    "<circle cx='16.5' cy='7.5' r='.5' fill='currentColor'/>",
  fk: "<path d='M7 7h10v10'/><path d='M7 17 17 7'/>",
};

export function keyIconSvg(kind: 'pk' | 'fk', size = 12): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' ` +
    `stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'>${SHAPES[kind]}</svg>`
  );
}

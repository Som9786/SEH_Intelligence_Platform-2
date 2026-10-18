import { cardinalityShort } from '../../table-details/utils/relationshipGraph';
import { CARD_WIDTH, type ErLayout } from './erLayout';

const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SVG = {
  background: '#f7faf8',
  card: '#ffffff',
  cardBorder: '#c9d8cf',
  head: '#e8f3ec',
  text: '#173b32',
  muted: '#5a6f64',
  confirmed: '#08784e',
  inferred: '#b45f12',
  pk: '#0f6a3c',
  fk: '#1d4f91',
};

/** A standalone SVG of the current layout, in light colours, for the "Export SVG" button. */
export function erSvg(layout: ErLayout): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" font-family="Inter, Arial, sans-serif">`,
    `<rect width="100%" height="100%" fill="${SVG.background}"/>`,
    `<defs><marker id="head-c" viewBox="0 0 10 10" refX="9.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${SVG.confirmed}"/></marker><marker id="head-i" viewBox="0 0 10 10" refX="9.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${SVG.inferred}"/></marker></defs>`,
  ];
  for (const { edge, path, lx, ly } of layout.edges) {
    const color = edge.confirmed ? SVG.confirmed : SVG.inferred;
    parts.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2"${edge.confirmed ? '' : ' stroke-dasharray="7 6"'} marker-end="url(#head-${edge.confirmed ? 'c' : 'i'})"/>`,
    );
    const label = [
      edge.fromColumns.join(', '),
      cardinalityShort(edge.cardinality),
    ]
      .filter(Boolean)
      .join(' · ');
    parts.push(
      `<text x="${lx}" y="${ly - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${xml(label)}</text>`,
    );
  }
  for (const card of layout.cards) {
    const { x, y, height, table, columns } = card;
    parts.push(
      `<rect x="${x}" y="${y}" width="${CARD_WIDTH}" height="${height}" rx="12" fill="${SVG.card}" stroke="${SVG.cardBorder}"/>`,
      `<path d="M ${x} ${y + 52} V ${y + 12} Q ${x} ${y} ${x + 12} ${y} H ${x + CARD_WIDTH - 12} Q ${x + CARD_WIDTH} ${y} ${x + CARD_WIDTH} ${y + 12} V ${y + 52} Z" fill="${SVG.head}"/>`,
      `<text x="${x + 14}" y="${y + 31}" font-size="14" font-weight="700" fill="${SVG.text}">${xml(table.id)}</text>`,
      `<text x="${x + CARD_WIDTH - 14}" y="${y + 30}" text-anchor="end" font-size="10" font-weight="700" fill="${SVG.muted}">${table.columnCount} cols</text>`,
    );
    columns.shown.forEach((c, i) => {
      const cy = y + 52 + i * 30 + 19;
      const key = [c.pk ? 'PK' : '', c.fk ? 'FK' : '']
        .filter(Boolean)
        .join(' ');
      parts.push(
        `<text x="${x + 14}" y="${cy}" font-size="11" font-weight="700" fill="${c.pk ? SVG.pk : SVG.fk}">${xml(key)}</text>`,
        `<text x="${x + 52}" y="${cy}" font-size="12" font-weight="600" fill="${SVG.text}">${xml(c.name)}</text>`,
        `<text x="${x + CARD_WIDTH - 14}" y="${cy}" text-anchor="end" font-size="11" fill="${SVG.muted}">${xml(c.dataType)}</text>`,
      );
    });
    if (columns.hidden > 0)
      parts.push(
        `<text x="${x + 14}" y="${y + 52 + columns.shown.length * 30 + 17}" font-size="10" fill="${SVG.muted}">+${columns.hidden} more columns</text>`,
      );
  }
  parts.push('</svg>');
  return parts.join('\n');
}

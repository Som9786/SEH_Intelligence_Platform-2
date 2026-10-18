import type { GraphEdge } from '../utils/relationshipGraph';
import { KeyBadge } from './KeyBadge';

/**
 * The column pairs of a relationship, "from → to". The referencing side carries the FK icon (only
 * for confirmed foreign keys, since an inferred join is not a declared key), and the referenced side
 * carries the PK icon when it is part of that table's primary key.
 */
export function RelationshipColumns({
  edge,
  primaryKeys,
}: {
  edge: GraphEdge;
  primaryKeys: ReadonlyMap<string, readonly string[]>;
}) {
  const parentKey = primaryKeys.get(edge.to) ?? [];
  return (
    <span className="td-dir-chips">
      {edge.fromColumns.map((column, i) => {
        const target = edge.toColumns[i] ?? '?';
        return (
          <span className="td-col-code rel-columns" key={column}>
            {edge.confirmed && (
              <KeyBadge
                kind="fk"
                extra={`${column} in ${edge.from} references ${edge.to}.`}
              />
            )}
            {column} →{' '}
            {parentKey.includes(target) && (
              <KeyBadge kind="pk" extra={`${target} in ${edge.to}.`} />
            )}
            {target}
          </span>
        );
      })}
    </span>
  );
}

import type {
  GraphEdge,
  RelationshipIndex,
} from '../../table-details/utils/relationshipGraph';

/** One assistant reply: paragraphs, plus an optional SQL example. */
export interface Reply {
  paragraphs: string[];
  code?: string;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const edgeText = (edge: GraphEdge) =>
  `${edge.from} (${edge.fromColumns.join(', ')}) references ${edge.to} (${edge.toColumns.join(', ')})` +
  (edge.confirmed ? '' : ', inferred');

/** The table ids a question mentions, by full id or by name without the schema. */
function mentionedTables(question: string, ids: string[]): string[] {
  const text = question.toLocaleLowerCase();
  return ids.filter((id) => {
    const name = id.split('.').pop() ?? id;
    return (
      text.includes(id.toLocaleLowerCase()) ||
      text.includes(name.toLocaleLowerCase())
    );
  });
}

function joinReply(index: RelationshipIndex, a: string, b: string): Reply {
  const edge = index.edges.find(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  );
  if (!edge)
    return {
      paragraphs: [
        `The catalog records no direct relationship between ${a} and ${b}, so there is no key to join them on.`,
      ],
    };
  const on = edge.fromColumns
    .map((col, i) => `c.${col} = p.${edge.toColumns[i] ?? col}`)
    .join(' AND ');
  return {
    paragraphs: [
      `Join on ${edge.fromColumns.join(', ')}. ${edge.from} is the child table, and ${edge.to} is the parent it references.` +
        (edge.confirmed
          ? ' This is a foreign key defined in the database.'
          : ' This link is inferred from names or data, so check it before relying on it.'),
    ],
    code: `SELECT *
FROM ${edge.from} AS c
JOIN ${edge.to} AS p
  ON ${on};`,
  };
}

function tableReply(index: RelationshipIndex, id: string): Reply {
  const table = index.tables.get(id);
  const edges = (index.byTable.get(id) ?? []).map((i) => index.edges[i]);
  const paragraphs = [
    table?.primaryKey.length
      ? `${id} has the primary key ${table.primaryKey.join(', ')}.`
      : `${id} has no primary key in the catalog.`,
  ];
  paragraphs.push(
    edges.length
      ? `It has ${plural(edges.length, 'relationship', 'relationships')}: ${edges.map(edgeText).join('; ')}.`
      : 'It has no recorded relationships.',
  );
  return { paragraphs };
}

/** The suggested questions, built from the tables actually in the catalog. */
export function suggestedQuestions(index: RelationshipIndex): string[] {
  const first = index.edges.find((e) => e.confirmed) ?? index.edges[0];
  return [
    'Which tables are related?',
    'Which tables have a primary key?',
    ...(first ? [`How would I join ${first.from} and ${first.to}?`] : []),
    'Which relationships are confirmed?',
    'Why are inferred relationships risky?',
  ];
}

/** A scripted reply built from the catalog. No model is called. */
export function scriptedReply(
  question: string,
  index: RelationshipIndex,
): Reply {
  const text = question.toLocaleLowerCase();
  const ids = [...index.tables.keys()];
  const tables = mentionedTables(question, ids);

  if (/inferred|risk/.test(text))
    return {
      paragraphs: [
        'An inferred relationship is suggested from column names or data patterns. The database does not enforce it, so rows can exist that break it.',
        'Treat inferred links as leads to verify. Confirmed links come from foreign keys defined in the database.',
      ],
    };
  if (/join/.test(text) && tables.length >= 2)
    return joinReply(index, tables[0], tables[1]);
  if (/primary key/.test(text)) {
    const withKey = [...index.tables.values()].filter(
      (t) => t.primaryKey.length,
    );
    return {
      paragraphs: [
        withKey.length
          ? `${plural(withKey.length, 'table has', 'tables have')} a primary key: ${withKey.map((t) => `${t.id} (${t.primaryKey.join(', ')})`).join('; ')}.`
          : 'No table has a primary key in the catalog.',
      ],
    };
  }
  if (/confirmed/.test(text)) {
    const confirmed = index.edges.filter((e) => e.confirmed);
    return {
      paragraphs: [
        confirmed.length
          ? `${plural(confirmed.length, 'relationship is', 'relationships are')} confirmed by a database foreign key: ${confirmed.map(edgeText).join('; ')}.`
          : 'No relationship is confirmed by a database foreign key.',
      ],
    };
  }
  if (/relat|link|connect/.test(text) && tables.length === 0)
    return {
      paragraphs: [
        index.edges.length
          ? `The catalog records ${plural(index.edges.length, 'relationship', 'relationships')}: ${index.edges.map(edgeText).join('; ')}.`
          : 'The catalog records no relationships.',
      ],
    };
  if (tables.length) return tableReply(index, tables[0]);
  return {
    paragraphs: [
      'This demo only knows scripted answers about table keys and relationships. Pick one of the suggested questions, or mention a table name.',
    ],
  };
}

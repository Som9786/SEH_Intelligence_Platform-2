/** What a piece of a query is, for colouring it. `text` is spaces and punctuation, left plain. */
export type SqlTokenKind =
  'keyword' | 'function' | 'name' | 'string' | 'number' | 'comment' | 'text';

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

// The words the queries here use (PostgreSQL for Analytics, SQL Server for DB Catalog), upper or lower case.
const KEYWORDS = new Set(
  `select from where and or not in is null as on join inner left right full outer cross group by order
  having limit offset top distinct union all case when then else end with asc desc between like ilike exists
  any some cast interval true false over partition rows range preceding following current row nulls first last
  filter within insert update delete into values set create alter drop table view index`
    .split(/\s+/)
    .filter(Boolean),
);

// Comments, strings, quoted names, numbers, words, and one character of anything else.
const TOKEN =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?|\[[^\]]*\]?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$]*)|([\s\S])/g;

/**
 * Splits a query into coloured pieces. A word is a keyword, a function (when "(" follows it) or a
 * name. Joining the pieces' text gives back the query exactly.
 */
export function sqlTokens(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const push = (kind: SqlTokenKind, text: string) => {
    const last = tokens[tokens.length - 1];
    // Neighbouring plain text is kept as one piece, so a query isn't hundreds of spans.
    if (kind === 'text' && last?.kind === 'text') last.text += text;
    else tokens.push({ kind, text });
  };
  for (const m of sql.matchAll(TOKEN)) {
    const [text, comment, string, quoted, number, word] = m;
    if (comment) push('comment', text);
    else if (string) push('string', text);
    else if (quoted) push('name', text);
    else if (number) push('number', text);
    else if (word) {
      const next = sql.slice((m.index ?? 0) + text.length).match(/^\s*\(/);
      if (KEYWORDS.has(word.toLowerCase())) push('keyword', text);
      else if (next) push('function', text);
      else push('name', text);
    } else push('text', text);
  }
  return tokens;
}

// Words that start a clause on a new line, and the join words that come before JOIN.
const CLAUSES = new Set([
  'from',
  'where',
  'group',
  'order',
  'having',
  'limit',
  'union',
  'join',
]);
const JOIN_PREFIXES = new Set(['inner', 'left', 'right', 'full', 'cross']);

/**
 * The query with each main clause (FROM, WHERE, JOIN, GROUP BY, ORDER BY, ...) on a line of its own,
 * for queries written on one line. Only clauses outside brackets move, so a subquery or OVER (ORDER
 * BY ...) stays together; a query that already has line breaks is left as written.
 */
export function laidOut(tokens: SqlToken[]): SqlToken[] {
  if (tokens.some((t) => t.text.includes('\n'))) return tokens;
  let depth = 0;
  return tokens.map((token, i) => {
    if (token.kind === 'text') {
      for (const c of token.text) depth += c === '(' ? 1 : c === ')' ? -1 : 0;
      const next = tokens[i + 1];
      const word = next?.kind === 'keyword' ? next.text.toLowerCase() : '';
      const prev = tokens[i - 1]?.text.toLowerCase() ?? '';
      const startsClause =
        JOIN_PREFIXES.has(word) ||
        (CLAUSES.has(word) && !(word === 'join' && JOIN_PREFIXES.has(prev)));
      if (depth === 0 && startsClause && /^\s+$/.test(token.text))
        return { kind: 'text', text: '\n' };
    }
    return token;
  });
}

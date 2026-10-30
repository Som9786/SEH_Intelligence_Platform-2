import { describe, expect, it } from 'vitest';
import { laidOut, sqlTokens } from './sqlTokens';

const kinds = (sql: string) =>
  sqlTokens(sql)
    .filter((t) => t.kind !== 'text')
    .map((t) => `${t.kind}:${t.text}`);

describe('sqlTokens', () => {
  it('gives back the query exactly', () => {
    const sql = `SELECT c.CustomerId, round(sum(o.Amount), 2) AS total -- per customer
FROM Customers c INNER JOIN Orders o ON c.CustomerId = o.CustomerId
WHERE o.Note ILIKE '%it''s%' AND [Order Date] >= '2026-08-16'
LIMIT 100`;
    expect(
      sqlTokens(sql)
        .map((t) => t.text)
        .join(''),
    ).toBe(sql);
  });

  it('tells keywords, functions, names, strings, numbers and comments apart', () => {
    expect(
      kinds(
        "select round(x, 2) as total from t where name = 'a''b' /* note */",
      ),
    ).toEqual([
      'keyword:select',
      'function:round',
      'name:x',
      'number:2',
      'keyword:as',
      'name:total',
      'keyword:from',
      'name:t',
      'keyword:where',
      'name:name',
      "string:'a''b'",
      'comment:/* note */',
    ]);
  });

  it('treats quoted and bracketed identifiers as names', () => {
    expect(kinds('SELECT "Net Sales", [Order Date] FROM x')).toEqual([
      'keyword:SELECT',
      'name:"Net Sales"',
      'name:[Order Date]',
      'keyword:FROM',
      'name:x',
    ]);
  });

  it('keeps an unfinished string to the end instead of failing', () => {
    expect(kinds("SELECT 'abc")).toEqual(['keyword:SELECT', "string:'abc"]);
  });

  it('puts each main clause of a one-line query on its own line', () => {
    const text = (sql: string) =>
      laidOut(sqlTokens(sql))
        .map((t) => t.text)
        .join('');
    expect(
      text(
        'SELECT a, row_number() OVER (ORDER BY b) AS n FROM t LEFT JOIN u ON t.id = u.id WHERE a > 1 GROUP BY a ORDER BY a LIMIT 5',
      ),
    ).toBe(
      [
        'SELECT a, row_number() OVER (ORDER BY b) AS n',
        'FROM t',
        'LEFT JOIN u ON t.id = u.id',
        'WHERE a > 1',
        'GROUP BY a',
        'ORDER BY a',
        'LIMIT 5',
      ].join('\n'),
    );
    // Already on several lines: left as written.
    expect(text('SELECT a\n  FROM t')).toBe('SELECT a\n  FROM t');
  });
});

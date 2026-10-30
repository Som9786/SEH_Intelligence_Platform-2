import type {
  AnalyticsResult,
  CatalogJoin,
  DbCatalogResult,
} from '../services/assistantService';

export type Confidence = 'High' | 'Medium' | 'Low';

/** What an answer shows besides its text: how it was reached, how far to trust it, and what it used. */
export interface AnswerDetails {
  steps: string[];
  confidence: { level: Confidence; note: string };
  /** Knowledge model concepts (Analytics) or tables (DB Catalog). */
  dataUsed: string[];
}

const sentence = (text: string) => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** "A", "A and B", "A, B and C". */
export function listOf(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** For an answered Analytics question; null when the data can't answer it. */
export function analyticsDetails(
  result: AnalyticsResult,
): AnswerDetails | null {
  if (!result.answerable || !result.result) return null;
  const concepts = result.knowledgeModel ?? [];
  const rows = result.result.rows.length;

  const steps = [
    concepts.length
      ? `Matched the question to ${listOf(concepts)} in the knowledge model.`
      : 'Looked the question up in the knowledge model.',
    // What the generated query does, in AI Hub's words.
    result.explanation
      ? sentence(result.explanation)
      : 'Wrote a SQL query for it.',
    result.corrected
      ? `The first query failed, so it was corrected and run again: ${plural(rows, 'row')}${result.result.truncated ? ' (more were cut off)' : ''}.`
      : `Ran it on the POS basket data: ${plural(rows, 'row')}${result.result.truncated ? ' (more were cut off)' : ''}.`,
  ];
  if (result.answer) steps.push('Summarised the rows in plain English.');

  const confidence: AnswerDetails['confidence'] =
    rows === 0
      ? {
          level: 'Low',
          note: 'The query returned no rows, so nothing backs the answer.',
        }
      : result.corrected
        ? {
            level: 'Medium',
            note: 'The first query failed and was corrected; check the query in Data behind this.',
          }
        : result.result.truncated
          ? {
              level: 'Medium',
              note: 'Only part of the result came back; the answer covers the rows shown.',
            }
          : {
              level: 'High',
              note: 'The query ran first time and returned every row; the numbers come straight from it.',
            };

  return { steps, confidence, dataUsed: concepts };
}

const isInferred = (join: CatalogJoin) =>
  !join.enforced && join.evidence !== 'confirmed';

/** Every join the answer's join paths use, once each (paths can share a step). */
export function joinsOf(result: DbCatalogResult): CatalogJoin[] {
  const joins = new Map<string, CatalogJoin>();
  for (const path of result.joinPaths ?? [])
    for (const step of path.steps) joins.set(step.on, step);
  return [...joins.values()];
}

/** For a DB Catalog answer. */
export function dbCatalogDetails(result: DbCatalogResult): AnswerDetails {
  const matched = result.matched ?? [];
  const joins = joinsOf(result);

  const steps = matched
    .slice(0, 3)
    .map((match) => `Matched ${match.table}: ${sentence(match.why)}`);
  if (!steps.length && result.tables.length)
    steps.push(`Looked up ${listOf(result.tables)} in the catalog.`);
  for (const path of (result.joinPaths ?? []).slice(0, 2))
    steps.push(
      `Found how ${path.from} joins ${path.to}${path.steps.length > 1 ? ` in ${path.steps.length} steps` : ''}.`,
    );
  if (result.sql) steps.push('Wrote an example query (not run).');

  const confidence: AnswerDetails['confidence'] = !result.tables.length
    ? {
        level: 'Low',
        note: 'No table in the catalog clearly matched the question.',
      }
    : joins.some(isInferred)
      ? {
          level: 'Medium',
          note: 'A join it relies on is inferred from the data, not a foreign key.',
        }
      : {
          level: 'High',
          note: 'Based on the documented catalog for these tables.',
        };

  return { steps, confidence, dataUsed: result.tables };
}

/** "16 Aug – 22 Aug 2026", and the number of days. */
export function coverageOf(range: { from: string; to: string }) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const day = (date: Date, year: boolean) =>
    date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
    });
  return {
    label: `${day(from, from.getFullYear() !== to.getFullYear())} – ${day(to, true)}`,
    days: Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  };
}

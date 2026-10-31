import { apiJson } from '../../../platform/api/apiClient';
import type { Board } from '../../../platform/api/workspaceService';

export type Intent = 'analytics' | 'db-catalog' | 'unclear';

/** The longest question the services accept (QuestionRules.MaxLength in Insights.Common). */
export const MAX_QUESTION_LENGTH = 2000;

/** Analytics POST /ask: a query on the sales data, its rows and a plain-English answer. */
export interface AnalyticsResult {
  question: string;
  answerable: boolean;
  sql: string;
  /** Why the question can't be answered from the data, when answerable is false. */
  explanation: string;
  result: {
    columns: string[];
    rows: Record<string, unknown>[];
    truncated: boolean;
  } | null;
  answer: string | null;
  costUsd: number | null;
  corrected?: boolean;
  knowledgeModel?: string[] | null;
  /** When the rows were read from the database. */
  fetchedAt?: string | null;
  /** A short heading for the result, such as "Top 5 Stores by Net Sales"; null when the AI gave none. */
  title?: string | null;
}

/** One join between two tables, as the DB Catalog catalog describes it. */
export interface CatalogJoin {
  from: string;
  to: string;
  on: string;
  meaning: string;
  cardinality: string;
  /** A foreign key in the database. */
  enforced: boolean;
  /** "confirmed" or "inferred" from the data. */
  evidence: string;
}

/** DB Catalog POST /ask: an answer about the database's structure, in Markdown, with an example query. */
export interface DbCatalogResult {
  question: string;
  answer: string;
  tables: string[];
  sql: string;
  cached: boolean;
  /** The tables the question matched, and why. */
  matched?: { table: string; why: string }[];
  /** How the matched tables join, step by step. */
  joinPaths?: { from: string; to: string; steps: CatalogJoin[] }[];
}

/** Analytics POST /context: the part of the knowledge model a question is about. */
export interface AnalyticsContext {
  dialect: string;
  coverage: { from: string; to: string } | null;
  matched: string[];
  tables: { name: string; description: string }[];
  concepts: { name: string; description: string }[];
  metrics: { name: string; description: string; expression: string }[];
  rules: string[];
}

/** DB Catalog POST /context: the part of the catalog a question is about. */
export interface DbCatalogContext {
  database: {
    name: string;
    provider: string;
    version: string;
    summary: string;
  } | null;
  tables: {
    id: string;
    area: string;
    purpose: string;
    rowCount: number | null;
    rules: { text: string; evidence: string }[];
  }[];
  otherTables: { id: string }[];
}

export const loadAnalyticsContext = (question: string) =>
  apiJson<AnalyticsContext>('analytics/context', { body: { question } });

export const loadDbCatalogContext = (question: string) =>
  apiJson<DbCatalogContext>('db-catalog/context', { body: { question } });

/** AI Hub POST /ask, through the gateway at /api/ai/ask. */
export type AssistantReply = {
  question: string;
  reason: string;
  message: string | null;
  /** The capability board an answer about the data can be added to. */
  board: Board | 'none';
  /** The chart the question asks for, as AI Hub read it ("none" when it asks for none; see askedOf). */
  chart?: string;
} & (
  | { intent: 'analytics'; service: 'analytics'; result: AnalyticsResult }
  | { intent: 'db-catalog'; service: 'db-catalog'; result: DbCatalogResult }
  | { intent: 'unclear'; service: null; result: null }
);

/** One earlier exchange, sent as history so a follow-up ("and by store?") is understood. */
export interface AssistantTurn {
  question: string;
  intent: Intent;
  /** DB Catalog's answer, for its follow-ups. */
  answer?: string;
  /** Analytics' query, for its follow-ups. */
  sql?: string;
}

export function turnOf(reply: AssistantReply): AssistantTurn {
  if (reply.intent === 'analytics')
    return {
      question: reply.question,
      intent: reply.intent,
      sql: reply.result.sql,
    };
  if (reply.intent === 'db-catalog')
    return {
      question: reply.question,
      intent: reply.intent,
      answer: reply.result.answer,
    };
  return { question: reply.question, intent: reply.intent };
}

/** Asks AI Hub, which works out whether the question is about the sales data or the database, and asks that service. */
export function askAssistant(
  question: string,
  history: AssistantTurn[],
  signal?: AbortSignal,
): Promise<AssistantReply> {
  return apiJson<AssistantReply>('ai/ask', {
    body: { question, history },
    signal,
  });
}

/** Up to three questions to ask next, suggested by AI Hub from the question and the answer shown. */
export async function loadFollowUps(reply: AssistantReply): Promise<string[]> {
  const body =
    reply.intent === 'analytics'
      ? {
          question: reply.question,
          intent: reply.intent,
          answer: reply.result.answer ?? reply.result.explanation,
          columns: reply.result.result?.columns ?? [],
        }
      : reply.intent === 'db-catalog'
        ? {
            question: reply.question,
            intent: reply.intent,
            answer: reply.result.answer,
          }
        : null;
  if (!body) return [];
  const { questions } = await apiJson<{ questions: string[] }>(
    'ai/follow-ups',
    { body },
  );
  return questions.slice(0, 3);
}

/** One thing to do about an answer, suggested by AI Hub from its rows. */
export interface Recommendation {
  action: string;
  /** The figures from the rows that call for it. */
  why: string;
  /** The team that would act on it, such as "Merchandising". */
  owner: string;
  priority: 'high' | 'medium' | 'low';
}

/** Analytics POST /recommend: what to do about an answer, and a note about the data itself. */
export interface Recommendations {
  recommendations: Recommendation[];
  /** Something to bear in mind about the data, such as a partial last day; null when none. */
  dataNote: string | null;
}

/** Fewer rows than this have nothing to compare (a single total), so none are asked for. */
const MIN_RECOMMENDATION_ROWS = 2;

/** Whether an answer has enough rows to recommend anything from. */
export function canRecommend(reply: AssistantReply): boolean {
  return (
    reply.intent === 'analytics' &&
    !!reply.result.sql &&
    (reply.result.result?.rows.length ?? 0) >= MIN_RECOMMENDATION_ROWS
  );
}

/**
 * Up to three actions for an answer about the data, most pressing first. Analytics first sets the
 * rows against a benchmark (the chain average, the previous period), then AI Hub suggests actions.
 */
export async function loadRecommendations(
  reply: AssistantReply,
): Promise<Recommendations> {
  if (reply.intent !== 'analytics' || !canRecommend(reply))
    return { recommendations: [], dataNote: null };
  const { recommendations, dataNote } = await apiJson<Recommendations>(
    'analytics/recommend',
    {
      body: {
        question: reply.question,
        sql: reply.result.sql,
        answer: reply.result.answer ?? reply.result.explanation,
        result: reply.result.result,
      },
    },
  );
  return { recommendations: recommendations.slice(0, 3), dataNote };
}

/** The questions each service suggests about itself: the sales data (Analytics) and the database (DB Catalog). */
export interface SuggestedQuestions {
  data: string[];
  structure: string[];
}

interface ServiceProfile {
  name: string;
  suggestions: string[];
}

/** Reads both lists; a service that doesn't answer contributes none. */
export async function loadSuggestedQuestions(): Promise<SuggestedQuestions> {
  const [data, structure] = await Promise.allSettled([
    apiJson<ServiceProfile>('analytics/dataset'),
    apiJson<ServiceProfile>('db-catalog/guide'),
  ]);
  const list = (settled: PromiseSettledResult<ServiceProfile>) =>
    settled.status === 'fulfilled' && Array.isArray(settled.value.suggestions)
      ? settled.value.suggestions.filter((s) => typeof s === 'string')
      : [];
  return { data: list(data), structure: list(structure) };
}

/** Takes from each list in turn, so a short list shows both kinds of question. */
export function interleave(
  { data, structure }: SuggestedQuestions,
  count: number,
): string[] {
  const out: string[] = [];
  for (
    let i = 0;
    out.length < count && i < Math.max(data.length, structure.length);
    i++
  ) {
    if (data[i]) out.push(data[i]);
    if (out.length < count && structure[i]) out.push(structure[i]);
  }
  return out;
}

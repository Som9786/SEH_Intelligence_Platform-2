import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { formatWhen } from '../../../platform/api/workspaceService';
import {
  loadAnalyticsContext,
  loadDbCatalogContext,
  type AnalyticsResult,
  type DbCatalogResult,
} from '../services/assistantService';
import { coverageOf, joinsOf } from '../utils/answerDetails';
import { ResultTable } from './ResultTable';
import { SideFlyout } from '../../../shared/components/SideFlyout';
import { SqlCode } from '../../../shared/components/SqlCode';

type Source = { question: string; reason: string } & (
  | { intent: 'analytics'; result: AnalyticsResult }
  | { intent: 'db-catalog'; result: DbCatalogResult }
);

/**
 * "Data behind this": a panel on the right with what an answer is based on. The answer's own
 * query and rows come with the reply; the definitions, rules and coverage are read when the
 * panel opens (Analytics or DB Catalog POST /context, no AI involved).
 */
export function DataBehindThis({
  source,
  onClose,
}: {
  source: Source;
  onClose: () => void;
}) {
  return (
    <SideFlyout
      kicker="Data behind this"
      title={source.question}
      onClose={onClose}
    >
      {source.intent === 'analytics' ? (
        <AnalyticsData
          question={source.question}
          result={source.result}
          reason={<Reason text={source.reason} />}
        />
      ) : (
        <DbCatalogData
          question={source.question}
          result={source.result}
          reason={<Reason text={source.reason} />}
        />
      )}
    </SideFlyout>
  );
}

function Stats({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <dl className="dbt-stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dbt-section">
      <h3 className="ia-label">{title}</h3>
      {children}
    </section>
  );
}

/** Why AI Hub sent the question to this service. */
function Reason({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Section title="Why it was routed here">
      <p className="dbt-strong">{text}</p>
    </Section>
  );
}

function Chips({ items, link }: { items: string[]; link?: boolean }) {
  const { can } = useAuth();
  return (
    <ul className="td-badge-row dbt-chips">
      {items.map((item) => (
        <li className="td-chip td-chip-columns" key={item}>
          {link && can('db-catalog') ? (
            <Link to={`/db-catalog/tables?table=${encodeURIComponent(item)}`}>
              {item}
            </Link>
          ) : (
            item
          )}
        </li>
      ))}
    </ul>
  );
}

/** Loading and error states while the context is read. */
function Pending({
  query,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => unknown;
  };
}) {
  if (query.isPending)
    return (
      <p className="ia-thinking" role="status">
        <span className="spinner" aria-hidden="true" />
        Reading the definitions…
      </p>
    );
  if (query.isError)
    return (
      <div className="ia-error" role="alert">
        <p>{query.error?.message}</p>
        <button
          type="button"
          className="td-action"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  return null;
}

/**
 * What an Analytics answer is based on. Also shown at the foot of an insight's page ("page"),
 * which leaves out the result, the data used and the query it already shows, and of a shared
 * report ("report"), which also leaves out table names and the query's rules.
 */
export function AnalyticsData({
  question,
  reason,
  result,
  view = 'flyout',
}: {
  question: string;
  reason: ReactNode;
  result: AnalyticsResult;
  view?: 'flyout' | 'page' | 'report';
}) {
  const onPage = view !== 'flyout';
  const context = useQuery({
    queryKey: ['assistant', 'context', 'analytics', question],
    queryFn: () => loadAnalyticsContext(question),
    staleTime: 10 * 60_000,
  });
  const data = context.data;
  const coverage = data?.coverage ? coverageOf(data.coverage) : null;
  const rows = result.result?.rows.length ?? 0;
  const concepts = result.knowledgeModel?.length
    ? result.knowledgeModel
    : (data?.matched ?? []);
  const definitions = data
    ? [
        ...data.metrics.map((m) => ({ name: m.name, text: m.description })),
        ...data.concepts.map((c) => ({ name: c.name, text: c.description })),
      ]
    : [];

  return (
    <>
      <Stats
        items={[
          { value: data ? data.tables.length : '…', label: 'data sources' },
          { value: coverage ? coverage.days : '…', label: 'days covered' },
          {
            value: `${rows}${result.result?.truncated ? '+' : ''}`,
            label: 'rows returned',
          },
        ]}
      />
      {reason}
      {result.result && !onPage && (
        <Section title="Data returned">
          <ResultTable result={result.result} />
        </Section>
      )}
      <Pending query={context} />
      {data && (
        <>
          <Section title="Sources used">
            {view !== 'report' && (
              <Chips items={data.tables.map((t) => t.name)} />
            )}
            {data.tables.map((t) => (
              <p className="dbt-text" key={t.name}>
                {t.description}
              </p>
            ))}
          </Section>
          <Section title="Coverage">
            <p className="dbt-strong">
              {coverage
                ? `Business dates ${coverage.label}`
                : 'All dates in the data'}{' '}
              · {data.dialect}
            </p>
          </Section>
        </>
      )}
      {concepts.length > 0 && !onPage && (
        <Section title="Data used">
          <Chips items={concepts} />
        </Section>
      )}
      {definitions.length > 0 && (
        <Section title="Business definitions">
          <dl className="dbt-defs">
            {definitions.map((d) => (
              <div key={d.name}>
                <dt>{d.name}</dt>
                <dd>{d.text}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {data && data.rules.length > 0 && view !== 'report' && (
        <details className="ia-sql dbt-details">
          <summary>Rules the query follows ({data.rules.length})</summary>
          <ol className="dbt-rules">
            {data.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </details>
      )}
      {result.sql && !onPage && (
        <Section title="Query that was run">
          <SqlCode sql={result.sql} />
        </Section>
      )}
      <p className="dbt-note">
        Live data
        {result.fetchedAt &&
          `, synced from the database ${formatWhen(result.fetchedAt)}`}
        . The numbers come from the query run on{' '}
        {data?.dialect ?? 'the database'}; the wording is written by OpenAI from
        those rows.
        {result.corrected && ' The first query failed and was corrected.'}
        {result.costUsd === 0
          ? ' Reused an earlier answer, no OpenAI cost.'
          : result.costUsd !== null
            ? ` OpenAI cost about $${result.costUsd.toFixed(4)}.`
            : ''}
      </p>
    </>
  );
}

function DbCatalogData({
  question,
  reason,
  result,
}: {
  question: string;
  reason: ReactNode;
  result: DbCatalogResult;
}) {
  const context = useQuery({
    queryKey: ['assistant', 'context', 'db-catalog', question],
    queryFn: () => loadDbCatalogContext(question),
    staleTime: 10 * 60_000,
  });
  const data = context.data;
  const joins = joinsOf(result);
  const used = data?.tables.filter((t) => result.tables.includes(t.id)) ?? [];

  return (
    <>
      <Stats
        items={[
          { value: result.tables.length, label: 'tables used' },
          { value: joins.length, label: 'joins' },
          {
            value: data ? data.tables.length + data.otherTables.length : '…',
            label: 'tables in catalog',
          },
        ]}
      />
      {reason}
      <Pending query={context} />
      {data?.database && (
        <Section title="Database">
          <p className="dbt-strong">
            {data.database.name} · {data.database.provider}{' '}
            {data.database.version}
          </p>
          <p className="dbt-text">{data.database.summary}</p>
        </Section>
      )}
      {result.tables.length > 0 && (
        <Section title="Sources used">
          <Chips items={result.tables} link />
        </Section>
      )}
      {(result.matched?.length ?? 0) > 0 && (
        <Section title="Why these tables">
          <dl className="dbt-defs">
            {result.matched!.map((m) => (
              <div key={m.table}>
                <dt>{m.table}</dt>
                <dd>{m.why}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {joins.length > 0 && (
        <Section title="How they join">
          <dl className="dbt-defs">
            {joins.map((join) => (
              <div key={join.on}>
                <dt>
                  <code>{join.on}</code>
                  <span
                    className={`dbt-evidence${join.enforced ? '' : ' is-inferred'}`}
                  >
                    {join.enforced ? 'Foreign key' : join.evidence}
                  </span>
                </dt>
                <dd>{join.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {used.some((t) => t.rules.length > 0) && (
        <Section title="Business rules">
          <dl className="dbt-defs">
            {used
              .filter((t) => t.rules.length > 0)
              .map((t) => (
                <div key={t.id}>
                  <dt>{t.id}</dt>
                  <dd>
                    <ul className="dbt-rules">
                      {t.rules.map((rule) => (
                        <li key={rule.text}>
                          {rule.text}
                          {rule.evidence !== 'confirmed' && (
                            <span className="dbt-evidence is-inferred">
                              {rule.evidence}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
          </dl>
        </Section>
      )}
      {result.sql && (
        <Section title="Example query (not run)">
          <SqlCode sql={result.sql} />
        </Section>
      )}
      <p className="dbt-note">
        From the DB Catalog catalog in Neo4j. The example query was not run.
        {result.cached && ' Reused an earlier answer.'}
      </p>
    </>
  );
}

import { Database, Download } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  Confidence,
  Prose,
  Steps,
} from '../../ai-assistant/components/AssistantAnswer';
import { AnalyticsData } from '../../ai-assistant/components/DataBehindThis';
import { ResultChart } from '../../ai-assistant/components/ResultVisual';
import { ResultTable } from '../../ai-assistant/components/ResultTable';
import { analyticsDetails } from '../../ai-assistant/utils/answerDetails';
import { visualOf } from '../../ai-assistant/utils/visualOf';
import { useAuth } from '../../auth/useAuth';
import { PageHeading } from '../../../shared/components/PageHeading';
import { SqlCode } from '../../../shared/components/SqlCode';
import {
  ageOf,
  BOARD_LABEL,
  formatWhen,
} from '../../workspace/workspaceService';
import { asAnalyticsResult, downloadCsv, type Insight } from '../utils/insight';

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel ins-panel">
      <header className="ins-panel-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * An insight on a page of its own: the answer and how far to trust it, the chart and every row,
 * on the side how it was reached, the data it used and the query that was run, and at the foot
 * the data behind it. Board widgets open here in a new tab; a shared link opens SharedReport.
 */
export function InsightView({
  insight,
  actions,
}: {
  insight: Insight;
  /** Buttons beside the title (Share, Copy link…). */
  actions: ReactNode;
}) {
  const { can } = useAuth();
  const asResult = useMemo(() => asAnalyticsResult(insight), [insight]);
  const details = useMemo(() => analyticsDetails(asResult), [asResult]);
  const charted = useMemo(
    () => (insight.result ? visualOf(insight.result).kind !== 'table' : false),
    [insight.result],
  );
  // The definitions behind it are read from Analytics (POST /context), which these pages may call.
  const canSeeData = can('basket-intelligence') || can('insights-assistant');
  const concepts = insight.details?.knowledgeModel ?? [];
  const rows = insight.result?.rows.length ?? 0;

  return (
    <div className="page-content ins-page">
      <PageHeading
        eyebrow={BOARD_LABEL[insight.board]}
        title={insight.title}
        description="The answer, the data behind it and how it was reached."
        badge={<div className="ins-actions">{actions}</div>}
      />
      {insight.fetchedAt && (
        <dl className="bw-status ins-meta">
          <div>
            <dt>
              <Database size={13} aria-hidden="true" />
              Data synced
            </dt>
            <dd>
              <time dateTime={insight.fetchedAt}>
                {formatWhen(insight.fetchedAt)}
              </time>{' '}
              <span className="bw-age">({ageOf(insight.fetchedAt)})</span>
            </dd>
          </div>
        </dl>
      )}

      <div className="ins-layout">
        <div className="ins-main">
          <Panel title="Answer">
            {insight.title !== insight.question && (
              <p className="ins-question">{insight.question}</p>
            )}
            {insight.answer ? (
              <Prose markdown={insight.answer} />
            ) : (
              <p className="ins-note">No written answer was kept.</p>
            )}
            {details && insight.details && (
              <Confidence confidence={details.confidence} />
            )}
          </Panel>
          {insight.result && charted && (
            <Panel title="Chart">
              <ResultChart result={insight.result} />
            </Panel>
          )}
          {insight.result && (
            <Panel
              title="Data"
              action={
                rows > 0 && (
                  <button
                    type="button"
                    className="td-action"
                    onClick={() => downloadCsv(insight)}
                  >
                    <Download size={15} aria-hidden="true" />
                    Download CSV
                  </button>
                )
              }
            >
              {/* Every row kept (at most 500): the page is where the whole result is read. */}
              <ResultTable
                result={insight.result}
                dataBars
                maxRows={Infinity}
              />
            </Panel>
          )}
        </div>

        <aside className="ins-side" aria-label="Answer details">
          <Panel title="Answer details">
            {insight.details && details ? (
              <Steps steps={details.steps} />
            ) : (
              <p className="ins-note">
                How this answer was reached wasn't kept when it was added.
                Refresh the widget on its board to record it.
              </p>
            )}
          </Panel>
          {concepts.length > 0 && (
            <Panel title="Data used">
              <ul className="td-badge-row dbt-chips">
                {concepts.map((concept) => (
                  <li className="td-chip td-chip-columns" key={concept}>
                    {concept}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {insight.details?.sql && (
            <Panel title="Query that was run">
              <SqlCode sql={insight.details.sql} className="ins-code" />
            </Panel>
          )}
        </aside>
      </div>

      {canSeeData && (
        <section className="panel ins-panel ins-behind">
          <header className="ins-panel-head">
            <h2>Data behind this</h2>
          </header>
          <AnalyticsData
            question={insight.question}
            reason={null}
            result={asResult}
            view="page"
          />
        </section>
      )}
    </div>
  );
}

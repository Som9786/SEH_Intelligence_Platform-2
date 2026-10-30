import { Check, Copy, Download, Printer } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { BrandLogo } from '../../../shared/components/BrandLogo';
import {
  BOARD_LABEL,
  formatWhen,
  type SharedInsight,
} from '../../workspace/workspaceService';
import { asAnalyticsResult, downloadCsv } from '../utils/insight';

/** The report's header: the platform's name and, on screen only, what can be done with it. */
export function ReportFrame({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rp-page">
      <header className="rp-bar">
        <div className="rp-brand">
          <BrandLogo size={30} />
          <span>SEH Intelligence Platform</span>
        </div>
        {actions && <div className="rp-actions">{actions}</div>}
      </header>
      <main className="rp-doc">{children}</main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rp-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/**
 * A shared insight as a report to read or print: no sidebar or top bar, one column from the
 * answer to the data behind it. It leaves out the query and table names; the data it shows is the
 * copy made when it was shared.
 */
export function SharedReport({ share }: { share: SharedInsight }) {
  const { can } = useAuth();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const asResult = useMemo(() => asAnalyticsResult(share), [share]);
  const details = useMemo(() => analyticsDetails(asResult), [asResult]);
  const charted = useMemo(
    () => (share.result ? visualOf(share.result).kind !== 'table' : false),
    [share.result],
  );
  // The definitions are read from Analytics, which these users may call.
  const canSeeData = can('basket-intelligence') || can('insights-assistant');
  const concepts = share.details?.knowledgeModel ?? [];
  const rows = share.result?.rows.length ?? 0;

  return (
    <ReportFrame
      actions={
        <>
          <button
            type="button"
            className="td-action"
            onClick={() =>
              void navigator.clipboard
                .writeText(window.location.href)
                .then(() => setCopied(true))
                .catch(() => undefined)
            }
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            className="td-action td-action-primary"
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            Print / Save as PDF
          </button>
        </>
      }
    >
      <header className="rp-title">
        <p className="eyebrow">{BOARD_LABEL[share.board]} · Shared insight</p>
        <h1>{share.title}</h1>
        {share.title !== share.question && (
          <p className="rp-question">{share.question}</p>
        )}
        <dl className="rp-meta">
          <div>
            <dt>Shared by</dt>
            <dd>
              {share.sharedBy} on {formatWhen(share.sharedAt)}
            </dd>
          </div>
          {share.fetchedAt && (
            <div>
              <dt>Data synced</dt>
              <dd>{formatWhen(share.fetchedAt)}</dd>
            </div>
          )}
          {share.expiresAt && (
            <div>
              <dt>Link expires</dt>
              <dd>{formatWhen(share.expiresAt)}</dd>
            </div>
          )}
        </dl>
      </header>

      <Section title="Answer">
        {share.answer ? (
          <Prose markdown={share.answer} />
        ) : (
          <p className="ins-note">No written answer was kept.</p>
        )}
        {details && share.details && (
          <Confidence confidence={details.confidence} />
        )}
      </Section>

      {share.result && charted && (
        <Section title="Chart">
          <ResultChart result={share.result} />
        </Section>
      )}

      {share.result && (
        <section className="rp-section">
          <div className="rp-section-head">
            <h2>Data</h2>
            {rows > 0 && (
              <button
                type="button"
                className="td-action rp-screen-only"
                onClick={() => downloadCsv(share)}
              >
                <Download size={15} aria-hidden="true" />
                Download CSV
              </button>
            )}
          </div>
          <ResultTable result={share.result} dataBars maxRows={Infinity} />
        </section>
      )}

      {share.details && details && (
        <Section title="How it was reached">
          <Steps steps={details.steps} />
          {concepts.length > 0 && (
            <ul className="td-badge-row dbt-chips">
              {concepts.map((concept) => (
                <li className="td-chip td-chip-columns" key={concept}>
                  {concept}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {canSeeData && (
        <Section title="Data behind this">
          <AnalyticsData
            question={share.question}
            reason={null}
            result={asResult}
            view="report"
          />
        </Section>
      )}

      <footer className="rp-footer">
        A copy of this insight as it was when {share.sharedBy} shared it, from
        the SEH Intelligence Platform. Later changes to the data aren't shown.
      </footer>
    </ReportFrame>
  );
}

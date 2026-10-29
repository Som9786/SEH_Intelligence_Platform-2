import { Clock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';

interface Schedule {
  question: string;
  lastRun: string;
  capability: string;
  frequency: string;
  nextRun: string;
  active: boolean;
}

// SAMPLE ONLY: a preview of the page shown behind the coming-soon overlay.
const SCHEDULES: Schedule[] = [
  {
    question: 'Show me fresh food items with increasing waste.',
    lastRun: 'Last run Mon 21 Sep · 7 stores and 11 items flagged',
    capability: 'Fresh Food Forecasting',
    frequency: 'Weekly · Mondays · 8:00 AM',
    nextRun: 'Mon 28 Sep, 8:00 AM',
    active: true,
  },
  {
    question: 'What customer basket patterns have changed this month?',
    lastRun: 'Last run Tue 1 Sep · Lunch beverage pairing down at Store 124',
    capability: 'Basket Intelligence',
    frequency: 'Monthly · First business day · 8:00 AM',
    nextRun: 'Thu 1 Oct, 8:00 AM',
    active: true,
  },
  {
    question: 'What are the key revenue opportunities emerging this quarter?',
    lastRun: 'Last run Wed 1 Jul · Largest gap: beverage attachment, Store 124',
    capability: 'Revenue Opportunities',
    frequency: 'Quarterly · First business day of the quarter · 8:00 AM',
    nextRun: 'Paused',
    active: false,
  },
];

/** Scheduled insights: not built yet, so a sample preview sits behind a coming-soon overlay. */
export function ScheduledInsightsPage() {
  const active = SCHEDULES.filter((schedule) => schedule.active).length;

  return (
    <div className="page-content">
      <PageHeading
        title="Scheduled insights"
        description="Questions you've asked Insights Assistant to run again on a schedule. Each run uses the latest data, and the result appears here."
      />
      <div className="si-soon">
        {/* The preview can't be focused or clicked, and screen readers skip it. */}
        <div className="si-preview" inert aria-hidden="true">
          <p className="si-count">
            {active} active · {SCHEDULES.length - active} paused
          </p>
          <ul className="panel si-list">
            {SCHEDULES.map((schedule) => (
              <li
                key={schedule.question}
                className={`si-row${schedule.active ? '' : ' si-row-paused'}`}
              >
                <div className="si-question">
                  <h3>{schedule.question}</h3>
                  <p>{schedule.lastRun}</p>
                  <span className="td-chip td-chip-area">
                    {schedule.capability}
                  </span>
                </div>
                <dl className="si-meta">
                  <div>
                    <dt>Frequency</dt>
                    <dd>{schedule.frequency}</dd>
                  </div>
                  <div>
                    <dt>Next run</dt>
                    <dd>{schedule.nextRun}</dd>
                  </div>
                </dl>
                <div className="si-actions">
                  <span
                    className={`si-switch${schedule.active ? ' si-switch-on' : ''}`}
                  />
                  <span className="si-state">
                    {schedule.active ? 'Active' : 'Paused'}
                  </span>
                  <span className="td-action">Run now</span>
                  <span className="td-action">Edit</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="si-foot">
            Schedule more from any Insights Assistant answer or insight using
            “Schedule this”.
          </p>
        </div>

        <section className="si-overlay" aria-labelledby="si-soon-title">
          <div className="panel si-overlay-card">
            <span className="si-overlay-icon" aria-hidden="true">
              <Clock size={26} />
            </span>
            <span className="si-overlay-badge">Coming soon</span>
            <h2 id="si-soon-title">Scheduled insights</h2>
            <p>
              Soon you’ll be able to schedule any Insights Assistant question.
              It will run on the latest data each time, and the results will
              collect here.
            </p>
            <Link
              to="/insights-assistant"
              className="td-action td-action-primary"
            >
              <MessageSquare size={16} aria-hidden="true" />
              Ask Insights Assistant
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

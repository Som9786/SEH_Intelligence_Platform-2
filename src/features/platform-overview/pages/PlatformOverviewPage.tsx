import {
  ArrowRight,
  CalendarDays,
  Clock,
  Salad,
  Send,
  ShoppingBasket,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';

const QUESTIONS = [
  'What are the key insights today?',
  'What changed since yesterday?',
  'Why is waste higher at Store 124?',
];

type Tone = 'risk' | 'warn' | 'good';

interface Capability {
  title: string;
  icon: LucideIcon;
  path: string;
  tone: Tone;
  value: string;
  valueLabel: string;
  detail: string;
  /** Not built yet: the card shows its sample preview behind a coming-soon overlay. */
  comingSoon?: boolean;
}

// SAMPLE ONLY: the headline numbers are illustrative until store data is connected.
const CAPABILITIES: Capability[] = [
  {
    title: 'Basket Intelligence',
    icon: ShoppingBasket,
    path: '/basket-intelligence',
    tone: 'warn',
    value: '8 pairings',
    valueLabel: 'under-performing',
    detail: 'Products usually bought together, selling apart this week.',
  },
  {
    title: 'Fresh Food Forecasting',
    icon: Salad,
    path: '/fresh-food-forecasting',
    comingSoon: true,
    tone: 'risk',
    value: '14 items',
    valueLabel: 'at risk of stockout',
    detail: '7 stores ordered above tomorrow’s forecast range.',
  },
  {
    title: 'Revenue Opportunities',
    icon: TrendingUp,
    path: '/revenue-opportunities',
    comingSoon: true,
    tone: 'good',
    value: '23 gaps',
    valueLabel: 'below comparable stores',
    detail: 'Store and category combinations with room to grow.',
  },
];

const today = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

/** Platform home: ask a question, see today's headline per capability. */
export function PlatformOverviewPage() {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    void navigate(`/insights-assistant?${new URLSearchParams({ q: text })}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <div className="page-content">
      <PageHeading
        title="SEH Intelligence Platform"
        description="One platform, one data foundation. Ask a question, see today’s highlights and open a capability."
      />
      <div className="po-page">
        <section className="po-hero" aria-labelledby="po-title">
          <div className="po-hero-top">
            <p className="po-greeting">{greeting()}</p>
            <p className="po-date">
              <CalendarDays size={18} aria-hidden="true" />
              {today()}
            </p>
          </div>
          <h2 id="po-title">What would you like to understand?</h2>
          <form className="po-ask" onSubmit={submit}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Insights Assistant anything…"
              aria-label="Ask Insights Assistant"
            />
            <button
              className="td-action td-action-primary"
              type="submit"
              disabled={!draft.trim()}
            >
              Ask
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
          <ul className="po-questions" aria-label="Suggested questions">
            {QUESTIONS.map((question) => (
              <li key={question}>
                <button type="button" onClick={() => ask(question)}>
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="po-today">
          <div className="po-section-head">
            <h2 id="po-today">Today</h2>
          </div>
          <div className="po-capabilities">
            {CAPABILITIES.map(({ icon: Icon, ...capability }) => (
              <Link
                className={`panel po-capability po-tone-${capability.tone}${capability.comingSoon ? ' po-capability-soon' : ''}`}
                to={capability.path}
                key={capability.path}
              >
                <span className="po-capability-head">
                  <span className="po-capability-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <h3>{capability.title}</h3>
                </span>
                {/* Coming-soon cards blur their preview numbers behind the overlay. */}
                <span
                  className="po-capability-body"
                  aria-hidden={capability.comingSoon || undefined}
                >
                  <span className="po-metric">
                    <strong>{capability.value}</strong>
                    <span>{capability.valueLabel}</span>
                  </span>
                  <p>{capability.detail}</p>
                  <span className="po-capability-open">
                    Open
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </span>
                {capability.comingSoon && (
                  <span className="po-soon-overlay">
                    <span className="po-soon-badge">
                      <Clock size={14} aria-hidden="true" />
                      Coming soon
                    </span>
                    <small>Preview with sample data</small>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

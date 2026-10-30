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
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeading } from '../../../shared/components/PageHeading';
import { useAuth } from '../../auth/useAuth';
import { useSuggestedQuestions } from '../../insights-assistant/hooks/useSuggestedQuestions';
import { listWidgets, type Widget } from '../../../platform/api/workspaceService';
import { headlineOf } from '../utils/basketHeadline';
import {
  interleave,
  MAX_QUESTION_LENGTH,
} from '../../insights-assistant/services/assistantService';

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
  /** Clicking the card asks this in Insights Assistant instead of opening the capability. */
  question?: string;
}

const BASKET = {
  title: 'Basket Intelligence',
  icon: ShoppingBasket,
  path: '/basket-intelligence',
  tone: 'warn',
} as const;

// SAMPLE ONLY: these headline numbers are illustrative until the capabilities are built.
const COMING_SOON: Capability[] = [
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
  // The questions Analytics and DB Catalog suggest, two about the data and one about the database.
  const suggestions = useSuggestedQuestions();
  const questions = interleave(suggestions, 3);
  // Basket Intelligence shows the latest widget on its board, and asks that question when clicked;
  // with no widget yet, it offers a question to start with.
  const { can } = useAuth();
  const widgets = useQuery({
    queryKey: ['workspace', 'widgets', 'basket-intelligence'],
    queryFn: () => listWidgets('basket-intelligence'),
    enabled: can('basket-intelligence'),
  });
  // The newest one: the board's own order is the user's arrangement, not when each was added.
  const latest = widgets.data?.reduce<Widget | undefined>(
    (newest, w) =>
      !newest || Date.parse(w.createdAt) > Date.parse(newest.createdAt)
        ? w
        : newest,
    undefined,
  );
  const starter = suggestions.data[0];
  const basket: Capability | null = latest
    ? { ...BASKET, ...headlineOf(latest), question: latest.question }
    : starter
      ? {
          ...BASKET,
          value: 'Ask',
          valueLabel: 'to get your first insight',
          detail: starter,
          question: starter,
        }
      : null;
  const capabilities = basket ? [basket, ...COMING_SOON] : COMING_SOON;
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
        description="Unified Data. Intelligent Insights. Ask questions, explore key insights, and access data capabilities—all in one place."
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
          <h2 id="po-title">What would you like to know?</h2>
          <form className="po-ask" onSubmit={submit}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Insights Assistant anything…"
              maxLength={MAX_QUESTION_LENGTH}
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
          {questions.length > 0 && (
            <ul className="po-questions" aria-label="Suggested questions">
              {questions.map((question) => (
                <li key={question}>
                  <button type="button" onClick={() => ask(question)}>
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="po-today">
          <div className="po-section-head">
            <h2 id="po-today">Today</h2>
          </div>
          <div className="po-capabilities">
            {capabilities.map(({ icon: Icon, ...capability }) => (
              <Link
                title={
                  capability.question
                    ? `Ask in Insights Assistant: ${capability.question}`
                    : undefined
                }
                className={`panel po-capability po-tone-${capability.tone}${capability.comingSoon ? ' po-capability-soon' : ''}`}
                to={
                  capability.question
                    ? `/insights-assistant?${new URLSearchParams({ q: capability.question })}`
                    : capability.path
                }
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
                  {capability.question && (
                    <span className="po-capability-question">
                      {capability.question}
                    </span>
                  )}
                  <span className="po-capability-open">
                    {capability.question ? 'Ask in Insights Assistant' : 'Open'}
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

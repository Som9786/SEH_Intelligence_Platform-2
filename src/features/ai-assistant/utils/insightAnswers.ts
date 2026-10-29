import type { RelationshipIndex } from '../../table-details/utils/relationshipGraph';
import { scriptedReply } from './scriptedAnswers';

// SAMPLE ONLY. No store data is connected yet, so these answers and their numbers are illustrative.
// They show the shape of an answer (summary, reasoning, chart, confidence, sources) until a real
// assistant replaces them.

export type Confidence = 'High' | 'Medium' | 'Low';

export interface InsightAnswer {
  /** Where the question was routed, shown above the answer. */
  route: string[];
  summary: string[];
  /** An example query (Data Catalog answers). */
  code?: string;
  steps?: string[];
  chart?: {
    title: string;
    unit: '%' | '$K' | 'stores';
    rows: { label: string; value: number }[];
  };
  confidence?: { level: Confidence; note: string };
  dataUsed?: string[];
}

export const SUGGESTED_QUESTIONS = [
  'What are the key insights today?',
  'What changed since yesterday?',
  'Where are we seeing potential waste?',
  'Which items are at risk of stockout?',
  'Why is waste higher at Store 124?',
  'Where are we seeing revenue opportunities?',
];

const ASSISTANT = 'Insights Assistant';

const SAMPLES: { match: (q: string) => boolean; answer: InsightAnswer }[] = [
  {
    match: (q) => q.includes('waste') && q.includes('124'),
    answer: {
      route: [ASSISTANT, 'Fresh food analysis'],
      summary: [
        'Store 124 wrote off 9.4% of fresh-food units over the last four weeks, against 6.1% for comparable O‘ahu stores. Orders exceed sales most on Mondays and Tuesdays, and two items, Mochiko Chicken Bento and Loco Moco Bowl, account for over half of its write-offs.',
      ],
      steps: [
        'Compared Store 124’s write-off rate with comparable stores.',
        'Split orders and sales by day of the week.',
        'Broke the write-offs down by item.',
      ],
      chart: {
        title: 'Write-off rate by item · Store 124 · 4 weeks',
        unit: '%',
        rows: [
          { label: 'Mochiko Chicken Bento', value: 16.2 },
          { label: 'Loco Moco Bowl', value: 13.8 },
          { label: 'Chicken Musubi', value: 8.1 },
          { label: 'Spam Musubi', value: 5.4 },
          { label: 'Char Siu Manapua', value: 4.9 },
        ],
      },
      confidence: {
        level: 'Medium',
        note: 'Write-off data covers the full period; the comparable-store grouping is illustrative.',
      },
      dataUsed: ['Sales', 'Orders', 'Write-offs', 'Products'],
    },
  },
  {
    match: (q) => q.includes('waste'),
    answer: {
      route: [ASSISTANT, 'Cross-data analysis'],
      summary: [
        'Potential waste is concentrated in 7 stores and 11 items, where usual order quantities sit above the forecast range for tomorrow. Store 124 stands out: 9.4% of fresh-food units written off over the last four weeks, against 6.1% for comparable O‘ahu stores. Orders there exceed sales most on Mondays and Tuesdays, and two items account for over half of its write-offs.',
      ],
      steps: [
        'Compared usual order quantities for tomorrow with each forecast range.',
        'Ranked stores by write-off rate over the last 4 weeks.',
        'Broke the highest store down by item.',
      ],
      chart: {
        title: 'Write-off rate by item · Store 124 · 4 weeks',
        unit: '%',
        rows: [
          { label: 'Mochiko Chicken Bento', value: 16.2 },
          { label: 'Loco Moco Bowl', value: 13.8 },
          { label: 'Chicken Musubi', value: 8.1 },
          { label: 'Spam Musubi', value: 5.4 },
          { label: 'Char Siu Manapua', value: 4.9 },
        ],
      },
      confidence: {
        level: 'Medium',
        note: 'Write-off data covers the full period; the comparable-store grouping is illustrative.',
      },
      dataUsed: [
        'Forecast output',
        'Sales',
        'Orders',
        'Inventory',
        'Write-offs',
        'Products',
      ],
    },
  },
  {
    match: (q) => /stock[\s-]?out|out of stock|run out/.test(q),
    answer: {
      route: [ASSISTANT, 'Inventory analysis'],
      summary: [
        '14 items across 9 stores are likely to run out before the next delivery. Most are fresh-food items with weekend demand above the usual order; Spam Musubi is short in 5 of those stores.',
      ],
      steps: [
        'Compared on-hand inventory with expected sales until the next delivery.',
        'Flagged items expected to sell out early.',
        'Ranked items by the share of stores affected.',
      ],
      chart: {
        title: 'Stores at risk of stockout by item · next 3 days',
        unit: 'stores',
        rows: [
          { label: 'Spam Musubi', value: 5 },
          { label: 'Chicken Musubi', value: 4 },
          { label: 'Loco Moco Bowl', value: 3 },
          { label: 'Mochiko Chicken Bento', value: 2 },
          { label: 'Char Siu Manapua', value: 2 },
        ],
      },
      confidence: {
        level: 'High',
        note: 'Based on current inventory and confirmed delivery schedules.',
      },
      dataUsed: ['Inventory', 'Sales', 'Orders', 'Deliveries'],
    },
  },
  {
    match: (q) => q.includes('revenue') || q.includes('opportunit'),
    answer: {
      route: [ASSISTANT, 'Revenue Opportunities'],
      summary: [
        '23 store and category combinations sell below comparable stores. Hot food and beverages show the largest gaps; closing half of the gap in the top five would add an estimated $41K a month.',
      ],
      steps: [
        'Grouped stores with similar size, location and traffic.',
        'Compared sales per category with each group’s median.',
        'Estimated the gain from closing half of each gap.',
      ],
      chart: {
        title: 'Estimated monthly gain by category · $K',
        unit: '$K',
        rows: [
          { label: 'Hot food', value: 14.2 },
          { label: 'Beverages', value: 11.6 },
          { label: 'Snacks', value: 7.3 },
          { label: 'Bakery', value: 4.8 },
          { label: 'Grocery', value: 3.1 },
        ],
      },
      confidence: {
        level: 'Medium',
        note: 'Store groupings and the half-gap assumption are illustrative.',
      },
      dataUsed: ['Sales', 'Products', 'Vendors', 'Accounting'],
    },
  },
  {
    match: (q) => q.includes('changed') || q.includes('yesterday'),
    answer: {
      route: [ASSISTANT, 'Daily comparison'],
      summary: [
        'Sales were up 2.3% on the same day last week. Fresh-food write-offs rose in 3 stores, and two items moved into stockout risk after a delayed delivery.',
      ],
      steps: [
        'Compared yesterday with the same day last week.',
        'Listed the largest changes by store and item.',
      ],
      confidence: {
        level: 'High',
        note: 'Yesterday’s data is complete for all stores.',
      },
      dataUsed: ['Sales', 'Write-offs', 'Inventory', 'Deliveries'],
    },
  },
  {
    match: (q) => q.includes('insight') || q.includes('today'),
    answer: {
      route: [ASSISTANT, 'Daily summary'],
      summary: [
        'Three things need attention today: potential waste in 7 stores, 14 items at risk of stockout before the next delivery, and hot food selling below comparable stores in 6 locations.',
      ],
      steps: [
        'Checked tomorrow’s orders against the forecast.',
        'Checked inventory against expected sales.',
        'Compared category sales with comparable stores.',
      ],
      confidence: {
        level: 'Medium',
        note: 'Each item links to a deeper answer; ask about any of them.',
      },
      dataUsed: ['Forecast output', 'Sales', 'Orders', 'Inventory'],
    },
  },
];

const CATALOG_WORDS =
  /\b(tables?|columns?|keys?|primary|foreign|relationships?|joins?|schemas?)\b/;

/** Pick the sample answer for a question. Schema questions go to the Data Catalog's scripted answers. */
export function answerQuestion(
  question: string,
  catalog: RelationshipIndex | undefined,
): InsightAnswer {
  const q = question.toLocaleLowerCase();
  const sample = SAMPLES.find((entry) => entry.match(q));
  if (sample) return sample.answer;
  if (catalog && CATALOG_WORDS.test(q)) {
    const reply = scriptedReply(question, catalog);
    return {
      route: ['DB Catalog', 'Schema metadata'],
      summary: reply.paragraphs,
      code: reply.code,
      dataUsed: ['Catalog files'],
    };
  }
  return {
    route: [ASSISTANT],
    summary: [
      'I can’t answer that yet. This preview only has sample answers for the suggested questions below, plus questions about the database’s tables, keys and relationships.',
    ],
  };
}

import {
  BookOpen,
  Clock,
  LayoutGrid,
  MessageSquare,
  Network,
  Share2,
  ShoppingBasket,
  Sprout,
  TableProperties,
  TrendingUp,
} from 'lucide-react';
import { AiAssistantPage } from '../../features/ai-assistant/pages/AiAssistantPage';
import { BasketIntelligencePage } from '../../features/boards/pages/BasketIntelligencePage';
import {
  FreshFoodForecastingPage,
  RevenueOpportunitiesPage,
} from '../../features/coming-soon/pages/ComingSoonPages';
import {
  SharedInsightPage,
  WidgetInsightPage,
} from '../../features/insights/pages/InsightPages';
import { ScheduledInsightsPage } from '../../features/scheduled-insights/pages/ScheduledInsightsPage';
import { PlatformOverviewPage } from '../../features/platform-overview/pages/PlatformOverviewPage';
import { DocumentationPage } from '../../features/documentation/pages/DocumentationPage';
import { DataCatalogPage } from '../../features/overview/pages/DataCatalogPage';
import { RelationshipsPage } from '../../features/relationships/pages/RelationshipsPage';
import { TableDetailsPage } from '../../features/table-details/pages/TableDetailsPage';

/** Sidebar sections, in display order. */
export const navSections = [
  { key: 'platform', label: 'Platform' },
  { key: 'capabilities', label: 'Capabilities' },
] as const;

/**
 * `feature` is the functionality a role must have to open the page: the names Insights.Gateway's
 * Gateway:Roles setting lists. The sidebar shows only the user's pages.
 */
export const routes = [
  {
    path: '/overview',
    label: 'Overview',
    feature: 'overview',
    section: 'platform',
    icon: LayoutGrid,
    element: PlatformOverviewPage,
  },
  {
    path: '/insights-assistant',
    label: 'Insights Assistant',
    feature: 'insights-assistant',
    section: 'platform',
    icon: MessageSquare,
    element: AiAssistantPage,
  },
  {
    path: '/',
    label: 'DB Catalog',
    feature: 'db-catalog',
    section: 'platform',
    icon: TableProperties,
    element: DataCatalogPage,
  },
  {
    path: '/scheduled-insights',
    label: 'Scheduled insights',
    feature: 'scheduled-insights',
    section: 'platform',
    icon: Clock,
    element: ScheduledInsightsPage,
  },
  {
    path: '/basket-intelligence',
    label: 'Basket Intelligence',
    feature: 'basket-intelligence',
    section: 'capabilities',
    number: '01',
    icon: ShoppingBasket,
    element: BasketIntelligencePage,
  },
  {
    path: '/fresh-food-forecasting',
    label: 'Fresh Food Forecasting',
    feature: 'fresh-food-forecasting',
    section: 'capabilities',
    number: '02',
    badge: 'Soon',
    icon: Sprout,
    element: FreshFoodForecastingPage,
  },
  {
    path: '/revenue-opportunities',
    label: 'Revenue Opportunities',
    feature: 'revenue-opportunities',
    section: 'capabilities',
    number: '03',
    badge: 'Soon',
    icon: TrendingUp,
    element: RevenueOpportunitiesPage,
  },
  // A widget on its own page, opened in a new tab from its board.
  {
    path: '/basket-intelligence/insight',
    label: 'Insight',
    feature: 'basket-intelligence',
    section: null,
    parent: '/basket-intelligence',
    icon: ShoppingBasket,
    element: WidgetInsightPage,
  },
  // A shared insight's link: anyone signed in ("*") can open it.
  {
    path: '/shared-insight',
    label: 'Shared insight',
    feature: '*',
    section: null,
    icon: Share2,
    element: SharedInsightPage,
  },
  // Opened from DB Catalog, so the sidebar keeps DB Catalog selected on these.
  {
    path: '/table-details',
    label: 'DB Tables',
    feature: 'db-catalog',
    section: null,
    parent: '/',
    icon: TableProperties,
    element: TableDetailsPage,
  },
  {
    path: '/documentation',
    label: 'Documentation',
    feature: 'db-catalog',
    section: null,
    parent: '/',
    icon: BookOpen,
    element: DocumentationPage,
  },
  {
    path: '/relationships',
    label: 'Relationships',
    feature: 'db-catalog',
    section: null,
    parent: '/',
    icon: Network,
    element: RelationshipsPage,
  },
] as const;

/** Where a user lands: the first sidebar page they have, so Overview when they have it. */
export function homePath(can: (feature: string) => boolean): string {
  return (
    routes.find((route) => route.section && can(route.feature))?.path ?? '/'
  );
}

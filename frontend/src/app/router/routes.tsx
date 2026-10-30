import {
  BookOpen,
  Clock,
  LayoutGrid,
  MessageSquare,
  Network,
  ShoppingBasket,
  Sprout,
  TableProperties,
  TrendingUp,
} from 'lucide-react';
import { InsightsAssistantPage } from '../../features/insights-assistant/pages/InsightsAssistantPage';
import { BasketIntelligencePage } from '../../features/boards/pages/BasketIntelligencePage';
import {
  FreshFoodForecastingPage,
  RevenueOpportunitiesPage,
} from '../../features/coming-soon/pages/ComingSoonPages';
import { WidgetInsightPage } from '../../features/shared-insights/pages/InsightPages';
import { ScheduledInsightsPage } from '../../features/scheduled-insights/pages/ScheduledInsightsPage';
import { PlatformOverviewPage } from '../../features/home/pages/PlatformOverviewPage';
import { DocumentationPage } from '../../features/db-catalog/documentation/pages/DocumentationPage';
import { DataCatalogPage } from '../../features/db-catalog/overview/pages/DataCatalogPage';
import { RelationshipsPage } from '../../features/db-catalog/relationships/pages/RelationshipsPage';
import { TableDetailsPage } from '../../features/db-catalog/table-details/pages/TableDetailsPage';

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
    // The app's address opens Overview.
    path: '/',
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
    element: InsightsAssistantPage,
  },
  {
    path: '/db-catalog',
    label: 'DB Catalog',
    feature: 'db-catalog',
    section: 'platform',
    icon: TableProperties,
    element: DataCatalogPage,
  },
  {
    path: '/scheduled-insights',
    label: 'Scheduled Insights',
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
    path: '/basket-intelligence/insight/:id',
    label: 'Insight',
    feature: 'basket-intelligence',
    section: null,
    parent: '/basket-intelligence',
    icon: ShoppingBasket,
    element: WidgetInsightPage,
  },
  // Opened from DB Catalog, so the sidebar keeps DB Catalog selected on these.
  {
    path: '/db-catalog/tables',
    label: 'DB Tables',
    feature: 'db-catalog',
    section: null,
    parent: '/db-catalog',
    icon: TableProperties,
    element: TableDetailsPage,
  },
  {
    path: '/db-catalog/documentation',
    label: 'Documentation',
    feature: 'db-catalog',
    section: null,
    parent: '/db-catalog',
    icon: BookOpen,
    element: DocumentationPage,
  },
  {
    path: '/db-catalog/relationships',
    label: 'Relationships',
    feature: 'db-catalog',
    section: null,
    parent: '/db-catalog',
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

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
import { lazy } from 'react';
// Each page's code loads when the page is first opened (AppShell shows a spinner meanwhile), so
// signing in doesn't wait for every page's charts, Markdown and diagram libraries.
const InsightsAssistantPage = lazy(() =>
  import('../../features/insights-assistant/pages/InsightsAssistantPage').then(
    (m) => ({ default: m.InsightsAssistantPage }),
  ),
);
const BasketIntelligencePage = lazy(() =>
  import('../../features/boards/pages/BasketIntelligencePage').then((m) => ({
    default: m.BasketIntelligencePage,
  })),
);
const FreshFoodForecastingPage = lazy(() =>
  import('../../features/coming-soon/pages/ComingSoonPages').then((m) => ({
    default: m.FreshFoodForecastingPage,
  })),
);
const RevenueOpportunitiesPage = lazy(() =>
  import('../../features/coming-soon/pages/ComingSoonPages').then((m) => ({
    default: m.RevenueOpportunitiesPage,
  })),
);
const WidgetInsightPage = lazy(() =>
  import('../../features/shared-insights/pages/InsightPages').then((m) => ({
    default: m.WidgetInsightPage,
  })),
);
const ScheduledInsightsPage = lazy(() =>
  import('../../features/scheduled-insights/pages/ScheduledInsightsPage').then(
    (m) => ({ default: m.ScheduledInsightsPage }),
  ),
);
const PlatformOverviewPage = lazy(() =>
  import('../../features/home/pages/PlatformOverviewPage').then((m) => ({
    default: m.PlatformOverviewPage,
  })),
);
const DocumentationPage = lazy(() =>
  import('../../features/db-catalog/documentation/pages/DocumentationPage').then(
    (m) => ({ default: m.DocumentationPage }),
  ),
);
const DataCatalogPage = lazy(() =>
  import('../../features/db-catalog/overview/pages/DataCatalogPage').then(
    (m) => ({ default: m.DataCatalogPage }),
  ),
);
const RelationshipsPage = lazy(() =>
  import('../../features/db-catalog/relationships/pages/RelationshipsPage').then(
    (m) => ({ default: m.RelationshipsPage }),
  ),
);
const TableDetailsPage = lazy(() =>
  import('../../features/db-catalog/table-details/pages/TableDetailsPage').then(
    (m) => ({ default: m.TableDetailsPage }),
  ),
);

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
    // Not in the sidebar: opened from Basket Intelligence's "Scheduled insights" button, so the
    // sidebar keeps Basket Intelligence selected and the breadcrumb shows it as the parent.
    path: '/scheduled-insights',
    label: 'Scheduled Insights',
    feature: 'scheduled-insights',
    section: null,
    parent: '/basket-intelligence',
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
    label: 'DB details',
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

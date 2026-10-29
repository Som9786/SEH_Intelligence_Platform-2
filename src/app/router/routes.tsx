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
import { AiAssistantPage } from '../../features/ai-assistant/pages/AiAssistantPage';
import {
  BasketIntelligencePage,
  FreshFoodForecastingPage,
  RevenueOpportunitiesPage,
} from '../../features/coming-soon/pages/ComingSoonPages';
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

export const routes = [
  {
    path: '/overview',
    label: 'Overview',
    section: 'platform',
    icon: LayoutGrid,
    element: PlatformOverviewPage,
  },
  {
    path: '/insights-assistant',
    label: 'Insights Assistant',
    section: 'platform',
    icon: MessageSquare,
    element: AiAssistantPage,
  },
  {
    path: '/',
    label: 'DB Catalog',
    section: 'platform',
    icon: TableProperties,
    element: DataCatalogPage,
  },
  {
    path: '/scheduled-insights',
    label: 'Scheduled insights',
    section: 'platform',
    badge: 'Soon',
    icon: Clock,
    element: ScheduledInsightsPage,
  },
  {
    path: '/basket-intelligence',
    label: 'Basket Intelligence',
    section: 'capabilities',
    number: '01',
    icon: ShoppingBasket,
    element: BasketIntelligencePage,
  },
  {
    path: '/fresh-food-forecasting',
    label: 'Fresh Food Forecasting',
    section: 'capabilities',
    number: '02',
    badge: 'Soon',
    icon: Sprout,
    element: FreshFoodForecastingPage,
  },
  {
    path: '/revenue-opportunities',
    label: 'Revenue Opportunities',
    section: 'capabilities',
    number: '03',
    badge: 'Soon',
    icon: TrendingUp,
    element: RevenueOpportunitiesPage,
  },
  // Opened from DB Catalog, so the sidebar keeps DB Catalog selected on these.
  {
    path: '/table-details',
    label: 'DB Tables',
    section: null,
    parent: '/',
    icon: TableProperties,
    element: TableDetailsPage,
  },
  {
    path: '/documentation',
    label: 'Documentation',
    section: null,
    parent: '/',
    icon: BookOpen,
    element: DocumentationPage,
  },
  {
    path: '/relationships',
    label: 'Relationships',
    section: null,
    parent: '/',
    icon: Network,
    element: RelationshipsPage,
  },
] as const;

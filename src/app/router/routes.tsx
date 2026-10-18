import {
  BookOpen,
  Network,
  LayoutDashboard,
  Sparkles,
  TableProperties,
} from 'lucide-react';
import { AiAssistantPage } from '../../features/ai-assistant/pages/AiAssistantPage';
import { DocumentationPage } from '../../features/documentation/pages/DocumentationPage';
import { OverviewPage } from '../../features/overview/pages/OverviewPage';
import { RelationshipsPage } from '../../features/relationships/pages/RelationshipsPage';
import { TableDetailsPage } from '../../features/table-details/pages/TableDetailsPage';

export const routes = [
  {
    path: '/',
    label: 'Overview',
    inSidebar: true,
    icon: LayoutDashboard,
    element: OverviewPage,
  },
  {
    path: '/documentation',
    label: 'Documentation',
    inSidebar: false,
    icon: BookOpen,
    element: DocumentationPage,
  },
  {
    path: '/relationships',
    label: 'Relationships',
    inSidebar: true,
    icon: Network,
    element: RelationshipsPage,
  },
  {
    path: '/table-details',
    label: 'Table Details',
    inSidebar: true,
    icon: TableProperties,
    element: TableDetailsPage,
  },
  {
    path: '/ai-assistant',
    label: 'AI Assistant',
    inSidebar: true,
    badge: 'Soon',
    icon: Sparkles,
    element: AiAssistantPage,
  },
] as const;

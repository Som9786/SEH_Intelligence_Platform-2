import { Sparkles } from 'lucide-react';
import { PlaceholderPage } from '../../../shared/components/PlaceholderPage';

export function AiAssistantPage() {
  return (
    <PlaceholderPage
      icon={Sparkles}
      title="AI Assistant"
      eyebrow="Future capability"
      description="An assistant for exploring database knowledge is planned for a later phase."
      detail="This demo cannot provide live database answers or AI responses."
    />
  );
}

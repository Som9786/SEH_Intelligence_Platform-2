import { ShoppingBasket, Sprout, TrendingUp } from 'lucide-react';
import { ComingSoonPage } from '../../../shared/components/ComingSoonPage';

// Sidebar pages that are planned but not built yet.

export function FreshFoodForecastingPage() {
  return (
    <ComingSoonPage
      title="Fresh Food Forecasting"
      description="Forecast fresh food demand to reduce waste and stock-outs."
      icon={Sprout}
    />
  );
}

export function BasketIntelligencePage() {
  return (
    <ComingSoonPage
      title="Basket Intelligence"
      description="Understand which products customers buy together."
      icon={ShoppingBasket}
    />
  );
}

export function RevenueOpportunitiesPage() {
  return (
    <ComingSoonPage
      title="Revenue Opportunities"
      description="Find where stores can grow revenue."
      icon={TrendingUp}
    />
  );
}

import { PageHeading } from '../../../shared/components/PageHeading';
import { BoardWidgets } from '../components/BoardWidgets';

/** Basket Intelligence board: answers about baskets, items, stores and offers, kept as widgets. */
export function BasketIntelligencePage() {
  return (
    <div className="page-content">
      <PageHeading
        title="Basket Intelligence"
        description="Understand which products customers buy together. Widgets are Insights Assistant answers you added here; refresh one to fetch the latest data."
      />
      <BoardWidgets board="basket-intelligence" />
    </div>
  );
}

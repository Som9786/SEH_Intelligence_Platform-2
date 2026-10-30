import { PageHeading } from '../../../shared/components/PageHeading';
import { BoardWidgets } from '../components/BoardWidgets';

/** Basket Intelligence board: answers about baskets, items, stores and offers, kept as widgets. */
export function BasketIntelligencePage() {
  return (
    <div className="page-content">
      <PageHeading
        title="Basket Intelligence"
        description="Understand which products customers buy together. Pin answers from Insights Assistant here and refresh them for the latest data."
      />
      <BoardWidgets board="basket-intelligence" />
    </div>
  );
}

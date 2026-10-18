export type ReviewStatus = 'verified' | 'needs-attention';

/** A person's sign-off on one table's metadata and documentation. */
export interface TableReview {
  tableId: string;
  status: ReviewStatus;
  comment: string;
  reviewedBy: string;
  /** ISO 8601 timestamp, assigned when the review is saved. */
  updatedAt: string;
}

/** What the reviewer supplies; the service adds the timestamp. */
export type ReviewDraft = Omit<TableReview, 'updatedAt'>;

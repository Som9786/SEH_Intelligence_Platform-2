import type { OverviewSummary } from '../types/overview';

export interface OverviewService {
  getSummary(): Promise<OverviewSummary>;
}

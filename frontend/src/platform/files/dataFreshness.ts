export interface DataFreshness {
  status: 'live' | 'cached' | 'unavailable';
  generatedAtUtc: string | null;
  snapshotId: string | null;
}

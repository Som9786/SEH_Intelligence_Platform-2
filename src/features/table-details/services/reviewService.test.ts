import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewService } from './reviewService';

const sample = {
  tableId: 'dbo.Customers',
  status: 'verified',
  comment: 'Looks right.',
  reviewedBy: 'Priya Nair',
  updatedAt: '2026-10-15T09:30:00Z',
};

function respond(body: unknown, init: { status?: number; type?: string } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('reviewService (demo implementation)', () => {
  it('reads the static review file for a table', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(String(url));
      return respond(sample);
    });
    expect(await reviewService.getReview('dbo.Customers')).toEqual(sample);
    expect(urls[0]).toMatch(/data\/reviews\/dbo\.Customers\.json$/);
  });

  it('returns null when there is no review file (404 or an HTML fallback page)', async () => {
    vi.stubGlobal('fetch', async () => respond('', { status: 404 }));
    expect(await reviewService.getReview('dbo.Missing404')).toBeNull();
    vi.stubGlobal('fetch', async () =>
      respond('<html></html>', { type: 'text/html' }),
    );
    expect(await reviewService.getReview('dbo.MissingHtml')).toBeNull();
  });

  it('rejects a review file that is malformed or describes another table', async () => {
    vi.stubGlobal('fetch', async () => respond({ ...sample, status: 'maybe' }));
    await expect(reviewService.getReview('dbo.Customers')).rejects.toThrow(
      /not valid/,
    );
    vi.stubGlobal('fetch', async () =>
      respond({ ...sample, tableId: 'dbo.Other' }),
    );
    await expect(reviewService.getReview('dbo.Customers')).rejects.toThrow(
      /not valid/,
    );
  });

  it('surfaces server errors instead of treating them as "not reviewed"', async () => {
    vi.stubGlobal('fetch', async () => respond('', { status: 500 }));
    await expect(reviewService.getReview('dbo.ServerError')).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it('saves in memory: stamps updatedAt, and later reads return the saved review without fetching', async () => {
    const fetchMock = vi.fn(async () => respond('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const saved = await reviewService.saveReview({
      tableId: 'dbo.SaveTest',
      status: 'needs-attention',
      comment: 'Fix the description.',
      reviewedBy: 'Demo Reviewer',
    });
    expect(Date.parse(saved.updatedAt)).not.toBeNaN();
    expect(await reviewService.getReview('dbo.SaveTest')).toEqual(saved);
    expect(fetchMock).not.toHaveBeenCalled();

    const edited = await reviewService.saveReview({
      ...saved,
      comment: 'Fixed.',
      status: 'verified',
    });
    expect((await reviewService.getReview('dbo.SaveTest'))?.comment).toBe(
      'Fixed.',
    );
    expect(edited.status).toBe('verified');
  });
});

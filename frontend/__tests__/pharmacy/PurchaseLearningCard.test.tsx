import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseLearningCard } from '@/components/pharmacy/PurchaseLearningCard';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiClient: {
    getPharmacyPurchaseLearningMetrics: jest.fn(),
    getPharmacyPurchaseLearningLessons: jest.fn(),
    forgetPharmacyPurchaseLearningLesson: jest.fn(),
  },
}));

const api = apiClient as unknown as Record<string, jest.Mock>;

const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
  .map((weekStart, index) => ({ weekStart, lines: 100, touches: [18, 15, 14, 11, 9, 8, 6, 4][index] }));

const lessons = [
  { key: 'product:36ABCDE1234F1Z5:dolo650', field: 'product', rawValue: 'DOLO-650 TAB', finalValue: 'Dolo 650mg Tablet', tier: 'APPLY', independent: 3 },
  { key: 'distributorName:36ABCDE1234F1Z5:apex', field: 'distributorName', rawValue: 'APEX PHARMA', finalValue: 'Apex Pharmaceuticals', tier: 'SUGGEST', independent: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getPharmacyPurchaseLearningMetrics.mockResolvedValue({ weeks });
  api.getPharmacyPurchaseLearningLessons.mockResolvedValue({ lessons });
});

describe('OCR learning card', () => {
  it('shows touches per 100 lines for eight weeks, the active lesson count and the lessons', async () => {
    render(<PurchaseLearningCard />);
    const bars = await screen.findByRole('list', { name: 'Reviewer touches per 100 lines, by week' });
    expect(within(bars).getAllByRole('listitem').map(item => item.textContent?.split('Week of')[0])).toEqual(['18', '15', '14', '11', '9', '8', '6', '4']);
    expect(screen.getByText(/in the latest week, from/)).toHaveTextContent(/^Reviewers changed 4 per 100 lines in the latest week, from 18 in the week of 28 Sep/);
    expect(screen.getByText(/lesson is/)).toHaveTextContent('1 lesson is active.');

    await userEvent.click(screen.getByText('What it has learned (2)'));
    expect(screen.getByText(/DOLO-650 TAB/)).toHaveTextContent("Product: ‘DOLO-650 TAB’ → Dolo 650mg Tablet");
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(api.getPharmacyPurchaseLearningMetrics).toHaveBeenCalledWith({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('forgets a lesson through the API and removes it from the list', async () => {
    api.forgetPharmacyPurchaseLearningLesson.mockResolvedValue({});
    render(<PurchaseLearningCard />);
    await userEvent.click(await screen.findByText('What it has learned (2)'));
    await userEvent.click(screen.getByRole('button', { name: 'Forget lesson DOLO-650 TAB to Dolo 650mg Tablet' }));
    await waitFor(() => expect(screen.queryByText(/DOLO-650 TAB/)).not.toBeInTheDocument());
    expect(api.forgetPharmacyPurchaseLearningLesson).toHaveBeenCalledWith('product:36ABCDE1234F1Z5:dolo650');
    expect(screen.getByText('What it has learned (1)')).toBeInTheDocument();
  });

  it('keeps the lesson and says why when forgetting fails', async () => {
    api.forgetPharmacyPurchaseLearningLesson.mockRejectedValue(new Error('Review permission required'));
    render(<PurchaseLearningCard />);
    await userEvent.click(await screen.findByText('What it has learned (2)'));
    await userEvent.click(screen.getByRole('button', { name: 'Forget lesson DOLO-650 TAB to Dolo 650mg Tablet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review permission required');
    expect(screen.getByText(/DOLO-650 TAB/)).toBeInTheDocument();
  });

  it('renders nothing when both endpoints fail', async () => {
    api.getPharmacyPurchaseLearningMetrics.mockRejectedValue(new Error('403'));
    api.getPharmacyPurchaseLearningLessons.mockRejectedValue(new Error('403'));
    const { container } = render(<PurchaseLearningCard />);
    await waitFor(() => expect(api.getPharmacyPurchaseLearningLessons).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no data yet', async () => {
    api.getPharmacyPurchaseLearningMetrics.mockResolvedValue({ weeks: [] });
    api.getPharmacyPurchaseLearningLessons.mockResolvedValue({ lessons: [] });
    const { container } = render(<PurchaseLearningCard />);
    await waitFor(() => expect(api.getPharmacyPurchaseLearningLessons).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('still shows the lessons when only the metrics fail', async () => {
    api.getPharmacyPurchaseLearningMetrics.mockRejectedValue(new Error('500'));
    render(<PurchaseLearningCard />);
    expect(await screen.findByText('What it has learned (2)')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Reviewer touches/ })).not.toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TaskLinkPage from '@/app/p/t/page';

const TOKEN = 'A'.repeat(20) + 'b-_'.repeat(7) + 'x'.repeat(2);
const PAGE = {
  clinic: 'Linae Skin Clinic',
  firstName: 'Asha',
  language: 'EN',
  checkIns: [
    {
      id: 'c1',
      doctor: 'Dr. Meera Rao',
      title: { EN: 'How is your skin?', TE: 'మీ చర్మం ఎలా ఉంది?', HI: 'आपकी त्वचा कैसी है?' },
      items: [
        { key: 'severity', type: 'scale', prompt: { EN: 'How bad is it?', TE: 'ఎంత తీవ్రంగా ఉంది?', HI: 'कितना बुरा है?' }, required: true, min: 0, max: 10 },
        { key: 'note', type: 'text', prompt: { EN: 'Anything else?', TE: 'ఇంకేమైనా?', HI: 'और कुछ?' }, required: false },
      ],
    },
  ],
};
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 300, status, json: async () => body });

describe('patient task page (PP-36, PP-40, PP-44, PP-45, PP-46)', () => {
  let fetchMock: jest.Mock;
  const setItem = jest.spyOn(Storage.prototype, 'setItem');

  beforeEach(() => {
    window.history.replaceState(null, '', `/p/t#${TOKEN}`);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    setItem.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

  it('takes the token from the fragment, strips it, and loads every question in one POST', async () => {
    fetchMock.mockReturnValueOnce(json(200, PAGE));
    render(<TaskLinkPage />);
    expect(await screen.findByText('Hello Asha')).toBeInTheDocument();
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.hash).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/portal/task/questions');
    expect(url).not.toContain(TOKEN);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(bodies()[0]).toEqual({ token: TOKEN });
    expect(screen.getByText('Linae Skin Clinic')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Meera Rao/)).toBeInTheDocument();
    expect(screen.getByText('How bad is it?')).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps typed answers in memory after a failed submit and never in storage', async () => {
    fetchMock.mockReturnValueOnce(json(200, PAGE)).mockRejectedValueOnce(new TypeError('offline')).mockReturnValueOnce(json(200, { status: 'saved', urgent: false }));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    fireEvent.click(screen.getByLabelText('7'));
    fireEvent.change(screen.getByLabelText('Anything else?'), { target: { value: 'itchy at night' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    expect(await screen.findByTestId('submit-error')).toHaveTextContent('Your answers are kept on this page');
    expect(screen.getByLabelText('7')).toBeChecked();
    expect(screen.getByLabelText('Anything else?')).toHaveValue('itchy at night');
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(/itchy|7/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    expect(await screen.findByTestId('saved')).toBeInTheDocument();
    expect(bodies()[2]).toEqual({ token: TOKEN, checkInId: 'c1', answers: { severity: 7, note: 'itchy at night' }, photos: [] });
  });

  const TWO = { ...PAGE, checkIns: [PAGE.checkIns[0], { ...PAGE.checkIns[0], id: 'c2', title: { EN: 'Second check-in', TE: 'రెండవ', HI: 'दूसरा' } }] };

  it('gives each check-in its own answer group when two ask the same question', async () => {
    fetchMock.mockReturnValueOnce(json(200, TWO));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    const [first, second] = screen.getAllByLabelText('7');
    fireEvent.click(first);
    fireEvent.click(screen.getAllByLabelText('3')[1]);
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
    expect(first.getAttribute('name')).not.toBe(second.getAttribute('name'));
  });

  it('after a partial save shows the urgent call notice, locks the saved check-in and sends only the rest', async () => {
    fetchMock
      .mockReturnValueOnce(json(200, TWO))
      .mockReturnValueOnce(json(200, { status: 'saved', urgent: true, clinicPhone: '+91 40 5555 0100' }))
      .mockReturnValueOnce(json(400, { message: ['severity is required'] }))
      .mockReturnValueOnce(json(200, { status: 'saved', urgent: false }));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    fireEvent.click(screen.getAllByLabelText('9')[0]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    expect(await screen.findByTestId('submit-error')).toHaveTextContent('Please answer every required question.');
    expect(screen.getByTestId('urgent')).toHaveTextContent('Call +91 40 5555 0100');
    expect(screen.getByTestId('check-in-sent')).toHaveTextContent('How is your skin?');
    expect(screen.getAllByLabelText('9')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('2'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    expect(await screen.findByTestId('urgent')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation')).toBeInTheDocument();
    expect(bodies().slice(1).map((b) => b.checkInId)).toEqual(['c1', 'c2', 'c2']);
  });

  it('switches language on the page only, without storing it or asking the server', async () => {
    fetchMock.mockReturnValueOnce(json(200, PAGE));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    fireEvent.click(screen.getByRole('button', { name: 'తెలుగు' }));
    expect(screen.getByText('ఎంత తీవ్రంగా ఉంది?')).toBeInTheDocument();
    expect(screen.getByText('నమస్తే Asha')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('tells the patient to call the clinic, with its number, after an urgent answer', async () => {
    fetchMock.mockReturnValueOnce(json(200, PAGE)).mockReturnValueOnce(json(200, { status: 'saved', urgent: true, clinicPhone: '+91 40 5555 0100' }));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    fireEvent.click(screen.getByLabelText('9'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    const urgent = await screen.findByTestId('urgent');
    expect(urgent).toHaveTextContent('Please call the clinic now');
    expect(screen.getByRole('link', { name: 'Call +91 40 5555 0100' })).toHaveAttribute('href', 'tel:+91 40 5555 0100');
    expect(screen.getByRole('link', { name: 'See my records' })).toHaveAttribute('href', '/p/records');
  });

  it('says "already answered" and nothing about the stored answer', async () => {
    fetchMock.mockReturnValueOnce(json(200, PAGE)).mockReturnValueOnce(json(200, { status: 'already-answered' }));
    render(<TaskLinkPage />);
    await screen.findByText('Hello Asha');
    fireEvent.click(screen.getByLabelText('2'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send answers' })));
    expect(await screen.findByTestId('already-answered')).toHaveTextContent('already answered');
  });

  it('shows one inactive message for any rejected link', async () => {
    fetchMock.mockReturnValueOnce(json(404, { statusCode: 404, message: 'This link is no longer active. Please contact the clinic.' }));
    render(<TaskLinkPage />);
    await waitFor(() => expect(screen.getByTestId('link-inactive')).toHaveTextContent('This link is no longer active'));
    expect(window.location.href).not.toContain(TOKEN);
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { domToCanvas } from 'modern-screenshot';
import { apiClient } from '@/lib/api';
import { DashboardUserProvider } from '@/components/layout/dashboard-user-context';
import { ReportIssueProvider } from '@/components/issue-report/ReportIssueProvider';
import { ReportIssueButton } from '@/components/issue-report/ReportIssueButton';
import { ScreenshotRedactor } from '@/components/issue-report/ScreenshotRedactor';
import type { Redaction } from '@/components/issue-report/redaction';
import type { User } from '@/lib/types';

jest.mock('@/lib/api', () => ({ apiClient: { getIssueReportStatus: jest.fn(), submitIssueReport: jest.fn() } }));
jest.mock('modern-screenshot', () => ({ domToCanvas: jest.fn() }));

const api = apiClient as jest.Mocked<typeof apiClient>;
const capture = jest.mocked(domToCanvas);
const original = new Blob(['original-pixels'], { type: 'image/png' });

const rect = (width: number, height: number) =>
  ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;

const IMAGE = { w: 1000, h: 500 };
const FULL_WIDTH_ON_SCREEN = 500;

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

const blobUrls = new Map<string, Blob>();
const flattenedFrom: Array<Blob | undefined> = [];
const context = {
  drawImage: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  lineWidth: 0,
  strokeStyle: '',
  fillStyle: '',
};

beforeAll(() => {
  (window as unknown as { PointerEvent: typeof TestPointerEvent }).PointerEvent = TestPointerEvent;
  let counter = 0;
  URL.createObjectURL = jest.fn((blob: Blob) => {
    const url = `blob:test-${++counter}`;
    blobUrls.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = jest.fn();
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => IMAGE.w });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => IMAGE.h });
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => Promise.resolve() });
  HTMLCanvasElement.prototype.getContext = jest.fn(() => context) as never;
  HTMLCanvasElement.prototype.toBlob = function (done: BlobCallback) {
    done(new Blob([JSON.stringify([...context.fillRect.mock.calls, ...context.strokeRect.mock.calls])], { type: 'image/png' }));
  };
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('data-testid') !== 'redaction-surface') return rect(0, 0);
    const width = (parseFloat((this as HTMLElement).style.width) / 100) * FULL_WIDTH_ON_SCREEN;
    return rect(width, width / 2);
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  flattenedFrom.length = 0;
  context.drawImage.mockImplementation((image: HTMLImageElement) => {
    flattenedFrom.push(blobUrls.get(image.src));
    context.fillRect.mockClear();
    context.strokeRect.mockClear();
  });
});

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

function drag(from: [number, number], to: [number, number]) {
  const surface = screen.getByTestId('redaction-surface');
  fireEvent.pointerDown(surface, { clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(surface, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

const loadImage = () => fireEvent.load(screen.getByAltText('Screenshot being redacted'));

function renderRedactor(props: { initialBoxes?: Redaction[] } = {}) {
  const onDone = jest.fn();
  const onCancel = jest.fn();
  render(<ScreenshotRedactor blob={original} onDone={onDone} onCancel={onCancel} {...props} />);
  loadImage();
  return { onDone, onCancel };
}

const boxCount = () => screen.getByRole('status').textContent;

describe('drawing at different zoom levels', () => {
  it('stores the box in image pixels at fit', async () => {
    const { onDone } = renderRedactor();
    drag([50, 50], [150, 100]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(context.fillRect).toHaveBeenCalledWith(100, 100, 200, 100);
    expect(onDone.mock.calls[0][1]).toEqual([expect.objectContaining({ tool: 'hide', x: 100, y: 100, w: 200, h: 100 })]);
  });

  it('stores the same image-pixel box at 2x zoom as at 1x', async () => {
    const { onDone } = renderRedactor();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('200%')).toBeInTheDocument();
    drag([100, 100], [300, 200]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(context.fillRect).toHaveBeenCalledWith(100, 100, 200, 100);
    expect(onDone.mock.calls[0][1]).toEqual([expect.objectContaining({ x: 100, y: 100, w: 200, h: 100 })]);
  });

  it('fits again with the Fit button', async () => {
    renderRedactor();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('zooms with ctrl+wheel and leaves plain wheel to scroll', () => {
    renderRedactor();
    const viewport = screen.getByTestId('redaction-viewport');
    fireEvent.wheel(viewport, { deltaY: -100 });
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('ignores a stray tap that is too small to be a box', () => {
    renderRedactor();
    drag([50, 50], [52, 52]);
    expect(boxCount()).toBe('0 boxes drawn');
  });

  it('pinches to zoom instead of drawing a box', () => {
    renderRedactor();
    const surface = screen.getByTestId('redaction-surface');
    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(surface, { clientX: 250, clientY: 100, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(surface, { clientX: 350, clientY: 100, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(surface, { clientX: 350, clientY: 100, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 100, pointerId: 1, pointerType: 'touch' });
    expect(boxCount()).toBe('0 boxes drawn');
    expect(screen.getByText('300%')).toBeInTheDocument();
  });
});

describe('undo and redo', () => {
  it('undoes with Ctrl+Z even when Caps Lock sends an upper-case Z', () => {
    renderRedactor();
    drag([50, 50], [150, 100]);
    drag([200, 50], [300, 100]);
    expect(boxCount()).toBe('2 boxes drawn');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Z', ctrlKey: true });
    expect(boxCount()).toBe('1 box drawn');
  });

  it('redoes with Ctrl+Shift+Z and Ctrl+Y', () => {
    renderRedactor();
    drag([50, 50], [150, 100]);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'z', ctrlKey: true });
    expect(boxCount()).toBe('0 boxes drawn');
    fireEvent.keyDown(dialog, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(boxCount()).toBe('1 box drawn');
    fireEvent.keyDown(dialog, { key: 'z', metaKey: true });
    expect(boxCount()).toBe('0 boxes drawn');
    fireEvent.keyDown(dialog, { key: 'y', ctrlKey: true });
    expect(boxCount()).toBe('1 box drawn');
  });

  it('undoes and redoes from the buttons', async () => {
    renderRedactor();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    drag([50, 50], [150, 100]);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(boxCount()).toBe('0 boxes drawn');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(boxCount()).toBe('1 box drawn');
  });
});

describe('editing boxes', () => {
  function drawThree() {
    renderRedactor();
    drag([50, 50], [150, 100]);
    drag([200, 50], [300, 100]);
    drag([350, 50], [450, 100]);
  }

  it('names each box by its position', () => {
    drawThree();
    expect(screen.getByRole('button', { name: 'Redaction 1 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redaction 2 of 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redaction 3 of 3' })).toBeInTheDocument();
  });

  it('moves a box with the arrow keys and resizes it with Shift+arrows', async () => {
    const { onDone } = renderRedactor();
    drag([50, 50], [150, 100]);
    const box = screen.getByRole('button', { name: 'Redaction 1 of 1' });
    box.focus();
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowRight', shiftKey: true });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][1]).toEqual([expect.objectContaining({ x: 116, y: 116, w: 216, h: 100 })]);
  });

  it('undoes a run of key presses in one step', () => {
    renderRedactor();
    drag([50, 50], [150, 100]);
    const box = screen.getByRole('button', { name: 'Redaction 1 of 1' });
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'z', ctrlKey: true });
    expect(boxCount()).toBe('1 box drawn');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  });

  it('deletes only the focused box with Delete and moves focus on', async () => {
    drawThree();
    const middle = screen.getByRole('button', { name: 'Redaction 2 of 3' });
    middle.focus();
    fireEvent.keyDown(middle, { key: 'Delete' });
    expect(boxCount()).toBe('2 boxes drawn');
    expect(screen.queryByRole('button', { name: 'Redaction 3 of 3' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redaction 2 of 2' })).toHaveFocus());
  });

  it('selects, moves and resizes a box with the pointer in Select mode', async () => {
    const { onDone } = renderRedactor();
    drag([50, 50], [150, 100]);
    await userEvent.click(screen.getByRole('radio', { name: 'Select' }));
    const box = screen.getByRole('button', { name: 'Redaction 1 of 1' });
    const surface = screen.getByTestId('redaction-surface');
    fireEvent.pointerDown(box, { clientX: 100, clientY: 75, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 125, clientY: 85, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 125, clientY: 85, pointerId: 1 });
    expect(screen.getByRole('button', { name: 'Redaction 1 of 1' })).toHaveAttribute('aria-pressed', 'true');

    const handle = surface.querySelector('[data-handle="se"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 105, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 210, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 210, clientY: 110, pointerId: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][1]).toEqual([expect.objectContaining({ x: 150, y: 120, w: 220, h: 110 })]);
  });

  it('deletes the selected box from the toolbar', async () => {
    renderRedactor();
    drag([50, 50], [150, 100]);
    expect(screen.getByRole('button', { name: 'Delete box' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete box' }));
    expect(boxCount()).toBe('0 boxes drawn');
  });

  it('keeps boxes inside the image', async () => {
    const { onDone } = renderRedactor();
    drag([400, 200], [480, 240]);
    const box = screen.getByRole('button', { name: 'Redaction 1 of 1' });
    for (let i = 0; i < 20; i++) fireEvent.keyDown(box, { key: 'ArrowRight' });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [kept] = onDone.mock.calls[0][1] as Redaction[];
    expect(kept.x + kept.w).toBeLessThanOrEqual(IMAGE.w);
  });

  it('shows the boxes it was opened with', () => {
    renderRedactor({ initialBoxes: [{ id: 'a', tool: 'hide', x: 10, y: 10, w: 100, h: 50 }] });
    expect(screen.getByRole('button', { name: 'Redaction 1 of 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('reopening after Done', () => {
  function renderApp() {
    const user = { id: 'u1', role: 'DOCTOR' } as unknown as User;
    return render(
      <DashboardUserProvider value={{ user, loading: false, refresh: async () => {}, logout: async () => {} }}>
        <ReportIssueProvider>
          <ReportIssueButton />
        </ReportIssueProvider>
      </DashboardUserProvider>,
    );
  }

  beforeEach(() => {
    api.getIssueReportStatus.mockResolvedValue({ enabled: true });
    api.submitIssueReport.mockResolvedValue({ number: 1, url: 'https://github.com/acme/clinic/issues/1' });
    capture.mockImplementation(async (_page, options) => {
    options?.onCloneNode?.(document.createElement('body'));
    return { width: 10, height: 10, toBlob: (done: (blob: Blob) => void) => done(original) } as unknown as HTMLCanvasElement;
  });
  });

  async function openRedactor() {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Report a problem' }));
    const report = await screen.findByRole('dialog', { name: 'Report a problem' });
    await userEvent.click(await within(report).findByRole('button', { name: 'Open screenshot 1 to redact' }));
    loadImage();
    return report;
  }

  const reopen = async (report: HTMLElement) => {
    await userEvent.click(within(report).getByRole('button', { name: 'Open screenshot 1 to redact' }));
    loadImage();
  };

  const send = async (report: HTMLElement) => {
    await userEvent.type(within(report).getByLabelText('Summarize it in a line'), 'Printer stuck');
    await userEvent.click(within(report).getByRole('checkbox', { name: /no patient-identifying information/ }));
    await userEvent.click(within(report).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(api.submitIssueReport).toHaveBeenCalled());
    return api.submitIssueReport.mock.calls[0][0].get('screenshots') as File;
  };

  const closed = () => waitFor(() => expect(screen.queryByRole('dialog', { name: 'Redact screenshot' })).not.toBeInTheDocument());

  it('keeps the boxes editable, and deleting one changes what is sent', async () => {
    const report = await openRedactor();
    drag([50, 50], [150, 100]);
    drag([200, 50], [300, 100]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await closed();
    expect(within(report).getByText('Redacted (2)')).toBeInTheDocument();

    await reopen(report);
    expect(screen.getByRole('button', { name: 'Redaction 2 of 2' })).toBeInTheDocument();
    const first = screen.getByRole('button', { name: 'Redaction 1 of 2' });
    first.focus();
    fireEvent.keyDown(first, { key: 'Delete' });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await closed();
    expect(within(report).getByText('Redacted (1)')).toBeInTheDocument();
    expect(flattenedFrom).toEqual([original, original]);

    expect(JSON.parse(await readText(await send(report)))).toEqual([[400, 100, 200, 100]]);
  });

  it('sends the untouched image again once every box is deleted', async () => {
    const report = await openRedactor();
    drag([50, 50], [150, 100]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await closed();

    await reopen(report);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await closed();
    expect(within(report).getByText('Redact')).toBeInTheDocument();

    expect(await readText(await send(report))).toBe('original-pixels');
  });

  it('has a single tab stop for redacting each screenshot', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Report a problem' }));
    const report = await screen.findByRole('dialog', { name: 'Report a problem' });
    await within(report).findByRole('button', { name: 'Open screenshot 1 to redact' });
    expect(within(report).getAllByRole('button', { name: /redact/i })).toHaveLength(1);
  });
});

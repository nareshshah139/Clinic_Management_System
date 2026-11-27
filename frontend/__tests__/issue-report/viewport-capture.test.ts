import { createContext, domToCanvas } from 'modern-screenshot';
import { startViewportCapture } from '@/lib/issue-report';

jest.mock('modern-screenshot', () => ({ createContext: jest.fn(), domToCanvas: jest.fn() }));

type CaptureContext = {
  filter: (node: Node) => boolean;
  onCloneNode: (copy: Node) => void;
  onCreateForeignObjectSvg: (svg: SVGSVGElement) => void;
  style: Record<string, string>;
};

const fakeCanvas = () =>
  ({
    width: 10,
    height: 10,
    toBlob: (done: BlobCallback, type?: string) => done(new Blob(['png'], { type: type ?? 'image/png' })),
  }) as unknown as HTMLCanvasElement;

function controlledCapture() {
  let context!: CaptureContext;
  let finish!: (canvas: HTMLCanvasElement) => void;
  let fail!: (error: Error) => void;
  jest.mocked(createContext).mockImplementation(async (_node, options) => ({ ...options }) as never);
  jest.mocked(domToCanvas).mockImplementation((ctx) => {
    context = ctx as unknown as CaptureContext;
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  return { context: () => context, finish: (c: HTMLCanvasElement) => finish(c), fail: (e: Error) => fail(e) };
}

const settled = async <T>(promise: Promise<T>) => {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return done;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('startViewportCapture', () => {
  it('waits until the page is copied before letting the caller open the dialog', async () => {
    const capture = controlledCapture();
    const started = startViewportCapture();

    expect(await settled(started)).toBe(false);

    capture.context().onCloneNode(document.createElement('body'));
    const { image } = await started;
    capture.finish(fakeCanvas());

    await expect(image).resolves.toMatchObject({ type: 'image/png' });
  });

  it('rejects when the page cannot be copied', async () => {
    const capture = controlledCapture();
    const started = startViewportCapture();
    await settled(started);

    capture.fail(new Error('copy failed'));

    await expect(started).rejects.toThrow('copy failed');
  });

  it('leaves popovers and notification toasts out of the image', async () => {
    const capture = controlledCapture();
    void startViewportCapture();
    await settled(Promise.resolve());

    const popover = document.createElement('div');
    popover.setAttribute('data-radix-popper-content-wrapper', '');
    const toasts = document.createElement('section');
    toasts.setAttribute('role', 'region');
    toasts.setAttribute('aria-label', 'Notifications alt+T');

    expect(capture.context().filter(popover)).toBe(false);
    expect(capture.context().filter(toasts)).toBe(false);
    expect(capture.context().filter(document.createElement('main'))).toBe(true);
    expect(capture.context().filter(document.createTextNode('text'))).toBe(true);
  });

  it('shows the selections and text the user entered, not the defaults in the markup', async () => {
    document.body.innerHTML = `
      <select><option value="in">In-person</option><option value="tele">Tele-video</option></select>
      <input type="checkbox" />
      <textarea>default text</textarea>`;
    document.querySelector('select')!.value = 'tele';
    document.querySelector<HTMLInputElement>('input')!.checked = true;
    document.querySelector('textarea')!.value = 'typed by the clinician';

    const capture = controlledCapture();
    void startViewportCapture();
    await settled(Promise.resolve());

    // The library copies element by element and records a field's live value in its value attribute.
    const copy = document.body.cloneNode(true) as HTMLElement;
    copy.querySelector('select')!.setAttribute('value', 'tele');
    copy.querySelector('textarea')!.setAttribute('value', 'typed by the clinician');
    capture.context().onCloneNode(copy);

    expect(copy.querySelector('option[value="tele"]')!.hasAttribute('selected')).toBe(true);
    expect(copy.querySelector('option[value="in"]')!.hasAttribute('selected')).toBe(false);
    expect(copy.querySelector('input')!.hasAttribute('checked')).toBe(true);
    expect(copy.querySelector('textarea')!.textContent).toBe('typed by the clinician');
  });
});

describe('startViewportCapture layout', () => {
  const original = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio };
  const resize = (size: Partial<typeof original>) =>
    Object.entries(size).forEach(([key, value]) => Object.defineProperty(window, key, { value, configurable: true }));
  afterEach(() => resize(original));

  it.each([
    ['80% browser zoom on a 2x screen', 1.6, '1.6', '3024', '1600'],
    ['a 3x screen, capped at 2x', 3, '2', '3780', '2000'],
  ])('lays the copy out in device pixels on %s', async (_case, devicePixelRatio, zoom, width, height) => {
    resize({ innerWidth: 1890, innerHeight: 1000, devicePixelRatio });
    const capture = controlledCapture();
    const started = startViewportCapture();
    await settled(started);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    capture.context().onCreateForeignObjectSvg(svg);

    expect(capture.context().style.zoom).toBe(zoom);
    expect(svg.getAttribute('width')).toBe(width);
    expect(svg.getAttribute('height')).toBe(height);
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
    capture.context().onCloneNode(document.createElement('body'));
    await started;
  });

  it('keeps the exact widths of tabs that only fit their row at full precision', async () => {
    document.body.innerHTML = `
      <div role="tablist"><button id="tab" style="box-sizing: border-box; width: 106.055px">Purchase</button></div>
      <div id="spinning" style="box-sizing: border-box; width: 80px; transform: rotate(45deg)"></div>`;
    const laidOut = (id: string, width: number) =>
      jest.spyOn(document.getElementById(id)!, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
    laidOut('tab', 106.0546875);
    laidOut('spinning', 113.137);

    const capture = controlledCapture();
    const started = startViewportCapture();
    await settled(started);
    const copy = document.body.cloneNode(true) as HTMLElement;
    capture.context().onCloneNode(copy);
    await started;

    const sheet = [...copy.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    const tab = copy.querySelector('#tab')!;
    expect(sheet).toContain(`.${tab.classList[0]} { width: 106.0546875px !important; }`);
    expect(copy.querySelector('#spinning')!.classList).toHaveLength(0);
    expect(document.querySelector('[data-capture-width]')).toBeNull();
  });
});

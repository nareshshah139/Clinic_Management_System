import { domToCanvas } from 'modern-screenshot';
import { startViewportCapture } from '@/lib/issue-report';

jest.mock('modern-screenshot', () => ({ domToCanvas: jest.fn() }));

type CaptureOptions = { filter: (node: Node) => boolean; onCloneNode: (copy: Node) => void };

const fakeCanvas = () =>
  ({
    width: 10,
    height: 10,
    toBlob: (done: BlobCallback, type?: string) => done(new Blob(['png'], { type: type ?? 'image/png' })),
  }) as unknown as HTMLCanvasElement;

function controlledCapture() {
  let options!: CaptureOptions;
  let finish!: (canvas: HTMLCanvasElement) => void;
  let fail!: (error: Error) => void;
  jest.mocked(domToCanvas).mockImplementation((_node, opts) => {
    options = opts as unknown as CaptureOptions;
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  return { options: () => options, finish: (c: HTMLCanvasElement) => finish(c), fail: (e: Error) => fail(e) };
}

const settled = async <T>(promise: Promise<T>) => {
  let done = false;
  promise.then(() => (done = true), () => (done = true));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
};

describe('startViewportCapture', () => {
  it('waits until the page is copied before letting the caller open the dialog', async () => {
    const capture = controlledCapture();
    const started = startViewportCapture();

    expect(await settled(started)).toBe(false);

    capture.options().onCloneNode(document.createElement('body'));
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
    const page = document.createElement('main');

    expect(capture.options().filter(popover)).toBe(false);
    expect(capture.options().filter(toasts)).toBe(false);
    expect(capture.options().filter(page)).toBe(true);
    expect(capture.options().filter(document.createTextNode('text'))).toBe(true);
  });
});

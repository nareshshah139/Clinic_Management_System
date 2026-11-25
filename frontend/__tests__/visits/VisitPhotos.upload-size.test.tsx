import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import VisitPhotos from '@/components/visits/VisitPhotos';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/api', () => ({ apiClient: { getAllPatientVisitHistory: jest.fn().mockResolvedValue([]), get: jest.fn().mockResolvedValue({ items: [] }) } }));
jest.setTimeout(60_000);

const MB = 1024 * 1024;
const photo = (name: string, type: string, size: number) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const saved = { fetch: global.fetch, xhr: global.XMLHttpRequest, createURL: URL.createObjectURL, revokeURL: URL.revokeObjectURL };
let sent: { files: string[]; positions: string[] }[];

beforeEach(() => {
  sent = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => String(input).startsWith('blob:')
    ? ({ blob: async () => new Blob(['x']) } as Response)
    : ({ ok: true, json: async () => ({ items: [] }) } as Response)) as unknown as typeof fetch;
  Object.assign(globalThis, {
    createImageBitmap: async () => ({ width: 6000, height: 4000, close() {} }),
    OffscreenCanvas: class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return new Blob(['downscaled']); }
    },
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  URL.createObjectURL = () => 'blob:photo';
  URL.revokeObjectURL = () => {};
  global.XMLHttpRequest = class {
    upload = {};
    readyState = 0;
    status = 0;
    responseText = '{}';
    onreadystatechange?: () => void;
    open() {}
    send(body: FormData) {
      sent.push({
        files: body.getAll('files').map((f) => (f as File).name),
        positions: JSON.parse(String(body.get('positions'))),
      });
      this.status = 200;
      this.readyState = 4;
      this.onreadystatechange?.();
    }
  } as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  global.fetch = saved.fetch;
  global.XMLHttpRequest = saved.xhr;
  URL.createObjectURL = saved.createURL;
  URL.revokeObjectURL = saved.revokeURL;
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  jest.restoreAllMocks();
  mockToast.mockClear();
});

async function upload(files: File[]) {
  const { container } = render(<VisitPhotos visitId="cur" />);
  await screen.findByText(/No photos attached/);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /upload/i }));
  await waitFor(() => expect(screen.queryByText('Uploading...')).toBeNull());
}

it('uploads a 30MB photo that is small after downscaling, and skips one that stays over 25MB', async () => {
  await upload([
    photo('huge.jpg', 'image/jpeg', 30 * MB),
    photo('raw.heic', 'image/heic', 26 * MB),
    photo('small.jpg', 'image/jpeg', 2 * MB),
  ]);

  expect(sent).toEqual([{ files: ['huge.jpg', 'small.jpg'], positions: ['FRONT', 'RIGHT_PROFILE'] }]);
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Upload completed with warnings',
    description: expect.stringContaining('raw.heic: larger than 25MB'),
  })));
});

it('sends nothing when every photo is still over 25MB after processing', async () => {
  await upload([photo('raw.heic', 'image/heic', 26 * MB)]);

  expect(sent).toEqual([]);
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
    description: expect.stringContaining('raw.heic: larger than 25MB'),
  })));
});

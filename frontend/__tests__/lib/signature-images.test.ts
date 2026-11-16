import { waitForSignatureImages } from '@/lib/pdf-export';

it('waits for signature decoding before export', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<img data-doctor-signature src="data:image/png;base64,c2ln">';
  const image = root.firstElementChild as HTMLImageElement;
  let finish!: () => void;
  image.decode = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  Object.defineProperty(image, 'naturalWidth', { value: 548 });
  let ready = false;
  const pending = waitForSignatureImages(root).then(() => { ready = true; });
  expect(ready).toBe(false);
  finish();
  await pending;
  expect(ready).toBe(true);
});

it('rejects an unreadable signature instead of silently exporting without it', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<img data-doctor-signature src="invalid">';
  const image = root.firstElementChild as HTMLImageElement;
  image.decode = jest.fn().mockRejectedValue(new Error('Broken image'));
  await expect(waitForSignatureImages(root)).rejects.toThrow('Broken image');
});

it('allows unsigned output without waiting for an image', async () => {
  await expect(waitForSignatureImages(document.createElement('div'))).resolves.toBeUndefined();
});

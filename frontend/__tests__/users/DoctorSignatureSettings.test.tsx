import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DoctorSignatureSettings } from '@/components/users/DoctorSignatureSettings';
import { apiClient } from '@/lib/api';

jest.mock('@/lib/api', () => ({ apiClient: { getDoctorSignature: jest.fn(), uploadOwnSignature: jest.fn(), removeOwnSignature: jest.fn() } }));
const api = apiClient as jest.Mocked<typeof apiClient>;
beforeEach(() => { jest.clearAllMocks(); api.getDoctorSignature.mockResolvedValue({ signature: null }); });

it('uploads, previews, replaces and removes the current doctor’s signature', async () => {
  api.uploadOwnSignature.mockResolvedValue({ signature: { id: 'sig', url: 'data:image/png;base64,c2ln' } });
  api.removeOwnSignature.mockResolvedValue({});
  const changed = jest.fn();
  window.addEventListener('doctor-signature-changed', changed);
  const file = new File(['png'], 'signature.png', { type: 'image/png' });
  render(<DoctorSignatureSettings doctorId="doctor-1" />);
  const upload = screen.getByLabelText('Upload signature');
  await waitFor(() => expect(upload).toBeEnabled());
  fireEvent.change(upload, { target: { files: [file] } });
  expect(await screen.findByAltText('Your saved signature')).toHaveAttribute('src', 'data:image/png;base64,c2ln');
  expect(api.uploadOwnSignature).toHaveBeenCalledWith(file);
  expect(screen.getByText('Signature saved.')).toBeInTheDocument();
  expect(screen.getByLabelText('Replace signature')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove signature' }));
  await screen.findByText('Signature removed.');
  expect(screen.queryByAltText('Your saved signature')).not.toBeInTheDocument();
  expect(api.removeOwnSignature).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledTimes(2);
  window.removeEventListener('doctor-signature-changed', changed);
});

it.each([['signature.svg', 'image/svg+xml', 5], ['large.png', 'image/png', 2 * 1024 * 1024 + 1]])('rejects %s without uploading', async (name, type, bytes) => {
  render(<DoctorSignatureSettings doctorId="doctor-1" />);
  const upload = screen.getByLabelText('Upload signature');
  await waitFor(() => expect(upload).toBeEnabled());
  fireEvent.change(upload, { target: { files: [new File([new Uint8Array(bytes)], name, { type })] } });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a PNG or JPG image up to 2 MB.');
  expect(api.uploadOwnSignature).not.toHaveBeenCalled();
});

it('retains the saved signature when a replacement fails', async () => {
  api.getDoctorSignature.mockResolvedValue({ signature: { id: 'old', url: 'data:image/png;base64,b2xk' } });
  api.uploadOwnSignature.mockRejectedValue(new Error('Upload failed'));
  render(<DoctorSignatureSettings doctorId="doctor-1" />);
  const upload = await screen.findByLabelText('Replace signature');
  fireEvent.change(upload, { target: { files: [new File(['new'], 'new.jpg', { type: 'image/jpeg' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed');
  expect(screen.getByAltText('Your saved signature')).toHaveAttribute('src', 'data:image/png;base64,b2xk');
});

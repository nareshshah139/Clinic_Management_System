jest.mock('next/font/google', () => ({ Geist: () => ({ variable: '' }), Geist_Mono: () => ({ variable: '' }) }));

import { metadata } from '@/app/layout';

it('titles every page with the full clinic name', () => {
  expect(metadata.title).toEqual({
    default: 'Linaé Skin, Hair and Aesthetic Clinic',
    template: '%s | Linaé Skin, Hair and Aesthetic Clinic',
  });
});

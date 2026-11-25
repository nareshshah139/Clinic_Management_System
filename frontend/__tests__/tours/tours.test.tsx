import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { usePathname } from 'next/navigation';
import { DoctorTour, DOCTOR_VISIT_TOUR } from '@/components/tours/DoctorTour';
import { ReceptionistTour, RECEPTIONIST_TOURS } from '@/components/tours/ReceptionistTour';

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));

// jsdom has no layout: an element counts as on screen unless it sits inside [hidden].
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.closest('[hidden]') ? [] : [{ x: 0, y: 0, top: 0, left: 0, width: 100, height: 20, right: 100, bottom: 20 }]) as unknown as DOMRectList;
  });
});

afterEach(async () => {
  await act(async () => { document.querySelector<HTMLElement>('.introjs-skipbutton')?.click(); });
  document.body.innerHTML = '';
});

function PatientsPage({ listed }: { listed: 'rows' | 'empty' | 'hidden' }) {
  return (
    <>
      <ReceptionistTour />
      <div data-tour="search-patients"><input aria-label="Search patients" /></div>
      <button data-tour="add-patient-btn">New Patient</button>
      {listed === 'rows' && <div data-tour="patients-table">Asha Rao</div>}
      {listed === 'hidden' && <div hidden><div data-tour="patients-table">Asha Rao</div></div>}
    </>
  );
}

async function startTour(name: RegExp | string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
  return screen.findByRole('dialog');
}

async function walk(name: RegExp | string) {
  let dialog = await startTour(name);
  const seen: string[] = [];
  for (;;) {
    const title = dialog.querySelector('.introjs-tooltip-title')?.textContent ?? '';
    seen.push(`${title}: ${dialog.querySelector('.introjs-tooltiptext')?.textContent ?? ''}`);
    const next = within(dialog).getByRole('button', { name: /^(Next|Done)$/ });
    if (next.textContent === 'Done') return seen;
    await act(async () => { fireEvent.click(next); });
    dialog = await screen.findByRole('dialog', { name: (accessibleName) => accessibleName !== title });
  }
}

const routeTo = (pathname: string) => (usePathname as jest.Mock).mockReturnValue(pathname);

describe('onboarding tours', () => {
  it('opens on the first click, before the tour library has finished loading', async () => {
    routeTo('/dashboard/patients');
    render(<PatientsPage listed="rows" />);
    const dialog = await startTour('Start tour');
    expect(dialog).toHaveAccessibleName('Find a patient');
    expect(dialog).toHaveAccessibleDescription(/Search by name, phone, ABHA number or email/);
  });

  it('gives every tour control a name a screen reader can announce', async () => {
    routeTo('/dashboard/patients');
    render(<PatientsPage listed="rows" />);
    const dialog = await startTour('Start tour');
    expect(within(dialog).getByRole('button', { name: 'Skip tour' })).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveFocus());
    expect(within(dialog).getByRole('button', { name: 'Back' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('points each step at the element it describes', async () => {
    routeTo('/dashboard/patients');
    render(<PatientsPage listed="rows" />);
    const dialog = await startTour('Start tour');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Next' })); });
    await screen.findByRole('dialog', { name: 'New Patient' });
    expect(screen.getByText('New Patient', { selector: 'button' })).toHaveClass('introjs-showElement');
  });

  it.each(['empty', 'hidden'] as const)('leaves out the patient list step when the list is %s, without waiting for it', async (listed) => {
    routeTo('/dashboard/patients');
    render(<PatientsPage listed={listed} />);
    const steps = await walk('Start tour');
    expect(steps.map((step) => step.split(':')[0])).toEqual(['Find a patient', 'New Patient']);
  });

  it('teaches the patient form and appointment calendar as they are today', () => {
    const copy = (route: string) => RECEPTIONIST_TOURS[route].map((step) => step.intro).join(' ');
    expect(copy('/dashboard/patients')).toMatch(/Age/);
    expect(copy('/dashboard/patients')).not.toMatch(/date of birth/i);
    expect(copy('/dashboard/appointments')).toMatch(/Click an appointment/);
    expect(copy('/dashboard/appointments')).not.toMatch(/double/i);
    expect(Object.values(RECEPTIONIST_TOURS).flat().map((step) => step.intro).join(' ')).not.toMatch(/codex/i);
  });

  it('closes when Skip tour is pressed and returns focus to the tour button', async () => {
    routeTo('/dashboard/patients');
    render(<PatientsPage listed="rows" />);
    const dialog = await startTour('Start tour');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Skip tour' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Start tour' })).toHaveFocus();
  });

  it('scrolls each step into view and stops following page scroll once closed', async () => {
    routeTo('/dashboard/patients');
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    render(<PatientsPage listed="rows" />);
    const dialog = await startTour('Start tour');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Skip tour' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const scrollCalls = (spy: jest.SpyInstance) => spy.mock.calls.filter(([type]) => type === 'scroll').length;
    expect(scrollCalls(add)).toBeGreaterThan(0);
    expect(scrollCalls(add) - scrollCalls(remove)).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it('leaves no window listeners behind when unmounted before the tour library loads', async () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(<DoctorTour />);
    unmount();
    await act(async () => { await import('intro.js'); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const resizeAdds = add.mock.calls.filter(([type]) => type === 'resize' || type === 'orientationchange').length;
    const resizeRemoves = remove.mock.calls.filter(([type]) => type === 'resize' || type === 'orientationchange').length;
    expect(resizeAdds - resizeRemoves).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it('removes an open tour when its page goes away', async () => {
    const { unmount } = render(<><DoctorTour /><div data-tour="visit-bar">Asha Rao</div></>);
    await startTour('Visit workflow tour');
    await act(async () => { unmount(); });
    await waitFor(() => expect(document.querySelector('.introjs-tooltip, .introjs-overlay')).toBeNull());
  });
});

describe('tour anchors', () => {
  const src = path.join(__dirname, '../../src');
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !/Tour\.tsx$/.test(entry.name) ? [full] : [];
  });
  const sources = [...files(path.join(src, 'components')), ...files(path.join(src, 'app'))].map((file) => readFileSync(file, 'utf8'));

  const declares = (attr: string, value?: string) => sources.some((text) => {
    if (value === undefined) return text.includes(`${attr}=`);
    if (text.includes(`${attr}="${value}"`) || text.includes(`${attr.replace(/^data-/, '')}="${value}"`)) return true;
    return [...text.matchAll(new RegExp(`${attr}=\\{\`([\\w-]*)\\$\\{`, 'g'))]
      .some(([, prefix]) => value.startsWith(prefix) && text.includes(`"${value.slice(prefix.length)}"`));
  });

  const steps = [...DOCTOR_VISIT_TOUR, ...Object.values(RECEPTIONIST_TOURS).flat()];
  const attributes = steps.flatMap((step) => [...(step.element ?? '').matchAll(/\[([\w-]+)(?:="([^"]+)")?\]/g)])
    .map(([selector, attr, value]) => [selector, attr, value] as const);

  it('anchors at least one step of every tour to a page element', () => {
    expect(DOCTOR_VISIT_TOUR.filter((step) => step.element).length).toBeGreaterThanOrEqual(8);
    expect(attributes.length).toBeGreaterThan(0);
  });

  it.each(attributes)('%s is declared by an app component', (_selector, attr, value) => {
    expect(declares(attr, value)).toBe(true);
  });
});

import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';
import { Button } from '../button';
import { PageHeader } from '../page-header';
import { Select, SelectTrigger, SelectValue } from '../select';
import { Tabs, TabsList, TabsTrigger } from '../tabs';

function expectNoMidWordBreak(el: HTMLElement) {
  expect(el.className).not.toContain('overflow-wrap:anywhere');
  expect(el.className).not.toContain('whitespace-normal');
}

describe('labels stay whole', () => {
  it('keeps Badge text on one line', () => {
    render(<Badge>FEMALE</Badge>);
    const el = screen.getByText('FEMALE');
    expect(el).toHaveClass('whitespace-nowrap');
    expectNoMidWordBreak(el);
  });

  it('keeps Button text on one line', () => {
    render(<Button>Submit</Button>);
    const el = screen.getByRole('button', { name: 'Submit' });
    expect(el).toHaveClass('whitespace-nowrap');
    expectNoMidWordBreak(el);
  });

  it('keeps tab triggers on one line', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Prescription</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const el = screen.getByRole('tab', { name: 'Prescription' });
    expect(el).toHaveClass('whitespace-nowrap');
    expectNoMidWordBreak(el);
  });

  it('truncates the select value instead of wrapping', () => {
    render(
      <Select value="x">
        <SelectTrigger aria-label="Pick">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );
    const el = screen.getByRole('combobox', { name: 'Pick' });
    expect(el).toHaveClass('whitespace-nowrap');
    expect(el.className).toContain('*:data-[slot=select-value]:truncate');
    expectNoMidWordBreak(el);
  });

  it('renders the page title without forced mid-word breaking', () => {
    render(<PageHeader title="Patients" />);
    const header = screen.getByRole('banner');
    expect(header.className).not.toContain('overflow-wrap:anywhere');
    expect(screen.getByRole('heading', { level: 1, name: 'Patients' })).toHaveClass('break-words');
  });
});

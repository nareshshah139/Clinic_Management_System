import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NativeSelect } from '../native-select';

it('stays a named native select that reports the chosen value', () => {
  const onChange = jest.fn();
  render(
    <>
      <label htmlFor="period">Period</label>
      <NativeSelect id="period" value="week" onChange={(event) => onChange(event.target.value)}>
        <option value="day">Today</option>
        <option value="week">This week</option>
      </NativeSelect>
    </>,
  );
  const select = screen.getByRole('combobox', { name: 'Period' });
  expect(select.tagName).toBe('SELECT');
  expect(select).toHaveDisplayValue('This week');
  fireEvent.change(select, { target: { value: 'day' } });
  expect(onChange).toHaveBeenCalledWith('day');
});

it('sizes the wrapper with className and hands the ref to the select', () => {
  const ref = createRef<HTMLSelectElement>();
  render(
    <NativeSelect aria-label="Shelf" ref={ref} className="w-64">
      <option>A1</option>
    </NativeSelect>,
  );
  const select = screen.getByRole('combobox', { name: 'Shelf' });
  expect(ref.current).toBe(select);
  expect(select.parentElement).toHaveClass('w-64');
  expect(select).not.toHaveClass('w-64');
});

import { stockCheckLineName } from './bill-line-name';

describe('stockCheckLineName', () => {
  it('names a matched line by its stock, not by what was prescribed', () => {
    expect(stockCheckLineName({ drugName: '13 74 | Flutas 150Mg(Pc)', stockName: 'Tab. Flutas 150 mg' })).toBe('Tab. Flutas 150 mg');
  });
  it('falls back to the prescribed name when no stock is linked', () => {
    expect(stockCheckLineName({ drugName: 'Cream Unlisted 2%', stockName: null })).toBe('Cream Unlisted 2%');
    expect(stockCheckLineName({ drugName: 'Cream Unlisted 2%' })).toBe('Cream Unlisted 2%');
  });
});

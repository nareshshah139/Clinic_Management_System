import {
  checkedProductQuery,
  matchProductSearch as match,
  ocrProductSearchQuery,
  productEditDistance,
  searchPackKey,
} from './product-search';

describe('shared product matching', () => {
  it('orders exact codes, names, aliases, prefixes, words and typos consistently', () => {
    const products = [
      { names: ['Other'], codes: ['tyrodin'] },
      { names: ['Tyrodin'] },
      { names: ['New name'], aliases: ['Tyrodin'] },
      { names: ['Tyrodin Cream'] },
      { names: ['Tyrobin'] },
    ];
    const matches = products.map((p) => match('tyrodin', p)!);
    expect(matches.map((m) => m.kind)).toEqual([
      'code',
      'exact',
      'alias',
      'prefix',
      'fuzzy',
    ]);
    expect(matches.map((m) => m.score)).toEqual(
      matches.map((m) => m.score).sort((a, b) => b - a),
    );
  });
  it('corrects adjacent transpositions, joined brand words and known old names', () => {
    expect(productEditDistance('tyrodni', 'tyrodin')).toBe(1);
    expect(match('tyrodni', { names: ['Tyrodin Cream'] })?.kind).toBe('fuzzy');
    expect(match('maxrcih', { names: ['Max Rich Yu Cream'] })?.kind).toBe(
      'fuzzy',
    );
    expect(
      match('deepwhite', {
        names: ['Depiwhite Cream'],
        aliases: ['deepwhite cream 15ML'],
      })?.kind,
    ).toBe('prefix');
  });
  it('supports word order, unit spacing, punctuation and query words across fields', () => {
    expect(
      match('ointment t bact', { names: ['T-Bact Ointment'] }),
    ).not.toBeNull();
    expect(
      match('isotroin 10mg', {
        names: ['Isotroin 10 mg Capsule'],
        strength: '10mg',
      }),
    ).not.toBeNull();
    expect(
      match('cream 15 g', { names: ['Fucidin Cream'], details: ['15 Gm'] }),
    ).not.toBeNull();
    expect(
      match('cream 15g absentword', {
        names: ['Fucidin Cream'],
        details: ['15 Gm'],
      }),
    ).toBeNull();
  });
  it('does not fuzzy-correct numbers, decimal strength, dosage forms or short names', () => {
    expect(
      match('isotroin 10', {
        names: ['Isotroin 20 Capsule'],
        strength: '20mg',
        details: ['10 Capsules'],
      }),
    ).toBeNull();
    expect(
      match('isotroin 10mg', { names: ['Isotroin 100mg Capsule'] }),
    ).toBeNull();
    expect(match('revize 0.025%', { names: ['Revize 0.04% Gel'] })).toBeNull();
    expect(match('t bact cream', { names: ['T Bact Ointment'] })).toBeNull();
    expect(
      match('momate cream', { names: ['Momate Creamy Lotion'] }),
    ).toBeNull();
    expect(match('pan', { names: ['Pin Tablet'] })).toBeNull();
    expect(match('12345', { names: ['Other'], codes: ['12346'] })).toBeNull();
    expect(match('B-24', { names: ['Other'], codes: ['B-24001'] })?.kind).toBe(
      'code',
    );
    expect(
      match('photostable pro+', { names: ['Photostable Pro Sunscreen'] }),
    ).toBeNull();
  });
  it('ranks the closer spelling above a different brand even when strength is in another field', () => {
    const closer = match('isotrion 10mg', {
      names: ['Isotroin 10 Capsule'],
      strength: '10mg',
      details: ['10mg'],
    })!;
    const farther = match('isotrion 10mg', {
      names: ['Isotriz 10mg Capsule'],
    })!;
    expect(closer.score).toBeGreaterThan(farther.score);
  });
  it('honors name and ingredient mode without falling back to the other field', () => {
    const p = {
      names: ['Dolo 650 Tablet'],
      ingredients: ['Paracetamol 650mg'],
    };
    expect(match('paracetmaol', p, 'ingredient')?.kind).toBe('fuzzy');
    expect(match('paracetamol', p, 'name')).toBeNull();
    expect(match('dolo', p, 'ingredient')).toBeNull();
  });
  it('keeps pack dimensions and loose units distinct', () => {
    expect(searchPackKey('bottle of 30 ml Solution')).toBe('30:ml');
    expect(searchPackKey('30 g')).not.toBe(searchPackKey('30 ml'));
    expect(searchPackKey('strip of 10')).toBe(searchPackKey('10 Tablets'));
    expect(searchPackKey('1 tablet; source pack 10 Tablet')).not.toBe(
      searchPackKey('10 Tablets'),
    );
    expect(searchPackKey('0')).toBeNull();
    expect(searchPackKey('2 x 30ml')).toBeNull();
    expect(searchPackKey('1 loose unit; source pack 30ml')).not.toBe(
      searchPackKey('30ml'),
    );
  });
  it('bounds query work and never changes input objects', () => {
    expect(() => checkedProductQuery('a'.repeat(201))).toThrow(
      '200 characters',
    );
    const product = Object.freeze({
      names: Object.freeze(['Tyrodin Cream']) as unknown as string[],
    });
    expect(match('tyrodni', product)).not.toBeNull();
  });
  it('only omits the explicit supplier annotation for OCR suggestion lookup', () => {
    expect(ocrProductSearchQuery('FOLITRAX 7.5MG(DPC)')).toEqual({
      query: 'FOLITRAX 7.5MG',
      notes: [expect.stringContaining('(DPC)')],
    });
    expect(ocrProductSearchQuery('Medicine (SR) 5MG')).toEqual({
      query: 'Medicine (SR) 5MG',
      notes: [],
    });
    expect(
      match('Tyrodin ESR Tab.', { names: ['Tyrodin FSR Tablet'] }),
    ).toBeNull();
  });
});

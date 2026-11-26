import { prepareCaptureClone } from '@/lib/issue-report';

const declaredRules = () => {
  const css = Array.from(document.head.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n');
  return Array.from(css.matchAll(/([^{}]+)\{([^}]*)\}/g)).map(([, selector, body]) => ({ selector: selector.trim(), body }));
};

const hiddenBy = (id: string, declaration: RegExp) =>
  declaredRules().some(({ selector, body }) => declaration.test(body) && (document.getElementById(id) as HTMLElement).matches(selector));

describe('prepareCaptureClone', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <details id="closed"><summary id="closed-summary">Reported discounts</summary><p id="closed-body">body</p><div id="closed-grid"></div></details>
      <details open><summary id="open-summary">Open</summary><p id="open-body">body</p></details>`;
    prepareCaptureClone(document);
  });

  it('hides the body of a closed details block, which html2canvas would otherwise paint over its neighbours', () => {
    expect(hiddenBy('closed-body', /display:\s*none/)).toBe(true);
    expect(hiddenBy('closed-grid', /display:\s*none/)).toBe(true);
  });

  it('keeps the summary and everything in an open details block', () => {
    expect(hiddenBy('closed-summary', /display:\s*none/)).toBe(false);
    expect(hiddenBy('open-summary', /display:\s*none/)).toBe(false);
    expect(hiddenBy('open-body', /display:\s*none/)).toBe(false);
  });

  it('drops the summary list marker that html2canvas prints as a stray number', () => {
    expect(hiddenBy('closed-summary', /list-style:\s*none/)).toBe(true);
  });

  it('still flattens box shadows', () => {
    expect(hiddenBy('closed-body', /box-shadow:\s*none/)).toBe(true);
  });
});

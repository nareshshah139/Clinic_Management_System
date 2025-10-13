import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
})); 

// Neutralize jsdom CSS parsing for <style> tags (it doesn't support @page, @top-left, etc.)
// while still keeping access to the raw CSS text for assertions in tests.
try {
  const define = (proto, prop, descriptor) => Object.defineProperty(proto, prop, descriptor);
  if (typeof HTMLStyleElement !== 'undefined') {
    // Preserve original descriptors if present
    const originalTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');

    // Backing store for raw CSS
    define(HTMLStyleElement.prototype, '__rawCss', {
      configurable: true,
      writable: true,
      value: '',
    });

    // Override textContent getter/setter
    if (originalTextContent) {
      define(HTMLStyleElement.prototype, 'textContent', {
        configurable: true,
        get() { return this.__rawCss || ''; },
        set(v) { this.__rawCss = String(v ?? ''); },
      });
    }

    // Override innerHTML getter/setter
    const originalInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (originalInnerHtml) {
      define(HTMLStyleElement.prototype, 'innerHTML', {
        configurable: true,
        get() { return this.__rawCss || ''; },
        set(v) { this.__rawCss = String(v ?? ''); },
      });
    }

    // Override appendChild to accumulate raw CSS from Text nodes without parsing
    const originalAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child) {
      if (this instanceof HTMLStyleElement && child && child.nodeType === 3 /* TEXT_NODE */) {
        this.__rawCss = (this.__rawCss || '') + (child.nodeValue || '');
        return child;
      }
      return originalAppendChild.call(this, child);
    };
  }
} catch {}
import '@testing-library/jest-dom';

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// globalThis is `window` in jsdom and the plain global in node-env tests (supabase/**).
globalThis.IntersectionObserver = IntersectionObserverMock;

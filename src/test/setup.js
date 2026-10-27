import '@testing-library/jest-dom';

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.IntersectionObserver = IntersectionObserverMock;
globalThis.IntersectionObserver = IntersectionObserverMock;

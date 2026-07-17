import '@testing-library/jest-dom';

// Stub matchMedia for tests (jsdom doesn't implement it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Stub ResizeObserver (used by Recharts and Leaflet)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Stub requestAnimationFrame (used by canvas animations)
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
globalThis.cancelAnimationFrame = () => {};

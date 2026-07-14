import "@testing-library/jest-dom/vitest";

// HeroUI / react-aria / framer-motion touch browser APIs jsdom lacks.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
}
if (!("IntersectionObserver" in globalThis)) {
  globalThis.IntersectionObserver =
    ObserverStub as unknown as typeof IntersectionObserver;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
window.scrollTo = () => {};

import '@testing-library/jest-dom/vitest';
import 'antd-mobile/es/global';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock
});

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[antd-mobile: Global]')) return;
  originalError(...args);
};

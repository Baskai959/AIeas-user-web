import '@testing-library/jest-dom/vitest';
import 'antd-mobile/es/global';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value))
  };
}

const maybeWindow = (globalThis as typeof globalThis & { window?: { localStorage?: Storage } }).window;
const testLocalStorage =
  maybeWindow && typeof maybeWindow.localStorage?.clear === 'function'
    ? maybeWindow.localStorage
    : createMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  writable: true,
  configurable: true,
  value: testLocalStorage
});

if (maybeWindow) {
  Object.defineProperty(maybeWindow, 'localStorage', {
    configurable: true,
    value: testLocalStorage
  });
}

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

type RouteNavigate = (
  to: string,
  options?: {
    replace?: boolean;
    state?: unknown;
    flushSync?: boolean;
    viewTransition?: boolean;
  }
) => void;

export function navigateWithTransition(
  navigate: RouteNavigate,
  to: string,
  options?: {
    replace?: boolean;
    state?: unknown;
  }
): void {
  navigate(to, {
    ...options,
    flushSync: true,
    viewTransition: true
  });
}

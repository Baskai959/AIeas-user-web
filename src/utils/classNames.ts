export function joinClassNames(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(' ');
}

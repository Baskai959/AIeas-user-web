import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match?.[1] ?? '';
}

function rules(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'gm')))
    .map((match) => match[1])
    .join('\n');
}

function keyframes(name: string): string {
  const marker = `@keyframes ${name}`;
  const start = css.indexOf(marker);
  if (start < 0) return '';
  const next = css.indexOf('@keyframes', start + marker.length);
  return css.slice(start, next < 0 ? undefined : next);
}

describe('mobile layout CSS', () => {
  it('keeps formal live-room videos letterboxed while preserving immersive home previews', () => {
    expect(rule('.live-video')).toContain('object-fit: contain');
    expect(rule('.digital-human-video')).toContain('object-fit: contain');
    expect(rule('.discover-video')).toContain('object-fit: cover');
  });

  it('uses one continuous bottom-tab background and highlights only active text/icons', () => {
    expect(css).toContain('--bottom-tab-height');
    expect(css).toContain('--app-shell-border-width');
    expect(rule('.bottom-tab-frame')).toContain('position: fixed');
    expect(rule('.bottom-tab-frame')).toContain('left: calc((100vw - min(100vw, var(--app-shell-max-width))) / 2 + var(--app-shell-border-width))');
    expect(rule('.bottom-tab-frame')).toContain('right: calc((100vw - min(100vw, var(--app-shell-max-width))) / 2 + var(--app-shell-border-width))');
    expect(rule('.bottom-tabs')).toContain('gap: 0');
    expect(rule('.bottom-tabs')).toContain('width: 100%');
    expect(rule('.bottom-tabs')).not.toContain('position: fixed');
    expect(rule('.bottom-tabs')).not.toContain('background: transparent');
    expect(rule('.bottom-tabs button')).toContain('background: transparent');
    expect(rule('.bottom-tabs button')).toContain('border-radius: 0');
    expect(rule('.bottom-tabs button.is-active')).not.toContain('background:');
    expect(rule('.tab-shell.is-home-tab .bottom-tabs')).toContain('background: rgba(5, 7, 13, 0.94)');
    expect(rule('.tab-shell.is-home-tab .bottom-tabs button')).toContain('color: rgba(255, 255, 255, 0.64)');
    expect(rule('.tab-shell.is-home-tab .bottom-tabs button.is-active')).toContain('color: #fff');
  });

  it('compresses the home preview lot strip and uses the transparent white live-entry button', () => {
    expect(rule('.discover-copy')).toContain('left: 16px');
    expect(rule('.discover-copy')).toContain('max-width: none');
    expect(rule('.discover-lot')).toContain('grid-template-columns: 35px minmax(0, 1fr) auto auto');
    expect(rule('.discover-lot')).toContain('justify-self: center');
    expect(rule('.discover-lot')).toContain('width: 100%');
    expect(rule('.discover-lot')).toContain('min-height: 44px');
    expect(rule('.discover-lot .visual-placeholder,\n.discover-lot img')).toContain('width: 35px');
    expect(rule('.discover-lot .visual-placeholder')).toContain('min-height: 0');
    expect(rule('.discover-lot .visual-placeholder small')).toContain('display: none');
    expect(rule('.discover-lot-status.is-running')).toContain('background: #ef4444');
    expect(rule('.discover-lot-status.is-upcoming')).toContain('border: 1px solid rgba(239, 68, 68, 0.34)');
    expect(rule('.discover-slide .discover-enter-button.adm-button')).toContain('background: rgba(255, 255, 255, 0.05)');
    expect(rule('.discover-slide .discover-enter-button.adm-button')).toContain('border: 1px solid rgba(255, 255, 255, 0.7)');
    expect(rule('.discover-slide .discover-enter-button.adm-button')).toContain('font-family: "Microsoft YaHei UI Light", "Microsoft YaHei", sans-serif');
    expect(rule('.discover-slide .discover-enter-button.adm-button')).toContain('font-weight: 300');
  });

  it('renders the home preview watcher count without a border', () => {
    expect(rules('.discover-watcher-count')).toContain('background: transparent');
    expect(rules('.discover-watcher-count')).not.toContain('border:');
  });

  it('keeps live-room watcher and bottom controls compact', () => {
    expect(css).toContain('--live-auction-action-width: clamp(112px, 30vw, 132px)');
    expect(rule('.live-side-rail span')).toContain('background: transparent');
    expect(rule('.live-side-rail span')).toContain('opacity: 0.7');
    expect(rule('.live-side-rail span')).not.toContain('border:');
    expect(rule('.live-comment-input-row')).toContain('grid-template-columns: 36px minmax(0, 1fr) 54px var(--live-auction-action-width)');
    expect(rule('.live-comment-input-row.is-collapsed')).toContain('grid-template-columns: 36px var(--live-auction-action-width)');
    expect(rule('.comment-toggle-button,\n.comment-send-button,\n.comment-list-button')).toContain('width: 36px');
    expect(rule('.comment-toggle-button.is-floating')).toContain('background: transparent');
    expect(rule('.comment-toggle-button.is-floating')).toContain('border: 0');
    expect(rules('.comment-list-button')).toContain('width: var(--live-auction-action-width)');
    expect(rules('.comment-list-button')).toContain('background: linear-gradient(135deg, #ff7a18 0%, #ff2d55 100%)');
    expect(rule('.auction-float-card')).toContain('width: var(--live-auction-action-width)');
    expect(rule('.auction-float-card')).toContain('bottom: calc(66px + env(safe-area-inset-bottom))');
  });

  it('docks the live ranking rail under the follow button with a low-alpha background', () => {
    expect(rule('.live-ranking-rail')).toContain('position: absolute');
    expect(rule('.live-ranking-rail')).toContain('right: 0');
    expect(rule('.live-ranking-rail')).toContain('top: 58px');
    expect(rule('.live-ranking-rail')).toContain('background: rgba(0, 0, 0, 0.2)');
    expect(rule('.live-ranking-rail')).toContain('--live-ranking-toggle-width: 20px');
    expect(rule('.live-ranking-rail')).toContain('--live-ranking-price-width: 64px');
    expect(rule('.live-ranking-toggle')).toContain('left: calc(-1 * var(--live-ranking-toggle-width))');
    expect(rule('.live-ranking-toggle')).toContain('height: 64px');
    expect(rule('.live-ranking-toggle')).toContain('writing-mode: horizontal-tb');
    expect(rule('.live-ranking-toggle')).toContain('border: 1px solid rgba(255, 255, 255, 0.46)');
    expect(rule('.live-ranking-toggle b')).toContain('writing-mode: vertical-rl');
    expect(rule('.live-ranking-rail.is-collapsed')).toContain('transform: translateX(100%)');
    expect(rule('.live-ranking-panel')).toContain('min-height: 0');
    expect(rule('.live-ranking-panel')).toContain('grid-auto-rows: max-content');
    expect(rule('.live-ranking-panel')).toContain('align-content: start');
    expect(rule('.live-ranking-board-viewport')).toContain('position: relative');
    expect(rule('.live-ranking-board-viewport')).toContain('overflow: hidden');
    expect(rule('.live-ranking-row')).toContain('grid-template-columns: 19px 22px minmax(0, 1fr) var(--live-ranking-price-width)');
    expect(rule('.live-ranking-title')).toContain('justify-content: center');
    expect(rule('.live-ranking-price')).toContain('color: #ff4d5f');
    expect(rule('.live-ranking-price')).toContain('justify-self: center');
    expect(rule('.live-ranking-price')).toContain('width: var(--live-ranking-price-width)');
    expect(rule('.live-ranking-price')).toContain('text-align: center');
    expect(rule('.live-ranking-price.is-leading-price')).toContain('font-size: 12px');
    expect(rule('.live-ranking-row.is-leading .live-ranking-name')).toContain('color: #ffd45f');
    expect(rule('.live-ranking-rank.is-plain')).toContain('background: transparent');
    expect(rule('.live-ranking-rank.is-plain')).not.toContain('border:');
    expect(rule('.live-ranking-divider')).toContain('margin: 0 2px');
    expect(rule('.live-ranking-current-row')).toContain('min-height: 28px');
    expect(rule('.live-ranking-current-row')).toContain('padding-top: 0');
    expect(rule('.live-ranking-row.is-moving-target')).toContain('animation: ranking-target-reveal var(--ranking-duration-ms');
    expect(rule('.live-ranking-exit-row')).toContain('animation: ranking-row-exit-divider var(--ranking-duration-ms');
    expect(rule('.live-ranking-exit-row')).not.toContain('grid-template-columns:');
    expect(rule('.live-ranking-exit-row')).not.toContain('font-size:');
    expect(rule('.live-ranking-exit-row')).not.toContain('filter:');
    expect(rule('.live-ranking-ghost')).toContain('top: var(--ranking-to-y');
    expect(rule('.live-ranking-ghost')).toContain('--ranking-pop-scale: 1.12');
    expect(rule('.live-ranking-ghost.is-self-bid')).toContain('--ranking-pop-scale: 1.3');
    expect(rule('.live-ranking-ghost.is-divider-to-first')).toContain('animation: ranking-divider-to-first var(--ranking-duration-ms');
    expect(rule('.live-ranking-ghost.is-current-row-to-first')).toContain('animation: ranking-current-row-to-first var(--ranking-duration-ms');
    expect(css).toContain('@keyframes ranking-price-update');
    expect(css).toContain('@keyframes ranking-top-slot-to-first');
    expect(css).toContain('@keyframes ranking-divider-to-first');
    expect(css).toContain('@keyframes ranking-current-row-to-first');
    expect(css).toContain('@keyframes ranking-row-exit-divider');
    expect(keyframes('ranking-row-exit-divider')).toContain('transform: translate3d(0, calc(var(--ranking-exit-to-y, 0px) - var(--ranking-exit-from-y, 0px)), 0)');
    expect(keyframes('ranking-row-exit-divider')).toContain('99%');
    expect(keyframes('ranking-row-exit-divider')).not.toContain('opacity: 0.72');
    expect(keyframes('ranking-row-exit-divider')).not.toContain('scale(');
  });

  it('animates live room sheets from the backdrop and bottom panel', () => {
    expect(rule('.sheet-backdrop')).toContain('z-index: 80');
    expect(rule('.sheet-backdrop')).toContain('--sheet-duration-ms: 400ms');
    expect(rule('.sheet-backdrop')).not.toContain('animation: sheet-backdrop-in');
    expect(rule('.sheet-backdrop::before')).toContain('animation: sheet-backdrop-in var(--sheet-duration-ms) ease-out');
    expect(rule('.sheet-backdrop.is-closing::before')).toContain('animation: sheet-backdrop-out var(--sheet-duration-ms) ease-in forwards');
    expect(rule('.bottom-sheet')).toContain('animation: sheet-slide-up var(--sheet-duration-ms) cubic-bezier(0.22, 1, 0.36, 1)');
    expect(rule('.sheet-backdrop.is-closing .bottom-sheet')).toContain('animation: sheet-slide-down var(--sheet-duration-ms) cubic-bezier(0.22, 1, 0.36, 1) forwards');
    expect(rule('.lot-list-sheet')).toContain('--sheet-duration-ms: 340ms');
    expect(rule('.lot-list-sheet')).toContain('height: min(50dvh, 420px)');
    expect(rule('.lot-list-sheet')).toContain('max-height: min(50dvh, 420px)');
    expect(rule('.lot-list')).toContain('height: calc(100% - 52px)');
    expect(rule('.lot-list')).toContain('max-height: none');
    expect(rule('.lot-list')).toContain('overflow-y: auto');
    expect(rule('.lot-row')).toContain('grid-template-columns: 32px 64px minmax(0, 1fr) auto');
    expect(rule('.lot-sequence')).toContain('place-items: center');
    expect(rule('.detail-sheet')).toContain('--sheet-duration-ms: 400ms');
    expect(rule('.quick-bid-sheet')).toContain('--sheet-duration-ms: 460ms');
    expect(css).toContain('@keyframes sheet-slide-up');
    expect(css).toContain('@keyframes sheet-slide-down');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('styles quick bid countdown segments and the filled leader badge', () => {
    expect(rule('.quick-bid-countdown-display')).toContain('display: inline-flex');
    expect(rule('.quick-bid-countdown-unit')).toContain('background: #ff8a00');
    expect(rule('.quick-bid-countdown-unit')).toContain('min-width: 34px');
    expect(rule('.quick-bid-countdown-separator')).toContain('color: #f97316');
    expect(rule('.quick-bid-leader-badge')).toContain('background: #ffe3ec');
    expect(rule('.quick-bid-leader-badge')).toContain('border-radius: 999px');
    expect(rule('.quick-bid-leader-avatar')).toContain('background: linear-gradient(135deg, #7da4ff 0%, #6d5dfc 100%)');
  });

  it('shows and sinks auction floating cards into the goods button', () => {
    expect(rule('.auction-float-card.is-entering')).toContain('animation: auction-card-rise 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards');
    expect(rule('.auction-float-card.is-ended .float-card-action')).toContain('background: #98a2b3');
    expect(rule('.auction-float-card.is-ended .float-card-action')).toContain('cursor: not-allowed');
    expect(rule('.auction-float-card.is-leaving')).toContain('animation: auction-card-sink 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards');
    expect(rule('.auction-float-dismiss')).toContain('background: transparent');
    expect(rule('.auction-float-dismiss')).toContain('border: 0');
    expect(css).toContain('@keyframes auction-card-rise');
    expect(css).toContain('@keyframes auction-card-sink');
  });

  it('animates the winning celebration cannons and confetti above live room UI', () => {
    expect(rule('.winning-celebration')).toContain('position: fixed');
    expect(rule('.winning-celebration')).toContain('z-index: 130');
    expect(rule('.winning-celebration')).toContain('pointer-events: none');
    expect(rule('.winning-cannon.is-left')).toContain('animation: winning-cannon-left');
    expect(rule('.winning-cannon.is-right')).toContain('animation: winning-cannon-right');
    expect(rule('.winning-confetti-piece')).toContain('animation: winning-confetti-left');
    expect(rule('.winning-confetti-piece.is-right')).toContain('animation-name: winning-confetti-right');
    expect(css).toContain('@keyframes winning-message-pop');
    expect(css).toContain('@keyframes winning-cannon-left');
    expect(css).toContain('@keyframes winning-cannon-right');
    expect(css).toContain('@keyframes winning-confetti-left');
    expect(css).toContain('@keyframes winning-confetti-right');
  });
});

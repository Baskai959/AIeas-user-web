import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties
} from 'react';
import { Trophy } from 'lucide-react';

import { t } from '../../i18n/runtime';
import type { RankingItem } from '../../services/types';
import { formatMoney } from '../../utils/format';
import { joinClassNames } from '../../utils/classNames';
import { firstNonEmptyString, rankingBidderFallbackName } from './shared';
import { buildRankingAnimation, sortRankingItems, type RankingAnimation, type RankingAnimationKind, type RankingBidHint } from './liveRankingModel';

const rankingFallbackFirstRowY = 48;
const rankingFallbackRowStepY = 32;
const rankingFallbackDividerY = rankingFallbackFirstRowY + rankingFallbackRowStepY * 8 + 2;
const rankingFallbackCurrentRowY = rankingFallbackDividerY + 6;
const rankingFallbackBoardDividerY = rankingFallbackRowStepY * 8 + 2;

type RankingAnimationLayout = {
  id: string;
  fromY: number;
  toY: number;
  exitFromY: number;
  exitToY: number;
};

export function LiveRankingRail({
  items,
  userId,
  userNickname,
  userAvatarUrl,
  collapsed,
  lastBid,
  animateChanges,
  onToggle
}: {
  items: RankingItem[];
  userId: string;
  userNickname?: string;
  userAvatarUrl?: string;
  collapsed: boolean;
  lastBid?: RankingBidHint;
  animateChanges: boolean;
  onToggle: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rankRowRefs = useRef(new Map<number, HTMLDivElement>());
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  const previousItemsRef = useRef<RankingItem[]>([]);
  const activeAnimationRef = useRef<RankingAnimation>();
  const animationTimerRef = useRef<number>();
  const animationCompletionFrameRef = useRef<number>();
  const [animation, setAnimation] = useState<RankingAnimation>();
  const [animationLayout, setAnimationLayout] = useState<RankingAnimationLayout>();
  const [pinnedCurrentUser, setPinnedCurrentUser] = useState<{ active: boolean; item?: RankingItem }>();
  const slots = useMemo(() => buildRankingSlots(items), [items]);
  const currentUserItem = useMemo(() => items.find((item) => item.bidderId === userId), [items, userId]);
  const currentUserRowItem = useMemo(
    () => withCurrentUserAvatar(pinnedCurrentUser?.active ? pinnedCurrentUser.item : currentUserItem, userId, userAvatarUrl),
    [currentUserItem, pinnedCurrentUser?.active, pinnedCurrentUser?.item, userAvatarUrl, userId]
  );
  const currentUserFallbackName = useMemo(() => firstNonEmptyString(userNickname) ?? rankingBidderFallbackName(userId), [userId, userNickname]);
  const setRankRowRef = useCallback(
    (rank: number) => (node: HTMLDivElement | null) => {
      if (node) {
        rankRowRefs.current.set(rank, node);
      } else {
        rankRowRefs.current.delete(rank);
      }
    },
    []
  );
  const panelStyle = animation ? ({ '--ranking-duration-ms': `${animation.durationMs}ms` } as CSSProperties) : undefined;
  const resolvedAnimationLayout = animation ? (animationLayout?.id === animation.id ? animationLayout : fallbackRankingAnimationLayout(animation)) : undefined;

  const clearRankingAnimationTimers = useCallback(() => {
    if (animationTimerRef.current) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = undefined;
    }
    if (animationCompletionFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationCompletionFrameRef.current);
      animationCompletionFrameRef.current = undefined;
    }
  }, []);

  const clearRankingAnimation = useCallback(() => {
    clearRankingAnimationTimers();
    activeAnimationRef.current = undefined;
    setAnimation(undefined);
    setAnimationLayout(undefined);
    setPinnedCurrentUser(undefined);
  }, [clearRankingAnimationTimers]);

  const completeRankingAnimation = useCallback(
    (animationId?: string) => {
      if (!animationId || activeAnimationRef.current?.id !== animationId) return;
      clearRankingAnimationTimers();
      activeAnimationRef.current = undefined;
      setAnimation((current) => (current?.id === animationId ? undefined : current));
      setAnimationLayout((current) => (current?.id === animationId ? undefined : current));
      setPinnedCurrentUser(undefined);
    },
    [clearRankingAnimationTimers]
  );

  const scheduleRankingAnimationCompletion = useCallback(
    (animationId?: string) => {
      if (!animationId) return;
      if (animationCompletionFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationCompletionFrameRef.current);
      }
      animationCompletionFrameRef.current = window.requestAnimationFrame(() => {
        animationCompletionFrameRef.current = undefined;
        completeRankingAnimation(animationId);
      });
    },
    [completeRankingAnimation]
  );

  useEffect(() => {
    const previousItems = previousItemsRef.current;

    if (!animateChanges) {
      previousItemsRef.current = items;
      if (activeAnimationRef.current) return;
      clearRankingAnimation();
      return;
    }

    const nextAnimation = buildRankingAnimation(previousItems, items, userId, lastBid);
    if (!nextAnimation && activeAnimationRef.current) {
      previousItemsRef.current = items;
      return;
    }

    clearRankingAnimationTimers();
    activeAnimationRef.current = nextAnimation;
    setAnimation(nextAnimation);
    setAnimationLayout(nextAnimation ? fallbackRankingAnimationLayout(nextAnimation) : undefined);
    if (nextAnimation?.kind === 'current-row-to-first' && nextAnimation.isSelfBid) {
      setPinnedCurrentUser({ active: true, item: previousItems.find((item) => item.bidderId === userId) });
    } else {
      setPinnedCurrentUser(undefined);
    }
    if (nextAnimation) {
      animationTimerRef.current = window.setTimeout(() => {
        completeRankingAnimation(nextAnimation.id);
      }, nextAnimation.durationMs);
    }
    previousItemsRef.current = items;
  }, [animateChanges, clearRankingAnimation, clearRankingAnimationTimers, completeRankingAnimation, items, lastBid, userId]);

  useEffect(() => {
    return () => {
      clearRankingAnimationTimers();
      activeAnimationRef.current = undefined;
    };
  }, [clearRankingAnimationTimers]);

  useLayoutEffect(() => {
    if (!animation || animation.kind === 'price-only') return;
    const nextLayout = measureRankingAnimationLayout(animation, panelRef.current, boardRef.current, rankRowRefs.current, dividerRef.current, currentRowRef.current);
    setAnimationLayout((current) =>
      current &&
      current.id === nextLayout.id &&
      current.fromY === nextLayout.fromY &&
      current.toY === nextLayout.toY &&
      current.exitFromY === nextLayout.exitFromY &&
      current.exitToY === nextLayout.exitToY
        ? current
        : nextLayout
    );
  }, [animation, currentUserItem, slots]);

  return (
    <aside className={collapsed ? 'live-ranking-rail is-collapsed' : 'live-ranking-rail'} aria-label={t('auction.ranking')}>
      <button className="live-ranking-toggle" type="button" onClick={onToggle} aria-label={collapsed ? t('live.rankingExpand') : t('live.rankingCollapse')}>
        {collapsed ? (
          <>
            <b>{t('live.rankingExpandText')}</b>
            <span aria-hidden="true">&lt;</span>
          </>
        ) : (
          <>
            <b>{t('live.rankingCollapseText')}</b>
            <span aria-hidden="true">&gt;</span>
          </>
        )}
      </button>
      {!collapsed ? (
        <div ref={panelRef} className="live-ranking-panel" style={panelStyle}>
          <h2 className="live-ranking-title">
            <Trophy size={13} />
            <span>{t('auction.ranking')}</span>
          </h2>
          <div ref={boardRef} className="live-ranking-board-viewport">
            <div className="live-ranking-top-list">
              {slots.map((slot) => (
                <LiveRankingRow
                  key={rankingSlotKey(slot)}
                  rank={slot.rank}
                  item={slot.item}
                  userId={userId}
                  animation={animation}
                  rowRef={setRankRowRef(slot.rank)}
                />
              ))}
            </div>
            <div ref={dividerRef} className="live-ranking-divider" />
            {animation && animation.kind !== 'price-only' && resolvedAnimationLayout && animation.exitItem ? <LiveRankingExitRow animation={animation} layout={resolvedAnimationLayout} /> : null}
          </div>
          <LiveRankingRow
            rank={currentUserRowItem?.rank ?? '-'}
            item={currentUserRowItem}
            userId={userId}
            animation={animation}
            current
            currentFallbackName={currentUserFallbackName}
            rowRef={(node) => {
              currentRowRef.current = node;
            }}
          />
          {animation && animation.kind !== 'price-only' && resolvedAnimationLayout ? (
            <LiveRankingGhost animation={animation} layout={resolvedAnimationLayout} onComplete={scheduleRankingAnimationCompletion} />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function LiveRankingRow({
  rank,
  item,
  userId,
  animation,
  current = false,
  currentFallbackName,
  rowRef
}: {
  rank: number | '-';
  item?: RankingItem;
  userId: string;
  animation?: RankingAnimation;
  current?: boolean;
  currentFallbackName?: string;
  rowRef?: (node: HTMLDivElement | null) => void;
}) {
  const isPlaceholder = !item && !current;
  const isCurrentUser = item?.bidderId === userId;
  const isTopLeader = item?.rank === 1 && !current;
  const animationBidderId = item?.bidderId;
  const isMovementAnimation = animation && animation.kind !== 'price-only';
  const isMovingTarget = Boolean(isMovementAnimation && animationBidderId === animation.bidderId && !current);
  const isEnteringRow = Boolean(!isMovingTarget && !current && animationBidderId && animation?.enteringIds.includes(animationBidderId));
  const rowClassName = joinClassNames(
    'live-ranking-row',
    current && 'live-ranking-current-row',
    isPlaceholder && 'is-placeholder',
    isCurrentUser && 'is-current-user',
    isTopLeader && 'is-leading',
    !current && animationBidderId && animation?.shiftedIds.includes(animationBidderId) && 'is-shifted-down',
    isEnteringRow && 'is-entering',
    isMovingTarget && 'is-moving-target',
    animationBidderId && animation?.priceUpdateIds.includes(animationBidderId) && 'is-price-updating'
  );
  const rankClassName = joinClassNames(
    'live-ranking-rank',
    rank === 1 && 'is-gold',
    rank === 2 && 'is-silver',
    rank === 3 && 'is-bronze',
    typeof rank === 'number' && rank > 3 && 'is-plain'
  );
  const priceClassName = joinClassNames(
    'live-ranking-price',
    !item && 'is-empty',
    isTopLeader && 'is-leading-price',
    animationBidderId && animation?.priceUpdateIds.includes(animationBidderId) && 'is-price-updating'
  );

  return (
    <div ref={rowRef} className={rowClassName} data-rank={rank} data-bidder-id={item?.bidderId} data-current-user={current ? 'true' : undefined}>
      <span className={rankClassName}>{rank}</span>
      <RankingAvatar item={item} fallbackName={currentFallbackName} />
      <strong className="live-ranking-name">{item?.nicknameMask ?? (current ? currentFallbackName : '')}</strong>
      <b className={priceClassName}>{item ? formatMoney(item.price) : '-'}</b>
    </div>
  );
}

function LiveRankingGhost({
  animation,
  layout,
  onComplete
}: {
  animation: RankingAnimation;
  layout: RankingAnimationLayout;
  onComplete: (animationId: string) => void;
}) {
  const handleAnimationEnd = useCallback(
    (event: ReactAnimationEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.animationName && event.animationName !== rankingGhostAnimationName(animation.kind)) return;
      onComplete(animation.id);
    },
    [animation.id, animation.kind, onComplete]
  );

  return (
    <div
      className={joinClassNames('live-ranking-ghost', 'live-ranking-row', 'is-leading', `is-${animation.kind}`, animation.isSelfBid ? 'is-self-bid' : 'is-other-bid')}
      data-origin={animation.origin}
      data-from-rank={animation.fromRank}
      data-to-rank={animation.toRank}
      data-bidder-id={animation.bidderId}
      onAnimationEnd={handleAnimationEnd}
      style={
        {
          '--ranking-duration-ms': `${animation.durationMs}ms`,
          '--ranking-ghost-duration-ms': `${animation.durationMs}ms`,
          '--ranking-from-y': `${layout.fromY}px`,
          '--ranking-to-y': `${layout.toY}px`
        } as CSSProperties
      }
    >
      <span className="live-ranking-rank is-gold">1</span>
      <RankingAvatar item={animation.movingItem} />
      <strong className="live-ranking-name">{animation.movingItem.nicknameMask}</strong>
      <b className="live-ranking-price is-leading-price is-price-updating">{formatMoney(animation.movingItem.price)}</b>
    </div>
  );
}

function rankingGhostAnimationName(kind: RankingAnimationKind): string {
  if (kind === 'top-slot-to-first') return 'ranking-top-slot-to-first';
  if (kind === 'divider-to-first') return 'ranking-divider-to-first';
  if (kind === 'current-row-to-first') return 'ranking-current-row-to-first';
  return '';
}

function LiveRankingExitRow({ animation, layout }: { animation: RankingAnimation; layout: RankingAnimationLayout }) {
  if (!animation.exitItem) return null;
  return (
    <div
      className="live-ranking-row live-ranking-exit-row is-exiting-to-divider"
      data-bidder-id={animation.exitItem.bidderId}
      style={
        {
          '--ranking-duration-ms': `${animation.durationMs}ms`,
          '--ranking-exit-from-y': `${layout.exitFromY}px`,
          '--ranking-exit-to-y': `${layout.exitToY}px`
        } as CSSProperties
      }
    >
      <span className="live-ranking-rank is-plain">{animation.exitItem.rank}</span>
      <RankingAvatar item={animation.exitItem} />
      <strong className="live-ranking-name">{animation.exitItem.nicknameMask}</strong>
      <b className="live-ranking-price">{formatMoney(animation.exitItem.price)}</b>
    </div>
  );
}

function RankingAvatar({ item, fallbackName }: { item?: RankingItem; fallbackName?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = item?.avatarUrl;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span className="live-ranking-avatar" aria-hidden="true">
      {avatarUrl && !imageFailed ? <img src={avatarUrl} alt="" onError={() => setImageFailed(true)} /> : <span>{rankingAvatarText(item, fallbackName)}</span>}
    </span>
  );
}

function withCurrentUserAvatar(item: RankingItem | undefined, userId: string, userAvatarUrl?: string): RankingItem | undefined {
  const avatarUrl = firstNonEmptyString(item?.avatarUrl, item?.bidderId === userId ? userAvatarUrl : undefined);
  if (!item || !avatarUrl || item.avatarUrl === avatarUrl) return item;
  return {
    ...item,
    avatarUrl
  };
}

function buildRankingSlots(items: RankingItem[]): Array<{ rank: number; item?: RankingItem }> {
  const sortedItems = sortRankingItems(items).slice(0, 8);
  return Array.from({ length: 8 }, (_, index) => ({ rank: index + 1, item: sortedItems[index] }));
}

function rankingSlotKey(slot: { rank: number; item?: RankingItem }): string {
  return slot.item ? `${slot.rank}-${slot.item.bidderId}-${slot.item.price}` : `${slot.rank}-empty`;
}

function fallbackRankingAnimationLayout(animation: RankingAnimation): RankingAnimationLayout {
  const fromY =
    animation.kind === 'top-slot-to-first'
      ? rankingFallbackYForRank(animation.fromRank ?? 1)
      : animation.kind === 'current-row-to-first'
        ? rankingFallbackCurrentRowY
        : animation.kind === 'divider-to-first'
          ? rankingFallbackDividerY
          : rankingFallbackYForRank(1);
  return {
    id: animation.id,
    fromY,
    toY: rankingFallbackYForRank(1),
    exitFromY: rankingFallbackBoardYForRank(8),
    exitToY: rankingFallbackBoardDividerY
  };
}

function measureRankingAnimationLayout(
  animation: RankingAnimation,
  panel: HTMLDivElement | null,
  board: HTMLDivElement | null,
  rankRows: Map<number, HTMLDivElement>,
  divider: HTMLDivElement | null,
  currentRow: HTMLDivElement | null
): RankingAnimationLayout {
  const fallback = fallbackRankingAnimationLayout(animation);
  const toY = relativeRankingTop(rankRows.get(1), panel, fallback.toY);
  const fromY =
    animation.kind === 'top-slot-to-first'
      ? relativeRankingTop(rankRows.get(animation.fromRank ?? 1), panel, fallback.fromY)
      : animation.kind === 'current-row-to-first'
        ? relativeRankingTop(currentRow, panel, fallback.fromY)
        : animation.kind === 'divider-to-first'
          ? relativeRankingTop(divider, panel, fallback.fromY)
          : fallback.fromY;
  return {
    id: animation.id,
    fromY,
    toY,
    exitFromY: relativeRankingTop(rankRows.get(8), board, fallback.exitFromY),
    exitToY: relativeRankingTop(divider, board, fallback.exitToY)
  };
}

function rankingFallbackYForRank(rank: number): number {
  return rankingFallbackFirstRowY + Math.max(0, rank - 1) * rankingFallbackRowStepY;
}

function rankingFallbackBoardYForRank(rank: number): number {
  return Math.max(0, rank - 1) * rankingFallbackRowStepY;
}

function relativeRankingTop(element: HTMLElement | null | undefined, panel: HTMLElement | null, fallback: number): number {
  if (!element || !panel) return fallback;
  const elementRect = element.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  if (!elementRect.height && !elementRect.top && !panelRect.top) return fallback;
  return Math.round(elementRect.top - panelRect.top);
}

function rankingAvatarText(item?: RankingItem, fallbackName = ''): string {
  const name = item?.nicknameMask ?? fallbackName;
  return name.trim().slice(0, 1) || '-';
}


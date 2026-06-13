import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, type SetStateAction, type SyntheticEvent as ReactSyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Toast } from 'antd-mobile';
import { ArrowLeft, Gavel, Minus, Package, Plus, Radio, ShoppingBag, Trophy, Users, VideoOff, Volume2, VolumeX, WalletCards, X } from 'lucide-react';
import commentIconUrl from '../../../Icon/comment.svg';
import closeCommentIconUrl from '../../../Icon/close_comment.svg';
import likeIconUrl from '../../../Icon/like.svg';
import logoUrl from '../../../logo.png';
import { LotImageGallery } from '../../components/LotImageGallery';
import { Metric } from '../../components/Metric';
import { EmptyState } from '../../components/EmptyState';
import { SheetHeader } from '../../components/SheetHeader';
import { SectionTitle } from '../../components/SectionTitle';
import { VisualPlaceholder } from '../../components/VisualPlaceholder';
import { buildOrderByAuctionId } from '../../features/account/auctionRecords';
import { bidRuleFromLot, capPriceForLot, minIncrementForLot } from '../../features/auction/bidRules';
import { defaultRanking, finiteOptionalParticipantCount, formatCompactNumber, lotStatusLabel, participantCountForLot, priceLabel, priceValue, scheduledStartText, scheduledStartTimeText, stateFromLot } from '../../features/auction/presentation';
import { enableAudibleVideo, forceMutedVideo, playVideo, readSharedLiveSoundEnabled, resetVideoToStart, writeSharedLiveSoundEnabled } from '../../features/live-room/videoSound';
import { mobileInlineVideoAttributes } from '../../features/media/inlineVideo';
import { isPaidOrder, isPendingPayOrder, orderTabFromOrder } from '../../features/order/status';
import { buildPreviewMediaSnapshot, discoverPreviewVideoUrl, isPreviewMediaSnapshotApplicable, liveRoomPreviewVideoUrl, rememberPreviewMediaSnapshot, type PreviewMediaSnapshot, usePreviewMediaRestore } from '../../features/media/previewMedia';
import type { MessageKey } from '../../i18n/messages';
import { getRuntimeLocale, t } from '../../i18n/runtime';
import { hasZeroDepositEnrollment, selectCurrentRunningLot } from '../../services/auctionViews';
import { buildBidPlacePayload, getMinBidIntervalMs, getQuickBidIntervalRemainingMs, getQuickBidMaxSteps, getQuickBidPrice, isQuickBidIntervalActive, isQuickBidOutdated, validateBidPrice, type BidValidationResult } from '../../services/bidding';
import type { ApiClient } from '../../services/api';
import { defaultDigitalHumanMedia, getLiveVoiceBroadcastAudioPlayer, type LiveVoiceBroadcastAudioPlayer, type LiveVoiceBroadcastAudioPayload } from '../../services/digitalHuman';
import { demoLiveRoomStats, findDemoLiveRoom, listDemoLots } from '../../services/mockData';
import { isFreshRealtimeMessageByDomain, MockRealtimeClient, MockRealtimeControlClient, NativeWebSocketClient, nextRealtimeSeqByDomain, type RealtimeClient, type RealtimeMessage, type RealtimeSeqCursor, type TimeSyncResultPayload } from '../../services/realtime';
import type { AuctionState, EnrollResult, LiveChatMessage, LiveRoom, LiveRoomLot, LiveRoomStats, MyAuctionTabKey, Order, PageResult, RankingItem } from '../../services/types';
import { useLiveActivityStore } from '../../store/liveActivity';
import { joinClassNames } from '../../utils/classNames';
import { countdownMillisecondsThresholdMs, formatCountdown, formatMoney, getServerOffsetMs, getServerOffsetMsWithRtt, makeRequestId, shouldShowCountdownMilliseconds } from '../../utils/format';
import { LiveAuctionAlertLayer, LiveCountdownAmbientLayer } from './LiveAuctionFeedback';
import {
  countdownAmbientBidPulseMs,
  countdownAmbientEndExitMs,
  countdownAmbientEndHoldMs,
  countdownAmbientProgress,
  countdownAmbientThresholdMs,
  countdownAmbientTone,
  countdownPressureDisplaySeconds,
  countdownPressureExtendedMs,
  getCountdownPressurePhase,
  liveAuctionAlertDurationMs,
  liveAuctionAlertPriority,
  type AuctionEventAlertKind,
  type CountdownAmbientEndEffect,
  type CountdownAmbientState,
  type CountdownExtensionPulse,
  type LiveAuctionAlert,
  useLiveAuctionAlerts
} from './liveAuctionFeedbackModel';
import { LiveRankingRail } from './LiveRankingRail';
import { buildRankingAnimation, sortRankingItems, type RankingAnimationSource, type RankingBidHint } from './liveRankingModel';
import { firstNonEmptyString, rankingBidderFallbackName } from './shared';

const likeBurstParticles = Array.from({ length: 15 }, (_, index) => index);
const liveVoiceUnlockEvents = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
const liveSessionLotListChangedEvents = new Set(['live_session.lot_mounted', 'live_session.lot_unmounted', 'live_session.lot_changed']);
const emptyLiveRoomLotPage: PageResult<LiveRoomLot> = { items: [], total: 0, page: 1, page_size: 20 };

function createRemotePendingRoom(roomId: string): LiveRoom {
  return {
    id: roomId,
    title: t('state.loading'),
    merchantName: '',
    status: 'LIVE',
    onlineCount: 0,
    watcherCount: 0
  };
}

function createRemotePendingStats(roomId: string): LiveRoomStats {
  return {
    roomId,
    onlineCount: 0,
    watcherCount: 0,
    bidCount: 0,
    gmvCent: 0
  };
}

function isLiveSoundUnlockControlTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('[data-live-sound-unlock-control="true"]'));
}

function sameOriginWsBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

function configuredWsBaseUrl(): string {
  const explicitUrl = import.meta.env.VITE_WS_URL?.trim();
  return explicitUrl || sameOriginWsBaseUrl();
}

function realtimeDigitalHumanConfig(value: unknown): LiveRoom['digitalHuman'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const idleVideoUrl = typeof raw.idleVideoUrl === 'string' && raw.idleVideoUrl.trim() ? raw.idleVideoUrl.trim() : undefined;
  const speakingVideoUrl = typeof raw.speakingVideoUrl === 'string' && raw.speakingVideoUrl.trim() ? raw.speakingVideoUrl.trim() : undefined;
  if (!idleVideoUrl || !speakingVideoUrl) return undefined;
  const ttsWsUrl = typeof raw.ttsWsUrl === 'string' && raw.ttsWsUrl.trim() ? raw.ttsWsUrl.trim() : undefined;
  return { idleVideoUrl, speakingVideoUrl, ttsWsUrl };
}

function realtimeAIAssistantSwitchEnabled(payload: unknown): boolean | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.enabled === 'boolean') return raw.enabled;
  const liveRoom = raw.liveRoom && typeof raw.liveRoom === 'object' ? (raw.liveRoom as Record<string, unknown>) : undefined;
  if (typeof liveRoom?.aiAssistantEnabled === 'boolean') return liveRoom.aiAssistantEnabled;
  if (typeof raw.status === 'string') {
    const status = raw.status.trim().toLowerCase();
    if (status === 'enabled') return true;
    if (status === 'disabled') return false;
  }
  return undefined;
}

function liveRoomWithAIAssistantSwitch(room: LiveRoom, payload: unknown, enabled: boolean): LiveRoom {
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
  const liveRoom = raw?.liveRoom && typeof raw.liveRoom === 'object' ? (raw.liveRoom as Record<string, unknown>) : undefined;
  const digitalHuman = realtimeDigitalHumanConfig(liveRoom?.digitalHuman) ?? realtimeDigitalHumanConfig(raw?.digitalHuman) ?? room.digitalHuman ?? defaultDigitalHumanMedia;
  const videoSource = liveRoom?.videoSource === 'digitalHuman' || raw?.videoSource === 'digitalHuman'
    ? 'digitalHuman'
    : liveRoom?.videoSource === 'recorded' || raw?.videoSource === 'recorded'
      ? 'recorded'
      : enabled
        ? 'digitalHuman'
        : 'recorded';
  if (!enabled) {
    return {
      ...room,
      aiAssistantEnabled: false,
      videoSource
    };
  }
  return {
    ...room,
    aiAssistantEnabled: true,
    videoSource,
    digitalHuman
  };
}

function realtimeLiveVoiceBroadcastAudioPayload(payload: unknown): LiveVoiceBroadcastAudioPayload | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const raw = payload as Record<string, unknown>;
  const audioBase64 = typeof raw.audioBase64 === 'string' && raw.audioBase64.trim() ? raw.audioBase64.trim() : undefined;
  if (!audioBase64) return undefined;
  const sampleRate = Number(raw.sampleRate ?? raw.sample_rate);
  const channels = Number(raw.channels);
  return {
    audioBase64,
    audioFormat: typeof raw.audioFormat === 'string' ? raw.audioFormat : typeof raw.audio_format === 'string' ? raw.audio_format : undefined,
    encoding: typeof raw.encoding === 'string' ? raw.encoding : undefined,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
    channels: Number.isFinite(channels) ? channels : undefined
  };
}

function estimateLiveVoiceAudioBytes(audioBase64: string | undefined): number | undefined {
  if (!audioBase64) return undefined;
  const value = (audioBase64.includes(',') ? audioBase64.slice(audioBase64.indexOf(',') + 1) : audioBase64).replace(/\s/g, '');
  if (!value) return undefined;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function liveVoiceAudioDebugSummary(payload: LiveVoiceBroadcastAudioPayload | undefined): Record<string, unknown> {
  const audioBase64 = typeof payload?.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
  return {
    audioBase64Length: audioBase64.length,
    audioBytesApprox: estimateLiveVoiceAudioBytes(audioBase64),
    audioFormat: payload?.audioFormat ?? payload?.encoding,
    sampleRate: payload?.sampleRate,
    channels: payload?.channels
  };
}

function liveVoicePendingPayloadKey(payload: LiveVoiceBroadcastAudioPayload): string {
  const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
  const audioFormat = String(payload.audioFormat || payload.encoding || 'pcm_s16le').toLowerCase();
  const sampleRate = Number(payload.sampleRate);
  const normalizedSampleRate = Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 192000 ? sampleRate : 24_000;
  const channels = Math.floor(Number(payload.channels));
  const normalizedChannels = Number.isFinite(channels) && channels >= 1 ? Math.min(channels, 8) : 1;
  return [audioBase64, audioFormat, normalizedSampleRate, normalizedChannels].join('|');
}

function appendUniqueLiveVoicePendingPayload(queue: LiveVoiceBroadcastAudioPayload[], payload: LiveVoiceBroadcastAudioPayload): LiveVoiceBroadcastAudioPayload[] {
  const key = liveVoicePendingPayloadKey(payload);
  return queue.some((item) => liveVoicePendingPayloadKey(item) === key) ? queue : [...queue, payload];
}

function liveVoiceMessageDebugSummary(message: RealtimeMessage, room: LiveRoom, payload: LiveVoiceBroadcastAudioPayload | undefined): Record<string, unknown> {
  const raw = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : undefined;
  const rawAudioBase64 = typeof raw?.audioBase64 === 'string' ? raw.audioBase64.trim() : undefined;
  const audioBase64 = payload?.audioBase64 ?? rawAudioBase64;
  return {
    requestId: message.requestId,
    messageLiveSessionId: message.liveSessionId,
    payloadLiveSessionId: raw?.liveSessionId ?? raw?.live_session_id,
    roomId: room.id,
    roomLiveSessionId: room.liveSessionId,
    audioBase64Length: audioBase64?.length ?? 0,
    audioBytesApprox: estimateLiveVoiceAudioBytes(audioBase64),
    audioFormat: payload?.audioFormat ?? payload?.encoding ?? raw?.audioFormat ?? raw?.audio_format ?? raw?.encoding,
    sampleRate: payload?.sampleRate ?? raw?.sampleRate ?? raw?.sample_rate,
    channels: payload?.channels ?? raw?.channels
  };
}

function realtimeLiveVoiceMatchesRoom(message: RealtimeMessage, room: LiveRoom): boolean {
  const payload = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : undefined;
  const eventLiveSessionId = Number(message.liveSessionId ?? payload?.liveSessionId ?? payload?.live_session_id);
  if (!Number.isFinite(eventLiveSessionId) || !room.liveSessionId) return true;
  return eventLiveSessionId === room.liveSessionId;
}

function isLiveSessionLotListChangedMessage(message: RealtimeMessage): boolean {
  return liveSessionLotListChangedEvents.has(message.type);
}

function realtimeLiveSessionMessageMatchesRoom(message: RealtimeMessage, room: LiveRoom): boolean {
  const payload = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : undefined;
  const rawLiveSessionId = message.liveSessionId ?? payload?.liveSessionId ?? payload?.live_session_id ?? payload?.sessionId;
  if (rawLiveSessionId === undefined || rawLiveSessionId === null || rawLiveSessionId === '') return true;
  const eventLiveSessionId = Number(rawLiveSessionId);
  if (Number.isFinite(eventLiveSessionId) && room.liveSessionId) return eventLiveSessionId === room.liveSessionId;
  return String(rawLiveSessionId) === room.id;
}

function isBackendAuctionId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

type QuickBidFeedback =
  | { status: 'idle' }
  | { status: 'submitting'; requestId: string; message: string }
  | { status: 'arbitrating'; requestId: string; message: string }
  | { status: 'success'; requestId?: string; message: string }
  | { status: 'error'; requestId?: string; message: string };

const LIVE_SHEET_ANIMATION_MS = {
  lotList: { enter: 250, exit: 150, easing: 'linear' },
  detail: { enter: 250, exit: 150, easing: 'linear' },
  quickBid: { enter: 460, exit: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  quickBidFast: { enter: 150, exit: 150, easing: 'linear' }
} as const;

const AUCTION_ENDED_HOLD_MS = 5000;
const AUCTION_CARD_ANIMATION_MS = 380;
const LIVE_SHEET_Z_INDEX_BASE = 110;
const BID_CONFIRM_TIMEOUT_MS = 8000;
const BID_ARBITRATION_TIMEOUT_MS = 15000;
const SCHEDULED_AUCTION_REFRESH_RETRY_DELAYS_MS = [0, 1000, 3000, 8000, 15000] as const;
const AUCTION_COUNTDOWN_EXPIRED_REFRESH_RETRY_DELAYS_MS = [0, 1000, 3000, 8000, 15000] as const;

type LiveSheetVariant = keyof typeof LIVE_SHEET_ANIMATION_MS;
type LiveSheetType = 'lotList' | 'detail' | 'quickBid';
type LiveSheetPhase = 'opening' | 'open' | 'closing';

type LiveSheetInstance = {
  id: string;
  type: LiveSheetType;
  variant: LiveSheetVariant;
  phase: LiveSheetPhase;
  lotId?: string;
};

function liveSheetInstanceKey(type: LiveSheetType, lotId?: string): string {
  return `${type}:${lotId ?? ''}`;
}

type FloatingAuctionCardPhase = 'entering' | 'visible' | 'holding' | 'leaving';
type FloatingAuctionCardMode = 'running' | 'ended';

type FloatingAuctionCardState = {
  auctionId: string;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  mode: FloatingAuctionCardMode;
  phase: FloatingAuctionCardPhase;
  startedByRuntimeEvent?: boolean;
  retireAtMs?: number;
};

function isSameFloatingAuctionCardSnapshot(current: FloatingAuctionCardState, next: FloatingAuctionCardState): boolean {
  return (
    current.auctionId === next.auctionId &&
    current.mode === next.mode &&
    current.lot.id === next.lot.id &&
    current.enrolled === next.enrolled &&
    current.ranking === next.ranking &&
    current.retireAtMs === next.retireAtMs &&
    current.state.status === next.state.status &&
    current.state.currentPrice === next.state.currentPrice &&
    current.state.leaderBidderId === next.state.leaderBidderId &&
    current.state.endTsMs === next.state.endTsMs
  );
}

export default function LiveRoomPage({
  apiClient,
  roomId,
  initialLotId,
  initialPreviewMedia,
  userId,
  userNickname,
  userAvatarUrl,
  accessToken,
  onBack,
  onPay,
  onOpenOrder
}: {
  apiClient: ApiClient;
  roomId: string;
  initialLotId?: string;
  initialPreviewMedia?: PreviewMediaSnapshot;
  userId: string;
  userNickname?: string;
  userAvatarUrl?: string;
  accessToken?: string;
  onBack: () => void;
  onPay: (orderId: string, auctionId: string) => void;
  onOpenOrder: (orderId: string, tab: MyAuctionTabKey) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedLotId, setSelectedLotId] = useState<string | undefined>(initialLotId);
  const [liveSheets, setLiveSheets] = useState<LiveSheetInstance[]>([]);
  const [floatingAuctionCard, setFloatingAuctionCard] = useState<FloatingAuctionCardState | undefined>();
  const [hiddenAuctionCardId, setHiddenAuctionCardId] = useState<string | undefined>();
  const [runtimeStartedAuctionId, setRuntimeStartedAuctionId] = useState<string | undefined>();
  const [lastBidAtByAuction, setLastBidAtByAuction] = useState<Record<string, number>>({});
  const lastBidAtByAuctionRef = useRef<Record<string, number>>({});
  const [quickBidIntervalNoticeUntilByAuction, setQuickBidIntervalNoticeUntilByAuction] = useState<Partial<Record<string, number>>>({});
  const [quickBidFeedback, setQuickBidFeedback] = useState<QuickBidFeedback>({ status: 'idle' });
  const pendingBidAuctionIdsRef = useRef<Set<string>>(new Set());
  const pendingBidRequestAuctionMapRef = useRef<Record<string, string>>({});
  const [rankingCollapsed, setRankingCollapsed] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(readSharedLiveSoundEnabled);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>(() => initialLiveChatMessages(roomId));
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingAnimationSource, setRankingAnimationSource] = useState<RankingAnimationSource>('initial');
  const [enrolledAuctions, setEnrolledAuctions] = useState<Set<string>>(() => new Set());
  const [lotStates, setLotStates] = useState<Record<string, AuctionState>>({});
  const [liveStats, setLiveStats] = useState<LiveRoomStats>(() => (import.meta.env.VITE_API_MODE === 'remote' ? createRemotePendingStats(roomId) : demoLiveRoomStats));
  const [countdownExtensionPulse, setCountdownExtensionPulse] = useState<CountdownExtensionPulse | undefined>();
  const [countdownAmbientPulse, setCountdownAmbientPulse] = useState<{ auctionId: string; id: number } | undefined>();
  const [countdownAmbientEndEffect, setCountdownAmbientEndEffect] = useState<CountdownAmbientEndEffect | undefined>();
  const [likeBurstId, setLikeBurstId] = useState(0);
  const [likeBurstVisible, setLikeBurstVisible] = useState(false);
  const [digitalHumanSpeaking, setDigitalHumanSpeaking] = useState(false);
  const [liveSoundAutoplayBlocked, setLiveSoundAutoplayBlocked] = useState(false);
  const [liveVoicePermissionPromptVisible, setLiveVoicePermissionPromptVisible] = useState(false);

  const clearQuickBidIntervalNotice = useCallback((auctionId: string | undefined) => {
    if (!auctionId) return;
    setQuickBidIntervalNoticeUntilByAuction((prev) => {
      if (prev[auctionId] === undefined) return prev;
      const next = { ...prev };
      delete next[auctionId];
      return next;
    });
  }, []);

  const showQuickBidIntervalNotice = useCallback((auctionId: string | undefined, remainingMs: number) => {
    if (!auctionId) return;
    const safeRemainingMs = Math.max(0, remainingMs);
    if (safeRemainingMs <= 0) return;
    const noticeUntilMs = Date.now() + safeRemainingMs;
    setQuickBidIntervalNoticeUntilByAuction((prev) => ({ ...prev, [auctionId]: noticeUntilMs }));
  }, []);

  const recordAcceptedBidAt = useCallback((auctionId: string | undefined, acceptedAtMs = Date.now()) => {
    if (!auctionId) return;
    lastBidAtByAuctionRef.current[auctionId] = acceptedAtMs;
    setLastBidAtByAuction((prev) => ({ ...prev, [auctionId]: acceptedAtMs }));
  }, []);

  const lockQuickBidSubmission = useCallback((auctionId: string, requestId: string) => {
    pendingBidAuctionIdsRef.current.add(auctionId);
    pendingBidRequestAuctionMapRef.current[requestId] = auctionId;
  }, []);

  const releaseQuickBidSubmission = useCallback(({ auctionId, requestId }: { auctionId?: string; requestId?: string }) => {
    const mappedAuctionId = requestId ? pendingBidRequestAuctionMapRef.current[requestId] : undefined;
    const resolvedAuctionId = auctionId ?? mappedAuctionId;
    if (resolvedAuctionId) {
      pendingBidAuctionIdsRef.current.delete(resolvedAuctionId);
    }
    for (const [currentRequestId, currentAuctionId] of Object.entries(pendingBidRequestAuctionMapRef.current)) {
      if ((requestId && currentRequestId === requestId) || (resolvedAuctionId && currentAuctionId === resolvedAuctionId)) {
        delete pendingBidRequestAuctionMapRef.current[currentRequestId];
      }
    }
  }, []);
  const [now, setNow] = useState(Date.now());
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const { alerts: auctionAlerts, pushAlert: pushAuctionAlert, dismissAlert: dismissAuctionAlert } = useLiveAuctionAlerts();
  const realtimeRef = useRef<RealtimeClient>();
  const liveVoicePlayerRef = useRef<LiveVoiceBroadcastAudioPlayer>();
  const pendingLiveVoicePayloadsRef = useRef<LiveVoiceBroadcastAudioPayload[]>([]);
  const liveVideoSurfaceRef = useRef<LiveRoomVideoSurfaceHandle>(null);
  const liveSoundAutoplayBlockedRef = useRef(false);
  const liveSoundUnlockInFlightRef = useRef(false);
  const liveVoicePermissionPromptVisibleRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  const serverTimeOffsetRef = useRef(0);
  const lastSeqRef = useRef(0);
  const realtimeSeqCursorRef = useRef<RealtimeSeqCursor>({});
  const timeSyncInFlightRef = useRef<{ requestId: string; clientSendTimeMs: number; seq: number }>();
  const timeSyncSeqRef = useRef(0);
  const lastSeqScopeRef = useRef('');
  const lastRankingBidRef = useRef<RankingBidHint>();
  const rankingRef = useRef<RankingItem[]>([]);
  const sheetTimersRef = useRef<number[]>([]);
  const liveSheetsRef = useRef<LiveSheetInstance[]>([]);
  const liveSheetKeysRef = useRef<Set<string>>(new Set());
  const floatingAuctionCardRef = useRef<FloatingAuctionCardState>();
  const pendingFloatingAuctionCardRef = useRef<FloatingAuctionCardState>();
  const countdownExtensionTimerRef = useRef<number>();
  const countdownAmbientPulseTimerRef = useRef<number>();
  const countdownAmbientEndHoldTimerRef = useRef<number>();
  const countdownAmbientEndExitTimerRef = useRef<number>();
  const completedCountdownAmbientEndKeyRef = useRef<string>();
  const scheduledAuctionRefreshAttemptsRef = useRef<Set<string>>(new Set());
  const expiredAuctionRefreshAttemptsRef = useRef<Set<string>>(new Set());
  const bidConfirmTimerRef = useRef<number>();
  const settledBidResultIdsRef = useRef<Set<string>>(new Set());
  const rankingSnapshotDelayUntilRef = useRef(0);
  const delayedRankingSnapshotTimerRef = useRef<number>();
  const delayedRankingSnapshotMessageRef = useRef<RealtimeMessage>();
  const likeBurstTimerRef = useRef<number>();
  const commentsViewportRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentsShouldStickRef = useRef(true);
  soundEnabledRef.current = soundEnabled;
  liveSoundAutoplayBlockedRef.current = liveSoundAutoplayBlocked;
  liveVoicePermissionPromptVisibleRef.current = liveVoicePermissionPromptVisible;
  rankingRef.current = ranking;
  const setSharedSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    writeSharedLiveSoundEnabled(enabled);
    setSoundEnabled(enabled);
  }, []);
  const applyRankingUpdate = useCallback((updater: (current: RankingItem[]) => RankingItem[]) => {
    const current = rankingRef.current;
    const next = updater(current);
    if (next === current) return;
    rankingRef.current = next;
    setRanking(next);
  }, []);
  const clearDelayedRankingSnapshot = useCallback(() => {
    if (delayedRankingSnapshotTimerRef.current) {
      window.clearTimeout(delayedRankingSnapshotTimerRef.current);
      delayedRankingSnapshotTimerRef.current = undefined;
    }
    delayedRankingSnapshotMessageRef.current = undefined;
    rankingSnapshotDelayUntilRef.current = 0;
  }, []);
  const roomLocalLikeCount = useLiveActivityStore((state) => state.roomLikeCounts[roomId] ?? 0);
  const likeRoom = useLiveActivityStore((state) => state.likeRoom);
  const setStoredCommentDraft = useLiveActivityStore((state) => state.setCommentDraft);
  const clearStoredCommentDraft = useLiveActivityStore((state) => state.clearCommentDraft);
  const recordFootprint = useLiveActivityStore((state) => state.recordFootprint);
  const isRemoteApiMode = import.meta.env.VITE_API_MODE === 'remote';
  const roomPlaceholder = useMemo(() => (isRemoteApiMode ? createRemotePendingRoom(roomId) : findDemoLiveRoom(roomId)), [isRemoteApiMode, roomId]);
  const lotsPlaceholder = useMemo(() => (isRemoteApiMode ? emptyLiveRoomLotPage : listDemoLots(roomId)), [isRemoteApiMode, roomId]);
  const statsPlaceholder = useMemo(() => (isRemoteApiMode ? createRemotePendingStats(roomId) : demoLiveRoomStats), [isRemoteApiMode, roomId]);

  const roomQuery = useQuery({
    queryKey: ['live-room', roomId],
    queryFn: () => apiClient.getLiveRoom(roomId),
    placeholderData: roomPlaceholder
  });
  const lotsQuery = useQuery({
    queryKey: ['live-room-lots', roomId],
    queryFn: () => apiClient.listLiveRoomLots(roomId),
    placeholderData: lotsPlaceholder
  });
  const statsQuery = useQuery({
    queryKey: ['live-room-stats', roomId],
    queryFn: () => apiClient.getLiveRoomStats(roomId),
    placeholderData: statsPlaceholder
  });
  const myAuctionRecordsQuery = useQuery({
    queryKey: ['my-auction-records'],
    queryFn: () => apiClient.listMyAuctionRecords(),
    placeholderData: { items: [], total: 0, page: 1, page_size: 20 }
  });
  const myOrdersQuery = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => apiClient.listMyOrders(),
    placeholderData: { items: [], total: 0, page: 1, page_size: 20 }
  });

  const room = roomQuery.data ?? roomPlaceholder;
  const lots = lotsQuery.data?.items ?? lotsPlaceholder.items;
  const merchantQuery = useQuery({
    queryKey: ['merchant', room.merchantId],
    queryFn: () => {
      if (!room.merchantId) throw new Error('No merchant');
      return apiClient.getMerchant(room.merchantId);
    },
    enabled: Boolean(room.merchantId)
  });
  const followMerchantMutation = useMutation({
    mutationFn: ({ merchantId, followed }: { merchantId: string; followed: boolean }) =>
      followed ? apiClient.unfollowMerchant(merchantId) : apiClient.followMerchant(merchantId),
    onSuccess: (merchant, variables) => {
      queryClient.setQueryData(['merchant', variables.merchantId], merchant);
      if (merchant.id !== variables.merchantId) queryClient.setQueryData(['merchant', merchant.id], merchant);
      void queryClient.invalidateQueries({ queryKey: ['my-followed-merchants'] });
      void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
    },
    onError: () => {
      Toast.show({ content: t('state.error') });
    }
  });
  const myAuctionRecordItems = myAuctionRecordsQuery.data?.items;
  const myOrderItems = myOrdersQuery.data?.items;
  const orderByAuctionId = useMemo(() => buildOrderByAuctionId(myAuctionRecordItems, myOrderItems), [myAuctionRecordItems, myOrderItems]);
  const roomPreviewMediaSource = room.videoSource === 'recorded' ? discoverPreviewVideoUrl(room) : liveRoomPreviewVideoUrl(room);
  const initialMediaPosition = isPreviewMediaSnapshotApplicable(initialPreviewMedia, room, roomPreviewMediaSource) ? initialPreviewMedia : undefined;
  const activeLot = selectCurrentRunningLot(room, lots, lotStates);
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? activeLot ?? lots[0];
  const merchant = merchantQuery.data;
  const isFollowingMerchant = Boolean(merchant?.isFollowed);
  const activeLotInitialState = useMemo(() => (activeLot ? stateFromLot(activeLot) : undefined), [activeLot]);
  const canFetchActiveAuctionState =
    Boolean(activeLot?.auctionId) && (import.meta.env.MODE === 'test' || import.meta.env.VITE_API_MODE !== 'remote' || isBackendAuctionId(activeLot?.auctionId));
  const activeAuctionIdForState = canFetchActiveAuctionState ? activeLot?.auctionId : undefined;

  const stateQuery = useQuery({
    queryKey: ['auction-state', activeAuctionIdForState],
    queryFn: () => {
      if (!activeAuctionIdForState) throw new Error('No active auction');
      return apiClient.getAuctionState(activeAuctionIdForState);
    },
    enabled: Boolean(activeAuctionIdForState),
    placeholderData: activeLotInitialState
  });

  useEffect(() => {
    if (statsQuery.data) setLiveStats((prev) => mergeLiveRoomStats(prev, statsQuery.data));
  }, [statsQuery.data]);

  useEffect(() => {
    if (isRemoteApiMode && !roomQuery.data) return;
    const coverUrl = liveRoomFootprintCoverUrl(room, lots, activeLot);
    recordFootprint(coverUrl && coverUrl !== room.coverUrl ? { ...room, coverUrl } : room);
  }, [activeLot, isRemoteApiMode, lots, recordFootprint, room, roomQuery.data]);

  const applyServerTimeOffset = useCallback((offsetMs: number) => {
    if (!Number.isFinite(offsetMs)) return;
    setServerTimeOffsetMs((current) => {
      if (Math.abs(current - offsetMs) < 5) return current;
      serverTimeOffsetRef.current = offsetMs;
      return offsetMs;
    });
  }, []);

  const syncServerTimeOffset = useCallback((message: RealtimeMessage) => {
    if (message.type === 'time.sync.result') {
      const payload = realtimePayloadRecord(message.payload) as Partial<TimeSyncResultPayload>;
      const requestId = String(message.requestId ?? payload.requestId ?? '');
      const inFlight = timeSyncInFlightRef.current;
      if (!inFlight || requestId !== inFlight.requestId) return;
      const clientReceiveTimeMs = Date.now();
      const serverTimeMs = parseRealtimeTimestampMs(payload.serverTimeMs ?? payload.serverTime, Number.NaN);
      timeSyncInFlightRef.current = undefined;
      if (!Number.isFinite(serverTimeMs)) return;
      applyServerTimeOffset(getServerOffsetMsWithRtt({
        serverTimeMs,
        clientSendTimeMs: inFlight.clientSendTimeMs,
        clientReceiveTimeMs
      }));
      return;
    }
    const offsetMs = serverTimeOffsetFromPayload(message.payload);
    if (offsetMs !== undefined) applyServerTimeOffset(offsetMs);
  }, [applyServerTimeOffset]);

  useEffect(() => {
    const serverTsMs = stateQuery.data?.serverTsMs;
    if (!serverTsMs || !Number.isFinite(serverTsMs)) return;
    applyServerTimeOffset(getServerOffsetMs(serverTsMs, Date.now()));
  }, [applyServerTimeOffset, stateQuery.data?.serverTsMs]);

  const clearCountdownAmbientPulse = useCallback(() => {
    if (countdownAmbientPulseTimerRef.current) {
      window.clearTimeout(countdownAmbientPulseTimerRef.current);
      countdownAmbientPulseTimerRef.current = undefined;
    }
    setCountdownAmbientPulse(undefined);
  }, []);

  const clearCountdownAmbientEndEffect = useCallback((options?: { keepCompleted?: boolean }) => {
    if (countdownAmbientEndHoldTimerRef.current) {
      window.clearTimeout(countdownAmbientEndHoldTimerRef.current);
      countdownAmbientEndHoldTimerRef.current = undefined;
    }
    if (countdownAmbientEndExitTimerRef.current) {
      window.clearTimeout(countdownAmbientEndExitTimerRef.current);
      countdownAmbientEndExitTimerRef.current = undefined;
    }
    if (!options?.keepCompleted) completedCountdownAmbientEndKeyRef.current = undefined;
    setCountdownAmbientEndEffect(undefined);
  }, []);

  const triggerCountdownAmbientPulse = useCallback((auctionId: string) => {
    if (!auctionId) return;
    if (countdownAmbientPulseTimerRef.current) window.clearTimeout(countdownAmbientPulseTimerRef.current);
    const pulse = { auctionId, id: Date.now() };
    setCountdownAmbientPulse(pulse);
    countdownAmbientPulseTimerRef.current = window.setTimeout(() => {
      setCountdownAmbientPulse((current) => (current?.id === pulse.id ? undefined : current));
      countdownAmbientPulseTimerRef.current = undefined;
    }, countdownAmbientBidPulseMs);
  }, []);

  useEffect(() => {
    setChatMessages(initialLiveChatMessages(roomId));
    setCommentDraft(useLiveActivityStore.getState().commentDrafts[roomId] ?? '');
    setCommentComposerOpen(false);
    setLikeBurstId(0);
    setLikeBurstVisible(false);
    setDigitalHumanSpeaking(false);
    setLiveSoundAutoplayBlocked(false);
    setLiveVoicePermissionPromptVisible(false);
    liveSoundAutoplayBlockedRef.current = false;
    liveVoicePermissionPromptVisibleRef.current = false;
    pendingLiveVoicePayloadsRef.current = [];
    clearCountdownAmbientPulse();
    clearCountdownAmbientEndEffect();
    clearDelayedRankingSnapshot();
    liveVoicePlayerRef.current?.stop();
    commentsShouldStickRef.current = true;
  }, [clearCountdownAmbientEndEffect, clearCountdownAmbientPulse, clearDelayedRankingSnapshot, roomId]);

  useEffect(() => {
    return () => {
      if (countdownExtensionTimerRef.current) window.clearTimeout(countdownExtensionTimerRef.current);
      if (countdownAmbientPulseTimerRef.current) window.clearTimeout(countdownAmbientPulseTimerRef.current);
      if (countdownAmbientEndHoldTimerRef.current) window.clearTimeout(countdownAmbientEndHoldTimerRef.current);
      if (countdownAmbientEndExitTimerRef.current) window.clearTimeout(countdownAmbientEndExitTimerRef.current);
      if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current);
    };
  }, []);

  const currentState = activeLot ? lotStates[activeLot.auctionId] ?? stateQuery.data ?? activeLotInitialState : undefined;
  const hasBlockingLiveSheet = liveSheets.some((sheet) => sheet.phase !== 'closing');
  const liveSheetOpen = hasBlockingLiveSheet;
  const activeCountdownRemainMs = currentState ? countdownRemainMs(currentState.endTsMs, now, serverTimeOffsetMs) : 0;
  const isActiveCountdownExpired = activeCountdownRemainMs <= 0;
  const displayCurrentState = currentState ? stateWithHammerPendingAfterCountdown(currentState, activeCountdownRemainMs) : undefined;
  useEffect(() => {
    const activeEndTsMs = displayCurrentState?.endTsMs;
    if (!activeLot || !displayCurrentState || activeEndTsMs === undefined || !isActiveAuctionDisplayStatus(displayCurrentState.status)) {
      clearCountdownAmbientEndEffect();
      return;
    }
    const endKey = `${activeLot.auctionId}:${activeEndTsMs}`;
    if (activeCountdownRemainMs > 0) {
      clearCountdownAmbientEndEffect();
      return;
    }
    if (completedCountdownAmbientEndKeyRef.current === endKey) return;
    if (countdownAmbientEndEffect?.auctionId === activeLot.auctionId && countdownAmbientEndEffect.endTsMs === activeEndTsMs) return;
    if (countdownAmbientEndHoldTimerRef.current) window.clearTimeout(countdownAmbientEndHoldTimerRef.current);
    if (countdownAmbientEndExitTimerRef.current) window.clearTimeout(countdownAmbientEndExitTimerRef.current);
    const pulseId = Date.now();
    setCountdownAmbientEndEffect({ auctionId: activeLot.auctionId, endTsMs: activeEndTsMs, phase: 'hold', pulseId });
    countdownAmbientEndHoldTimerRef.current = window.setTimeout(() => {
      setCountdownAmbientEndEffect((current) =>
        current?.auctionId === activeLot.auctionId && current.endTsMs === activeEndTsMs
          ? { ...current, phase: 'leaving' }
          : current
      );
      countdownAmbientEndHoldTimerRef.current = undefined;
    }, countdownAmbientEndHoldMs);
    countdownAmbientEndExitTimerRef.current = window.setTimeout(() => {
      completedCountdownAmbientEndKeyRef.current = endKey;
      setCountdownAmbientEndEffect((current) => (current?.auctionId === activeLot.auctionId && current.endTsMs === activeEndTsMs ? undefined : current));
      countdownAmbientEndExitTimerRef.current = undefined;
    }, countdownAmbientEndHoldMs + countdownAmbientEndExitMs);
  }, [activeCountdownRemainMs, activeLot, clearCountdownAmbientEndEffect, countdownAmbientEndEffect, displayCurrentState]);

  const countdownAmbientState = useMemo<CountdownAmbientState | undefined>(() => {
    if (!activeLot || !displayCurrentState) return undefined;
    if (!isActiveAuctionDisplayStatus(displayCurrentState.status)) return undefined;
    if (activeCountdownRemainMs > countdownAmbientThresholdMs) return undefined;
    const endKey = `${activeLot.auctionId}:${displayCurrentState.endTsMs}`;
    if (activeCountdownRemainMs <= 0 && completedCountdownAmbientEndKeyRef.current === endKey) return undefined;
    const activeEndEffect =
      countdownAmbientEndEffect?.auctionId === activeLot.auctionId && countdownAmbientEndEffect.endTsMs === displayCurrentState.endTsMs
        ? countdownAmbientEndEffect
        : undefined;
    return {
      auctionId: activeLot.auctionId,
      tone: countdownAmbientTone(displayCurrentState, userId),
      progress: countdownAmbientProgress(activeCountdownRemainMs),
      pulseId: countdownAmbientPulse?.auctionId === activeLot.auctionId ? countdownAmbientPulse.id : undefined,
      endPulseId: activeEndEffect?.pulseId,
      endPhase: activeEndEffect?.phase
    };
  }, [activeCountdownRemainMs, activeLot, countdownAmbientEndEffect, countdownAmbientPulse, displayCurrentState, userId]);

  const useMillisecondCountdownRefresh = Boolean(
    activeLot?.auctionId &&
    displayCurrentState &&
    activeCountdownRemainMs > 0 &&
    (activeCountdownRemainMs <= countdownMillisecondsThresholdMs || activeCountdownRemainMs <= countdownAmbientThresholdMs)
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), useMillisecondCountdownRefresh ? 100 : 1000);
    return () => window.clearInterval(timer);
  }, [useMillisecondCountdownRefresh]);

  const rankingQuery = useQuery({
    queryKey: ['auction-ranking', activeLot?.auctionId],
    queryFn: () => {
      if (!activeLot?.auctionId) throw new Error('No active auction');
      return apiClient.getAuctionRanking(activeLot.auctionId);
    },
    enabled: Boolean(activeLot?.auctionId && isActiveAuctionDisplayStatus(displayCurrentState?.status ?? activeLot.status)),
    staleTime: 1000
  });

  useEffect(() => {
    if (!activeLot?.auctionId || !rankingQuery.data) return;
    const nextRanking = normalizeRealtimeRankingItems(rankingQuery.data, userId, userNickname, userAvatarUrl);
    if (!shouldApplyRankingSnapshot(rankingRef.current, nextRanking)) return;
    setRankingAnimationSource('snapshot');
    applyRankingUpdate((current) => (shouldApplyRankingSnapshot(current, nextRanking) ? nextRanking : current));
  }, [activeLot?.auctionId, applyRankingUpdate, rankingQuery.data, userAvatarUrl, userId, userNickname]);
  const displayLotStates = useMemo(() => {
    if (!activeLot || !displayCurrentState) return lotStates;
    return { ...lotStates, [activeLot.auctionId]: displayCurrentState };
  }, [activeLot, displayCurrentState, lotStates]);
  const activeCountdownPressurePhase = getCountdownPressurePhase(
    activeCountdownRemainMs,
    displayCurrentState?.status
  );
  const countdownAlert = useMemo<LiveAuctionAlert | undefined>(() => {
    if (!activeLot || !displayCurrentState || activeCountdownPressurePhase === 'idle') return undefined;
    const seconds = countdownPressureDisplaySeconds(activeCountdownRemainMs);
    const isExtended = activeCountdownPressurePhase === 'extended';
    const subtitle = isExtended ? t('countdownPressure.extendedSubtitle') : t('countdownPressure.subtitle');
    return {
      id: `countdown-${activeLot.auctionId}-${displayCurrentState.endTsMs}-${activeCountdownPressurePhase}-${seconds}`,
      kind: 'countdown',
      auctionId: activeLot.auctionId,
      lotId: activeLot.id,
      tone: activeCountdownPressurePhase,
      kicker: activeCountdownPressurePhase === 'critical' ? t('countdownPressure.criticalKicker') : t('countdownPressure.kicker'),
      title: isExtended ? t('countdownPressure.extendedTitle') : t('countdownPressure.title', { seconds }),
      subtitle: activeLot.title ? `${subtitle} \u00B7 ${activeLot.title}` : subtitle,
      value: isExtended ? '+' : String(seconds),
      priority: liveAuctionAlertPriority.countdown,
      durationMs: liveAuctionAlertDurationMs.countdown
    };
  }, [activeCountdownPressurePhase, activeCountdownRemainMs, activeLot, displayCurrentState]);
  const visibleAuctionAlerts = auctionAlerts[0] ? [auctionAlerts[0]] : countdownAlert ? [countdownAlert] : [];
  const stateForLot = useCallback(
    (lot: LiveRoomLot) => displayLotStates[lot.auctionId] ?? stateFromLot(lot),
    [displayLotStates]
  );

  useEffect(() => {
    const timers: number[] = [];
    const currentMs = Date.now();
    const attempts = scheduledAuctionRefreshAttemptsRef.current;

    lots.forEach((lot) => {
      const startTsMs = lot.startTsMs;
      if (!isValidScheduledStartMs(startTsMs)) return;
      const state = stateForLot(lot);
      if (!isUpcomingAuctionStatus(state.status)) return;

      SCHEDULED_AUCTION_REFRESH_RETRY_DELAYS_MS.forEach((delayMs, attemptIndex) => {
        const attemptKey = `${roomId}:${lot.auctionId}:${startTsMs}:${attemptIndex}`;
        if (attempts.has(attemptKey)) return;
        const timeoutMs = Math.max(0, startTsMs + delayMs - currentMs);
        const timer = window.setTimeout(() => {
          attempts.add(attemptKey);
          void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['live-room-stats', roomId] });
          if (lot.auctionId === activeAuctionIdForState) {
            void refetchAuctionStateRef.current();
          }
        }, timeoutMs);
        timers.push(timer);
      });
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeAuctionIdForState, lots, queryClient, roomId, stateForLot]);

  useEffect(() => {
    const restoredIds = new Set<string>();
    (myAuctionRecordItems ?? []).forEach((record) => {
      if (hasZeroDepositEnrollment(record)) restoredIds.add(record.lot.auctionId);
    });
    if (!restoredIds.size) return;
    setEnrolledAuctions((prev) => {
      const next = new Set(prev);
      restoredIds.forEach((auctionId) => next.add(auctionId));
      return next.size === prev.size ? prev : next;
    });
  }, [myAuctionRecordItems]);

  useEffect(() => {
    liveSheetsRef.current = liveSheets;
  }, [liveSheets]);

  useEffect(() => {
    floatingAuctionCardRef.current = floatingAuctionCard;
  }, [floatingAuctionCard]);

  const scheduleSheetOpen = useCallback((id: string) => {
    const timer = window.setTimeout(() => {
      setLiveSheets((prev) => prev.map((sheet) => (sheet.id === id && sheet.phase === 'opening' ? { ...sheet, phase: 'open' } : sheet)));
    }, 20);
    sheetTimersRef.current.push(timer);
  }, []);

  const scheduleSheetRemoval = useCallback((id: string, durationMs: number) => {
    const timer = window.setTimeout(() => {
      setLiveSheets((prev) => {
        const removedSheet = prev.find((sheet) => sheet.id === id);
        if (removedSheet) {
          liveSheetKeysRef.current.delete(liveSheetInstanceKey(removedSheet.type, removedSheet.lotId));
        }
        return prev.filter((sheet) => sheet.id !== id);
      });
    }, durationMs);
    sheetTimersRef.current.push(timer);
  }, []);

  const closeLiveSheet = useCallback(
    (id: string) => {
      const sheet = liveSheetsRef.current.find((item) => item.id === id);
      if (!sheet || sheet.phase === 'closing') return;
      liveSheetKeysRef.current.delete(liveSheetInstanceKey(sheet.type, sheet.lotId));
      setLiveSheets((prev) => prev.map((item) => (item.id === id ? { ...item, phase: 'closing' } : item)));
      scheduleSheetRemoval(id, LIVE_SHEET_ANIMATION_MS[sheet.variant].exit);
    },
    [scheduleSheetRemoval]
  );

  const closeActiveLiveSheets = useCallback(() => {
    const closingSheets = liveSheetsRef.current.filter((sheet) => sheet.phase !== 'closing');
    if (!closingSheets.length) return;
    closingSheets.forEach((sheet) => liveSheetKeysRef.current.delete(liveSheetInstanceKey(sheet.type, sheet.lotId)));
    setLiveSheets((prev) => prev.map((sheet) => (sheet.phase === 'closing' ? sheet : { ...sheet, phase: 'closing' })));
    closingSheets.forEach((sheet) => scheduleSheetRemoval(sheet.id, LIVE_SHEET_ANIMATION_MS[sheet.variant].exit));
  }, [scheduleSheetRemoval]);

  const openLiveSheet = useCallback(
    (type: LiveSheetType, lotId?: string, options: { closeExisting?: boolean; variant?: LiveSheetVariant } = {}) => {
      if (options.closeExisting ?? true) closeActiveLiveSheets();
      const sheetKey = liveSheetInstanceKey(type, lotId);
      if (liveSheetKeysRef.current.has(sheetKey)) return;
      liveSheetKeysRef.current.add(sheetKey);
      const variantByType: Record<LiveSheetType, LiveSheetVariant> = {
        lotList: 'lotList',
        detail: 'detail',
        quickBid: 'quickBid'
      };
      const id = makeRequestId(`sheet-${type}`);
      setLiveSheets((prev) => {
        const hasDuplicate = prev.some((sheet) => sheet.phase !== 'closing' && liveSheetInstanceKey(sheet.type, sheet.lotId) === sheetKey);
        if (hasDuplicate) return prev;
        return [...prev, { id, type, lotId, variant: options.variant ?? variantByType[type], phase: 'opening' }];
      });
      scheduleSheetOpen(id);
    },
    [closeActiveLiveSheets, scheduleSheetOpen]
  );

  useEffect(() => {
    const liveSheetKeys = liveSheetKeysRef.current;
    return () => {
      sheetTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      sheetTimersRef.current = [];
      liveSheetKeys.clear();
    };
  }, []);

  const requestFloatingAuctionCard = useCallback((nextCard: FloatingAuctionCardState) => {
    setFloatingAuctionCard((current) => {
      if (!current) return nextCard;
      if (current.auctionId === nextCard.auctionId && current.mode === nextCard.mode && current.phase !== 'leaving') {
        const merged = { ...nextCard, phase: current.phase };
        return isSameFloatingAuctionCardSnapshot(current, merged) ? current : merged;
      }
      pendingFloatingAuctionCardRef.current = nextCard;
      return current.phase === 'leaving' ? current : { ...current, phase: 'leaving' };
    });
  }, []);

  const dismissFloatingAuctionCard = useCallback((auctionId: string) => {
    setHiddenAuctionCardId(auctionId);
    pendingFloatingAuctionCardRef.current = undefined;
    setFloatingAuctionCard((current) => (current?.auctionId === auctionId && current.phase !== 'leaving' ? { ...current, phase: 'leaving' } : current));
  }, []);

  useEffect(() => {
    if (!floatingAuctionCard) return undefined;
    if (floatingAuctionCard.phase === 'entering') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => (current?.auctionId === floatingAuctionCard.auctionId && current.phase === 'entering' ? { ...current, phase: 'visible' } : current));
      }, AUCTION_CARD_ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
    if (floatingAuctionCard.phase === 'holding') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => (current?.auctionId === floatingAuctionCard.auctionId && current.phase === 'holding' ? { ...current, phase: 'leaving' } : current));
      }, Math.max(0, (floatingAuctionCard.retireAtMs ?? Date.now()) - Date.now()));
      return () => window.clearTimeout(timer);
    }
    if (floatingAuctionCard.phase === 'leaving') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => {
          if (current?.auctionId !== floatingAuctionCard.auctionId || current.phase !== 'leaving') return current;
          const pending = pendingFloatingAuctionCardRef.current;
          pendingFloatingAuctionCardRef.current = undefined;
          return pending;
        });
      }, AUCTION_CARD_ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [floatingAuctionCard]);

  useEffect(() => {
    if (liveSheetOpen) {
      pendingFloatingAuctionCardRef.current = undefined;
      setFloatingAuctionCard((current) => (current?.phase === 'leaving' ? current : undefined));
      return;
    }
    if (!activeLot || !displayCurrentState || hiddenAuctionCardId === activeLot.auctionId) {
      setFloatingAuctionCard((current) => (current?.mode === 'running' && current.phase !== 'leaving' ? { ...current, phase: 'leaving' } : current));
      return;
    }
    requestFloatingAuctionCard({
      auctionId: activeLot.auctionId,
      lot: activeLot,
      state: displayCurrentState,
      ranking,
      enrolled: enrolledAuctions.has(activeLot.auctionId),
      mode: 'running',
      phase: activeLot.auctionId === runtimeStartedAuctionId ? 'entering' : 'visible',
      startedByRuntimeEvent: activeLot.auctionId === runtimeStartedAuctionId
    });
  }, [activeLot, displayCurrentState, enrolledAuctions, hiddenAuctionCardId, liveSheetOpen, ranking, requestFloatingAuctionCard, runtimeStartedAuctionId]);

  useEffect(() => {
    if (!initialLotId) return;
    setSelectedLotId(initialLotId);
    openLiveSheet('detail', initialLotId);
  }, [initialLotId, openLiveSheet]);

  const latestContext = useRef({
    activeLot,
    currentState: displayCurrentState,
    room,
    lots,
    liveStats,
    hasBlockingLiveSheet,
    ranking,
    enrolledAuctions
  });
  latestContext.current = {
    activeLot,
    currentState: displayCurrentState,
    room,
    lots,
    liveStats,
    hasBlockingLiveSheet,
    ranking,
    enrolledAuctions
  };
  const refetchAuctionStateRef = useRef(stateQuery.refetch);
  refetchAuctionStateRef.current = stateQuery.refetch;

  useEffect(() => {
    if (!activeLot?.auctionId || activeLot.auctionId !== activeAuctionIdForState || !currentState) return;
    if (!isRunningAuctionStatus(currentState.status) || !isActiveCountdownExpired) return;

    const timers: number[] = [];
    const attempts = expiredAuctionRefreshAttemptsRef.current;
    const refreshKeyPrefix = `${roomId}:${activeLot.auctionId}:${currentState.endTsMs}`;

    AUCTION_COUNTDOWN_EXPIRED_REFRESH_RETRY_DELAYS_MS.forEach((delayMs, attemptIndex) => {
      const attemptKey = `${refreshKeyPrefix}:${attemptIndex}`;
      if (attempts.has(attemptKey)) return;
      const timer = window.setTimeout(() => {
        attempts.add(attemptKey);
        void refetchAuctionStateRef.current();
        void queryClient.invalidateQueries({ queryKey: ['auction-ranking', activeLot.auctionId] });
        void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
      }, delayMs);
      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeAuctionIdForState, activeLot?.auctionId, currentState, isActiveCountdownExpired, queryClient, roomId]);

  const clearBidConfirmTimer = useCallback(() => {
    if (bidConfirmTimerRef.current === undefined) return;
    window.clearTimeout(bidConfirmTimerRef.current);
    bidConfirmTimerRef.current = undefined;
  }, []);

  const scheduleBidConfirmTimeout = useCallback(
    (requestId: string) => {
      clearBidConfirmTimer();
      bidConfirmTimerRef.current = window.setTimeout(() => {
        bidConfirmTimerRef.current = undefined;
        console.warn('[bid.place] confirmation timeout', { requestId });
        const auctionId = pendingBidRequestAuctionMapRef.current[requestId];
        releaseQuickBidSubmission({ requestId });
        clearQuickBidIntervalNotice(auctionId);
        setQuickBidFeedback((prev) =>
          prev.status === 'submitting' && prev.requestId === requestId
            ? { status: 'error', requestId, message: t('auction.bidRealtimeTimeout') }
            : prev
        );
        void refetchAuctionStateRef.current();
      }, BID_CONFIRM_TIMEOUT_MS);
    },
    [clearBidConfirmTimer, clearQuickBidIntervalNotice, releaseQuickBidSubmission]
  );

  // Async bid acknowledgements can remain queued until a later bid.result arrives.
  const scheduleBidArbitrationTimeout = useCallback(
    (requestId: string) => {
      clearBidConfirmTimer();
      bidConfirmTimerRef.current = window.setTimeout(() => {
        bidConfirmTimerRef.current = undefined;
        console.warn('[bid.place] arbitration wait timeout', { requestId });
        let stillArbitrating = false;
        setQuickBidFeedback((prev) => {
          if (prev.status === 'arbitrating' && prev.requestId === requestId) {
            stillArbitrating = true;
            return { status: 'arbitrating', requestId, message: t('auction.bidArbitrationTimeout') };
          }
          return prev;
        });
        if (stillArbitrating) {
          void refetchAuctionStateRef.current();
        }
      }, BID_ARBITRATION_TIMEOUT_MS);
    },
    [clearBidConfirmTimer]
  );

  useEffect(() => clearBidConfirmTimer, [clearBidConfirmTimer]);

  const stopDigitalHumanSpeaking = useCallback(() => {
    setDigitalHumanSpeaking(false);
  }, []);

  const stopLiveVoiceBroadcastPlayback = useCallback(() => {
    pendingLiveVoicePayloadsRef.current = [];
    setLiveVoicePermissionPromptVisible(false);
    liveVoicePermissionPromptVisibleRef.current = false;
    liveVoicePlayerRef.current?.stop();
    stopDigitalHumanSpeaking();
  }, [stopDigitalHumanSpeaking]);

  const isCurrentDigitalHumanLive = useCallback(() => latestContext.current.room.videoSource === 'digitalHuman', []);

  const unlockLiveVoiceAudio = useCallback(async () => {
    const player = liveVoicePlayerRef.current ?? getLiveVoiceBroadcastAudioPlayer();
    liveVoicePlayerRef.current = player;
    try {
      return await player.unlockAudio();
    } catch (error) {
      console.warn('[live.voice_broadcast] audio unlock failed', error);
      return false;
    }
  }, []);

  const playLiveVoiceBroadcast = useCallback(
    (payload: LiveVoiceBroadcastAudioPayload, options: { ignoreSoundGate?: boolean } = {}) => {
      if (!isCurrentDigitalHumanLive()) {
        pendingLiveVoicePayloadsRef.current = [];
        liveVoicePermissionPromptVisibleRef.current = false;
        setLiveVoicePermissionPromptVisible(false);
        liveVoicePlayerRef.current?.stop();
        stopDigitalHumanSpeaking();
        console.info('[live.voice_broadcast] playback skipped: current room is not digital-human live', liveVoiceAudioDebugSummary(payload));
        return;
      }
      if (!options.ignoreSoundGate && !soundEnabledRef.current) {
        pendingLiveVoicePayloadsRef.current = [];
        setLiveVoicePermissionPromptVisible(false);
        liveVoicePlayerRef.current?.stop();
        stopDigitalHumanSpeaking();
        console.info('[live.voice_broadcast] playback skipped: live sound is muted', liveVoiceAudioDebugSummary(payload));
        return;
      }
      const player = liveVoicePlayerRef.current ?? getLiveVoiceBroadcastAudioPlayer();
      liveVoicePlayerRef.current = player;
      const audioSummary = liveVoiceAudioDebugSummary(payload);
      console.info('[live.voice_broadcast] playback requested', audioSummary);
      void player.play(payload, { onEnded: stopDigitalHumanSpeaking }).then((result) => {
        console.info('[live.voice_broadcast] playback result', { ...audioSummary, ...result });
        if (result.played) {
          if (!soundEnabledRef.current) {
            player.stop();
            stopDigitalHumanSpeaking();
            return;
          }
          setLiveVoicePermissionPromptVisible(false);
          setDigitalHumanSpeaking(true);
          return;
        }
        if (!soundEnabledRef.current) {
          pendingLiveVoicePayloadsRef.current = [];
          setLiveVoicePermissionPromptVisible(false);
          stopDigitalHumanSpeaking();
          return;
        }
        if (result.blocked) {
          console.warn('[live.voice_broadcast] playback blocked; waiting for the next user gesture to unlock audio', { ...audioSummary, ...result });
          pendingLiveVoicePayloadsRef.current = appendUniqueLiveVoicePendingPayload(pendingLiveVoicePayloadsRef.current, payload);
          liveVoicePermissionPromptVisibleRef.current = true;
          setLiveVoicePermissionPromptVisible(true);
          Toast.show({ content: t('live.voiceAudioBlocked') });
        } else {
          console.warn('[live.voice_broadcast] playback skipped', { ...audioSummary, ...result });
        }
        }).catch((error) => {
          console.error('[live.voice_broadcast] playback failed', audioSummary, error);
          stopDigitalHumanSpeaking();
        });
      },
      [isCurrentDigitalHumanLive, stopDigitalHumanSpeaking]
    );

  const unlockAndPlayPendingLiveVoice = useCallback(() => {
    if (!soundEnabledRef.current) return;
    if (liveSoundAutoplayBlockedRef.current) return;
    if (!isCurrentDigitalHumanLive()) {
      stopLiveVoiceBroadcastPlayback();
      return;
    }
    void unlockLiveVoiceAudio().then((unlocked) => {
      const pendingPayloads = pendingLiveVoicePayloadsRef.current;
      if (!pendingPayloads.length) return;
      console.info('[live.voice_broadcast] user gesture unlock attempt', { unlocked, pendingCount: pendingPayloads.length });
      if (!unlocked) {
        liveVoicePermissionPromptVisibleRef.current = true;
        setLiveVoicePermissionPromptVisible(true);
        return;
      }
      liveVoicePermissionPromptVisibleRef.current = false;
      setLiveVoicePermissionPromptVisible(false);
      pendingLiveVoicePayloadsRef.current = [];
      pendingPayloads.forEach((pendingPayload) => playLiveVoiceBroadcast(pendingPayload, { ignoreSoundGate: true }));
    });
  }, [isCurrentDigitalHumanLive, playLiveVoiceBroadcast, stopLiveVoiceBroadcastPlayback, unlockLiveVoiceAudio]);

  useEffect(() => {
    liveVoiceUnlockEvents.forEach((eventName) => window.addEventListener(eventName, unlockAndPlayPendingLiveVoice, true));
    return () => {
      liveVoiceUnlockEvents.forEach((eventName) => window.removeEventListener(eventName, unlockAndPlayPendingLiveVoice, true));
      pendingLiveVoicePayloadsRef.current = [];
      liveVoicePermissionPromptVisibleRef.current = false;
      setLiveVoicePermissionPromptVisible(false);
      const player = liveVoicePlayerRef.current ?? getLiveVoiceBroadcastAudioPlayer();
      player.stop();
    };
  }, [unlockAndPlayPendingLiveVoice]);

  const appendChatMessage = useCallback((message: LiveChatMessage) => {
    setChatMessages((prev) => upsertChatMessage(prev, normalizeLiveChatMessage(message)).slice(-80));
  }, []);

  const pushNotice = useCallback(
    (content: string) => {
      appendChatMessage(createSystemChatMessage(roomId, content));
    },
    [appendChatMessage, roomId]
  );

  const pushAuctionAtmosphereAlert = useCallback(
    (kind: AuctionEventAlertKind, options: { auctionId: string; lot?: LiveRoomLot; price?: number; subtitle?: string; winnerName?: string; bidCount?: number }) => {
      const titleKey: Record<AuctionEventAlertKind, MessageKey> = {
        leading: 'auctionAlert.leading.title',
        outbid: 'auctionAlert.outbid.title',
        extended: 'auctionAlert.extended.title',
        closed: 'auctionAlert.closed.title',
        won: 'auctionAlert.won.title'
      };
      const subtitleKey: Record<AuctionEventAlertKind, MessageKey> = {
        leading: 'auctionAlert.leading.subtitle',
        outbid: 'auctionAlert.outbid.subtitle',
        extended: 'auctionAlert.extended.subtitle',
        closed: 'auctionAlert.closed.subtitle',
        won: 'auctionAlert.won.subtitle'
      };
      pushAuctionAlert({
        kind,
        auctionId: options.auctionId,
        lotId: options.lot?.id,
        title: t(titleKey[kind]),
        subtitle: options.subtitle ?? t(subtitleKey[kind]),
        price: options.price,
        winnerName: options.winnerName,
        bidCount: options.bidCount,
        durationMs: kind === 'won' ? 0 : undefined
      });
    },
    [pushAuctionAlert]
  );

  const acknowledgeChatMessage = useCallback((payload: Record<string, unknown>) => {
    const clientMessageId = String(payload.clientMessageId ?? '');
    if (!clientMessageId) return;
    setChatMessages((prev) =>
      prev.map((message) =>
        message.clientMessageId === clientMessageId
          ? {
              ...message,
              id: String(payload.messageId ?? message.id),
              createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : message.createdAt,
              pending: false,
              failed: false
            }
          : message
      )
    );
  }, []);

  const failChatMessage = useCallback((payload: Record<string, unknown>) => {
    const clientMessageId = String(payload.clientMessageId ?? '');
    if (!clientMessageId) return;
    setChatMessages((prev) => prev.map((message) => (message.clientMessageId === clientMessageId ? { ...message, pending: false, failed: true } : message)));
  }, []);

  const handleBidAck = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    // Async bid acknowledgements use mode/status instead of an immediate terminal result.
    if (String(payload.mode ?? '').toUpperCase() === 'ASYNC') {
      const status = String(payload.status ?? '').toUpperCase();
      if (status === 'REJECTED') {
        // A rejected async ack is already terminal.
        logBidRejectedDebug('bid.ack', requestId, payload);
        clearBidConfirmTimer();
        const auctionId = String(payload.auctionId ?? '');
        releaseQuickBidSubmission({ auctionId, requestId });
        clearQuickBidIntervalNotice(auctionId);
        setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { status: 'error', requestId, message: formatBidRejectedMessage(payload) } : prev));
        return;
      }
      // Queued async acks stay in arbitration until bid.result resolves them.
      let arbitrationRequestId: string | undefined;
      setQuickBidFeedback((prev) => {
        if (prev.status !== 'submitting' || (requestId && prev.requestId !== requestId)) return prev;
        const effectiveRequestId = requestId ?? prev.requestId;
        arbitrationRequestId = effectiveRequestId;
        return { status: 'arbitrating', requestId: effectiveRequestId, message: t('auction.bidArbitrating') };
      });
      if (arbitrationRequestId) scheduleBidArbitrationTimeout(arbitrationRequestId);
      return;
    }
    if (payload.accepted === false) {
      logBidRejectedDebug('bid.ack', requestId, payload);
      clearBidConfirmTimer();
      const auctionId = String(payload.auctionId ?? '');
      releaseQuickBidSubmission({ auctionId, requestId });
      clearQuickBidIntervalNotice(auctionId);
      setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { status: 'error', requestId, message: formatBidRejectedMessage(payload) } : prev));
      return;
    }
    if (payload.accepted === true) {
      const bidderId = String(payload.bidderId ?? payload.leaderBidderId ?? '');
      const auctionId = String(payload.auctionId ?? '');
      // bid.ack is the directed result for the current user's bid request, so a successful ack
      // should always start the local cooldown even when the backend omits bidder identity fields.
      if (auctionId) recordAcceptedBidAt(auctionId);
      releaseQuickBidSubmission({ auctionId, requestId });
      setQuickBidFeedback((prev) => {
        if (prev.status !== 'submitting') return prev;
        if (requestId && prev.requestId !== requestId && bidderId !== userId) return prev;
        clearBidConfirmTimer();
        return { status: 'success', requestId: requestId ?? prev.requestId, message: t('auction.bidAccepted') };
      });
      return;
    }
    setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { ...prev, message: t('auction.bidSubmitted') } : prev));
  }, [clearBidConfirmTimer, clearQuickBidIntervalNotice, recordAcceptedBidAt, releaseQuickBidSubmission, scheduleBidArbitrationTimeout, userId]);

  const handleBidAcceptedFeedback = useCallback(
    (requestId: string | undefined, payload: Record<string, unknown>) => {
      const bidderId = String(payload.bidderId ?? payload.leaderBidderId ?? '');
      const auctionId = String(payload.auctionId ?? '');
      let isOwnAcceptedBid = bidderId === userId;
      releaseQuickBidSubmission({ auctionId, requestId });
      setQuickBidFeedback((prev) => {
        if (prev.status === 'submitting' && requestId && prev.requestId === requestId) {
          isOwnAcceptedBid = true;
          clearBidConfirmTimer();
          return { status: 'success', requestId, message: t('auction.bidAccepted') };
        }
        if (bidderId === userId) {
          isOwnAcceptedBid = true;
          clearBidConfirmTimer();
          return { status: 'success', requestId, message: t('auction.bidAccepted') };
        }
        return prev;
      });
      if (isOwnAcceptedBid && auctionId) {
        recordAcceptedBidAt(auctionId);
      }
    },
    [clearBidConfirmTimer, recordAcceptedBidAt, releaseQuickBidSubmission, userId]
  );

  const handleBidRejectedFeedback = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    logBidRejectedDebug('bid.rejected', requestId, payload);
    clearBidConfirmTimer();
    const auctionId = String(payload.auctionId ?? '');
    releaseQuickBidSubmission({ auctionId, requestId });
    clearQuickBidIntervalNotice(auctionId);
    setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { status: 'error', requestId, message: formatBidRejectedMessage(payload) } : prev));
  }, [clearBidConfirmTimer, clearQuickBidIntervalNotice, releaseQuickBidSubmission]);

  // bid.result is the final directed result for an async bid attempt.
  const handleBidResult = useCallback((payload: Record<string, unknown>): boolean => {
    const bidId = String(payload.bidId ?? '').trim();
    // Always acknowledge bid.result when bidId is present.
    if (bidId) {
      realtimeRef.current?.send({ type: 'bid.result.ack', requestId: makeRequestId('bidResultAck'), payload: { bidId } });
    }
    // Duplicate terminal results only need the ack path.
    if (bidId && settledBidResultIdsRef.current.has(bidId)) return false;
    if (bidId) settledBidResultIdsRef.current.add(bidId);

    const finalStatus = String(payload.finalStatus ?? '').toUpperCase();
    const auctionId = String(payload.auctionId ?? '').trim();
    if (finalStatus === 'ACCEPTED') {
      // Clear the sync confirmation watchdog once the terminal accepted result arrives.
      clearBidConfirmTimer();
      const acceptedPrice = realtimeNumber(realtimeBidPriceValue(payload), Number.NaN);
      if (auctionId && Number.isFinite(acceptedPrice)) {
        lastRankingBidRef.current = {
          auctionId,
          bidderId: userId,
          price: acceptedPrice,
          bidTsMs: parseRealtimeTimestampMs(payload.bidTsMs ?? payload.serverTimeMs ?? payload.serverTime, Date.now())
        };
      }
      if (auctionId) {
        recordAcceptedBidAt(auctionId);
      }
      releaseQuickBidSubmission({ auctionId });
      setQuickBidFeedback((prev) => (prev.status === 'submitting' || prev.status === 'arbitrating' ? { status: 'success', requestId: prev.requestId, message: t('auction.bidAccepted') } : prev));
      return true;
    }
    if (finalStatus === 'REJECTED') {
      logBidRejectedDebug('bid.ack', undefined, payload);
      clearBidConfirmTimer();
      releaseQuickBidSubmission({ auctionId });
      clearQuickBidIntervalNotice(auctionId);
      setQuickBidFeedback((prev) => (prev.status === 'submitting' || prev.status === 'arbitrating' ? { status: 'error', requestId: prev.requestId, message: formatBidRejectedMessage(payload) } : prev));
      void refetchAuctionStateRef.current();
      return true;
    }
    return true;
  }, [clearBidConfirmTimer, clearQuickBidIntervalNotice, recordAcceptedBidAt, releaseQuickBidSubmission, userId]);

  const sendComment = useCallback(() => {
    const content = commentDraft.trim();
    if (!content) return;
    const clientMessageId = makeRequestId('chat');
    const message: LiveChatMessage = {
      id: clientMessageId,
      roomId,
      userId,
      nickname: t('live.commentMe'),
      content,
      clientMessageId,
      createdAt: new Date().toISOString(),
      pending: true
    };
    appendChatMessage(message);
    setCommentDraft('');
    clearStoredCommentDraft(roomId);
    realtimeRef.current?.send({
      type: 'chat.send',
      requestId: clientMessageId,
      payload: {
        roomId,
        content,
        clientMessageId
      }
    });
  }, [appendChatMessage, clearStoredCommentDraft, commentDraft, roomId, userId]);

  const handleCommentDraftChange = useCallback(
    (value: string) => {
      setCommentDraft(value);
      setStoredCommentDraft(roomId, value);
    },
    [roomId, setStoredCommentDraft]
  );

  const handleCommentKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendComment();
  };

  const handleCommentScroll = () => {
    const viewport = commentsViewportRef.current;
    if (!viewport) return;
    commentsShouldStickRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
  };

  useEffect(() => {
    if (!commentsOpen || !commentsShouldStickRef.current) return;
    commentsEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chatMessages, commentsOpen]);

  useEffect(() => {
    const context = latestContext.current;
    const seqScope = `${roomId}:${context.activeLot?.auctionId ?? ''}`;
    if (lastSeqScopeRef.current !== seqScope) {
      lastSeqScopeRef.current = seqScope;
      lastSeqRef.current = 0;
      realtimeSeqCursorRef.current = {};
    }
    const hasActiveAuction = Boolean(context.activeLot && context.currentState);
    const minIncrement = context.activeLot && context.currentState ? minIncrementForLot(context.activeLot, context.currentState) : 100;
    const isTestMode = import.meta.env.MODE === 'test';
    const wsBaseUrl = configuredWsBaseUrl();
    const useNativeRealtime = !isTestMode && import.meta.env.VITE_REALTIME_MODE === 'websocket' && Boolean(wsBaseUrl);
    const useRemoteApiMode = !isTestMode && import.meta.env.VITE_API_MODE === 'remote';
    const client: RealtimeClient | undefined =
      useNativeRealtime
        ? new NativeWebSocketClient({
            baseUrl: wsBaseUrl ?? '',
            roomId,
            auctionId: context.activeLot?.auctionId,
            accessToken,
            lastSeq: lastSeqRef.current,
            storage: window.localStorage
          })
        : !useRemoteApiMode && hasActiveAuction && context.activeLot && context.currentState
          ? new MockRealtimeClient({
              roomId,
              auctionId: context.activeLot.auctionId,
              liveSessionId: context.room.liveSessionId,
              currentPrice: context.currentState.currentPrice,
              minIncrement,
              endTsMs: context.currentState.endTsMs,
              userId,
              userNickname,
              userAvatarUrl,
              participantCount: participantCountForLot(context.activeLot, context.currentState),
              onlineCount: context.liveStats.onlineCount,
              capPrice: capPriceForLot(context.activeLot)
            })
          : undefined;
    realtimeRef.current = client;
    const consumeRealtimeMessage = (message: RealtimeMessage) => {
      if (isBidAcceptedRealtimeType(message.type)) {
        const payload = message.payload as Record<string, unknown>;
        const auctionId = String(payload.auctionId ?? latestContext.current.activeLot?.auctionId ?? '');
        const bidderId = String(payload.bidderId ?? payload.leaderBidderId ?? '');
        const context = latestContext.current;
        const acceptedLot = context.lots.find((lot) => lot.auctionId === auctionId);
        const previousState = context.activeLot?.auctionId === auctionId ? context.currentState : undefined;
        const previousLeaderId = previousState?.leaderBidderId ?? acceptedLot?.leaderBidderId;
        const acceptedPrice = Number(realtimeBidPriceValue(payload) ?? previousState?.currentPrice ?? acceptedLot?.currentPrice ?? 0);
        if (auctionId && acceptedLot && context.activeLot?.auctionId === auctionId) {
          triggerCountdownAmbientPulse(auctionId);
        }
        if (auctionId && acceptedLot && bidderId === userId) {
          pushAuctionAtmosphereAlert('leading', { auctionId, lot: acceptedLot, price: acceptedPrice });
        } else if (auctionId && acceptedLot && previousLeaderId === userId && bidderId && bidderId !== userId) {
          pushAuctionAtmosphereAlert('outbid', { auctionId, lot: acceptedLot, price: acceptedPrice });
        }
        if (auctionId && bidderId) {
          lastRankingBidRef.current = {
            auctionId,
            bidderId,
            price: acceptedPrice,
            bidTsMs: Number(payload.bidTsMs ?? Date.now())
          };
        }
        const nextRanking = mergeRealtimeBidIntoRankingItems(rankingRef.current, payload, userId, context.activeLot?.auctionId, userNickname, userAvatarUrl);
        const rankingAnimation = buildRankingAnimation(rankingRef.current, nextRanking, userId, lastRankingBidRef.current);
        clearDelayedRankingSnapshot();
        if (rankingAnimation) {
          rankingSnapshotDelayUntilRef.current = Date.now() + rankingAnimation.durationMs;
        }
      }
      if (message.type === 'timer.extended') {
        const payload = message.payload as Record<string, unknown>;
        const context = latestContext.current;
        const auctionId = String(payload.auctionId ?? context.activeLot?.auctionId ?? '');
        const extendedLot = context.lots.find((lot) => lot.auctionId === auctionId);
        if (auctionId && extendedLot && context.activeLot?.auctionId === auctionId) {
          const previousEndTsMs = context.currentState?.endTsMs ?? extendedLot.endTsMs ?? Date.now();
          const newEndTsMs = parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previousEndTsMs);
          const extendSeconds = realtimeExtendSeconds(payload, previousEndTsMs, newEndTsMs) ?? lotCountdownExtensionSeconds(extendedLot);
          if (countdownExtensionTimerRef.current) window.clearTimeout(countdownExtensionTimerRef.current);
          setCountdownExtensionPulse({ auctionId, id: Date.now(), seconds: extendSeconds });
          countdownExtensionTimerRef.current = window.setTimeout(() => {
            setCountdownExtensionPulse((current) => (current?.auctionId === auctionId ? undefined : current));
          }, countdownPressureExtendedMs);
        }
      }
      if (message.type === 'auction.started') {
        const payload = realtimePayloadWithState(message.payload);
        const auctionId = String(payload.auctionId ?? '');
        if (auctionId) {
          const context = latestContext.current;
          const startedLot = context.lots.find((lot) => lot.auctionId === auctionId);
          const previousState = startedLot ? context.currentState && context.activeLot?.auctionId === auctionId ? context.currentState : stateFromLot(startedLot) : undefined;
          const baseStartedState = previousState ?? fallbackAuctionState(auctionId);
          const startedState = {
            ...baseStartedState,
            auctionId,
            status: 'RUNNING' as const,
            currentPrice: realtimeNumber(payload.currentPrice, baseStartedState.currentPrice ?? 0),
            leaderBidderId: payload.leaderBidderId === undefined ? baseStartedState.leaderBidderId : String(payload.leaderBidderId),
            endTsMs: parseRealtimeTimestampMs(realtimeEndTimeValue(payload), baseStartedState.endTsMs ?? Date.now()),
            serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now()),
            bidCount: payload.bidCount === undefined ? baseStartedState.bidCount : realtimeNumber(payload.bidCount, baseStartedState.bidCount ?? 0),
            participantCount: payload.participantCount === undefined ? baseStartedState.participantCount : realtimeNumber(payload.participantCount, baseStartedState.participantCount ?? 0)
          };
          if (countdownExtensionTimerRef.current) window.clearTimeout(countdownExtensionTimerRef.current);
          setCountdownExtensionPulse(undefined);
          clearCountdownAmbientPulse();
          clearCountdownAmbientEndEffect();
          setHiddenAuctionCardId(undefined);
          setRuntimeStartedAuctionId(auctionId);
          setLotStates((prev) => {
            const next = { ...prev };
            context.lots.forEach((lot) => {
              if (lot.auctionId === auctionId) return;
              const previous = next[lot.auctionId] ?? stateFromLot(lot);
              if (previous.status !== 'RUNNING' && previous.status !== 'EXTENDED') return;
              next[lot.auctionId] = {
                ...previous,
                status: 'CLOSED_FAILED',
                endTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now()),
                serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
              };
            });
            next[auctionId] = startedState;
            return next;
          });
          void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['live-room-stats', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['auction-ranking', auctionId] });
          if (startedLot && !context.hasBlockingLiveSheet) {
            requestFloatingAuctionCard({
              auctionId,
              lot: startedLot,
              state: startedState,
              ranking: context.ranking,
              enrolled: context.enrolledAuctions.has(auctionId),
              mode: 'running',
              phase: 'entering',
              startedByRuntimeEvent: true
            });
          }
          return;
        }
      }
      if (message.type === 'auction.closed') {
        const payload = realtimePayloadRecord(message.payload);
        const context = latestContext.current;
        const closingAuctionId = String(payload.auctionId ?? context.activeLot?.auctionId ?? '');
        const winnerBidderId = String(payload.winnerBidderId ?? payload.winnerId ?? '');
        const isCurrentUserWinner = String(payload.status ?? 'CLOSED_WON') === 'CLOSED_WON' && winnerBidderId === userId;
        const winnerRankingItem = context.ranking.find((item) => item.bidderId === winnerBidderId);
        const winnerName = String(payload.winnerNickname ?? payload.winnerNickName ?? payload.winnerName ?? winnerRankingItem?.nicknameMask ?? t('auctionAlert.closed.defaultWinner'));
        const finalPrice = Number(payload.finalPrice ?? payload.price ?? context.currentState?.currentPrice ?? 0);
        const bidCount = Number(payload.bidCount ?? context.currentState?.bidCount ?? context.activeLot?.bidCount ?? 0);
        if (countdownExtensionTimerRef.current) window.clearTimeout(countdownExtensionTimerRef.current);
        setCountdownExtensionPulse(undefined);
        clearCountdownAmbientPulse();
        clearCountdownAmbientEndEffect();
        if (closingAuctionId && context.activeLot?.auctionId === closingAuctionId) {
          pushAuctionAtmosphereAlert(isCurrentUserWinner ? 'won' : 'closed', {
            auctionId: closingAuctionId,
            lot: context.activeLot,
            price: finalPrice,
            winnerName: isCurrentUserWinner ? undefined : winnerName,
            bidCount: isCurrentUserWinner ? undefined : bidCount
          });
        }
        const visibleCard = floatingAuctionCardRef.current;
        if (
          context.activeLot &&
          context.currentState &&
          visibleCard?.auctionId === closingAuctionId &&
          visibleCard.mode === 'running' &&
          visibleCard.phase !== 'leaving' &&
          !context.hasBlockingLiveSheet &&
          context.activeLot.auctionId === closingAuctionId
        ) {
          const closedAtMs = parseRealtimeTimestampMs(payload.closedAt, Date.now());
          pendingFloatingAuctionCardRef.current = undefined;
          setFloatingAuctionCard({
            auctionId: closingAuctionId,
            lot: context.activeLot,
            state: {
              ...context.currentState,
              auctionId: closingAuctionId,
              status: String(payload.status ?? 'CLOSED_WON') as AuctionState['status'],
              currentPrice: realtimeNumber(payload.price, context.currentState.currentPrice ?? 0),
              leaderBidderId: payload.winnerId === undefined ? context.currentState.leaderBidderId : String(payload.winnerId),
              endTsMs: closedAtMs,
              serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
            },
            ranking: context.ranking,
            enrolled: context.enrolledAuctions.has(closingAuctionId),
            mode: 'ended',
            phase: 'holding',
            retireAtMs: closedAtMs + AUCTION_ENDED_HOLD_MS
          });
        }
        void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
        void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
        void queryClient.invalidateQueries({ queryKey: ['live-room-stats', roomId] });
        void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['my-auction-records'] });
        if (closingAuctionId) {
          void queryClient.invalidateQueries({ queryKey: ['result-order', closingAuctionId] });
          void queryClient.invalidateQueries({ queryKey: ['auction-ranking', closingAuctionId] });
        }
      }
      if (isLiveSessionLotListChangedMessage(message) && realtimeLiveSessionMessageMatchesRoom(message, latestContext.current.room)) {
        const payload = message.payload && typeof message.payload === 'object' ? (message.payload as Record<string, unknown>) : undefined;
        const auctionId = payload?.auctionId === undefined ? '' : String(payload.auctionId);
        const action = String(payload?.action ?? '').trim();
        const isCancelledLot = auctionId && message.type === 'live_session.lot_changed' && action === 'cancelled';
        if (auctionId && (message.type === 'live_session.lot_unmounted' || isCancelledLot)) {
          if (countdownExtensionTimerRef.current) window.clearTimeout(countdownExtensionTimerRef.current);
          setCountdownExtensionPulse(undefined);
          clearCountdownAmbientPulse();
          clearCountdownAmbientEndEffect();
          setRuntimeStartedAuctionId((current) => (current === auctionId ? undefined : current));
          setHiddenAuctionCardId((current) => (current === auctionId ? undefined : current));
          lastRankingBidRef.current = undefined;
          clearDelayedRankingSnapshot();
          rankingRef.current = [];
          setRankingAnimationSource('snapshot');
          setRanking([]);
          if (pendingFloatingAuctionCardRef.current?.auctionId === auctionId) {
            pendingFloatingAuctionCardRef.current = undefined;
          }
          setFloatingAuctionCard((current) => (current?.auctionId === auctionId ? undefined : current));
          setLotStates((prev) => {
            const next = { ...prev };
            if (isCancelledLot) {
              const lot = latestContext.current.lots.find((item) => item.auctionId === auctionId);
              const previous = prev[auctionId] ?? (lot ? stateFromLot(lot) : fallbackAuctionState(auctionId));
              next[auctionId] = {
                ...previous,
                auctionId,
                status: 'READY',
                currentPrice: lot?.startPrice ?? previous.currentPrice ?? 0,
                leaderBidderId: undefined,
                endTsMs: lot?.endTsMs ?? previous.endTsMs ?? Date.now(),
                serverTsMs: Date.now()
              };
            } else {
              if (!(auctionId in prev)) return prev;
              delete next[auctionId];
            }
            return next;
          });
        }
        void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
        void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
        void queryClient.invalidateQueries({ queryKey: ['live-room-stats', roomId] });
      }
      if (message.type === 'ai.assistant.switch') {
        const enabled = realtimeAIAssistantSwitchEnabled(message.payload);
        if (enabled !== undefined) {
          queryClient.setQueryData<LiveRoom>(['live-room', roomId], (current) =>
            liveRoomWithAIAssistantSwitch(current ?? latestContext.current.room, message.payload, enabled)
          );
          void queryClient.invalidateQueries({ queryKey: ['live-room', roomId] });
        }
      }
      if (message.type === 'live.voice_broadcast') {
        const voicePayload = realtimeLiveVoiceBroadcastAudioPayload(message.payload);
        const messageSummary = liveVoiceMessageDebugSummary(message, latestContext.current.room, voicePayload);
        console.info('[live.voice_broadcast] received', messageSummary);
        if (!realtimeLiveVoiceMatchesRoom(message, latestContext.current.room)) {
          console.warn('[live.voice_broadcast] ignored: liveSessionId mismatch', messageSummary);
        } else if (latestContext.current.room.videoSource !== 'digitalHuman') {
          console.info('[live.voice_broadcast] ignored: current room is not digital-human live', messageSummary);
          stopLiveVoiceBroadcastPlayback();
        } else if (!voicePayload) {
          console.warn('[live.voice_broadcast] ignored: missing or invalid audioBase64 payload', messageSummary);
        } else {
          playLiveVoiceBroadcast(voicePayload);
        }
      }
      handleRealtimeMessage(message, {
        activeAuctionId: latestContext.current.activeLot?.auctionId,
        activeAuctionState: latestContext.current.currentState,
        userId,
        userNickname,
        userAvatarUrl,
        setLiveStats,
        setLotStates,
        setNotice: pushNotice,
        applyRankingUpdate,
        getCurrentRanking: () => rankingRef.current,
        getLastRankingBid: () => lastRankingBidRef.current,
        setRankingAnimationSource,
        onChatAck: acknowledgeChatMessage,
        onChatMessage: appendChatMessage,
        onChatError: failChatMessage,
        onBidAck: handleBidAck,
        onBidAccepted: handleBidAcceptedFeedback,
        onBidRejected: handleBidRejectedFeedback,
        onBidResult: handleBidResult,
        onSnapshotRequired: () => {
          void refetchAuctionStateRef.current();
          const activeAuctionId = latestContext.current.activeLot?.auctionId;
          if (activeAuctionId) void queryClient.invalidateQueries({ queryKey: ['auction-ranking', activeAuctionId] });
        }
      });
    };
    const consumeDelayedRankingSnapshot = () => {
      delayedRankingSnapshotTimerRef.current = undefined;
      const delayedMessage = delayedRankingSnapshotMessageRef.current;
      delayedRankingSnapshotMessageRef.current = undefined;
      rankingSnapshotDelayUntilRef.current = 0;
      if (!delayedMessage) return;
      if (
        !shouldConsumeDelayedRankingUpdatedMessage(
          delayedMessage,
          latestContext.current.activeLot?.auctionId,
          rankingRef.current,
          userId,
          userNickname,
          userAvatarUrl
        )
      ) {
        return;
      }
      consumeRealtimeMessage(delayedMessage);
    };
    const scheduleDelayedRankingSnapshot = (message: RealtimeMessage, delayMs: number) => {
      delayedRankingSnapshotMessageRef.current = message;
      if (delayedRankingSnapshotTimerRef.current) window.clearTimeout(delayedRankingSnapshotTimerRef.current);
      delayedRankingSnapshotTimerRef.current = window.setTimeout(consumeDelayedRankingSnapshot, delayMs);
    };
    const handleMessage = (message: RealtimeMessage) => {
      if (message.type === 'time.sync.result') {
        syncServerTimeOffset(message);
        return;
      }
      if (
        message.type === 'ranking.updated' &&
        !shouldConsumeRankingUpdatedMessage(message, latestContext.current.activeLot?.auctionId, rankingRef.current, userId, userNickname, userAvatarUrl)
      ) {
        return;
      }
      if (!isFreshRealtimeMessageByDomain(message, realtimeSeqCursorRef.current)) return;
      realtimeSeqCursorRef.current = nextRealtimeSeqByDomain(message, realtimeSeqCursorRef.current);
      lastSeqRef.current = realtimeSeqCursorRef.current.bid ?? lastSeqRef.current;
      syncServerTimeOffset(message);
      const rankingDelayMs = message.type === 'ranking.updated' ? rankingSnapshotDelayUntilRef.current - Date.now() : 0;
      if (rankingDelayMs > 0) {
        scheduleDelayedRankingSnapshot(message, rankingDelayMs);
        return;
      }
      consumeRealtimeMessage(message);
    };
    const controlClient =
      (isTestMode || import.meta.env.VITE_REALTIME_MODE !== 'websocket') && import.meta.env.VITE_MOCK_CONTROL_URL
        ? new MockRealtimeControlClient({ url: import.meta.env.VITE_MOCK_CONTROL_URL, roomId })
        : undefined;
    if (!client && !controlClient) return undefined;
    const unsubscribe = client?.onMessage(handleMessage);
    const unsubscribeControl = controlClient?.onMessage(handleMessage);
    client?.connect();
    controlClient?.connect();
    client?.send({ type: 'room.subscribe', requestId: makeRequestId('room'), payload: { auctionId: context.activeLot?.auctionId } });
    timeSyncInFlightRef.current = undefined;
    const sendTimeSyncRequest = () => {
      if (!client) return;
      const currentInFlight = timeSyncInFlightRef.current;
      if (currentInFlight && Date.now() - currentInFlight.clientSendTimeMs < 1_500) return;
      const seq = timeSyncSeqRef.current + 1;
      timeSyncSeqRef.current = seq;
      const clientSendTimeMs = Date.now();
      const requestId = makeRequestId(`time_${seq}`);
      const sent = client.send({
        type: 'time.sync',
        requestId,
        payload: {
          requestId,
          clientSendTimeMs,
          clientTimeMs: clientSendTimeMs
        }
      });
      if (sent) timeSyncInFlightRef.current = { requestId, clientSendTimeMs, seq };
    };
    sendTimeSyncRequest();
    const timeSyncTimer = client ? window.setInterval(sendTimeSyncRequest, 500) : undefined;
    return () => {
      unsubscribe?.();
      unsubscribeControl?.();
      clearDelayedRankingSnapshot();
      if (timeSyncTimer !== undefined) window.clearInterval(timeSyncTimer);
      timeSyncInFlightRef.current = undefined;
      controlClient?.disconnect();
      client?.disconnect();
    };
  }, [accessToken, acknowledgeChatMessage, activeLot?.auctionId, appendChatMessage, applyRankingUpdate, clearCountdownAmbientEndEffect, clearCountdownAmbientPulse, clearDelayedRankingSnapshot, failChatMessage, handleBidAcceptedFeedback, handleBidAck, handleBidRejectedFeedback, handleBidResult, playLiveVoiceBroadcast, pushAuctionAtmosphereAlert, pushNotice, queryClient, requestFloatingAuctionCard, roomId, stopLiveVoiceBroadcastPlayback, syncServerTimeOffset, triggerCountdownAmbientPulse, userAvatarUrl, userId, userNickname]);

  const enrollMutation = useMutation({
    mutationFn: (auctionId: string) => apiClient.enrollAuction(auctionId),
    onSuccess: (result: EnrollResult) => {
      const auctionId = result.auctionId;
      const participantCount = finiteOptionalParticipantCount(result.participantCount);
      setEnrolledAuctions((prev) => {
        if (prev.has(auctionId)) return prev;
        const next = new Set(prev);
        next.add(auctionId);
        return next;
      });
      if (participantCount !== undefined) {
        setLotStates((prev) => {
          const context = latestContext.current;
          const lot = context.lots.find((item) => item.auctionId === auctionId);
          const previous =
            prev[auctionId] ??
            (context.activeLot?.auctionId === auctionId ? context.currentState : undefined) ??
            (lot ? stateFromLot(lot) : fallbackAuctionState(auctionId));
          return {
            ...prev,
            [auctionId]: {
              ...previous,
              auctionId,
              participantCount
            }
          };
        });
        queryClient.setQueryData<PageResult<LiveRoomLot>>(['live-room-lots', roomId], (current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((lot) =>
              lot.auctionId === auctionId
                ? { ...lot, participantCount }
                : lot
            )
          };
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['auction-state', auctionId] });
      void queryClient.invalidateQueries({ queryKey: ['live-room-lots', roomId] });
      void queryClient.invalidateQueries({ queryKey: ['live-room-stats', roomId] });
      void myAuctionRecordsQuery.refetch();
      pushNotice(t('auction.enrolled'));
    }
  });

  const submitBid = (lot: LiveRoomLot, state: AuctionState, price: number) => {
    if (state.status === 'HAMMER_PENDING') {
      // Hammer-pending is terminal for new bids; stop before sending another request.
      const message = t('auction.bidRejectedHammerPending');
      setQuickBidFeedback({ status: 'error', message });
      pushNotice(message);
      return;
    }
    const rule = bidRuleFromLot(lot, state);
    const minBidIntervalMs = getMinBidIntervalMs(rule);
    const validation = validateBidPrice(price, rule);
    if (!validation.valid) {
      setQuickBidFeedback({ status: 'error', message: formatBidValidationNotice(validation) });
      return;
    }
    if (pendingBidAuctionIdsRef.current.has(lot.auctionId)) {
      showQuickBidIntervalNotice(lot.auctionId, minBidIntervalMs);
      return;
    }
    const intervalRemainingMs = getQuickBidIntervalRemainingMs(lastBidAtByAuctionRef.current[lot.auctionId], Date.now(), minBidIntervalMs);
    if (intervalRemainingMs > 0) {
      showQuickBidIntervalNotice(lot.auctionId, intervalRemainingMs);
      return;
    }
    const requestId = makeRequestId('bid');
    lockQuickBidSubmission(lot.auctionId, requestId);
    setQuickBidFeedback({ status: 'submitting', requestId, message: t('auction.bidSubmitted') });
    const sent = realtimeRef.current?.send({
      type: 'bid.place',
      requestId,
      payload: buildBidPlacePayload({
        auctionId: lot.auctionId,
        price: validation.price,
        expectedCurrentPrice: state.currentPrice,
      })
    }) ?? false;
    if (!sent) {
      releaseQuickBidSubmission({ auctionId: lot.auctionId, requestId });
      clearQuickBidIntervalNotice(lot.auctionId);
      clearBidConfirmTimer();
      console.warn('[bid.place] send skipped: realtime socket is not ready', { requestId, auctionId: lot.auctionId });
      setQuickBidFeedback({ status: 'error', requestId, message: t('auction.bidRealtimeUnavailable') });
      pushNotice(t('auction.bidRealtimeUnavailable'));
      void refetchAuctionStateRef.current();
      return;
    }
    scheduleBidConfirmTimeout(requestId);
  };

  const openLot = (lot: LiveRoomLot) => {
    setSelectedLotId(lot.id);
    openLiveSheet('detail', lot.id);
  };
  const openLotFromList = (lot: LiveRoomLot) => {
    setSelectedLotId(lot.id);
    openLiveSheet('detail', lot.id, { closeExisting: false });
  };

  const openQuickBid = (lot: LiveRoomLot, options: { variant?: LiveSheetVariant } = {}) => {
    setSelectedLotId(lot.id);
    setQuickBidFeedback({ status: 'idle' });
    clearQuickBidIntervalNotice(lot.auctionId);
    openLiveSheet('quickBid', lot.id, options);
  };

  const openQuickBidFromList = (lot: LiveRoomLot) => {
    openQuickBid(lot, { variant: 'quickBidFast' });
  };

  const toggleFollowMerchant = () => {
    if (!room.merchantId || followMerchantMutation.isPending) return;
    followMerchantMutation.mutate({ merchantId: room.merchantId, followed: isFollowingMerchant });
  };
  const handleLikeRoom = () => {
    likeRoom(room.id);
    setLikeBurstId((value) => value + 1);
    setLikeBurstVisible(true);
    if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current);
    likeBurstTimerRef.current = window.setTimeout(() => setLikeBurstVisible(false), 820);
  };
  const openCommentComposer = () => {
    setCommentsOpen(true);
    setLikeBurstVisible(false);
    if (likeBurstTimerRef.current) window.clearTimeout(likeBurstTimerRef.current);
    setCommentComposerOpen(true);
  };
  const liveLikeCount = (room.likeCount ?? 0) + roomLocalLikeCount;
  const hasLikedRoom = roomLocalLikeCount > 0;
  const merchantFollowerCount = merchant?.followerCount ?? room.merchantFollowerCount;
  const liveShopMetaText = merchantFollowerCount === undefined
    ? t('live.likes', { count: formatCompactNumber(liveLikeCount) })
    : t('live.shopStats', { followers: formatCompactNumber(merchantFollowerCount), likes: formatCompactNumber(liveLikeCount) });
  const showSoundBlockedToast = useCallback(() => {
    Toast.show({ content: t('live.soundBlocked') });
  }, []);
  const handleSoundBlocked = useCallback(() => {
    if (!soundEnabledRef.current) return;
    liveSoundAutoplayBlockedRef.current = true;
    setLiveSoundAutoplayBlocked(true);
    showSoundBlockedToast();
  }, [showSoundBlockedToast]);
  const retryLiveSoundUnlock = useCallback(() => {
    if (!soundEnabledRef.current) return;
    if (liveSoundUnlockInFlightRef.current) return;
    liveSoundUnlockInFlightRef.current = true;
    setSharedSoundEnabled(true);
    const surface = liveVideoSurfaceRef.current;
    const pendingVoicePayloads = pendingLiveVoicePayloadsRef.current;
    const unlockPlayback = surface?.setAudiblePlayback(true) ?? Promise.resolve(true);
    const unlockVoiceAudio = unlockLiveVoiceAudio();
    void Promise.all([unlockPlayback, unlockVoiceAudio]).then(([played, voiceUnlocked]) => {
      liveSoundUnlockInFlightRef.current = false;
      if (!soundEnabledRef.current) return;
      if (played) {
        liveSoundAutoplayBlockedRef.current = false;
        setLiveSoundAutoplayBlocked(false);
        if (pendingVoicePayloads.length) {
          if (voiceUnlocked) {
            liveVoicePermissionPromptVisibleRef.current = false;
            setLiveVoicePermissionPromptVisible(false);
            pendingLiveVoicePayloadsRef.current = [];
            pendingVoicePayloads.forEach((pendingVoicePayload) => playLiveVoiceBroadcast(pendingVoicePayload, { ignoreSoundGate: true }));
          } else {
            liveVoicePermissionPromptVisibleRef.current = true;
            setLiveVoicePermissionPromptVisible(true);
            showSoundBlockedToast();
          }
        } else if (voiceUnlocked) {
          liveVoicePermissionPromptVisibleRef.current = false;
          setLiveVoicePermissionPromptVisible(false);
        }
        return;
      }
      liveSoundAutoplayBlockedRef.current = true;
      setLiveSoundAutoplayBlocked(true);
      showSoundBlockedToast();
    }).catch(() => {
      liveSoundUnlockInFlightRef.current = false;
      if (!soundEnabledRef.current) return;
      liveSoundAutoplayBlockedRef.current = true;
      setLiveSoundAutoplayBlocked(true);
      showSoundBlockedToast();
    });
  }, [playLiveVoiceBroadcast, setSharedSoundEnabled, showSoundBlockedToast, unlockLiveVoiceAudio]);
  const toggleLiveSound = useCallback(() => {
    const surface = liveVideoSurfaceRef.current;
    if (soundEnabled && !liveSoundAutoplayBlocked) {
      liveSoundAutoplayBlockedRef.current = false;
      liveVoicePermissionPromptVisibleRef.current = false;
      setSharedSoundEnabled(false);
      setLiveSoundAutoplayBlocked(false);
      setLiveVoicePermissionPromptVisible(false);
      void surface?.setAudiblePlayback(false);
      stopLiveVoiceBroadcastPlayback();
      return;
    }
    setSharedSoundEnabled(true);
    retryLiveSoundUnlock();
  }, [liveSoundAutoplayBlocked, retryLiveSoundUnlock, setSharedSoundEnabled, soundEnabled, stopLiveVoiceBroadcastPlayback]);

  const handleLiveSoundUnlockGesture = useCallback((event: ReactSyntheticEvent<HTMLElement>) => {
    if (!soundEnabledRef.current || !liveSoundAutoplayBlockedRef.current) return;
    if (isLiveSoundUnlockControlTarget(event.target)) return;
    retryLiveSoundUnlock();
  }, [retryLiveSoundUnlock]);

  const soundControlActive = soundEnabled && !liveSoundAutoplayBlocked;
  const liveSoundUnlockPromptVisible = soundEnabled && (liveSoundAutoplayBlocked || liveVoicePermissionPromptVisible);

  if (room.status === 'ENDED') {
    return <RoomStatePage room={room} lots={lots} status="ended" onBack={onBack} onPay={(auctionId) => onPay('ord_2001', auctionId)} />;
  }

  if (room.status === 'DRAFT' || room.status === 'SCHEDULED') {
    return <RoomStatePage room={room} lots={lots} status="upcoming" onBack={onBack} />;
  }

  return (
    <section className="live-page" onPointerDownCapture={handleLiveSoundUnlockGesture} onKeyDownCapture={handleLiveSoundUnlockGesture}>
      <LiveRoomVideoSurface ref={liveVideoSurfaceRef} room={room} initialMediaPosition={initialMediaPosition} soundEnabled={soundControlActive} onSoundBlocked={handleSoundBlocked} digitalHumanSpeaking={digitalHumanSpeaking} />
      <div className="live-gradient" />
      <header className="live-header">
        <button className="live-back" onClick={onBack} aria-label={t('common.back')} type="button">
          <ArrowLeft size={20} />
        </button>
        <div className="live-shop">
          <img className="live-shop-logo" src={room.coverUrl ?? logoUrl} alt={room.merchantName} />
          <div className="live-shop-copy">
            <strong>{room.merchantName}</strong>
            <span>{liveShopMetaText}</span>
          </div>
          <button className={isFollowingMerchant ? 'live-follow-pill is-followed' : 'live-follow-pill'} type="button" onClick={toggleFollowMerchant} aria-pressed={isFollowingMerchant} disabled={!room.merchantId || followMerchantMutation.isPending}>
            {isFollowingMerchant ? t('live.followed') : `+${t('live.follow')}`}
          </button>
        </div>
        <div className="live-header-right">
          <button
            className={soundControlActive ? 'live-sound-toggle is-on' : 'live-sound-toggle'}
            type="button"
            aria-label={soundControlActive ? t('live.soundDisable') : t('live.soundEnable')}
            aria-pressed={soundControlActive}
            data-live-sound-unlock-control="true"
            onClick={toggleLiveSound}
          >
            {soundControlActive ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <span className="live-watcher-count live-header-watchers" aria-label={t('live.statsOnline', { count: liveStats.onlineCount })}>
            <Users size={12} /> {liveStats.onlineCount}
          </span>
        </div>
      </header>

      {liveSoundUnlockPromptVisible ? (
        <div className="live-voice-permission" role="alert">
          <div className="live-voice-permission-copy">
            <strong>{t('live.voiceAudioBlockedTitle')}</strong>
            <span>{t('live.voiceAudioBlocked')}</span>
          </div>
          <button className="live-voice-permission-button" type="button" data-live-sound-unlock-control="true" onClick={retryLiveSoundUnlock}>
            <Volume2 size={16} />
            <span>{t('live.voiceAudioAllow')}</span>
          </button>
        </div>
      ) : null}

      {activeLot && displayCurrentState ? (
        <LiveRankingRail
          items={ranking}
          userId={userId}
          userNickname={userNickname}
          userAvatarUrl={userAvatarUrl}
          collapsed={rankingCollapsed}
          lastBid={lastRankingBidRef.current}
          animateChanges={rankingAnimationSource === 'bid.accepted'}
          onToggle={() => setRankingCollapsed((value) => !value)}
        />
      ) : null}

      <LiveCommentPanel
        open={commentsOpen}
        messages={chatMessages}
        userId={userId}
        draft={commentDraft}
        composerOpen={commentComposerOpen}
        commentsViewportRef={commentsViewportRef}
        commentsEndRef={commentsEndRef}
        onDraftChange={handleCommentDraftChange}
        onKeyDown={handleCommentKeyDown}
        onScroll={handleCommentScroll}
        onSend={sendComment}
        onLike={handleLikeRoom}
        liked={hasLikedRoom}
        likeBurstId={likeBurstId}
        likeBurstVisible={likeBurstVisible}
        onComposerOpen={openCommentComposer}
        onComposerClose={() => setCommentComposerOpen(false)}
        onToggle={() => setCommentsOpen((value) => !value)}
        onOpenList={() => openLiveSheet('lotList')}
      />

      {floatingAuctionCard && !liveSheetOpen ? (
        <AuctionFloatingCard
          lot={floatingAuctionCard.lot}
          state={floatingAuctionCard.state}
          ranking={floatingAuctionCard.ranking}
          enrolled={floatingAuctionCard.enrolled}
          phase={floatingAuctionCard.phase}
          onOpenLot={() => openLot(floatingAuctionCard.lot)}
          onQuickBid={() => openQuickBid(floatingAuctionCard.lot)}
          onDismiss={() => dismissFloatingAuctionCard(floatingAuctionCard.auctionId)}
          remainMs={floatingAuctionCard.mode === 'ended' ? 0 : countdownRemainMs(floatingAuctionCard.state.endTsMs, now, serverTimeOffsetMs)}
          ended={floatingAuctionCard.mode === 'ended'}
        />
      ) : null}

      {liveSheets.map((sheet, index) => {
        const zIndex = LIVE_SHEET_Z_INDEX_BASE + index;
        const accessibilityHidden = sheet.phase === 'closing' && liveSheets.some((otherSheet, otherIndex) => otherIndex > index && otherSheet.phase !== 'closing');
        if (sheet.type === 'lotList') {
          return (
            <LotListSheet
              key={sheet.id}
              phase={sheet.phase}
              zIndex={zIndex}
              accessibilityHidden={accessibilityHidden}
              lots={lots}
              states={displayLotStates}
              activeAuctionId={activeLot?.auctionId}
              enrolledAuctionIds={enrolledAuctions}
              ordersByAuctionId={orderByAuctionId}
              userId={userId}
              onClose={() => closeLiveSheet(sheet.id)}
              onOpenLot={openLotFromList}
              onQuickBid={openQuickBidFromList}
              onPay={(order, lot) => onPay(order.id, lot.auctionId)}
              onOpenOrder={(order) => onOpenOrder(order.id, orderTabFromOrder(order))}
            />
          );
        }

        const sheetLot = sheet.lotId ? lots.find((lot) => lot.id === sheet.lotId) : selectedLot;
        if (!sheetLot) return null;
        const sheetState = stateForLot(sheetLot);
        if (!sheetState) return null;

        if (sheet.type === 'detail') {
          return (
            <LotDetailSheet
              key={sheet.id}
              phase={sheet.phase}
              zIndex={zIndex}
              accessibilityHidden={accessibilityHidden}
              lot={sheetLot}
              state={sheetState}
              ranking={ranking}
              enrolled={enrolledAuctions.has(sheetLot.auctionId)}
              enrolling={enrollMutation.isPending}
              order={orderByAuctionId.get(sheetLot.auctionId)}
              orderLoading={myAuctionRecordsQuery.isLoading || myOrdersQuery.isLoading}
              userId={userId}
              onClose={() => closeLiveSheet(sheet.id)}
              onEnroll={() => enrollMutation.mutate(sheetLot.auctionId)}
              onBid={() => openQuickBid(sheetLot)}
              onPay={(order) => onPay(order.id, sheetLot.auctionId)}
              onOpenOrder={(order) => onOpenOrder(order.id, orderTabFromOrder(order))}
            />
          );
        }

        return (
            <BidSheet
              key={sheet.id}
              variant={sheet.variant}
              phase={sheet.phase}
              zIndex={zIndex}
            accessibilityHidden={accessibilityHidden}
            lot={sheetLot}
            state={sheetState}
            ranking={ranking}
            feedback={quickBidFeedback}
            lastBidAtMs={lastBidAtByAuction[sheetLot.auctionId]}
            intervalNoticeUntilMs={quickBidIntervalNoticeUntilByAuction[sheetLot.auctionId]}
            nowMs={now}
            serverTimeOffsetMs={serverTimeOffsetMs}
            countdownExtensionPulse={countdownExtensionPulse?.auctionId === sheetLot.auctionId ? countdownExtensionPulse : undefined}
            userId={userId}
            onClose={() => closeLiveSheet(sheet.id)}
            onSubmit={(price) => submitBid(sheetLot, sheetState, price)}
          />
        );
      })}
      <LiveCountdownAmbientLayer state={countdownAmbientState} />
      <LiveAuctionAlertLayer
        alerts={visibleAuctionAlerts}
        lots={lots}
        ordersByAuctionId={orderByAuctionId}
        onDismiss={dismissAuctionAlert}
        onPay={(order, auctionId) => onPay(order.id, auctionId)}
      />
    </section>
  );
}

type LiveRoomVideoSurfaceHandle = {
  setAudiblePlayback: (enabled: boolean) => Promise<boolean>;
};

type LiveRoomVideoSurfaceProps = {
  room: LiveRoom;
  initialMediaPosition?: PreviewMediaSnapshot;
  soundEnabled: boolean;
  onSoundBlocked: () => void;
  digitalHumanSpeaking?: boolean;
};

const LiveRoomVideoSurface = forwardRef<LiveRoomVideoSurfaceHandle, LiveRoomVideoSurfaceProps>(function LiveRoomVideoSurface({
  room,
  initialMediaPosition,
  soundEnabled,
  onSoundBlocked,
  digitalHumanSpeaking
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { applyInitialPosition, resetAppliedInitialPosition } = usePreviewMediaRestore(initialMediaPosition);
  const recordedVideoUrl = room.videoSource === 'recorded' ? discoverPreviewVideoUrl(room) : undefined;
  const setAudiblePlayback = useCallback(async (enabled: boolean) => {
    const video = videoRef.current;
    if (!video) return true;
    if (!enabled) {
      forceMutedVideo(video);
      void playVideo(video);
      return true;
    }
    enableAudibleVideo(video);
    const played = await playVideo(video);
    if (!played) {
      forceMutedVideo(video);
      void playVideo(video);
    }
    return played;
  }, []);

  useImperativeHandle(ref, () => ({ setAudiblePlayback }), [setAudiblePlayback]);

  const rememberRecordedVideoPosition = useCallback(() => {
    const snapshot = buildPreviewMediaSnapshot(room, videoRef.current);
    if (snapshot) rememberPreviewMediaSnapshot(snapshot);
  }, [room]);

  const syncRecordedVideoPosition = useCallback(() => {
    const video = videoRef.current;
    if (soundEnabled) {
      enableAudibleVideo(video);
    } else {
      forceMutedVideo(video);
    }
    applyInitialPosition(video);
    void playVideo(video).then((played) => {
      if (played || !soundEnabled) return;
      forceMutedVideo(video);
      void playVideo(video);
      onSoundBlocked();
    });
  }, [applyInitialPosition, onSoundBlocked, soundEnabled]);

  useEffect(() => () => {
    rememberRecordedVideoPosition();
  }, [rememberRecordedVideoPosition]);

  useEffect(() => {
    resetAppliedInitialPosition();
  }, [recordedVideoUrl, resetAppliedInitialPosition, room.id]);

  useEffect(() => {
    if (room.videoSource !== 'recorded') return;
    syncRecordedVideoPosition();
  }, [room.videoSource, recordedVideoUrl, soundEnabled, syncRecordedVideoPosition]);

  if (room.videoSource === 'recorded' && recordedVideoUrl) {
    return (
      <video
        ref={videoRef}
        className="live-video"
        data-testid="live-room-video"
        src={recordedVideoUrl}
        poster={room.coverUrl}
        muted={!soundEnabled}
        autoPlay
        loop
        {...mobileInlineVideoAttributes}
        onLoadedMetadata={syncRecordedVideoPosition}
        onCanPlay={syncRecordedVideoPosition}
        onTimeUpdate={rememberRecordedVideoPosition}
        onPause={rememberRecordedVideoPosition}
      />
    );
  }

  if (room.videoSource === 'digitalHuman' && room.digitalHuman) {
    return (
      <DigitalHumanLiveStage
        room={room}
        idleVideoUrl={room.digitalHuman.idleVideoUrl}
        talkVideoUrl={room.digitalHuman.speakingVideoUrl}
        initialMediaPosition={initialMediaPosition}
        speaking={Boolean(digitalHumanSpeaking)}
      />
    );
  }

  return (
    <div className="live-video-config-error" data-testid="live-video-config-error">
      <VideoOffIcon />
      <span>{t('live.videoConfigMissing')}</span>
    </div>
  );
});

function VideoOffIcon() {
  return <VideoOff size={28} />;
}

function LiveCommentPanel({
  open,
  messages,
  userId,
  draft,
  composerOpen,
  commentsViewportRef,
  commentsEndRef,
  onDraftChange,
  onKeyDown,
  onScroll,
  onSend,
  onLike,
  liked,
  likeBurstId,
  likeBurstVisible,
  onComposerOpen,
  onComposerClose,
  onToggle,
  onOpenList
}: {
  open: boolean;
  messages: LiveChatMessage[];
  userId: string;
  draft: string;
  composerOpen: boolean;
  commentsViewportRef: RefObject<HTMLDivElement>;
  commentsEndRef: RefObject<HTMLDivElement>;
  onDraftChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onScroll: () => void;
  onSend: () => void;
  onLike: () => void;
  liked: boolean;
  likeBurstId: number;
  likeBurstVisible: boolean;
  onComposerOpen: () => void;
  onComposerClose: () => void;
  onToggle: () => void;
  onOpenList: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const syncTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 118)}px`;
  }, []);

  useLayoutEffect(() => {
    if (!composerOpen) return;
    syncTextareaHeight();
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [composerOpen, draft, syncTextareaHeight]);

  return (
    <section className={joinClassNames('live-comment-panel', !open && 'is-collapsed', composerOpen && 'is-composing')} aria-label={t('live.commentPanel')}>
      {open ? (
        <>
          <div className="live-comment-list" ref={commentsViewportRef} onScroll={onScroll} aria-label={t('live.commentList')}>
            {messages.map((message) => (
              <div className={message.system ? 'live-comment-item is-system' : 'live-comment-item'} key={`${message.id}-${message.clientMessageId ?? ''}`}>
                <strong>{message.system ? t('live.commentSystem') : message.userId === userId ? t('live.commentMe') : message.nickname}</strong>
                <span>{message.content}</span>
                {message.pending ? <small>{t('live.commentSending')}</small> : null}
                {message.failed ? <small>{t('live.commentFailed')}</small> : null}
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </>
      ) : null}
      {composerOpen ? (
        <>
          <button className="live-comment-compose-dismiss" type="button" onClick={onComposerClose} aria-label={t('live.commentCloseComposer')} />
          <div className="live-comment-composer">
            <textarea
              ref={textareaRef}
              aria-label={t('live.commentInput')}
              placeholder={t('live.commentPlaceholder')}
              value={draft}
              maxLength={240}
              rows={1}
              onChange={(event) => {
                onDraftChange(event.currentTarget.value);
                syncTextareaHeight();
              }}
              onKeyDown={onKeyDown}
            />
            <button className="comment-composer-send-button" type="button" onClick={onSend} disabled={!draft.trim()} aria-label={t('live.commentSend')}>
              {t('live.commentSend')}
            </button>
          </div>
        </>
      ) : (
      <div className={open ? 'live-comment-input-row' : 'live-comment-input-row is-collapsed'}>
        <button className={open ? 'comment-toggle-button' : 'comment-toggle-button is-floating'} type="button" onClick={onToggle} aria-label={open ? t('live.commentHide') : t('live.commentShow')}>
          <img src={open ? closeCommentIconUrl : commentIconUrl} alt="" aria-hidden="true" />
        </button>
        {open ? (
          <button className="comment-input-trigger" type="button" onClick={onComposerOpen} aria-label={t('live.commentInput')}>
            <span>{draft.trim() || t('live.commentPlaceholder')}</span>
          </button>
        ) : null}
        <button className={joinClassNames('comment-like-button', liked && 'is-liked')} type="button" onClick={onLike} aria-label={liked ? t('live.likedRoom') : t('live.likeRoom')} aria-pressed={liked}>
          <img src={likeIconUrl} alt="" aria-hidden="true" />
          {likeBurstVisible ? (
            <span className="comment-like-burst" key={likeBurstId} aria-hidden="true">
              {likeBurstParticles.map((particle) => (
                <span key={particle} />
              ))}
            </span>
          ) : null}
        </button>
        <button className="comment-list-button" type="button" onClick={onOpenList} aria-label={t('live.goodsEntry')}>
          <ShoppingBag size={16} />
          <span>{t('live.goodsEntry')}</span>
        </button>
      </div>
      )}
    </section>
  );
}

function rankingSnapshotItemsEqual(previousItems: RankingItem[], nextItems: RankingItem[]): boolean {
  const previousSorted = sortRankingItems(previousItems);
  const nextSorted = sortRankingItems(nextItems);
  if (previousSorted.length !== nextSorted.length) return false;
  return previousSorted.every((previousItem, index) => {
    const nextItem = nextSorted[index];
    return (
      nextItem &&
      previousItem.rank === nextItem.rank &&
      previousItem.bidderId === nextItem.bidderId &&
      previousItem.price === nextItem.price &&
      previousItem.nicknameMask === nextItem.nicknameMask &&
      previousItem.avatarUrl === nextItem.avatarUrl
    );
  });
}

function normalizeRankingUpdatedMessage(message: RealtimeMessage, activeAuctionId: string | undefined, userId: string, userNickname?: string, userAvatarUrl?: string): RankingItem[] | undefined {
  const payload = realtimePayloadRecord(message.payload);
  const auctionId = String(payload.auctionId ?? '').trim();
  if (activeAuctionId && auctionId && auctionId !== activeAuctionId) return undefined;
  return normalizeRealtimeRankingItems(extractRealtimeRankingItems(payload), userId, userNickname, userAvatarUrl);
}

function shouldConsumeRankingUpdatedMessage(message: RealtimeMessage, activeAuctionId: string | undefined, currentItems: RankingItem[], userId: string, userNickname?: string, userAvatarUrl?: string): boolean {
  const nextRanking = normalizeRankingUpdatedMessage(message, activeAuctionId, userId, userNickname, userAvatarUrl);
  return Boolean(nextRanking && !rankingSnapshotItemsEqual(currentItems, nextRanking));
}

function shouldConsumeDelayedRankingUpdatedMessage(message: RealtimeMessage, activeAuctionId: string | undefined, currentItems: RankingItem[], userId: string, userNickname?: string, userAvatarUrl?: string): boolean {
  const nextRanking = normalizeRankingUpdatedMessage(message, activeAuctionId, userId, userNickname, userAvatarUrl);
  return Boolean(nextRanking && shouldApplyRankingSnapshot(currentItems, nextRanking));
}

function rankingSnapshotMatchesBidHint(snapshotItems: RankingItem[], bid?: RankingBidHint): boolean {
  if (!bid || !snapshotItems.length) return false;
  const leader = sortRankingItems(snapshotItems)[0];
  return leader?.bidderId === bid.bidderId && leader.price === bid.price;
}

function shouldApplyRankingSnapshot(currentItems: RankingItem[], snapshotItems: RankingItem[]): boolean {
  if (rankingSnapshotItemsEqual(currentItems, snapshotItems)) return false;
  if (!currentItems.length) return true;
  if (!snapshotItems.length) return false;
  return Math.max(...snapshotItems.map((item) => item.price)) >= Math.max(...currentItems.map((item) => item.price));
}

function initialLiveChatMessages(roomId: string): LiveChatMessage[] {
  return [createSystemChatMessage(roomId, t('live.commentWelcome'))];
}

function createSystemChatMessage(roomId: string, content: string): LiveChatMessage {
  return {
    id: makeRequestId('system-chat'),
    roomId,
    nickname: t('live.commentSystem'),
    content,
    createdAt: new Date().toISOString(),
    system: true
  };
}

function normalizeLiveChatMessage(message: LiveChatMessage): LiveChatMessage {
  if (message.system) return message;
  const raw = message as LiveChatMessage & Record<string, unknown>;
  const nestedUser = raw.user && typeof raw.user === 'object' ? (raw.user as Record<string, unknown>) : {};
  const userId = firstNonEmptyString(raw.userId, raw.user_id, raw.senderId, raw.sender_id, nestedUser.id);
  const explicitNickname = firstNonEmptyString(
    raw.userNickname,
    raw.user_nickname,
    raw.userNickName,
    raw.user_nick_name,
    raw.senderNickname,
    raw.sender_nickname,
    raw.senderNickName,
    raw.sender_nick_name,
    raw.nickName,
    raw.nick_name,
    nestedUser.nickname,
    nestedUser.nickName,
    nestedUser.name
  );
  const rawNickname = firstNonEmptyString(raw.nickname, raw.name);
  const nickname = explicitNickname ?? (rawNickname && rawNickname !== userId ? rawNickname : undefined) ?? (userId ? rankingBidderFallbackName(userId) : t('common.demoUser'));
  return {
    ...message,
    userId: userId ?? message.userId,
    nickname
  };
}

function upsertChatMessage(messages: LiveChatMessage[], message: LiveChatMessage): LiveChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id || (message.clientMessageId && item.clientMessageId === message.clientMessageId));
  if (index < 0) return [...messages, message];
  return messages.map((item, currentIndex) => (currentIndex === index ? { ...item, ...message, pending: false, failed: false } : item));
}

function RoomStatePage({ room, lots, status, onBack, onPay }: { room: LiveRoom; lots: LiveRoomLot[]; status: 'ended' | 'upcoming'; onBack: () => void; onPay?: (auctionId: string) => void }) {
  const soldLots = lots.filter((lot) => lot.status === 'CLOSED_WON' || lot.status === 'SETTLED' || lot.status === 'HAMMER_PENDING');
  const gmv = soldLots.reduce((sum, lot) => sum + (lot.finalPrice ?? lot.currentPrice), 0);
  const visibleLots = status === 'ended' ? lots : lots.filter((lot) => lot.status === 'READY' || lot.status === 'WARMING_UP');
  return (
    <section className="room-state-page">
      <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
        <ArrowLeft size={18} />
      </button>
      <div className="room-state-hero">
        <Radio size={38} />
        <p>{room.merchantName}</p>
        <h1>{room.title}</h1>
        <span>{status === 'ended' ? t('live.endedTitle') : t('live.upcomingTitle')}</span>
      </div>
      <div className="price-grid compact">
        <Metric label={t('live.lotCount', { count: lots.length })} value={String(lots.length)} icon={<Package size={16} />} />
        <Metric label={t('live.dealTotal')} value={formatMoney(gmv)} icon={<Trophy size={16} />} />
      </div>
      <SectionTitle eyebrow={status === 'ended' ? t('live.endedSummary') : t('live.upcomingSummary')} title={room.title} />
      <div className="result-list">
        {visibleLots.map((lot) => {
          const state = stateFromLot(lot);
          return (
            <article className="search-result-card lot-result-card" key={lot.id}>
              <button className="result-media" type="button">
                <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="gold" />
              </button>
              <div>
                <span className="status-badge">{lotStatusLabel(state.status)}</span>
                <h3>{lot.title}</h3>
                <p>{lot.subtitle}</p>
                <div className="lot-price-line">
                  <span>{priceLabel(lot, state)}</span>
                  <strong>{formatMoney(priceValue(lot, state))}</strong>
                </div>
                {scheduledStartText(lot, state) ? <div className="lot-schedule-line">{scheduledStartText(lot, state)}</div> : null}
              </div>
              {status === 'ended' && state.status === 'CLOSED_WON' && onPay ? (
                <Button size="small" color="primary" onClick={() => onPay(lot.auctionId)}>
                  {t('auction.pay')}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface RealtimeHandlerOptions {
  activeAuctionId?: string;
  activeAuctionState?: AuctionState;
  userId: string;
  userNickname?: string;
  userAvatarUrl?: string;
  setLiveStats: (updater: (prev: LiveRoomStats) => LiveRoomStats) => void;
  setLotStates: (updater: (prev: Record<string, AuctionState>) => Record<string, AuctionState>) => void;
  setNotice: (notice: string) => void;
  applyRankingUpdate: (updater: (current: RankingItem[]) => RankingItem[]) => void;
  getCurrentRanking: () => RankingItem[];
  getLastRankingBid: () => RankingBidHint | undefined;
  setRankingAnimationSource: Dispatch<SetStateAction<RankingAnimationSource>>;
  onChatAck: (payload: Record<string, unknown>) => void;
  onChatMessage: (message: LiveChatMessage) => void;
  onChatError: (payload: Record<string, unknown>) => void;
  onBidAck?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onBidAccepted?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onBidRejected?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onBidResult?: (payload: Record<string, unknown>) => boolean;
  onSnapshotRequired?: () => void;
}

function handleRealtimeMessage(message: RealtimeMessage, options: RealtimeHandlerOptions) {
  if (isLiveStatsRealtimeType(message.type)) {
    const payload = realtimePayloadRecord(message.payload);
    const nextOnlineCount = realtimeOptionalNumber(realtimeOnlineCountValue(payload));
    const nextWatcherCount = realtimeOptionalNumber(realtimeWatcherCountValue(payload));
    if (nextOnlineCount !== undefined || nextWatcherCount !== undefined) {
      options.setLiveStats((prev) => ({
        ...prev,
        onlineCount: nextOnlineCount === undefined ? prev.onlineCount : nextOnlineCount,
        watcherCount: nextWatcherCount === undefined ? prev.watcherCount : nextWatcherCount
      }));
    }
  }
  if (message.type === 'room.snapshot') {
    const payload = realtimePayloadRecord(message.payload);
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    if (auctionId) {
      options.setLotStates((prev) => {
        const previous = prev[auctionId] ?? fallbackAuctionState(auctionId);
        return {
          ...prev,
          [auctionId]: {
            ...previous,
            auctionId,
            status: String(payload.status ?? previous.status) as AuctionState['status'],
            currentPrice: realtimeNumber(payload.currentPrice, previous.currentPrice ?? 0),
            leaderBidderId: payload.leaderBidderId === undefined ? previous.leaderBidderId : String(payload.leaderBidderId),
            bidCount: payload.bidCount === undefined ? previous.bidCount : realtimeNumber(payload.bidCount, previous.bidCount ?? 0),
            participantCount: payload.participantCount === undefined ? previous.participantCount : realtimeNumber(payload.participantCount, previous.participantCount ?? 0),
            endTsMs: parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previous.endTsMs ?? Date.now()),
            serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
          }
        };
      });
    }
  }
  if (message.type === 'auction.state') {
    // auction.state reuses the same write path as other realtime status updates.
    const payload = realtimePayloadRecord(message.payload);
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    if (auctionId) {
      options.setLotStates((prev) => {
        const previous = prev[auctionId] ?? fallbackAuctionState(auctionId);
        const nextStatus = String(payload.status ?? previous.status) as AuctionState['status'];
        return {
          ...prev,
          [auctionId]: {
            ...previous,
            auctionId,
            status: nextStatus,
            currentPrice: realtimeNumber(payload.currentPrice, previous.currentPrice ?? 0),
            leaderBidderId: payload.leaderBidderId === undefined ? previous.leaderBidderId : String(payload.leaderBidderId),
            bidCount: payload.bidCount === undefined ? previous.bidCount : realtimeNumber(payload.bidCount, previous.bidCount ?? 0),
            participantCount: payload.participantCount === undefined ? previous.participantCount : realtimeNumber(payload.participantCount, previous.participantCount ?? 0),
            endTsMs: parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previous.endTsMs ?? Date.now()),
            serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
          }
        };
      });
      if (String(payload.status ?? '').toUpperCase() === 'HAMMER_PENDING') {
        options.setNotice(t('auction.hammerPendingNotice'));
      }
    }
  }
  if (message.type === 'auction.participant_updated') {
    const payload = realtimePayloadRecord(message.payload);
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '').trim();
    const participantCount = realtimeOptionalNumber(payload.participantCount);
    if (auctionId && participantCount !== undefined) {
      options.setLotStates((prev) => {
        const activeState = options.activeAuctionState?.auctionId === auctionId ? options.activeAuctionState : undefined;
        const previous = prev[auctionId] ?? activeState;
        if (!previous) return prev;
        return {
          ...prev,
          [auctionId]: {
            ...previous,
            auctionId,
            participantCount
          }
        };
      });
    }
  }
  if (message.type === 'room.snapshot_required') {
    options.setNotice(t('live.snapshotRequired'));
    options.onSnapshotRequired?.();
  }
  if (message.type === 'bid.ack') {
    const payload = message.payload as Record<string, unknown>;
    const requestId = realtimeMessageRequestId(message, payload);
    const isAsync = String(payload.mode ?? '').toUpperCase() === 'ASYNC';
    if (!isAsync && payload.accepted === true) {
      updateLotStateFromBidPayload(payload, options, false);
    }
    options.onBidAck?.(requestId, payload);
    if (isAsync) {
      // Async acknowledgements surface queueing immediately and only use rejection copy when the server already decided.
      options.setNotice(String(payload.status ?? '').toUpperCase() === 'REJECTED' ? formatBidRejectedMessage(payload) : t('auction.bidArbitrating'));
    } else {
      options.setNotice(payload.accepted === false ? formatBidRejectedMessage(payload) : payload.accepted === true ? t('auction.bidAccepted') : t('auction.bidSubmitted'));
    }
  }
  if (message.type === 'bid.result') {
    const payload = message.payload as Record<string, unknown>;
    // Always run the ack path; duplicate results should not mutate UI twice.
    const isFresh = options.onBidResult?.(payload) ?? true;
    if (isFresh) {
      const finalStatus = String(payload.finalStatus ?? '').toUpperCase();
      if (finalStatus === 'ACCEPTED') {
        updateLotStateFromBidPayload({ ...payload, endTime: realtimeEndTimeValue(payload), serverTime: payload.serverTime ?? payload.serverTimeMs }, options, true);
        options.setRankingAnimationSource('bid.accepted');
        options.applyRankingUpdate((prev) => mergeRealtimeBidIntoRankingItems(prev, { ...payload, bidderId: options.userId }, options.userId, options.activeAuctionId, options.userNickname, options.userAvatarUrl));
        options.setNotice(t('auction.bidAccepted'));
      } else if (finalStatus === 'REJECTED') {
        // Refresh the latest price without forcing a ranking reorder.
        if (payload.currentPrice !== undefined) {
          updateLotStateFromBidPayload({ auctionId: payload.auctionId, currentPrice: payload.currentPrice, leaderBidderId: payload.leaderBidderId, endTime: realtimeEndTimeValue(payload), serverTime: payload.serverTime ?? payload.serverTimeMs }, options, false);
        }
        options.setNotice(formatBidRejectedMessage(payload));
      }
    }
  }
  if (message.type === 'chat.ack') {
    options.onChatAck(message.payload as Record<string, unknown>);
  }
  if (message.type === 'chat.message') {
    options.onChatMessage(message.payload as LiveChatMessage);
  }
  if (message.type === 'chat.error') {
    options.onChatError(message.payload as Record<string, unknown>);
    options.setNotice(t('live.commentFailed'));
  }
  if (message.type === 'bid.rejected') {
    const payload = message.payload as Record<string, unknown>;
    options.onBidRejected?.(realtimeMessageRequestId(message, payload), payload);
    options.setNotice(formatBidRejectedMessage(payload));
  }
  if (isBidAcceptedRealtimeType(message.type)) {
    const payload = message.payload as Record<string, unknown>;
    updateLotStateFromBidPayload(payload, options, true);
    options.setRankingAnimationSource('bid.accepted');
    options.applyRankingUpdate((prev) => mergeRealtimeBidIntoRankingItems(prev, payload, options.userId, options.activeAuctionId, options.userNickname, options.userAvatarUrl));
    options.onBidAccepted?.(realtimeMessageRequestId(message, payload), payload);
    options.setNotice(String(payload.bidderId ?? payload.leaderBidderId) === options.userId ? t('auction.bidAccepted') : t('live.chat.bid'));
  }
  if (message.type === 'ranking.updated') {
    const nextRanking = normalizeRankingUpdatedMessage(message, options.activeAuctionId, options.userId, options.userNickname, options.userAvatarUrl);
    if (!nextRanking) return;
    if (!rankingSnapshotItemsEqual(options.getCurrentRanking(), nextRanking)) {
      options.setRankingAnimationSource(rankingSnapshotMatchesBidHint(nextRanking, options.getLastRankingBid()) ? 'bid.accepted' : 'snapshot');
      options.applyRankingUpdate(() => nextRanking);
    }
  }
  if (message.type === 'timer.extended') {
    const payload = message.payload as Record<string, unknown>;
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    if (!auctionId) return;
    const previousEndTsMs = options.activeAuctionState?.endTsMs ?? Date.now();
    const newEndTsMs = parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previousEndTsMs);
    const extendSeconds = realtimeExtendSeconds(payload, previousEndTsMs, newEndTsMs);
    options.setLotStates((prev) => {
      const previous = prev[auctionId] ?? fallbackAuctionState(auctionId);
      const previousStateEndTsMs = previous.endTsMs ?? previousEndTsMs;
      const nextEndTsMs = parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previousStateEndTsMs);
      return {
        ...prev,
        [auctionId]: {
          ...previous,
          auctionId,
          status: 'EXTENDED',
          endTsMs: nextEndTsMs,
          serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
        }
      };
    });
    options.setNotice(extendSeconds ? t('auctionAlert.extended.subtitleWithDelay', { seconds: extendSeconds }) : t('auctionAlert.extended.subtitle'));
  }
  if (message.type === 'auction.started') {
    const payload = realtimePayloadWithState(message.payload);
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => {
      const previous = prev[auctionId] ?? fallbackAuctionState(auctionId);
      return {
        ...prev,
        [auctionId]: {
          ...previous,
          auctionId,
          status: 'RUNNING',
          currentPrice: realtimeNumber(payload.currentPrice, previous.currentPrice ?? 0),
          leaderBidderId: payload.leaderBidderId === undefined ? previous.leaderBidderId : String(payload.leaderBidderId),
          endTsMs: parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previous.endTsMs ?? Date.now()),
          serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now()),
          bidCount: payload.bidCount === undefined ? previous.bidCount : realtimeNumber(payload.bidCount, previous.bidCount ?? 0),
          participantCount: payload.participantCount === undefined ? previous.participantCount : realtimeNumber(payload.participantCount, previous.participantCount ?? 0)
        }
      };
    });
  }
  if (message.type === 'auction.closed') {
    const payload = realtimePayloadRecord(message.payload);
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => ({
      ...prev,
      [auctionId]: {
        ...(prev[auctionId] ?? fallbackAuctionState(auctionId)),
        auctionId,
        status: String(payload.status ?? 'CLOSED_WON') as AuctionState['status'],
        currentPrice: realtimeNumber(payload.price, prev[auctionId]?.currentPrice ?? 0),
        leaderBidderId: payload.winnerId === undefined ? prev[auctionId]?.leaderBidderId : String(payload.winnerId),
        endTsMs: parseRealtimeTimestampMs(payload.closedAt, Date.now()),
        serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
      }
    }));
    options.setNotice(t('auction.closed'));
  }
}

function AuctionFloatingCard({
  lot,
  state,
  ranking,
  enrolled,
  phase,
  onOpenLot,
  onQuickBid,
  onDismiss,
  remainMs,
  ended = false
}: {
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  phase: FloatingAuctionCardPhase;
  onOpenLot: () => void;
  onQuickBid: () => void;
  onDismiss: () => void;
  remainMs: number;
  ended?: boolean;
}) {
  const leader = state.leaderBidderId ? (ranking[0]?.nicknameMask ?? defaultRanking(state)[0]?.nicknameMask) : undefined;
  const actionText = ended ? t('auction.closed') : enrolled ? t('auction.quickBid') : t('auction.lookAround');
  const className = ['auction-float-card', `is-${phase}`, ended ? 'is-ended' : ''].filter(Boolean).join(' ');
  const countdownPhase = ended ? 'idle' : getCountdownPressurePhase(remainMs, state.status);
  const countdownClassName = ['auction-float-countdown', countdownPhase !== 'idle' ? `is-${countdownPhase}` : ''].filter(Boolean).join(' ');
  return (
    <article className={className}>
      <button
        type="button"
        className="auction-float-dismiss"
        aria-label={t('auction.hideCurrentLot')}
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
      >
        <X size={13} aria-hidden="true" />
      </button>
      <button type="button" className="float-card-main" onClick={ended ? undefined : onOpenLot} aria-label={lot.title} disabled={ended}>
        <div className="auction-float-media">
          <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
        </div>
        <h2>{lot.title}</h2>
        <strong>{formatMoney(priceValue(lot, state))}</strong>
        <p>{leader ?? t('bid.startPriceBidder')}</p>
        <small className={countdownClassName}>{ended ? t('auction.endShort') : formatCountdown(remainMs, { milliseconds: true })}</small>
        <div className="float-card-legacy" aria-hidden="true">
          <span className="status-badge">{lotStatusLabel(state.status)}</span>
          <h2>{lot.title}</h2>
          <p>{priceLabel(lot, state)}</p>
          <strong>{formatMoney(priceValue(lot, state))}</strong>
          <small>
            {t('auction.countdown')} {formatCountdown(remainMs, { milliseconds: true })}
            {leader ? ` \u00B7 ${leader}` : ''}
          </small>
        </div>
      </button>
      <button
        type="button"
        className={enrolled ? 'float-card-action is-quick' : 'float-card-action'}
        disabled={ended}
        onClick={(event) => {
          event.stopPropagation();
          if (ended) return;
          if (enrolled) {
            onQuickBid();
            return;
          }
          onOpenLot();
        }}
      >
        {actionText}
      </button>
    </article>
  );
}

function AnimatedSheetFrame({
  variant,
  phase,
  zIndex,
  accessibilityHidden = false,
  className,
  label,
  showBackdrop = true,
  onClose,
  children
}: {
  variant: LiveSheetVariant;
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  className: string;
  label: string;
  showBackdrop?: boolean;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}) {
  const animation = LIVE_SHEET_ANIMATION_MS[variant];
  const requestClose = useCallback(() => {
    if (phase === 'closing') return;
    onClose();
  }, [onClose, phase]);
  const frameClassName = [showBackdrop ? 'sheet-backdrop' : 'sheet-layer', phase === 'opening' ? 'is-opening' : '', phase === 'closing' ? 'is-closing' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={frameClassName}
      aria-hidden={accessibilityHidden ? true : undefined}
      style={
        {
          '--sheet-enter-duration-ms': `${animation.enter}ms`,
          '--sheet-exit-duration-ms': `${animation.exit}ms`,
          '--sheet-easing': animation.easing,
          zIndex
        } as CSSProperties
      }
      onClick={requestClose}
    >
      <section className={`bottom-sheet ${className}`} role="dialog" aria-label={label} onClick={(event) => event.stopPropagation()}>
        {children(requestClose)}
      </section>
    </div>
  );
}

function LotListSheet({
  phase,
  zIndex,
  accessibilityHidden,
  lots,
  states,
  activeAuctionId,
  enrolledAuctionIds,
  ordersByAuctionId,
  userId,
  onClose,
  onOpenLot,
  onQuickBid,
  onPay,
  onOpenOrder
}: {
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lots: LiveRoomLot[];
  states: Record<string, AuctionState>;
  activeAuctionId?: string;
  enrolledAuctionIds: ReadonlySet<string>;
  ordersByAuctionId: ReadonlyMap<string, Order>;
  userId: string;
  onClose: () => void;
  onOpenLot: (lot: LiveRoomLot) => void;
  onQuickBid: (lot: LiveRoomLot) => void;
  onPay: (order: Order, lot: LiveRoomLot) => void;
  onOpenOrder: (order: Order) => void;
}) {
  const sortedLots = useMemo(() => sortLotListForSheet(lots, states, activeAuctionId), [activeAuctionId, lots, states]);
  return (
    <AnimatedSheetFrame variant="lotList" phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="lot-list-sheet" label={t('live.goodsList')} onClose={onClose}>
      {(requestClose) => (
        <>
        <SheetHeader title={t('live.goodsList')} onClose={requestClose} />
        <div className="lot-list">
          {sortedLots.length ? sortedLots.map(({ lot, state, originalIndex }) => {
            const isActive = isActiveAuctionDisplayStatus(state.status);
            const scheduleText = scheduledStartTimeText(lot, state);
            const listIntro = lot.subtitle?.trim();
            const action = deriveLotListAction({
              state,
              enrolled: enrolledAuctionIds.has(lot.auctionId),
              order: ordersByAuctionId.get(lot.auctionId),
              userId
            });
            const actionClassName = lotListActionClassName(action);
            return (
              <article
                className={lot.auctionId === activeAuctionId && isActive ? 'lot-row is-active' : 'lot-row'}
                role="button"
                tabIndex={0}
                aria-label={lot.title}
                data-original-index={originalIndex + 1}
                data-testid="lot-row"
                key={lot.id}
                onClick={() => onOpenLot(lot)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onOpenLot(lot);
                }}
              >
                <div className="lot-thumb-frame">
                  <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
                  <span className="lot-sequence" aria-label={`#${originalIndex + 1}`}>
                    {originalIndex + 1}
                  </span>
                </div>
                <div>
                  <div className="lot-row-meta">
                    <span className="status-badge">{lotStatusLabel(state.status)}</span>
                    {scheduleText ? <LotListScheduleLine text={scheduleText} /> : null}
                  </div>
                  <h3>{lot.title}</h3>
                  {listIntro ? <p>{listIntro}</p> : null}
                  <div className="lot-price-line">
                    <span>{priceLabel(lot, state)}</span>
                    <strong>{formatMoney(priceValue(lot, state))}</strong>
                  </div>
                </div>
                <Button
                  size="small"
                  color={action.color}
                  fill={action.fill}
                  disabled={action.disabled}
                  className={actionClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (action.disabled) return;
                    if (action.kind === 'quickBid') {
                      onQuickBid(lot);
                      return;
                    }
                    if (action.kind === 'pay' && action.order) {
                      onPay(action.order, lot);
                      return;
                    }
                    if (action.kind === 'order' && action.order) {
                      onOpenOrder(action.order);
                      return;
                    }
                    onOpenLot(lot);
                  }}
                >
                  {t(action.label)}
                </Button>
              </article>
            );
          }) : <EmptyState text={t('live.goodsEmpty')} />}
        </div>
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function LotListScheduleLine({ text }: { text: string }) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const [isHidden, setIsHidden] = useState(false);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const parent = slot?.parentElement;
    if (!slot || !parent) return;

    const statusBadge = parent.querySelector<HTMLElement>('.status-badge');
    let frameId: number | undefined;

    const updateVisibility = () => {
      const parentWidth = parent.clientWidth || parent.getBoundingClientRect().width;
      const statusWidth = statusBadge ? statusBadge.offsetWidth || statusBadge.getBoundingClientRect().width : 0;
      const styles = window.getComputedStyle(parent);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
      const requiredWidth = measureLotScheduleLineWidth(text);

      if (parentWidth <= 0 || requiredWidth <= 0) {
        setIsHidden(false);
        return;
      }

      setIsHidden(requiredWidth > Math.max(0, parentWidth - statusWidth - gap) + 0.5);
    };

    const scheduleUpdate = () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = undefined;
        updateVisibility();
      });
    };

    updateVisibility();

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(parent);
    if (statusBadge) resizeObserver?.observe(statusBadge);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [text]);

  return (
    <span ref={slotRef} className="lot-schedule-slot">
      {isHidden ? null : <span className="lot-schedule-line">{text}</span>}
    </span>
  );
}

function measureLotScheduleLineWidth(text: string): number {
  const measure = document.createElement('span');
  measure.className = 'lot-schedule-line lot-schedule-line-measure';
  measure.textContent = text;
  document.body.appendChild(measure);
  const width = measure.scrollWidth || measure.getBoundingClientRect().width;
  measure.remove();
  return width;
}

function sortLotListForSheet(lots: LiveRoomLot[], states: Record<string, AuctionState>, activeAuctionId?: string): Array<{ lot: LiveRoomLot; state: AuctionState; originalIndex: number }> {
  const indexedLots = lots.map((lot, originalIndex) => ({
    lot,
    state: states[lot.auctionId] ?? stateFromLot(lot),
    originalIndex
  }));
  const activeLot = indexedLots.find((item) => item.lot.auctionId === activeAuctionId && isActiveAuctionDisplayStatus(item.state.status));
  if (!activeLot) return indexedLots;
  return [activeLot, ...indexedLots.filter((item) => item.lot.id !== activeLot.lot.id)];
}

function isRunningAuctionStatus(status: AuctionState['status'] | LiveRoomLot['status']): boolean {
  return status === 'RUNNING' || status === 'EXTENDED';
}

function isActiveAuctionDisplayStatus(status: AuctionState['status'] | LiveRoomLot['status']): boolean {
  return isRunningAuctionStatus(status) || status === 'HAMMER_PENDING';
}

type LotListAction = {
  kind: 'quickBid' | 'pay' | 'order' | 'look' | 'disabled';
  label: MessageKey;
  color: 'primary' | 'danger';
  fill: 'solid' | 'outline';
  disabled?: boolean;
  order?: Order;
};

function lotListActionClassName(action: LotListAction): string {
  return [
    'lot-action-button',
    action.kind === 'look' || action.kind === 'order' ? 'is-look' : '',
    action.disabled ? 'is-disabled' : '',
    action.kind === 'pay' || action.kind === 'quickBid' ? 'is-primary-action' : ''
  ].filter(Boolean).join(' ');
}

function deriveLotListAction({
  state,
  enrolled,
  order,
  userId
}: {
  state: AuctionState;
  enrolled: boolean;
  order?: Order;
  userId: string;
}): LotListAction {
  if (state.status === 'HAMMER_PENDING') {
    return { kind: 'disabled', label: 'auction.hammerInProgress', color: 'primary', fill: 'solid', disabled: true };
  }

  if (state.status === 'CLOSED_FAILED') {
    return { kind: 'disabled', label: 'status.ended', color: 'primary', fill: 'solid', disabled: true };
  }

  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED') {
    const userWon = Boolean(order?.buyerId === userId || state.leaderBidderId === userId);
    if (!userWon) return { kind: 'disabled', label: 'status.ended', color: 'primary', fill: 'solid', disabled: true };
    if (order && isPendingPayOrder(order)) return { kind: 'pay', label: 'auction.pay', color: 'danger', fill: 'solid', order };
    if (order && isPaidOrder(order)) return { kind: 'order', label: 'auction.viewOrder', color: 'primary', fill: 'outline', order };
    return { kind: 'look', label: 'auction.lookAround', color: 'primary', fill: 'outline' };
  }

  if (isRunningAuctionStatus(state.status) && enrolled) {
    return { kind: 'quickBid', label: 'product.bidNow', color: 'danger', fill: 'solid' };
  }

  return { kind: 'look', label: 'auction.lookAround', color: 'primary', fill: 'outline' };
}

type LotDetailAction = {
  kind: 'enroll' | 'bid' | 'wait' | 'pay' | 'order' | 'pendingOrder';
  label: MessageKey;
  color: 'primary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  order?: Order;
};

function deriveLotDetailAction({
  state,
  enrolled,
  enrolling,
  order,
  orderLoading,
  userId
}: {
  state: AuctionState;
  enrolled: boolean;
  enrolling: boolean;
  order?: Order;
  orderLoading: boolean;
  userId: string;
}): LotDetailAction | undefined {
  if (isRunningAuctionStatus(state.status)) {
    return enrolled
      ? { kind: 'bid', label: 'product.bidNow', color: 'danger' }
      : { kind: 'enroll', label: 'auction.enrollAndPayDeposit', color: 'primary', loading: enrolling };
  }

  if (isUpcomingAuctionStatus(state.status)) {
    return { kind: 'wait', label: 'auction.waitingStart', color: 'primary', disabled: true };
  }

  if (state.status === 'CLOSED_FAILED' || state.status === 'HAMMER_PENDING') return undefined;

  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED') {
    const userWon = Boolean(order?.buyerId === userId || state.leaderBidderId === userId);
    if (!userWon) return undefined;
    if (order && isPaidOrder(order)) return { kind: 'order', label: 'auction.viewOrder', color: 'primary', order };
    if (order && isPendingPayOrder(order)) return { kind: 'pay', label: 'auction.pay', color: 'danger', order };
    if (orderLoading || !order) return { kind: 'pendingOrder', label: 'auction.orderPending', color: 'primary', disabled: true };
  }

  return undefined;
}

function LotDetailSheet({
  phase,
  zIndex,
  accessibilityHidden,
  lot,
  state,
  ranking,
  enrolled,
  enrolling,
  order,
  orderLoading,
  userId,
  onClose,
  onEnroll,
  onBid,
  onPay,
  onOpenOrder
}: {
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  enrolling: boolean;
  order?: Order;
  orderLoading: boolean;
  userId: string;
  onClose: () => void;
  onEnroll: () => void;
  onBid: () => void;
  onPay: (order: Order) => void;
  onOpenOrder: (order: Order) => void;
}) {
  const [rankingExpanded, setRankingExpanded] = useState(false);
  const detailRanking = ranking.length ? ranking : defaultRanking(state);
  const visibleRanking = detailRanking.slice(0, 8);
  const canToggleRanking = detailRanking.length > 3;
  const action = deriveLotDetailAction({ state, enrolled, enrolling, order, orderLoading, userId });
  const description = lot.description?.trim() || '';

  useEffect(() => {
    setRankingExpanded(false);
  }, [lot.id]);

  const handleAction = () => {
    if (!action || action.disabled) return;
    if (action.kind === 'enroll') onEnroll();
    if (action.kind === 'bid') onBid();
    if (action.kind === 'pay' && action.order) onPay(action.order);
    if (action.kind === 'order' && action.order) onOpenOrder(action.order);
  };

  return (
    <AnimatedSheetFrame variant="detail" phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="detail-sheet" label={t('product.detail')} onClose={onClose}>
      {(requestClose) => (
        <>
        <header className="sheet-header detail-sheet-header">
          <div className="detail-header-title">
            <h2>{t('product.detail')}</h2>
            <span>{lotStatusLabel(state.status)}</span>
          </div>
          <button type="button" aria-label={t('common.close')} onClick={requestClose}>
            <X size={18} />
          </button>
        </header>
        <div className="detail-scroll-body">
          <LotImageGallery lot={lot} />
          <div className="detail-body">
            <p className="price-label">{priceLabel(lot, state)}</p>
            <h2>{formatMoney(priceValue(lot, state))}</h2>
            <h3>{lot.title}</h3>
            <p className={description ? 'detail-description' : 'detail-description is-empty'}>{description || t('product.noDescription')}</p>
            {scheduledStartText(lot, state) ? <div className="lot-schedule-line detail-schedule-line">{scheduledStartText(lot, state)}</div> : null}
            <div className="price-grid compact detail-rule-grid">
              <Metric label={t('auction.participants')} value={String(participantCountForLot(lot, state))} icon={<Users size={16} />} />
              <Metric label={t('auction.bidCount')} value={String(state.bidCount ?? lot.bidCount ?? 0)} icon={<Gavel size={16} />} />
              <Metric label={t('auction.increment')} value={formatMoney(minIncrementForLot(lot, state))} icon={<Plus size={16} />} />
              <Metric label={t('auction.deposit')} value={formatMoney(lot.depositAmount ?? 0)} icon={<WalletCards size={16} />} />
            </div>
            <article className={rankingExpanded ? 'ranking-panel detail-ranking-panel is-expanded' : 'ranking-panel detail-ranking-panel'}>
              <div className="detail-ranking-header">
                <h4>{t('auction.ranking')}</h4>
              </div>
              <div className="detail-ranking-list">
                {visibleRanking.length ? (
                  visibleRanking.map((item) => (
                    <div className="ranking-row" key={`${item.rank}-${item.bidderId}`}>
                      <span>{item.rank}</span>
                      <strong>{item.nicknameMask}</strong>
                      <b className={item.rank === 1 ? 'detail-ranking-price is-first' : 'detail-ranking-price'}>{formatMoney(item.price)}</b>
                    </div>
                  ))
                ) : (
                  <p className="detail-ranking-empty">{t('auction.rankingEmpty')}</p>
                )}
              </div>
              {canToggleRanking ? (
                <div className="detail-ranking-actions">
                  <button type="button" aria-expanded={rankingExpanded} onClick={() => setRankingExpanded((value) => !value)}>
                    {rankingExpanded ? t('auction.collapseRanking') : t('auction.expandRanking')}
                  </button>
                </div>
              ) : null}
            </article>
          </div>
        </div>
        {action ? (
          <footer className="sheet-actions detail-sticky-actions">
            <Button block color={action.color} loading={action.loading} disabled={action.disabled} className={action.kind === 'wait' || action.kind === 'pendingOrder' ? 'detail-action-button is-muted' : 'detail-action-button'} onClick={handleAction}>
              {t(action.label)}
            </Button>
          </footer>
        ) : null}
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function BidSheet({
  variant,
  phase,
  zIndex,
  accessibilityHidden,
  lot,
  state,
  ranking,
  feedback,
  lastBidAtMs,
  intervalNoticeUntilMs,
  nowMs,
  serverTimeOffsetMs,
  countdownExtensionPulse,
  userId,
  onClose,
  onSubmit
}: {
  variant: LiveSheetVariant;
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  feedback: QuickBidFeedback;
  lastBidAtMs?: number;
  intervalNoticeUntilMs?: number;
  nowMs: number;
  serverTimeOffsetMs: number;
  countdownExtensionPulse?: CountdownExtensionPulse;
  userId: string;
  onClose: () => void;
  onSubmit: (price: number) => void;
}) {
  const rule = useMemo(() => bidRuleFromLot(lot, state), [lot, state]);
  const isHammerPending = state.status === 'HAMMER_PENDING';
  const isBiddingOpen = state.status === 'RUNNING' || state.status === 'EXTENDED';
  const isClosed = !isBiddingOpen && !isHammerPending;
  const [stepCount, setStepCount] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState(() => getQuickBidPrice(rule, 1));
  const [closedAtMs, setClosedAtMs] = useState<number | undefined>(() => (isClosed ? nowMs : undefined));
  const remainMs = countdownRemainMs(state.endTsMs, nowMs, serverTimeOffsetMs);
  const minBidIntervalMs = getMinBidIntervalMs(rule);
  const maxBidSteps = getQuickBidMaxSteps(rule);
  const intervalRemainingMs = getQuickBidIntervalRemainingMs(lastBidAtMs, nowMs, minBidIntervalMs);
  const intervalActive = isQuickBidIntervalActive(lastBidAtMs, nowMs, minBidIntervalMs);
  const intervalNoticeRemainingMs = intervalNoticeUntilMs ? Math.max(0, intervalNoticeUntilMs - Date.now()) : 0;
  const shouldShowIntervalNotice = intervalNoticeRemainingMs > 0;
  const effectiveIntervalNoticeRemainingMs = intervalActive
    ? (shouldShowIntervalNotice ? Math.min(intervalRemainingMs, intervalNoticeRemainingMs) : intervalRemainingMs)
    : intervalNoticeRemainingMs;
  const outdated = isQuickBidOutdated(selectedPrice, rule);
  const validation = validateBidPrice(selectedPrice, rule);
  const hasLeader = Boolean(state.leaderBidderId);
  const isUserLeader = state.leaderBidderId === userId;
  const currentUserBid = ranking.find((item) => item.bidderId === userId);
  const leader = hasLeader ? (isUserLeader ? t('live.commentMe') : (ranking[0]?.nicknameMask ?? defaultRanking(state)[0]?.nicknameMask ?? t('bid.startPriceBidder'))) : t('bid.startPriceBidder');
  const currentBidPrice = priceValue(lot, state);
  const myBid = isUserLeader ? formatMoney(state.currentPrice) : currentUserBid ? formatMoney(currentUserBid.price) : t('bid.noMyBid');
  const quickBidNotice = isUserLeader
    ? t('bid.highestPriceNotice')
    : t('bid.aboveCurrentPriceNotice', { amount: formatQuickBidDeltaAmount(selectedPrice - currentBidPrice) });
  const countdownParts = formatCountdownParts(remainMs);
  const countdownAriaLabel = [countdownParts.hours, countdownParts.minutes, countdownParts.seconds].join(':') + (countdownParts.milliseconds ? `.${countdownParts.milliseconds}` : '');
  const countdownPhase = getCountdownPressurePhase(remainMs, state.status);
  const countdownClassName = ['quick-bid-countdown', countdownPhase !== 'idle' ? `is-${countdownPhase}` : ''].filter(Boolean).join(' ');
  const countdownExtensionText = countdownExtensionPulse?.seconds ? `+${countdownExtensionPulse.seconds}s` : undefined;
  const closedCountdown = isClosed ? Math.max(0, Math.ceil(((closedAtMs ?? nowMs) + AUCTION_ENDED_HOLD_MS - nowMs) / 1000)) : 5;

  useEffect(() => {
    if (feedback.status !== 'success') return;
    const nextRule = bidRuleFromLot(lot, state);
    setStepCount(1);
    setSelectedPrice(getQuickBidPrice(nextRule, 1));
  }, [feedback.status, lot, state]);

  useEffect(() => {
    const nextSteps = Math.max(1, Math.min(maxBidSteps, stepCount));
    if (nextSteps !== stepCount) setStepCount(nextSteps);
    setSelectedPrice(getQuickBidPrice(rule, nextSteps));
  }, [rule, maxBidSteps, stepCount]);

  useEffect(() => {
    setClosedAtMs((current) => {
      if (!isClosed) return undefined;
      return current ?? nowMs;
    });
  }, [isClosed, nowMs]);

  useEffect(() => {
    if (isClosed && closedCountdown <= 0) onClose();
  }, [closedCountdown, isClosed, onClose]);

  const setPriceBySteps = (steps: number) => {
    const nextSteps = Math.max(1, Math.min(maxBidSteps, steps));
    setStepCount(nextSteps);
    setSelectedPrice(getQuickBidPrice(rule, nextSteps));
  };

  // Both submitting and arbitrating states should lock the bid controls.
  const isBidPending = feedback.status === 'submitting' || feedback.status === 'arbitrating';
  const canDecrease = stepCount > 1 && isBiddingOpen && !isBidPending;
  const canIncrease = stepCount < maxBidSteps && selectedPrice < (rule.capPrice ?? Number.MAX_SAFE_INTEGER) && isBiddingOpen && !isBidPending;
  const disabledReason = isHammerPending
    ? t('auction.bidRejectedHammerPending')
    : isClosed
      ? t('bid.currentAuctionEnded')
      : outdated
        ? t('bid.priceOutdated')
        : !validation.valid
          ? formatBidValidationNotice(validation)
          : shouldShowIntervalNotice && effectiveIntervalNoticeRemainingMs > 0
            ? t('bid.intervalWaiting', { seconds: Math.ceil(effectiveIntervalNoticeRemainingMs / 1000) })
            : '';
  const canSubmit = !disabledReason && !isBidPending;
  const submitText = isHammerPending
    ? t('auction.hammerInProgress')
    : isClosed
      ? t('bid.endedAutoReturn', { seconds: closedCountdown })
      : feedback.status === 'arbitrating'
        ? feedback.message
        : feedback.status === 'submitting'
          ? t('auction.bidSubmitted')
          : t('bid.submitNow');

  return (
    <AnimatedSheetFrame variant={variant} phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="bid-sheet quick-bid-sheet" label={t('bid.confirmTitle')} showBackdrop={false} onClose={onClose}>
      {() => (
        <>
        <div className="quick-bid-timer">
          {isHammerPending ? (
            <h2>{t('auction.hammerInProgress')}</h2>
          ) : isClosed ? (
            <h2>{t('bid.currentAuctionEnded')}</h2>
          ) : (
            <h2 className={countdownClassName}>
              <span className="quick-bid-countdown-label">{t('bid.countdownPrefix')}</span>
              <span className="quick-bid-countdown-display" aria-label={countdownAriaLabel}>
                <span className="quick-bid-countdown-unit">{countdownParts.hours}</span>
                <span className="quick-bid-countdown-separator">:</span>
                <span className="quick-bid-countdown-unit">{countdownParts.minutes}</span>
                <span className="quick-bid-countdown-separator">:</span>
                <span className="quick-bid-countdown-unit">{countdownParts.seconds}</span>
                {countdownParts.milliseconds ? (
                  <>
                    <span className="quick-bid-countdown-separator is-milliseconds">.</span>
                    <span className="quick-bid-countdown-unit is-milliseconds">{countdownParts.milliseconds}</span>
                  </>
                ) : null}
              </span>
              {countdownExtensionText ? (
                <span key={countdownExtensionPulse?.id} className="quick-bid-countdown-extension" aria-label={countdownExtensionText}>
                  {countdownExtensionText}
                </span>
              ) : null}
            </h2>
          )}
        </div>
        <div className="quick-bid-summary">
          <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="gold" />
          <div className="quick-bid-title">
            <h3>{lot.title}</h3>
            <div className="quick-bid-price-grid">
              <div className="quick-bid-price-cell">
                <div className="quick-bid-price-meta">
                  <span>{t('bid.currentPriceShort')}</span>
                  {hasLeader ? (
                    <small className="quick-bid-leader-badge">
                      <span className="quick-bid-leader-avatar" aria-hidden="true">{leaderAvatarText(leader)}</span>
                      <b>{t('bid.leadingBadge', { name: leader })}</b>
                    </small>
                  ) : (
                    <small className="quick-bid-leader-badge is-start-price">{leader}</small>
                  )}
                </div>
                <strong>{formatMoney(priceValue(lot, state))}</strong>
              </div>
              <div className="quick-bid-price-cell">
                <div className="quick-bid-price-meta">
                  <span>{t('bid.myBid')}</span>
                </div>
                <strong>{myBid}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="quick-bid-selector">
          <span className="quick-bid-status-badge">{quickBidNotice}</span>
          <button type="button" aria-label={t('bid.decrease')} disabled={!canDecrease} onClick={() => setPriceBySteps(stepCount - 1)}>
            <Minus size={18} />
          </button>
          <div>
            <strong>{formatMoney(selectedPrice)}</strong>
            <span>
              {t('auction.increment')} {formatMoney(rule.minIncrement)}
            </span>
          </div>
          <button type="button" aria-label={t('bid.increase')} disabled={!canIncrease} onClick={() => setPriceBySteps(outdated ? 1 : stepCount + 1)}>
            <Plus size={18} />
          </button>
        </div>
        {feedback.status === 'error' ? <p className="quick-bid-feedback is-error">{feedback.message}</p> : null}
        {disabledReason && !isClosed ? <p className="quick-bid-feedback is-error">{disabledReason}</p> : null}
        <button className="quick-bid-submit" type="button" disabled={!canSubmit} onClick={() => onSubmit(selectedPrice)}>
          {submitText}
        </button>
        <p className="quick-bid-ceiling">
          <span>{t('auction.ceilingPrice')}</span> {rule.capPrice === undefined ? t('common.none') : formatMoney(rule.capPrice)}
        </p>
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function DigitalHumanLiveStage({ room, idleVideoUrl, talkVideoUrl, initialMediaPosition, speaking = false }: { room: LiveRoom; idleVideoUrl: string; talkVideoUrl: string; initialMediaPosition?: PreviewMediaSnapshot; speaking?: boolean }) {
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const talkVideoRef = useRef<HTMLVideoElement>(null);
  const { applyInitialPosition, resetAppliedInitialPosition } = usePreviewMediaRestore(initialMediaPosition);
  const [mediaError, setMediaError] = useState(false);

  const rememberIdleVideoPosition = useCallback(() => {
    const snapshot = buildPreviewMediaSnapshot(room, idleVideoRef.current);
    if (snapshot) rememberPreviewMediaSnapshot(snapshot);
  }, [room]);

  const syncIdleVideoPosition = useCallback(() => {
    const idleVideo = idleVideoRef.current;
    forceMutedVideo(idleVideo);
    if (applyInitialPosition(idleVideo)) return;
    void playVideo(idleVideo);
  }, [applyInitialPosition]);

  useEffect(() => () => {
    rememberIdleVideoPosition();
  }, [rememberIdleVideoPosition]);

  useEffect(() => {
    resetAppliedInitialPosition();
  }, [idleVideoUrl, resetAppliedInitialPosition]);

  useEffect(() => {
    const talkVideo = talkVideoRef.current;
    forceMutedVideo(talkVideo);
    syncIdleVideoPosition();
    resetVideoToStart(talkVideo);
  }, [idleVideoUrl, talkVideoUrl, syncIdleVideoPosition]);

  useEffect(() => {
    const talkVideo = talkVideoRef.current;
    forceMutedVideo(talkVideo);
    if (speaking) {
      resetVideoToStart(talkVideo);
      void playVideo(talkVideo);
      return;
    }
    talkVideo?.pause();
    resetVideoToStart(talkVideo);
    syncIdleVideoPosition();
  }, [speaking, syncIdleVideoPosition]);

  return (
    <div className={joinClassNames('digital-human-stage', speaking && 'is-speaking')} data-testid="digital-human-stage">
      <video
        ref={idleVideoRef}
        className="digital-human-video idle"
        src={idleVideoUrl}
        muted
        autoPlay
        loop
        {...mobileInlineVideoAttributes}
        preload="auto"
        onLoadedMetadata={syncIdleVideoPosition}
        onCanPlay={syncIdleVideoPosition}
        onTimeUpdate={rememberIdleVideoPosition}
        onPause={rememberIdleVideoPosition}
        onError={() => setMediaError(true)}
      />
      <video
        ref={talkVideoRef}
        className="digital-human-video talk"
        src={talkVideoUrl}
        muted
        loop
        {...mobileInlineVideoAttributes}
        preload="auto"
        onError={() => setMediaError(true)}
      />
      {mediaError ? (
        <div className="digital-human-placeholder">
          <VideoOff size={28} />
          <span>{t('digitalHuman.mediaMissing')}</span>
        </div>
      ) : null}
    </div>
  );
}

function fallbackAuctionState(auctionId: string): AuctionState {
  return {
    auctionId,
    status: 'RUNNING',
    currentPrice: 0,
    endTsMs: Date.now(),
    serverTsMs: Date.now()
  };
}

function realtimePayloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

function firstRealtimeDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function isLiveStatsRealtimeType(type: string): boolean {
  return type === 'room.online' || type === 'room.updated' || type === 'live.status' || type === 'auction.closed' || type === 'auction.ended' || type === 'lot.ended' || type === 'live_session.ended';
}

function realtimeOnlineCountValue(payload: Record<string, unknown>): unknown {
  return firstRealtimeDefined(payload.online, payload.onlineCount, payload.online_count, payload.count, payload.viewerCount, payload.viewer_count, payload.audienceCount, payload.audience_count);
}

function realtimeWatcherCountValue(payload: Record<string, unknown>): unknown {
  return firstRealtimeDefined(payload.watcherCount, payload.watcher_count, payload.viewerTotal, payload.viewer_total, payload.viewerCount, payload.viewer_count, payload.audienceCount, payload.audience_count);
}

function mergeLiveRoomStats(previous: LiveRoomStats, next: LiveRoomStats): LiveRoomStats {
  return {
    ...previous,
    ...next,
    onlineCount: Number.isFinite(next.onlineCount) ? next.onlineCount : previous.onlineCount,
    watcherCount: Number.isFinite(next.watcherCount) ? next.watcherCount : previous.watcherCount
  };
}

function realtimeMessageRequestId(message: Pick<RealtimeMessage, 'requestId'>, payload: Record<string, unknown>): string | undefined {
  const requestId = String(message.requestId ?? payload.requestId ?? '').trim();
  return requestId || undefined;
}

function isBidAcceptedRealtimeType(type: string): boolean {
  return type === 'bid.accepted' || type === 'bid.accept';
}

function realtimeBidPriceValue(payload: Record<string, unknown>): unknown {
  return payload.currentPrice ?? payload.current_price ?? payload.amount ?? payload.price;
}

function realtimeEndTimeValue(payload: Record<string, unknown>): unknown {
  return firstRealtimeDefined(
    payload.endTime,
    payload.endTimeMs,
    payload.endTsMs,
    payload.end_time,
    payload.end_time_ms,
    payload.end_ts_ms,
    payload.newEndTime,
    payload.newEndTimeMs,
    payload.newEndTsMs,
    payload.new_end_time,
    payload.new_end_time_ms,
    payload.new_end_ts_ms
  );
}

function realtimeExtendSeconds(payload: Record<string, unknown>, previousEndTsMs: number, newEndTsMs: number): number | undefined {
  const explicitSeconds = realtimeOptionalNumber(firstRealtimeDefined(
    payload.extendSeconds,
    payload.extendSec,
    payload.extensionSeconds,
    payload.extensionSec,
    payload.antiExtendSeconds,
    payload.antiExtendSec,
    payload.antiSnipingSec,
    payload.antiSnipingExtendSec,
    payload.extend_seconds,
    payload.extend_sec,
    payload.extension_seconds,
    payload.extension_sec,
    payload.anti_extend_seconds,
    payload.anti_extend_sec,
    payload.anti_sniping_sec,
    payload.anti_sniping_extend_sec
  ));
  if (explicitSeconds && explicitSeconds > 0) return explicitSeconds;

  const explicitMs = realtimeOptionalNumber(firstRealtimeDefined(
    payload.extendMs,
    payload.extensionMs,
    payload.antiExtendMs,
    payload.antiSnipingExtendMs,
    payload.extend_ms,
    payload.extension_ms,
    payload.anti_extend_ms,
    payload.anti_sniping_extend_ms
  ));
  if (explicitMs && explicitMs > 0) return Math.max(1, Math.round(explicitMs / 1000));

  const derivedMs = newEndTsMs - previousEndTsMs;
  if (Number.isFinite(derivedMs) && derivedMs > 0) return Math.max(1, Math.round(derivedMs / 1000));
  return undefined;
}

function lotCountdownExtensionSeconds(lot?: LiveRoomLot): number | undefined {
  const snapshot = lot?.ruleSnapshot;
  if (!snapshot) return undefined;
  const seconds = realtimeOptionalNumber(firstRealtimeDefined(
    snapshot.antiExtendSec,
    snapshot.extendSec,
    snapshot.extensionSec,
    snapshot.extensionSeconds,
    snapshot.antiSnipingExtendSec,
    snapshot.antiSnipeExtendSec,
    snapshot.anti_sniping_extend_sec,
    snapshot.anti_snipe_extend_sec,
    snapshot.antiSnipingSec,
    snapshot.antiSnipeSec
  ));
  return seconds && seconds > 0 ? seconds : undefined;
}

function updateLotStateFromBidPayload(payload: Record<string, unknown>, options: RealtimeHandlerOptions, incrementMissingBidCount: boolean) {
  const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
  if (!auctionId) return;
  options.setLotStates((prev) => {
    const previous = prev[auctionId] ?? (auctionId === options.activeAuctionId ? options.activeAuctionState : undefined) ?? fallbackAuctionState(auctionId);
    const hasLeader = payload.leaderBidderId !== undefined || payload.bidderId !== undefined;
    const nextBidCount =
      payload.bidCount === undefined
        ? previous.bidCount === undefined
          ? undefined
          : previous.bidCount + (incrementMissingBidCount ? 1 : 0)
        : realtimeNumber(payload.bidCount, previous.bidCount ?? 0);
    return {
      ...prev,
      [auctionId]: {
        ...previous,
        auctionId,
        status: 'RUNNING',
        currentPrice: realtimeNumber(realtimeBidPriceValue(payload), previous.currentPrice ?? 0),
        leaderBidderId: hasLeader ? String(payload.leaderBidderId ?? payload.bidderId) : previous.leaderBidderId,
        bidCount: nextBidCount,
        participantCount: payload.participantCount === undefined ? previous.participantCount : realtimeNumber(payload.participantCount, previous.participantCount ?? 0),
        endTsMs: parseRealtimeTimestampMs(realtimeEndTimeValue(payload), previous.endTsMs ?? Date.now()),
        serverTsMs: parseRealtimeTimestampMs(payload.serverTime, Date.now())
      }
    };
  });
}

function realtimePayloadWithState(payload: unknown): Record<string, unknown> {
  const raw = realtimePayloadRecord(payload);
  const state = raw.state && typeof raw.state === 'object' ? (raw.state as Record<string, unknown>) : undefined;
  if (!state) return {};
  return {
    ...state,
    auctionId: state.auctionId ?? raw.auctionId,
    liveSessionId: state.liveSessionId ?? raw.liveSessionId,
    serverTime: state.serverTime ?? raw.serverTime
  };
}

function serverTimeOffsetFromPayload(payload: unknown, clientNowMs = Date.now()): number | undefined {
  const raw = realtimePayloadRecord(payload);
  const serverTimeMs = parseRealtimeTimestampMs(raw.serverTimeMs ?? raw.serverTime, Number.NaN);
  return Number.isFinite(serverTimeMs) ? getServerOffsetMs(serverTimeMs, clientNowMs) : undefined;
}

function countdownRemainMs(endTsMs: number, clientNowMs: number, serverTimeOffsetMs: number): number {
  return endTsMs - (clientNowMs + serverTimeOffsetMs);
}

function stateWithHammerPendingAfterCountdown(state: AuctionState, remainMs: number): AuctionState {
  if (remainMs <= 0 && isRunningAuctionStatus(state.status)) {
    return { ...state, status: 'HAMMER_PENDING' };
  }
  return state;
}

function realtimeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function realtimeOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function parseRealtimeTimestampMs(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function extractRealtimeRankingItems(payload: Record<string, unknown>): unknown[] {
  const items = Array.isArray(payload.ranking) ? payload.ranking : Array.isArray(payload.items) ? payload.items : [];
  const currentUserItem = payload.currentUserItem;
  if (!currentUserItem || typeof currentUserItem !== 'object') return items;
  return [...items, currentUserItem];
}

function normalizeRealtimeRankingItems(value: unknown, userId = '', userNickname?: string, userAvatarUrl?: string): RankingItem[] {
  if (!Array.isArray(value)) return [];
  const fallbackTsMs = Date.now();
  const normalized = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const bidderId = String(raw.bidderId ?? raw.bidder_id ?? raw.userId ?? raw.user_id ?? '').trim();
    const price = Number(realtimeBidPriceValue(raw));
    if (!bidderId || !Number.isFinite(price)) return [];
    const rank = Number(raw.rank);
    const { nickname, nicknameMask } = resolveRankingDisplayName(raw, bidderId, userId, userNickname);
    return [
      {
        rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
        bidderId,
        nickname,
        nicknameMask,
        avatarUrl: rankingAvatarUrl(raw, bidderId, userId, userAvatarUrl),
        price,
        bidTsMs: parseRealtimeTimestampMs(raw.bidTsMs ?? raw.createdAtMs ?? raw.createdAt ?? raw.serverTime, fallbackTsMs)
      }
    ];
  });
  const byBidder = new Map<string, RankingItem>();
  normalized.forEach((item) => byBidder.set(item.bidderId, item));
  return [...byBidder.values()];
}

function mergeRealtimeBidIntoRankingItems(previousItems: RankingItem[], payload: Record<string, unknown>, userId: string, activeAuctionId?: string, userNickname?: string, userAvatarUrl?: string): RankingItem[] {
  const auctionId = String(payload.auctionId ?? '').trim();
  if (activeAuctionId && auctionId && auctionId !== activeAuctionId) return previousItems;
  const bidderId = String(payload.bidderId ?? payload.bidder_id ?? payload.leaderBidderId ?? payload.userId ?? payload.user_id ?? '').trim();
  if (!bidderId) return previousItems;
  const previousItem = previousItems.find((item) => item.bidderId === bidderId);
  const price = realtimeNumber(realtimeBidPriceValue(payload), previousItem?.price ?? Number.NaN);
  if (!Number.isFinite(price)) return previousItems;
  const resolvedName = resolveRankingDisplayName(payload, bidderId, userId, userNickname);
  const nickname = resolvedName.nickname ?? previousItem?.nickname;
  const nicknameMask = resolvedName.nickname ?? previousItem?.nicknameMask ?? resolvedName.nicknameMask;
  const avatarUrl = rankingAvatarUrl(payload, bidderId, userId, userAvatarUrl) ?? previousItem?.avatarUrl;
  const bidTsMs = parseRealtimeTimestampMs(payload.bidTsMs ?? payload.createdAtMs ?? payload.createdAt ?? payload.serverTime, Date.now());
  const bidItem: RankingItem = previousItem
    ? {
        ...previousItem,
        rank: 1,
        nickname,
        nicknameMask,
        avatarUrl,
        price,
        bidTsMs
      }
    : {
        rank: 1,
        bidderId,
        nickname,
        nicknameMask,
        avatarUrl,
        price,
        bidTsMs
      };
  const merged = [bidItem, ...previousItems.filter((item) => item.bidderId !== bidderId)];
  const ranked = merged
    .sort((a, b) => b.price - a.price || b.bidTsMs - a.bidTsMs || a.rank - b.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const topItems = ranked.slice(0, 10);
  const currentUserItem = userId ? ranked.find((item) => item.bidderId === userId) : undefined;
  return currentUserItem && !topItems.some((item) => item.bidderId === userId) ? [...topItems, currentUserItem] : topItems;
}

function resolveRankingDisplayName(raw: Record<string, unknown>, bidderId: string, userId = '', userNickname?: string): Pick<RankingItem, 'nickname' | 'nicknameMask'> {
  const rawNickname = firstNonEmptyString(
    raw.nickname,
    raw.userNickname,
    raw.user_nickname,
    raw.bidderName,
    raw.bidderNickname,
    raw.nicknameMask
  );
  const nickname = isSelfRankingAlias(rawNickname) ? firstNonEmptyString(bidderId === userId ? userNickname : undefined) : (rawNickname ?? (bidderId === userId ? firstNonEmptyString(userNickname) : undefined));
  return {
    nickname,
    nicknameMask: nickname ?? rankingBidderFallbackName(bidderId)
  };
}

function isSelfRankingAlias(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '\u6211' || normalized === 'me';
}

function lotCoverUrl(lot?: LiveRoomLot): string | undefined {
  return firstNonEmptyString(lot?.imageUrl, lot?.imageUrls?.[0]);
}

function liveRoomFootprintCoverUrl(room: LiveRoom, lots: LiveRoomLot[], activeLot?: LiveRoomLot): string | undefined {
  return firstNonEmptyString(room.coverUrl, lotCoverUrl(activeLot), lots.map(lotCoverUrl).find(Boolean));
}

function rankingAvatarUrl(raw: Record<string, unknown>, bidderId = '', userId = '', userAvatarUrl?: string): string | undefined {
  return firstNonEmptyString(
    raw.avatarUrl,
    raw.avatar_url,
    raw.avatar,
    raw.userAvatarUrl,
    raw.user_avatar_url,
    raw.userAvatar,
    raw.bidderAvatarUrl,
    raw.bidder_avatar_url,
    raw.bidderAvatar,
    bidderId && bidderId === userId ? userAvatarUrl : undefined
  );
}

function isUpcomingAuctionStatus(status: AuctionState['status']): boolean {
  return status === 'DRAFT' || status === 'PENDING_AUDIT' || status === 'READY' || status === 'WARMING_UP';
}

function isValidScheduledStartMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatBidValidationNotice(validation: BidValidationResult): string {
  if (validation.valid) return '';
  if (validation.reason === 'belowMinimum') return t('auction.bidBelowMinimum', { min: formatMoney(validation.minPrice) });
  if (validation.reason === 'invalidStep') return t('auction.bidInvalidStep', { step: formatMoney(validation.step) });
  if (validation.reason === 'aboveCap') return t('auction.bidAboveCeiling', { ceiling: formatMoney(validation.capPrice) });
  if (validation.reason === 'aboveMaxBidSteps') return t('auction.bidAboveMaxSteps', { max: formatMoney(validation.maxPrice) });
  return t('auction.bidInvalidAmount');
}

function formatBidRejectedMessage(payload: Record<string, unknown>): string {
  const reason = String(payload.reason ?? '');
  if (reason === 'belowMinimum' || reason === 'BELOW_MIN_INCREMENT' || reason === 'invalidStep') return t('auction.bidTooSlow');
  if (reason === 'FREQ_LIMIT') return t('auction.bidTooFrequent');
  if (reason === 'ABOVE_MAX_BID_STEPS' || reason === 'ABOVE_EXPECTED_MAX_BID_STEPS') return t('auction.bidAboveMaxStepsGeneric');
  if (reason === 'HOT_AUCTION_QUEUE_FULL') return t('auction.bidQueueFull');
  if (reason === 'USER_BID_ALREADY_PENDING') return t('auction.bidAlreadyPending');
  if (reason === 'AUCTION_CLOSED' || reason === 'INVALID_STATE') return t('auction.closed');
  if (reason === 'AUCTION_HAMMER_PENDING') return t('auction.bidRejectedHammerPending');
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  return t('auction.bidRejected');
}

function logBidRejectedDebug(source: 'bid.ack' | 'bid.rejected', requestId: string | undefined, payload: Record<string, unknown>) {
  console.warn('[auction] bid rejected', {
    source,
    requestId,
    auctionId: payload.auctionId,
    reason: payload.reason,
    message: payload.message,
    code: payload.code,
    price: payload.price,
    currentPrice: payload.currentPrice,
    minNextPrice: payload.minNextPrice,
    expectedCurrentPrice: payload.expectedCurrentPrice,
    payload
  });
}

function formatQuickBidDeltaAmount(cents: number): string {
  const normalized = Math.max(0, Number.isFinite(cents) ? cents : 0);
  if (getRuntimeLocale() !== 'zh-CN') return formatMoney(normalized);
  const yuan = normalized / 100;
  const text = Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}\u5143`;
}

function formatCountdownParts(ms: number): { hours: string; minutes: string; seconds: string; milliseconds?: string } {
  const normalizedMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(normalizedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    milliseconds: shouldShowCountdownMilliseconds(normalizedMs) ? String(normalizedMs % 1000).padStart(3, '0') : undefined
  };
}

function leaderAvatarText(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0] : '-';
}





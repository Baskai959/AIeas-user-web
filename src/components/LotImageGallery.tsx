import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type TransitionEvent as ReactTransitionEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';

import { t } from '../i18n/runtime';
import type { LiveRoomLot } from '../services/types';
import { VisualPlaceholder } from './VisualPlaceholder';

const imageViewerScaleMin = 1;
const imageViewerScaleMax = 4;
const imageViewerOffsetMax = 720;
const imageViewerSwipeThreshold = 42;

type PointerPoint = { x: number; y: number };
type ImageViewerTransform = { scale: number; offsetX: number; offsetY: number };

function lotImageUrls(lot: LiveRoomLot): string[] {
  const urls = [...(lot.imageUrls ?? []), lot.imageUrl].filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  return Array.from(new Set(urls)).slice(0, 5);
}

export function LotImageGallery({ lot }: { lot: LiveRoomLot }) {
  const images = lotImageUrls(lot);
  const [activeIndex, setActiveIndex] = useState(0);
  const [galleryTrackIndex, setGalleryTrackIndex] = useState(images.length > 1 ? 1 : 0);
  const [galleryDragOffsetPx, setGalleryDragOffsetPx] = useState(0);
  const [galleryDragging, setGalleryDragging] = useState(false);
  const [galleryResetting, setGalleryResetting] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTransform, setViewerTransform] = useState<ImageViewerTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [viewerGesturing, setViewerGesturing] = useState(false);
  const suppressOpenRef = useRef(false);
  const galleryGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    baseTrackIndex: number;
  }>();
  const galleryMediaRef = useRef<HTMLButtonElement>(null);
  const galleryWindowListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    end: (event: PointerEvent) => void;
  }>();
  const galleryRestoreRafRef = useRef<number>();
  const viewerTransformRef = useRef<ImageViewerTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const viewerPointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const viewerDragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number }>();
  const viewerPinchRef = useRef<{ distance: number; centerX: number; centerY: number; scale: number; offsetX: number; offsetY: number }>();

  const resetViewerTransform = useCallback(() => {
    const next = { scale: 1, offsetX: 0, offsetY: 0 };
    viewerTransformRef.current = next;
    setViewerTransform(next);
    viewerPointersRef.current.clear();
    viewerDragRef.current = undefined;
    viewerPinchRef.current = undefined;
    setViewerGesturing(false);
  }, []);
  const updateViewerTransform = useCallback((updater: (current: ImageViewerTransform) => ImageViewerTransform) => {
    setViewerTransform((current: ImageViewerTransform) => {
      const next = updater(current);
      viewerTransformRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    setGalleryTrackIndex(images.length > 1 ? 1 : 0);
    setGalleryDragOffsetPx(0);
    setGalleryDragging(false);
    setGalleryResetting(false);
    galleryGestureRef.current = undefined;
    setViewerOpen(false);
    resetViewerTransform();
  }, [lot.id, images.length, resetViewerTransform]);

  const removeGalleryWindowListeners = useCallback(() => {
    const listeners = galleryWindowListenersRef.current;
    if (!listeners) return;
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.end);
    window.removeEventListener('pointercancel', listeners.end);
    galleryWindowListenersRef.current = undefined;
  }, []);

  useEffect(
    () => () => {
      removeGalleryWindowListeners();
      if (galleryRestoreRafRef.current) {
        cancelAnimationFrame(galleryRestoreRafRef.current);
      }
    },
    [removeGalleryWindowListeners]
  );

  const imageCount = Math.max(images.length, 1);
  const hasMultipleImages = images.length > 1;
  const normalizedIndex = images.length ? ((activeIndex % images.length) + images.length) % images.length : 0;
  const galleryItems = hasMultipleImages
    ? [
        { imageUrl: images[images.length - 1], imageIndex: images.length - 1, key: `clone-start-${images[images.length - 1]}` },
        ...images.map((imageUrl, imageIndex) => ({ imageUrl, imageIndex, key: `image-${imageIndex}-${imageUrl}` })),
        { imageUrl: images[0], imageIndex: 0, key: `clone-end-${images[0]}` }
      ]
    : images.map((imageUrl, imageIndex) => ({ imageUrl, imageIndex, key: `image-${imageIndex}-${imageUrl}` }));
  const moveImage = (step: number) => {
    if (imageCount <= 1) return;
    resetViewerTransform();
    setGalleryDragOffsetPx(0);
    setGalleryDragging(false);
    setGalleryResetting(false);
    setGalleryTrackIndex(normalizedIndex + 1 + step);
    setActiveIndex((value) => (value + step + imageCount) % imageCount);
  };
  const updateGalleryGesture = (clientX: number, clientY: number, preventDefault?: () => void) => {
    const gesture = galleryGestureRef.current;
    if (!gesture) return;
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
      preventDefault?.();
      suppressOpenRef.current = true;
      setGalleryDragging(true);
      setGalleryDragOffsetPx(deltaX);
    }
  };
  const finishGalleryGestureAt = (pointerId: number, clientX: number, clientY: number) => {
    const gesture = galleryGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    const shouldTreatAsDrag = Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY);
    const shouldSwitch = shouldTreatAsDrag && Math.abs(deltaX) > gesture.width * 0.5;
    galleryMediaRef.current?.releasePointerCapture?.(pointerId);
    removeGalleryWindowListeners();
    galleryGestureRef.current = undefined;
    setGalleryDragging(false);
    setGalleryDragOffsetPx(0);
    if (!shouldTreatAsDrag) {
      setGalleryTrackIndex(gesture.baseTrackIndex);
      return;
    }
    suppressOpenRef.current = true;
    if (!shouldSwitch) {
      setGalleryTrackIndex(gesture.baseTrackIndex);
      return;
    }
    const step = deltaX > 0 ? -1 : 1;
    setGalleryTrackIndex(gesture.baseTrackIndex + step);
    setActiveIndex((value) => (value + step + imageCount) % imageCount);
    resetViewerTransform();
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hasMultipleImages) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    galleryGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width || 1,
      baseTrackIndex: normalizedIndex + 1
    };
    suppressOpenRef.current = false;
    setGalleryTrackIndex(normalizedIndex + 1);
    setGalleryDragOffsetPx(0);
    setGalleryDragging(false);
    setGalleryResetting(false);
    removeGalleryWindowListeners();
    const move = (nativeEvent: PointerEvent) => {
      if (galleryGestureRef.current?.pointerId !== nativeEvent.pointerId) return;
      updateGalleryGesture(nativeEvent.clientX, nativeEvent.clientY, () => nativeEvent.preventDefault());
    };
    const end = (nativeEvent: PointerEvent) => {
      finishGalleryGestureAt(nativeEvent.pointerId, nativeEvent.clientX, nativeEvent.clientY);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    galleryWindowListenersRef.current = { move, end };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (galleryGestureRef.current?.pointerId !== event.pointerId) return;
    updateGalleryGesture(event.clientX, event.clientY, () => event.preventDefault());
  };
  const finishGalleryGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    finishGalleryGestureAt(event.pointerId, event.clientX, event.clientY);
  };
  const handleGalleryTransitionEnd = (event: ReactTransitionEvent<HTMLDivElement>) => {
    if ((event.propertyName && event.propertyName !== 'transform') || !hasMultipleImages) return;
    if (galleryTrackIndex !== 0 && galleryTrackIndex !== imageCount + 1) return;
    setGalleryResetting(true);
    setGalleryTrackIndex(galleryTrackIndex === 0 ? imageCount : 1);
    if (galleryRestoreRafRef.current) {
      cancelAnimationFrame(galleryRestoreRafRef.current);
    }
    galleryRestoreRafRef.current = requestAnimationFrame(() => {
      galleryRestoreRafRef.current = requestAnimationFrame(() => {
        galleryRestoreRafRef.current = undefined;
        setGalleryResetting(false);
      });
    });
  };
  const openViewer = () => {
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }
    if (!images.length) return;
    resetViewerTransform();
    setViewerOpen(true);
  };
  const closeViewer = () => {
    setViewerOpen(false);
    resetViewerTransform();
  };
  const startViewerGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    viewerPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activePointers = pointerEntries(viewerPointersRef.current);
    setViewerGesturing(true);
    if (activePointers.length >= 2) {
      const gesture = pinchGesture(activePointers[0].point, activePointers[1].point);
      viewerPinchRef.current = {
        distance: gesture.distance,
        centerX: gesture.centerX,
        centerY: gesture.centerY,
        scale: viewerTransformRef.current.scale,
        offsetX: viewerTransformRef.current.offsetX,
        offsetY: viewerTransformRef.current.offsetY
      };
      viewerDragRef.current = undefined;
      return;
    }
    viewerDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: viewerTransformRef.current.offsetX,
      offsetY: viewerTransformRef.current.offsetY
    };
  };
  const moveViewerGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!viewerPointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    viewerPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activePointers = pointerEntries(viewerPointersRef.current);
    if (activePointers.length >= 2 && viewerPinchRef.current) {
      const gesture = pinchGesture(activePointers[0].point, activePointers[1].point);
      const pinch = viewerPinchRef.current;
      updateViewerTransform(() => ({
        scale: clamp(Number((pinch.scale * (gesture.distance / pinch.distance)).toFixed(2)), imageViewerScaleMin, imageViewerScaleMax),
        offsetX: clamp(pinch.offsetX + gesture.centerX - pinch.centerX, -imageViewerOffsetMax, imageViewerOffsetMax),
        offsetY: clamp(pinch.offsetY + gesture.centerY - pinch.centerY, -imageViewerOffsetMax, imageViewerOffsetMax)
      }));
      return;
    }
    const drag = viewerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || viewerTransformRef.current.scale <= 1) return;
    updateViewerTransform((current: ImageViewerTransform) => ({
      ...current,
      offsetX: clamp(drag.offsetX + event.clientX - drag.x, -imageViewerOffsetMax, imageViewerOffsetMax),
      offsetY: clamp(drag.offsetY + event.clientY - drag.y, -imageViewerOffsetMax, imageViewerOffsetMax)
    }));
  };
  const endViewerGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = viewerDragRef.current;
    viewerPointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag?.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      if (viewerTransformRef.current.scale <= 1 && Math.abs(deltaX) >= imageViewerSwipeThreshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        moveImage(deltaX > 0 ? -1 : 1);
      }
      viewerDragRef.current = undefined;
    }
    if (viewerPointersRef.current.size < 2) {
      viewerPinchRef.current = undefined;
    }
    if (viewerPointersRef.current.size === 0) {
      setViewerGesturing(false);
    }
  };
  const zoomViewerByWheel = (event: ReactWheelEvent<HTMLButtonElement>) => {
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    updateViewerTransform((current: ImageViewerTransform) => {
      const scale = clamp(Number((current.scale + delta).toFixed(2)), imageViewerScaleMin, imageViewerScaleMax);
      if (scale === 1) return { scale, offsetX: 0, offsetY: 0 };
      return { ...current, scale };
    });
  };

  const currentImage = images[normalizedIndex];
  const counter = `${normalizedIndex + 1} / ${imageCount}`;
  const galleryTrackClassName = ['lot-gallery-track', galleryDragging ? 'is-dragging' : '', galleryResetting ? 'is-resetting' : '']
    .filter(Boolean)
    .join(' ');
  const galleryTrackStyle = {
    transform: `translate3d(calc(${-galleryTrackIndex * 100}% + ${galleryDragOffsetPx}px), 0, 0)`
  } as CSSProperties;
  const viewerIsTransformed =
    Math.abs(viewerTransform.scale - 1) > 0.01 || Math.abs(viewerTransform.offsetX) > 1 || Math.abs(viewerTransform.offsetY) > 1;
  const viewerImageStyle = {
    '--viewer-scale': String(viewerTransform.scale),
    '--viewer-offset-x': `${viewerTransform.offsetX}px`,
    '--viewer-offset-y': `${viewerTransform.offsetY}px`
  } as CSSProperties;
  const viewer = viewerOpen && currentImage ? (
    <div className="image-viewer-backdrop" role="dialog" aria-modal="true" aria-label={t('product.imageViewer')} onClick={closeViewer}>
      <div className="image-viewer-panel" onClick={(event) => event.stopPropagation()}>
        <button className="image-viewer-close" type="button" aria-label={t('common.close')} onClick={closeViewer}>
          <X size={22} />
        </button>
        <button
          className={viewerGesturing ? 'image-viewer-image is-gesturing' : 'image-viewer-image'}
          type="button"
          aria-label={t('product.imageViewer')}
          onPointerDown={startViewerGesture}
          onPointerMove={moveViewerGesture}
          onPointerUp={endViewerGesture}
          onPointerCancel={endViewerGesture}
          onWheel={zoomViewerByWheel}
        >
          <img src={currentImage} alt={`${lot.title} ${normalizedIndex + 1}`} style={viewerImageStyle} />
        </button>
        {imageCount > 1 ? (
          <>
            <button className="image-viewer-nav is-prev" type="button" aria-label={t('product.previousImage')} onClick={() => moveImage(-1)}>
              <ChevronLeft size={24} />
            </button>
            <button className="image-viewer-nav is-next" type="button" aria-label={t('product.nextImage')} onClick={() => moveImage(1)}>
              <ChevronRight size={24} />
            </button>
          </>
        ) : null}
        {viewerIsTransformed ? (
          <button className="image-viewer-reset" type="button" aria-label={t('product.resetImage')} onClick={resetViewerTransform}>
            <RotateCcw size={24} />
            <span>{t('product.resetImage')}</span>
          </button>
        ) : null}
        <span className="image-viewer-counter">{counter}</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section className="lot-gallery" aria-label={t('product.imageViewer')}>
        <button
          ref={galleryMediaRef}
          className="lot-gallery-media-button"
          type="button"
          aria-label={t('product.openImageViewer')}
          onClick={openViewer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishGalleryGesture}
          onPointerCancel={finishGalleryGesture}
        >
          <div className={galleryTrackClassName} style={galleryTrackStyle} onTransitionEnd={handleGalleryTransitionEnd}>
            {images.length ? (
              galleryItems.map((item) => (
                <div className="lot-gallery-slide" key={item.key}>
                  <img src={item.imageUrl} alt={`${lot.title} ${item.imageIndex + 1}`} />
                </div>
              ))
            ) : (
              <div className="lot-gallery-slide">
                <VisualPlaceholder title={lot.title} tone="red" />
              </div>
            )}
          </div>
        </button>
        {imageCount > 1 ? (
          <>
            <button className="lot-gallery-nav is-prev" type="button" aria-label={t('product.previousImage')} onClick={() => moveImage(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="lot-gallery-nav is-next" type="button" aria-label={t('product.nextImage')} onClick={() => moveImage(1)}>
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
        <span className="lot-gallery-counter">{counter}</span>
      </section>
      {viewer ? createPortal(viewer, document.body) : null}
    </>
  );
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointerEntries(points: Map<number, PointerPoint>): Array<{ pointerId: number; point: PointerPoint }> {
  return Array.from(points.entries()).map(([pointerId, point]) => ({ pointerId, point }));
}

function pinchGesture(first: PointerPoint, second: PointerPoint) {
  const distance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
  return {
    distance,
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2
  };
}

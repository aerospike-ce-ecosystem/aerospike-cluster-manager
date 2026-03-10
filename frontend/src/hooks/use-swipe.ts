"use client";

import { useEffect, useRef } from "react";

interface UseSwipeOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  edgeThreshold?: number;
  minDistance?: number;
}

export function useSwipe({
  onSwipeRight,
  onSwipeLeft,
  edgeThreshold = 30,
  minDistance = 60,
}: UseSwipeOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const isEdgeSwipe = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      isEdgeSwipe.current = touch.clientX <= edgeThreshold;
    }

    function handleTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // Only trigger if horizontal movement is dominant
      if (Math.abs(dx) < minDistance || Math.abs(dy) > Math.abs(dx)) return;

      if (dx > 0 && isEdgeSwipe.current && onSwipeRight) {
        onSwipeRight();
      } else if (dx < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true, signal });
    document.addEventListener("touchend", handleTouchEnd, { passive: true, signal });
    return () => {
      controller.abort();
    };
  }, [onSwipeRight, onSwipeLeft, edgeThreshold, minDistance]);
}

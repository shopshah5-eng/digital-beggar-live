"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BroadcastMessage, StreamEvent, StreamState } from "../types/events";
import { ANIMATION_MAP, DEFAULT_IDLE_ANIMATION } from "../config/animations";

export interface StreamNotification {
  id: number;
  message: string;
  subtext?: string;
  type: "support" | "sponsor" | "gratitude" | "info";
}

const DEFAULT_INITIAL_STATE: StreamState = {
  streamId: "stream_live_01",
  status: "active",
  goalAmount: 100000,
  raisedAmount: 0,
  currentSponsor: null,
  currentSponsorBid: 0,
  minimumNextBid: 500,
  recentSupport: null,
  lastEvent: null,
  viewerDisplayMode: "static_demo",
  demoMode: true,
};

export function useStreamRealtime() {
  const [streamState, setStreamState] = useState<StreamState>(DEFAULT_INITIAL_STATE);
  const [currentAnimation, setCurrentAnimation] = useState<string>(DEFAULT_IDLE_ANIMATION);
  const [notification, setNotification] = useState<StreamNotification | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [queueLength, setQueueLength] = useState<number>(0);
  const [recentEventsList, setRecentEventsList] = useState<StreamEvent[]>([]);

  // Reaction Queue references to manage sequential execution
  const queueRef = useRef<StreamEvent[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const maxQueueSize = 15;
  const maxProcessedIds = 50;

  const updateQueueMetrics = useCallback(() => {
    setQueueLength(queueRef.current.length);
  }, []);

  const processNextInQueue = useCallback(() => {
    updateQueueMetrics();
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false;
      setCurrentAnimation(DEFAULT_IDLE_ANIMATION);
      return;
    }

    isPlayingRef.current = true;
    const nextEvent = queueRef.current.shift()!;
    updateQueueMetrics();
    const animConfig = ANIMATION_MAP[nextEvent.type];

    if (!animConfig || !animConfig.videoSrc) {
      console.warn(`No animation mapping found for event type: ${nextEvent.type}`);
      processNextInQueue();
      return;
    }

    // Set animation and banner notification
    setCurrentAnimation(animConfig.videoSrc);

    if (animConfig.notificationMessage) {
      const notifId = Date.now();
      const sub = animConfig.notificationSubtext
        ? animConfig.notificationSubtext({
            displayName: nextEvent.displayName,
            amount: nextEvent.amount,
            metadata: nextEvent.metadata,
          })
        : undefined;

      setNotification({
        id: notifId,
        message: animConfig.notificationMessage,
        subtext: sub,
        type: animConfig.notificationType,
      });

      // Auto dismiss banner after 4.2 seconds
      setTimeout(() => {
        setNotification((prev) => (prev?.id === notifId ? null : prev));
      }, 4200);
    }
  }, [updateQueueMetrics]);

  // Called when video ends playing
  const handleAnimationEnd = useCallback(() => {
    if (queueRef.current.length > 0) {
      processNextInQueue();
    } else {
      isPlayingRef.current = false;
      setCurrentAnimation(DEFAULT_IDLE_ANIMATION);
      updateQueueMetrics();
    }
  }, [processNextInQueue, updateQueueMetrics]);

  // Connect to SSE stream
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    const connectSSE = () => {
      if (!isSubscribed) return;
      eventSource = new EventSource("/api/events/stream");

      eventSource.onopen = () => {
        if (!isSubscribed) return;
        setIsConnected(true);

        // Fetch fresh state on connect / reconnect to ensure zero missed updates
        fetch("/api/stream/state")
          .then((res) => res.json())
          .then((fresh) => {
            if (isSubscribed && fresh && typeof fresh.raisedAmount === "number") {
              setStreamState(fresh);
            }
          })
          .catch(() => {});
      };

      eventSource.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          const msg: BroadcastMessage = JSON.parse(event.data);

          if (msg.state) {
            setStreamState(msg.state);
          }

          if (msg.type === "STATE_RESET") {
            queueRef.current = [];
            isPlayingRef.current = false;
            setCurrentAnimation(DEFAULT_IDLE_ANIMATION);
            setNotification(null);
            updateQueueMetrics();
            setRecentEventsList([]);
          }

          if (msg.type === "STREAM_EVENT" && msg.event) {
            const streamEv = msg.event;
            const evId = streamEv.id || `${streamEv.type}_${streamEv.timestamp}`;

            // Track recent events list (max 10)
            setRecentEventsList((prev) => [streamEv, ...prev.slice(0, 9)]);

            // Deduplicate incoming events
            if (processedEventIdsRef.current.has(evId)) {
              return;
            }
            processedEventIdsRef.current.add(evId);
            if (processedEventIdsRef.current.size > maxProcessedIds) {
              const first = processedEventIdsRef.current.values().next().value;
              if (first) processedEventIdsRef.current.delete(first);
            }

            const config = ANIMATION_MAP[streamEv.type];
            if (config && streamEv.type !== "IDLE") {
              // Bound queue to maxQueueSize
              if (queueRef.current.length >= maxQueueSize) {
                queueRef.current.shift();
              }
              queueRef.current.push(streamEv);
              updateQueueMetrics();
              if (!isPlayingRef.current) {
                processNextInQueue();
              }
            }
          }
        } catch (err) {
          console.error("Failed to parse SSE event message:", err);
        }
      };

      eventSource.onerror = () => {
        if (!isSubscribed) return;
        setIsConnected(false);
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      isSubscribed = false;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [processNextInQueue, updateQueueMetrics]);

  return {
    streamState,
    currentAnimation,
    notification,
    isConnected,
    queueLength,
    recentEventsList,
    handleAnimationEnd,
  };
}

import { useEffect, useRef, useCallback, useState } from 'react';

export interface FlowEvent {
  id: string;
  orchestrationId: string;
  phase: 'decomposition' | 'model_selection' | 'execution' | 'integration' | 'orchestration';
  step: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  data?: Record<string, any>;
  timestamp: number;
  duration?: number;
}

export interface FlowOrchestration {
  id: string;
  startTime: number;
  status: 'running' | 'completed' | 'failed';
  phases: string[];
  currentPhase: string;
}

interface UseFlowSSEOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseFlowSSEReturn {
  isConnected: boolean;
  lastEvent: FlowEvent | null;
  events: FlowEvent[];
  clearEvents: () => void;
}

export function useFlowSSE(
  onEvent: (event: FlowEvent) => void,
  options: UseFlowSSEOptions = {}
): UseFlowSSEReturn {
  const {
    url = 'http://localhost:3458/v1/flow/subscribe',
    reconnectInterval = 3000,
    maxReconnectAttempts = 5
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<FlowEvent | null>(null);
  const [events, setEvents] = useState<FlowEvent[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Ignore initial connection message
          if (data.type === 'connected') {
            return;
          }

          const flowEvent: FlowEvent = data;
          setLastEvent(flowEvent);
          setEvents((prev) => {
            // Keep last 500 events
            const newEvents = [...prev, flowEvent];
            if (newEvents.length > 500) {
              return newEvents.slice(-500);
            }
            return newEvents;
          });
          onEvent(flowEvent);
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = (event) => {
        // Ignore intentional close events
        if (event.eventPhase === EventSource.CLOSED) {
          return;
        }

        setIsConnected(false);
        eventSource.close();

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          // Clear any existing timeout before setting a new one
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (err) {
      console.error('Failed to create EventSource:', err);
    }
  }, [url, onEvent, reconnectInterval, maxReconnectAttempts]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    events,
    clearEvents
  };
}

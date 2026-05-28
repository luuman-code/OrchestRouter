import { useEffect, useRef, useCallback, useState } from 'react';

export interface ModelResponseEvent {
  id: string;
  taskId: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'complete' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface TaskResponse {
  id: string;
  taskId: string;
  query: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  thinking: string;
  toolCalls: ModelResponseEvent[];
  response: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: string;
  sessionId?: string;
}

interface UseModelResponseSSEOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onTaskStart?: (task: TaskResponse) => void;
  onTaskComplete?: (task: TaskResponse) => void;
  onTaskError?: (taskId: string, error: string) => void;
}

interface UseModelResponseSSEReturn {
  isConnected: boolean;
  tasks: TaskResponse[];
  activeTasks: TaskResponse[];
  completedTasks: TaskResponse[];
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;
  cancelTask: (taskId: string) => void;
  endSession: () => void;
}

export function useModelResponseSSE(
  options: UseModelResponseSSEOptions = {}
): UseModelResponseSSEReturn {
  const {
    url = 'http://localhost:3458/v1/model/response/subscribe',
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    onTaskStart,
    onTaskComplete,
    onTaskError
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Generate session ID
  const generateSessionId = useCallback(() => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Get or create session ID
  const getSessionId = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = generateSessionId();
    }
    return sessionIdRef.current;
  }, [generateSessionId]);

  // Update or create task from event
  const updateTaskFromEvent = useCallback((event: ModelResponseEvent): TaskResponse => {
    return {
      id: event.taskId,
      taskId: event.taskId,
      query: '', // Will be set when task starts
      status: 'streaming',
      thinking: '',
      toolCalls: [],
      response: '',
      startTime: event.timestamp,
      sessionId: sessionIdRef.current || undefined
    };
  }, []);

  // Handle incoming SSE event
  const handleEvent = useCallback((event: ModelResponseEvent) => {
    setTasks((prevTasks) => {
      const existingIndex = prevTasks.findIndex(t => t.taskId === event.taskId);
      let updatedTasks = [...prevTasks];

      if (event.type === 'thinking') {
        // Update thinking content
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            thinking: updatedTasks[existingIndex].thinking + event.content
          };
        }
      } else if (event.type === 'tool_call') {
        // Add tool call
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            toolCalls: [...updatedTasks[existingIndex].toolCalls, event]
          };
        }
      } else if (event.type === 'tool_result') {
        // Update last tool call with result
        if (existingIndex >= 0) {
          const toolCalls = [...updatedTasks[existingIndex].toolCalls];
          const lastCallIndex = toolCalls.findIndex(
            tc => tc.toolName === event.toolName && !tc.toolResult
          );
          if (lastCallIndex >= 0) {
            toolCalls[lastCallIndex] = { ...toolCalls[lastCallIndex], toolResult: event.toolResult };
          }
          updatedTasks[existingIndex] = { ...updatedTasks[existingIndex], toolCalls };
        }
      } else if (event.type === 'response') {
        // Append to response
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            response: updatedTasks[existingIndex].response + event.content
          };
        }
      } else if (event.type === 'complete') {
        // Mark task as completed
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            status: 'completed',
            endTime: event.timestamp,
            duration: event.duration
          };
          onTaskComplete?.(updatedTasks[existingIndex]);
        }
      } else if (event.type === 'error') {
        // Mark task as failed
        if (existingIndex >= 0) {
          updatedTasks[existingIndex] = {
            ...updatedTasks[existingIndex],
            status: 'failed',
            error: event.content,
            endTime: event.timestamp
          };
          onTaskError?.(event.taskId, event.content);
        }
      }

      return updatedTasks;
    });
  }, [onTaskComplete, onTaskError]);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sessionId = getSessionId();
    const connectUrl = `${url}?session_id=${sessionId}`;

    try {
      const eventSource = new EventSource(connectUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          // Handle initial connection message
          if (data.type === 'connected') {
            sessionIdRef.current = data.sessionId;
            return;
          }

          // Handle task start message
          if (data.type === 'task_start') {
            const newTask: TaskResponse = {
              id: data.taskId,
              taskId: data.taskId,
              query: data.query || '',
              status: 'streaming',
              thinking: '',
              toolCalls: [],
              response: '',
              startTime: data.timestamp || Date.now(),
              sessionId: sessionIdRef.current || undefined
            };
            setTasks((prev) => [...prev, newTask]);
            onTaskStart?.(newTask);
            return;
          }

          const event: ModelResponseEvent = data;
          handleEvent(event);
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
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
  }, [url, handleEvent, onTaskStart, reconnectInterval, maxReconnectAttempts, getSessionId]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // End session
  const endSession = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await fetch(`http://localhost:3458/v1/model/response/session/${sessionIdRef.current}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Failed to end session:', err);
      }
    }
    cleanup();
    sessionIdRef.current = null;
  }, [cleanup]);

  // Cancel task
  const cancelTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`http://localhost:3458/v1/model/response/task/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId ? { ...t, status: 'cancelled' as const } : t
        )
      );
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  }, []);

  // Clear completed tasks
  const clearCompletedTasks = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'));
  }, []);

  // Clear all tasks
  const clearAllTasks = useCallback(() => {
    setTasks([]);
  }, []);

  // Setup SSE connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  // Heartbeat to keep session alive
  useEffect(() => {
    const heartbeatInterval = setInterval(async () => {
      if (sessionIdRef.current && isConnected) {
        try {
          await fetch(`http://localhost:3458/v1/model/response/session/${sessionIdRef.current}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          // Silently fail heartbeat
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(heartbeatInterval);
  }, [isConnected]);

  // Page close cleanup using sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        const data = JSON.stringify({ sessionId: sessionIdRef.current });
        navigator.sendBeacon(
          'http://localhost:3458/v1/model/response/session/cleanup',
          new Blob([data], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const activeTasks = tasks.filter((t) => t.status === 'streaming' || t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');

  return {
    isConnected,
    tasks,
    activeTasks,
    completedTasks,
    clearCompletedTasks,
    clearAllTasks,
    cancelTask,
    endSession
  };
}

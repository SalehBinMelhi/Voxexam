import { useState, useEffect, useCallback, useRef } from "react";

type MessageHandler = (data: any) => void;

interface WebSocketState {
  connected: boolean;
  sendMessage: (type: string, payload?: any) => void;
  onMessage: (type: string, handler: MessageHandler) => () => void;
}

let globalWs: WebSocket | null = null;
let globalHandlers: Map<string, Set<MessageHandler>> = new Map();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function connectWebSocket() {
  if (isConnecting || (globalWs && globalWs.readyState === WebSocket.OPEN)) return;
  isConnecting = true;

  try {
    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      globalWs = ws;
      isConnecting = false;
      const handlers = globalHandlers.get("_connection");
      if (handlers) handlers.forEach(h => h({ connected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const handlers = globalHandlers.get(message.type);
        if (handlers) handlers.forEach(h => h(message));
        const allHandlers = globalHandlers.get("*");
        if (allHandlers) allHandlers.forEach(h => h(message));
      } catch (e) {
        console.error("[WS] Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      globalWs = null;
      isConnecting = false;
      const handlers = globalHandlers.get("_connection");
      if (handlers) handlers.forEach(h => h({ connected: false }));
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      isConnecting = false;
    };
  } catch (e) {
    isConnecting = false;
  }
}

export function useWebSocket(): WebSocketState {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    connectWebSocket();

    const connHandler = (data: any) => setConnected(data.connected);
    if (!globalHandlers.has("_connection")) {
      globalHandlers.set("_connection", new Set());
    }
    globalHandlers.get("_connection")!.add(connHandler);

    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      setConnected(true);
    }

    return () => {
      globalHandlers.get("_connection")?.delete(connHandler);
      for (const cleanup of handlersRef.current) {
        cleanup();
      }
    };
  }, []);

  const sendMessage = useCallback((type: string, payload: any = {}) => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  const onMessage = useCallback((type: string, handler: MessageHandler) => {
    if (!globalHandlers.has(type)) {
      globalHandlers.set(type, new Set());
    }
    globalHandlers.get(type)!.add(handler);

    const cleanup = () => {
      globalHandlers.get(type)?.delete(handler);
    };
    handlersRef.current.push(cleanup);
    return cleanup;
  }, []);

  return { connected, sendMessage, onMessage };
}

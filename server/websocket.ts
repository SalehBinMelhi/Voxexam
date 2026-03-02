import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { storage } from "./storage";

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userRole: string;
}

class VoxWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient[]> = new Map();

  constructor(server: Server, sessionParser: any) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request: IncomingMessage, socket, head) => {
      if (request.url !== "/ws") {
        return;
      }

      sessionParser(request, {} as any, () => {
        const session = (request as any).session;
        const passport = session?.passport;
        const user = passport?.user;

        if (!user?.claims?.sub) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request, user);
        });
      });
    });

    this.wss.on("connection", (ws: WebSocket, _request: IncomingMessage, user: any) => {
      const userId = user.claims.sub;

      storage.getUser(userId).then(dbUser => {
        const userRole = dbUser?.role || "unknown";
        const client: ConnectedClient = { ws, userId, userRole };

        if (!this.clients.has(userId)) {
          this.clients.set(userId, []);
        }
        this.clients.get(userId)!.push(client);

        console.log(`[WS] Client connected: ${userId} (${userRole}), total connections: ${this.getTotalConnections()}`);

        ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(client, message);
          } catch (e) {
            console.error("[WS] Invalid message:", e);
          }
        });

        ws.on("close", () => {
          const userClients = this.clients.get(userId);
          if (userClients) {
            const idx = userClients.indexOf(client);
            if (idx !== -1) userClients.splice(idx, 1);
            if (userClients.length === 0) this.clients.delete(userId);
          }
          console.log(`[WS] Client disconnected: ${userId}, total connections: ${this.getTotalConnections()}`);
        });

        ws.on("error", (err) => {
          console.error(`[WS] Error for ${userId}:`, err.message);
        });

        this.send(ws, { type: "connected", userId });
      });
    });
  }

  private handleMessage(client: ConnectedClient, message: any) {
    const { type, targetUserId, ...rest } = message;
    const outgoing = { type, ...rest, from: client.userId };

    switch (type) {
      case "chat_message":
      case "support_request":
      case "support_status_update":
        if (client.userRole === "admin" && targetUserId) {
          this.sendToUser(targetUserId, outgoing);
        } else {
          this.sendToAdmins(outgoing);
        }
        break;

      case "call_request":
      case "call_response":
      case "screen_share_offer":
      case "screen_share_answer":
      case "ice_candidate":
        if (targetUserId) {
          this.sendToUser(targetUserId, outgoing);
        }
        break;

      case "ping":
        this.send(client.ws, { type: "pong" });
        break;

      default:
        console.log(`[WS] Unknown message type: ${type}`);
    }
  }

  private send(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  sendToUser(userId: string, data: any) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const msg = JSON.stringify(data);
      for (const client of userClients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(msg);
        }
      }
    }
  }

  sendToAdmins(data: any) {
    const msg = JSON.stringify(data);
    for (const [, clients] of this.clients) {
      for (const client of clients) {
        if (client.userRole === "admin" && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(msg);
        }
      }
    }
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.clients.keys());
  }

  private getTotalConnections(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.length;
    }
    return total;
  }
}

let wsServer: VoxWebSocketServer | null = null;

export function setupWebSocket(server: Server, sessionParser: any): VoxWebSocketServer {
  wsServer = new VoxWebSocketServer(server, sessionParser);
  return wsServer;
}

export function getWebSocketServer(): VoxWebSocketServer | null {
  return wsServer;
}

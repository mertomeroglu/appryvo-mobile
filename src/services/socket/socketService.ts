import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/apiClient';
import { secureStorage } from '../../native/secureStorage';

type EventListenerMap = Map<string, Set<(...args: any[]) => void>>;
const DEBUG = import.meta.env.DEV;

export class SocketService {
  private static instance: SocketService | null = null;
  private socket: Socket | null = null;
  private listeners: EventListenerMap = new Map();
  private isConnecting = false;
  private conversationRooms = new Set<string>();

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public async connect(): Promise<Socket | null> {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    // A socket that exists but isn't currently connected is still mid auto-reconnect (the
    // `reconnection: true` manager retries on the SAME instance) -- multiple call sites invoke
    // connect() independently (app-foreground, network-status-restored, RealtimeSync's initial
    // connect), and network state changes (e.g. wifi and mobile data both coming back within the
    // same few seconds) can fire more than one of these in quick succession, spaced further apart
    // than the isConnecting guard below covers. Tearing down and creating a brand-new io()
    // instance here would orphan the existing one -- it keeps retrying in the background,
    // producing two live sockets that both join the user's room and both deliver every event,
    // i.e. duplicate 'connect'/'user:updated'/message events. Let the existing manager keep
    // retrying instead of racing it.
    if (this.socket) {
      // `.active` is true while socket.io's own manager is still connected or auto-retrying;
      // it flips to false once reconnectionAttempts is exhausted or after an explicit
      // disconnect(), meaning this reference is dead and must NOT be reused.
      if (this.socket.active) {
        return this.socket;
      }
      this.socket = null;
    }
    if (this.isConnecting) return null;

    this.isConnecting = true;
    const token = await secureStorage.getAccessToken();

    if (!token) {
      this.isConnecting = false;
      return null;
    }

    try {
      this.socket = io(API_BASE_URL, {
        auth: { token },
        extraHeaders: { Authorization: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        autoConnect: true,
      });

      this.setupBaseListeners();
      this.reattachListeners();
      this.isConnecting = false;
      return this.socket;
    } catch (err) {
      console.error('[SOCKET CONNECT ERROR]', err);
      this.isConnecting = false;
      return null;
    }
  }

  // Re-applies every listener registered via the public on() method to the current socket
  // instance. Necessary because connect() creates a brand-new `io(...)` socket both on first
  // connect and on reconnectWithNewToken() (used after a 401 token refresh) -- without this,
  // any listener registered before that socket existed, or registered against a now-replaced
  // instance, was silently orphaned: stored in `listeners` but never actually attached, so
  // chat/presence/call events (and anything else using socketService.on) would stop arriving
  // after a token refresh until the owning component happened to remount.
  private reattachListeners() {
    if (!this.socket) return;
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const callback of callbacks) {
        this.socket.off(event, callback);
        this.socket.on(event, callback);
      }
    }
  }

  private setupBaseListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      if (DEBUG) console.log('[SOCKET CONNECTED] ID:', this.socket?.id);
      // Socket.IO room membership belongs to the physical connection. Rejoin every open
      // conversation after both first connect and reconnect so an in-flight chat never goes
      // stale after a network handoff or token refresh.
      this.conversationRooms.forEach((matchId) => {
        this.socket?.emit('join:conversation', matchId);
      });
    });

    this.socket.on('disconnect', (reason) => {
      if (DEBUG) console.log('[SOCKET DISCONNECTED] Reason:', reason);
    });

    this.socket.on('connect_error', (err) => {
      if (DEBUG) console.warn('[SOCKET CONNECT ERROR]', err.message);
    });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  public async reconnectWithNewToken() {
    this.disconnect();
    return await this.connect();
  }

  // Duplicate listener protection pattern
  public on(event: string, callback: (...args: any[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventSet = this.listeners.get(event)!;
    if (eventSet.has(callback)) {
      // Prevent duplicate listener registration
      return () => this.off(event, callback);
    }

    eventSet.add(callback);

    if (this.socket) {
      this.socket.off(event, callback);
      this.socket.on(event, callback);
    }

    return () => this.off(event, callback);
  }

  public off(event: string, callback: (...args: any[]) => void) {
    const eventSet = this.listeners.get(event);
    if (eventSet) {
      eventSet.delete(callback);
      if (eventSet.size === 0) {
        this.listeners.delete(event);
      }
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  public emit(event: string, data?: any, ackCallback?: (response: any) => void) {
    if (this.socket && !this.socket.active) this.socket = null;
    if (!this.socket) {
      if (DEBUG) console.warn('[SOCKET EMIT WARNING] Socket is not connected, attempting connect...');
      this.connect().then((sock) => {
        if (sock) {
          // socket.io buffers outbound events while its manager establishes/re-establishes the
          // transport. Emitting here is intentional; checking sock.connected first used to
          // silently drop joins and sends issued during the connection handshake.
          if (typeof ackCallback === 'function') {
            sock.emit(event, data, ackCallback);
          } else {
            sock.emit(event, data);
          }
        }
      });
      return;
    }

    if (typeof ackCallback === 'function') {
      this.socket.emit(event, data, ackCallback);
    } else {
      this.socket.emit(event, data);
    }
  }

  // Domain Specific Contract Actions from docs/mobile-api-contract.json
  public joinConversation(matchId: string) {
    this.conversationRooms.add(matchId);
    this.emit('join:conversation', matchId);
  }

  public leaveConversation(matchId: string) {
    this.conversationRooms.delete(matchId);
    this.emit('leave:conversation', matchId);
  }

  public sendMessage(payload: { matchId: string; text?: string; mediaUrl?: string; replyToMessageId?: string; replyToStoryId?: string; clientMessageId?: string; messageType?: string; isViewOnce?: boolean; durationSeconds?: number; thumbnailUrl?: string }, ack?: (res: any) => void) {
    if (!ack) {
      this.emit('message:send', payload);
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      ack({ status: 'error', code: 'SOCKET_TIMEOUT', message: 'Bağlantı kurulamadı. Tekrar dene.' });
    }, 12000);
    this.emit('message:send', payload, (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      ack(response);
    });
  }

  public startTyping(matchId: string) {
    this.emit('typing:start', { matchId });
  }

  public stopTyping(matchId: string) {
    this.emit('typing:stop', { matchId });
  }

  public queryPresence(targetUserId: string) {
    this.emit('presence:query', { targetUserId });
  }

  public markMessagesRead(matchId: string, messageIds?: string[]) {
    this.emit('message:read', { matchId, messageIds });
  }

  public reactToMessage(matchId: string, messageId: string, reaction?: string) {
    this.emit('message:reaction', { matchId, messageId, reaction });
  }

  public startCall(payload: { callId: string; calleeUid: string; matchId: string; type: 'voice' | 'video'; offer: any }) {
    this.emit('call:start', payload);
  }

  public answerCall(payload: { callId: string; answer: any }) {
    this.emit('call:answer', payload);
  }

  public sendIceCandidate(payload: { callId: string; candidate: any }) {
    this.emit('call:ice-candidate', payload);
  }

  public sendRenegotiateOffer(payload: { callId: string; offer: any }) {
    this.emit('call:renegotiate-offer', payload);
  }

  public sendRenegotiateAnswer(payload: { callId: string; answer: any }) {
    this.emit('call:renegotiate-answer', payload);
  }

  public endCall(payload: { callId: string; reason?: string }) {
    this.emit('call:end', payload);
  }
}

export const socketService = SocketService.getInstance();

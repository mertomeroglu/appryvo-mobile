import { apiClient, ApiException } from '../api/apiClient';

export type QueuedDiscoveryDirection = 'left' | 'right' | 'up';

export interface QueuedDiscoveryAction {
  viewerId: string;
  targetUserId: string;
  direction: QueuedDiscoveryDirection;
  createdAt: number;
}

const STORAGE_KEY = 'ryvo_discovery_action_outbox_v1';
const flushesInFlight = new Map<string, Promise<{ sent: number; pending: number }>>();

function readQueue(): QueuedDiscoveryAction[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.viewerId && item?.targetUserId && item?.direction) : [];
  } catch {
    return [];
  }
}

function writeQueue(actions: QueuedDiscoveryAction[]) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
}

export function enqueueDiscoveryAction(action: QueuedDiscoveryAction) {
  const queue = readQueue();
  const alreadyQueued = queue.some((item) => (
    item.viewerId === action.viewerId && item.targetUserId === action.targetUserId && item.direction === action.direction
  ));
  if (!alreadyQueued) writeQueue([...queue, action]);
}

export function getPendingDiscoveryActionCount(viewerId: string) {
  return readQueue().filter((item) => item.viewerId === viewerId).length;
}

export function isRetryableDiscoveryError(error: unknown) {
  return error instanceof ApiException && (
    error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.statusCode >= 500
  );
}

export async function flushDiscoveryActions(viewerId: string) {
  const existingFlush = flushesInFlight.get(viewerId);
  if (existingFlush) return existingFlush;
  const flush = (async () => {
    const queue = readQueue();
    const otherUsers = queue.filter((item) => item.viewerId !== viewerId);
    const pending = queue.filter((item) => item.viewerId === viewerId);
    const remaining: QueuedDiscoveryAction[] = [];
    let sent = 0;

    for (let index = 0; index < pending.length; index += 1) {
      const action = pending[index];
      try {
        if (action.direction === 'left') {
          await apiClient.post('/api/discovery/pass', { targetUserId: action.targetUserId });
        } else {
          await apiClient.post('/api/discovery/like', {
            targetUserId: action.targetUserId,
            isSuperLike: action.direction === 'up',
          });
        }
        sent += 1;
      } catch (error) {
        if (isRetryableDiscoveryError(error)) {
          remaining.push(...pending.slice(index));
          break;
        }
        // Permanent 4xx failures must not poison later actions in the outbox.
      }
    }

    writeQueue([...otherUsers, ...remaining]);
    return { sent, pending: remaining.length };
  })();
  flushesInFlight.set(viewerId, flush);
  try {
    return await flush;
  } finally {
    flushesInFlight.delete(viewerId);
  }
}

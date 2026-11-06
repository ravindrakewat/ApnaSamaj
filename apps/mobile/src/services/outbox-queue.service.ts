import { AppState, AppStateStatus } from 'react-native';
import { LocalChatMessage, MessageDeliveryStatus, ChatAttachmentInput } from '@apnasamaj/shared-types';
import { chatPersistenceService, ChatPersistenceService } from './chat-persistence.service';
import { chatApi } from '../api/chat.api';
import { getAuthTokens, getStoredCommunitySlug } from './storage.service';

/**
 * Outbox Queue Service
 *
 * Coordinates offline-first message dispatch, exponential retry backoff, in-flight deduplication,
 * and conversational order preservation.
 *
 * Suggested Flow:
 * UI -> chatPersistence.savePendingMessage -> outboxQueue.enqueue -> REST API -> Server Confirmation -> chatPersistence.markSent
 */

export type OutboxListener = (event: {
  tempId: string;
  conversationId: string;
  status: MessageDeliveryStatus;
  serverMessageId?: string;
  error?: string | null;
}) => void;

const BACKOFF_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];
const MAX_RETRIES = 5;

export class OutboxQueueService {
  private persistence: ChatPersistenceService;
  private processingLocks = new Set<string>(); // tempIds currently being transmitted
  private conversationLocks = new Set<string>(); // conversationIds currently processing a message
  private listeners: OutboxListener[] = [];
  private retryTimers = new Set<NodeJS.Timeout>();
  private isProcessing = false;
  private hasPendingWork = false;
  private activeTenantSlug: string | null = null;
  private activeUserId: string | null = null;
  private isOnline = true;
  private appStateSubscription: any = null;

  constructor(persistence: ChatPersistenceService = chatPersistenceService) {
    this.persistence = persistence;
  }

  /**
   * Initializes the outbox queue with current user session and tenant context.
   */
  public async initialize(tenantSlug: string, userId: string): Promise<void> {
    this.activeTenantSlug = tenantSlug;
    this.activeUserId = userId;

    // 1. Recover any messages that were mid-flight when app closed/crashed
    await this.persistence.recoverStuckSendingMessages(tenantSlug, userId);

    // 2. Set up AppState listener to automatically drain queue when app returns to foreground
    if (!this.appStateSubscription && AppState && typeof AppState.addEventListener === 'function') {
      this.appStateSubscription = AppState.addEventListener('change', (nextStatus: AppStateStatus) => {
        if (nextStatus === 'active') {
          this.processQueue();
        }
      });
    }

    // 3. Trigger initial drain of any pending items
    this.processQueue();
  }

  /**
   * Sets current network online/offline state.
   */
  public setOnlineStatus(online: boolean): void {
    const wasOffline = !this.isOnline && online;
    this.isOnline = online;

    if (wasOffline) {
      // Network came back online, immediately process queue
      this.processQueue();
    }
  }

  /**
   * Registers a subscriber callback for message delivery status transitions.
   */
  public subscribe(listener: OutboxListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(event: {
    tempId: string;
    conversationId: string;
    status: MessageDeliveryStatus;
    serverMessageId?: string;
    error?: string | null;
  }): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[OutboxQueue] Listener error:', err);
      }
    }
  }

  /**
   * Enqueues an outgoing chat message, updates local persistence, and triggers dispatch.
   */
  public async enqueue(payload: {
    tempId: string;
    conversationId: string;
    conversationType: 'DIRECT' | 'GROUP';
    content: string;
    attachment?: ChatAttachmentInput | null;
    replyToMessageId?: string;
    replyTo?: any;
    tenantSlug: string;
    userId: string;
  }): Promise<LocalChatMessage> {
    const saved = await this.persistence.savePendingMessage({
      tempId: payload.tempId,
      conversationId: payload.conversationId,
      conversationType: payload.conversationType,
      senderId: payload.userId,
      content: payload.content,
      attachment: payload.attachment || null,
      replyToMessageId: payload.replyToMessageId || null,
      replyTo: payload.replyTo || null,
      tenantSlug: payload.tenantSlug,
      userId: payload.userId,
    });

    this.notifyListeners({
      tempId: saved.tempId,
      conversationId: saved.conversationId,
      status: 'pending',
    });

    // Trigger asynchronous queue processor
    this.processQueue();

    return saved;
  }

  /**
   * Manually retries sending a failed message.
   */
  public async retryMessage(tempId: string): Promise<boolean> {
    if (!this.activeTenantSlug || !this.activeUserId) return false;

    // Reset status to pending
    const updated = await this.persistence.updateMessageDeliveryStatus(tempId, 'pending', {
      lastError: null,
      tenantSlug: this.activeTenantSlug,
      userId: this.activeUserId,
    });

    if (!updated) return false;

    this.notifyListeners({
      tempId,
      conversationId: updated.conversationId,
      status: 'pending',
    });

    this.processQueue();
    return true;
  }

  /**
   * Processes the outbox queue in conversational FIFO order.
   */
  public async processQueue(): Promise<void> {
    if (!this.isOnline || !this.activeTenantSlug || !this.activeUserId) {
      return;
    }
    if (this.isProcessing) {
      this.hasPendingWork = true;
      return;
    }

    this.isProcessing = true;

    try {
      // Verify active credentials exist
      const tokens = await getAuthTokens();
      if (!tokens.accessToken) {
        console.log('[DEBUG OutboxQueue] No accessToken found:', tokens);
        return;
      }

      const pendingMessages = await this.persistence.getPendingOutboxMessages(
        this.activeTenantSlug,
        this.activeUserId
      );

      if (pendingMessages.length === 0) {
        return;
      }

      // Group pending messages by conversationId to enforce strict sequential ordering per conversation
      const conversationMap = new Map<string, LocalChatMessage[]>();
      for (const msg of pendingMessages) {
        const list = conversationMap.get(msg.conversationId) || [];
        list.push(msg);
        conversationMap.set(msg.conversationId, list);
      }

      // Dispatch conversations concurrently, but process items within each conversation strictly in order
      const conversationPromises: Promise<void>[] = [];
      for (const [convId, msgs] of conversationMap.entries()) {
        if (!this.conversationLocks.has(convId)) {
          conversationPromises.push(this.processConversationQueue(convId, msgs));
        }
      }

      await Promise.all(conversationPromises);
    } finally {
      this.isProcessing = false;
      if (this.hasPendingWork) {
        this.hasPendingWork = false;
        this.processQueue();
      }
    }
  }

  /**
   * Processes all pending messages for a single conversation in strict FIFO order.
   */
  private async processConversationQueue(
    conversationId: string,
    messages: LocalChatMessage[]
  ): Promise<void> {
    this.conversationLocks.add(conversationId);

    try {
      for (const msg of messages) {
        // Strict context safety guard: never transmit if session changed or tenant/user mismatch
        if (
          !this.activeTenantSlug ||
          !this.activeUserId ||
          msg.tenantSlug !== this.activeTenantSlug ||
          msg.userId !== this.activeUserId
        ) {
          console.warn(
            `[OutboxQueue] Aborting dispatch: active context mismatch (${this.activeTenantSlug}:${this.activeUserId} vs msg ${msg.tenantSlug}:${msg.userId})`
          );
          break;
        }

        // Skip if already in-flight
        if (this.processingLocks.has(msg.tempId)) {
          continue;
        }

        // If message has exceeded max retries, mark as permanently failed
        if (msg.retryCount >= MAX_RETRIES) {
          await this.persistence.updateMessageDeliveryStatus(msg.tempId, 'failed', {
            lastError: 'Maximum retry limit reached.',
            tenantSlug: msg.tenantSlug,
            userId: msg.userId,
          });
          this.notifyListeners({
            tempId: msg.tempId,
            conversationId,
            status: 'failed',
            error: 'Maximum retry limit reached.',
          });
          continue;
        }

        const success = await this.transmitMessage(msg);
        if (!success) {
          // If sending this message failed, stop processing subsequent messages in THIS conversation
          // to preserve conversational order. Other conversations continue normally.
          break;
        }
      }
    } finally {
      this.conversationLocks.delete(conversationId);
    }
  }

  /**
   * Transmits a single message to the backend REST API with idempotency key.
   */
  private async transmitMessage(msg: LocalChatMessage): Promise<boolean> {
    this.processingLocks.add(msg.tempId);

    // Update status to 'sending'
    await this.persistence.updateMessageDeliveryStatus(msg.tempId, 'sending', {
      tenantSlug: msg.tenantSlug,
      userId: msg.userId,
    });
    this.notifyListeners({
      tempId: msg.tempId,
      conversationId: msg.conversationId,
      status: 'sending',
    });

    try {
      let resolvedAttachment = msg.attachment;

      // Two-phase upload for offline attachments (e.g., recorded voice notes created offline)
      if (resolvedAttachment && resolvedAttachment.localUri && !resolvedAttachment.storagePath) {
        try {
          const uploaded =
            msg.conversationType === 'DIRECT'
              ? await chatApi.uploadDirectAttachment(msg.conversationId, {
                  uri: resolvedAttachment.localUri,
                  name: resolvedAttachment.fileName,
                  type: resolvedAttachment.mimeType,
                })
              : await chatApi.uploadGroupAttachment(msg.conversationId, {
                  uri: resolvedAttachment.localUri,
                  name: resolvedAttachment.fileName,
                  type: resolvedAttachment.mimeType,
                });

          resolvedAttachment = {
            ...resolvedAttachment,
            id: uploaded.id,
            storagePath: uploaded.storagePath,
            type: uploaded.type,
            fileSizeBytes: uploaded.fileSizeBytes,
          };

          // Persist uploaded storagePath immediately to avoid re-uploading on retry, timeout, or app restart
          await this.persistence.updateMessageAttachment(msg.tempId, resolvedAttachment, {
            tenantSlug: msg.tenantSlug,
            userId: msg.userId,
          });
        } catch (uploadErr: any) {
          const uploadMsg = uploadErr?.message || 'Upload error';
          const isMissingFile =
            uploadMsg.includes('ENOENT') ||
            uploadMsg.includes('not found') ||
            uploadMsg.includes('does not exist') ||
            uploadMsg.includes('No such file');

          if (isMissingFile) {
            await this.persistence.updateMessageDeliveryStatus(msg.tempId, 'failed', {
              lastError: 'Local audio recording file was deleted or cannot be found on device.',
              tenantSlug: msg.tenantSlug,
              userId: msg.userId,
            });
            this.notifyListeners({
              tempId: msg.tempId,
              conversationId: msg.conversationId,
              status: 'failed',
              error: 'Local audio recording file was deleted or cannot be found on device.',
            });
            return false;
          }

          throw new Error(`Media upload failed: ${uploadMsg}`);
        }
      }

      let serverMessage: any;

      if (msg.conversationType === 'DIRECT') {
        serverMessage = await chatApi.sendDirectMessage(
          msg.conversationId,
          msg.content,
          msg.tempId,
          resolvedAttachment || undefined,
          msg.replyToMessageId || undefined
        );
      } else {
        serverMessage = await chatApi.sendGroupMessage(
          msg.conversationId,
          msg.content,
          msg.tempId,
          resolvedAttachment || undefined,
          msg.replyToMessageId || undefined
        );
      }

      // Mark message as 'sent' in local storage
      await this.persistence.updateMessageDeliveryStatus(msg.tempId, 'sent', {
        serverMessageId: serverMessage.id,
        tenantSlug: msg.tenantSlug,
        userId: msg.userId,
      });

      this.notifyListeners({
        tempId: msg.tempId,
        conversationId: msg.conversationId,
        status: 'sent',
        serverMessageId: serverMessage.id,
      });

      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Transmission failed.';
      const isPermanentError =
        /4\d\d/.test(errorMsg) ||
        errorMsg.includes('Invalid') ||
        errorMsg.includes('permission') ||
        errorMsg.includes('member') ||
        errorMsg.includes('banned') ||
        errorMsg.includes('blocked');

      const nextStatus: MessageDeliveryStatus = isPermanentError ? 'failed' : 'pending';

      await this.persistence.updateMessageDeliveryStatus(msg.tempId, nextStatus, {
        lastError: errorMsg,
        incrementRetry: !isPermanentError,
        tenantSlug: msg.tenantSlug,
        userId: msg.userId,
      });

      this.notifyListeners({
        tempId: msg.tempId,
        conversationId: msg.conversationId,
        status: nextStatus,
        error: errorMsg,
      });

      // If temporary network error, schedule delayed retry with exponential backoff & jitter
      if (!isPermanentError && msg.retryCount < MAX_RETRIES) {
        const delayIdx = Math.min(msg.retryCount, BACKOFF_DELAYS_MS.length - 1);
        const baseDelay = BACKOFF_DELAYS_MS[delayIdx];
        const jitter = Math.floor(Math.random() * 500);
        const totalDelay = baseDelay + jitter;

        const timer = setTimeout(() => {
          this.retryTimers.delete(timer);
          this.processQueue();
        }, totalDelay);
        this.retryTimers.add(timer);
      }

      return false;
    } finally {
      this.processingLocks.delete(msg.tempId);
    }
  }

  /**
   * Gracefully pauses the queue and detaches listeners on community switch or logout.
   * Cancels all scheduled retry timers and unbinds active tenant and user session.
   */
  public teardown(): void {
    this.isProcessing = false;
    this.hasPendingWork = false;
    this.activeTenantSlug = null;
    this.activeUserId = null;
    this.processingLocks.clear();
    this.conversationLocks.clear();
    for (const timer of this.retryTimers) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }
}

export const outboxQueueService = new OutboxQueueService();

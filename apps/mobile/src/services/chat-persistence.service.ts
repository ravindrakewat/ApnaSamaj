import { LocalChatMessage, MessageDeliveryStatus, ChatAttachmentInput, ChatReactionSummary, ChatSearchResultItem } from '@apnasamaj/shared-types';
import { getSecureItem, setSecureItem, removeSecureItem } from './storage.service';

/**
 * Chat Persistence Service
 *
 * Implements an offline-first, tenant-isolated, restart-resilient local persistence layer
 * for Apna Samaj Mobile. Compatible with Hermes, Expo SDK 52, and Android Keystore limits.
 *
 * Safety Invariants:
 * 1. Strict Tenant & User Isolation: Keys are prefixed with tenantSlug and userId.
 * 2. 1024-byte Chunking: Prevents Android Keystore 2048-byte overflow errors on long messages.
 * 3. Bounded Cache Growth: Keeps at most 50 most recent messages per conversation locally.
 * 4. Two-Tier Performance: L1 In-Memory fast lookup + L2 Persistent Storage.
 */

const CHUNK_SIZE = 1024;
const MAX_CONVERSATION_CACHE_SIZE = 50;

export class ChatPersistenceService {
  private inMemoryCache = new Map<string, LocalChatMessage>();
  private conversationIndex = new Map<string, string[]>(); // key: `${tenant}:${convId}`, val: messageIds[]
  private outboxIndex = new Map<string, string[]>(); // key: `${tenant}:${userId}`, val: tempIds[]
  private initialized = false;

  private getOutboxKey(tenantSlug: string, userId: string): string {
    return `@apnasamaj:chat:outbox:${tenantSlug.trim()}:${userId.trim()}`;
  }

  private getMsgKey(tenantSlug: string, userId: string, messageId: string): string {
    return `@apnasamaj:chat:msg:${tenantSlug.trim()}:${userId.trim()}:${messageId.trim()}`;
  }

  private getConvKey(tenantSlug: string, conversationId: string): string {
    return `@apnasamaj:chat:conv:${tenantSlug.trim()}:${conversationId.trim()}`;
  }

  /**
   * Reads a potentially chunked string value from storage.
   * Hardened against partial writes, missing chunks, and corrupted count headers.
   */
  private async readChunkedItem(baseKey: string): Promise<string | null> {
    const chunkCountStr = await getSecureItem(`${baseKey}:chk_cnt`);
    if (chunkCountStr !== null) {
      const count = parseInt(chunkCountStr, 10);
      // Validate chunk count is a reasonable positive integer
      if (isNaN(count) || count <= 0 || count > 500) {
        console.warn(`[ChatPersistence] Invalid chunk count header "${chunkCountStr}" for ${baseKey}. Rejecting corrupted item.`);
        return null;
      }

      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await getSecureItem(`${baseKey}:c${i}`);
        if (chunk === null) {
          console.warn(`[ChatPersistence] Missing chunk ${i}/${count} for ${baseKey}. Rejecting incomplete item.`);
          return null; // Reject incomplete write to prevent corrupted data
        }
        chunks.push(chunk);
      }
      return chunks.join('');
    }

    // Unchunked single item fallback
    return await getSecureItem(baseKey);
  }

  /**
   * Writes a string value to storage, chunking if it exceeds CHUNK_SIZE.
   * Hardened with two-phase commit:
   * 1. Writes all chunk payloads first.
   * 2. Commits by updating chunk count header.
   * 3. Cleans up obsolete chunks from previous writes of larger size.
   */
  private async writeChunkedItem(baseKey: string, value: string): Promise<void> {
    // Read previous chunk count (if any) to clean up obsolete keys if value shrunk
    const oldChunkCountStr = await getSecureItem(`${baseKey}:chk_cnt`);
    const oldChunkCount = oldChunkCountStr ? parseInt(oldChunkCountStr, 10) : 0;

    if (value.length <= CHUNK_SIZE) {
      // Small enough to fit in a single entry
      await setSecureItem(baseKey, value);

      // Clean up previous chunk keys if it was previously chunked
      if (!isNaN(oldChunkCount) && oldChunkCount > 0) {
        for (let i = 0; i < oldChunkCount; i++) {
          await removeSecureItem(`${baseKey}:c${i}`);
        }
        await removeSecureItem(`${baseKey}:chk_cnt`);
      }
      return;
    }

    // Split into chunks of CHUNK_SIZE
    const chunkCount = Math.ceil(value.length / CHUNK_SIZE);

    // Phase 1: Write all chunk slices first
    for (let i = 0; i < chunkCount; i++) {
      const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await setSecureItem(`${baseKey}:c${i}`, slice);
    }

    // Phase 2: Commit header
    await setSecureItem(`${baseKey}:chk_cnt`, String(chunkCount));

    // Phase 3: Clean up obsolete chunks if previous record had more chunks than current
    if (!isNaN(oldChunkCount) && oldChunkCount > chunkCount) {
      for (let i = chunkCount; i < oldChunkCount; i++) {
        await removeSecureItem(`${baseKey}:c${i}`);
      }
    }

    // Clean up unchunked baseKey
    await removeSecureItem(baseKey);
  }

  /**
   * Removes a potentially chunked item from storage.
   */
  private async removeChunkedItem(baseKey: string): Promise<void> {
    const chunkCountStr = await getSecureItem(`${baseKey}:chk_cnt`);
    if (chunkCountStr) {
      const count = parseInt(chunkCountStr, 10);
      if (!isNaN(count) && count > 0) {
        for (let i = 0; i < count; i++) {
          await removeSecureItem(`${baseKey}:c${i}`);
        }
        await removeSecureItem(`${baseKey}:chk_cnt`);
      }
    }
    await removeSecureItem(baseKey);
  }

  /**
   * Saves an outgoing pending message to the local outbox.
   */
  public async savePendingMessage(
    payload: Omit<LocalChatMessage, 'localId' | 'deliveryStatus' | 'retryCount' | 'createdAt' | 'updatedAt'>
  ): Promise<LocalChatMessage> {
    const nowIso = new Date().toISOString();
    const localId = `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const message: LocalChatMessage = {
      ...payload,
      localId,
      deliveryStatus: 'pending',
      retryCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      attachment: payload.attachment
        ? {
          id: payload.attachment.id,
          type: payload.attachment.type,
          fileName: payload.attachment.fileName,
          mimeType: payload.attachment.mimeType,
          fileSizeBytes: payload.attachment.fileSizeBytes,
          storagePath: payload.attachment.storagePath,
          duration: payload.attachment.duration,
          localUri: payload.attachment.localUri,
        }
        : null,
    };

    // Update L1 cache
    this.inMemoryCache.set(message.tempId, message);

    // Update Outbox Index
    const outboxKey = this.getOutboxKey(message.tenantSlug, message.userId);
    let outboxList = this.outboxIndex.get(outboxKey) || [];
    if (!outboxList.includes(message.tempId)) {
      outboxList = [...outboxList, message.tempId];
      this.outboxIndex.set(outboxKey, outboxList);
    }

    // Update Conversation Index
    const convKey = this.getConvKey(message.tenantSlug, message.conversationId);
    let convList = this.conversationIndex.get(convKey) || [];
    if (!convList.includes(message.tempId)) {
      convList = [message.tempId, ...convList].slice(0, MAX_CONVERSATION_CACHE_SIZE);
      this.conversationIndex.set(convKey, convList);
    }

    // Persist to L2 Storage
    const msgKey = this.getMsgKey(message.tenantSlug, message.userId, message.tempId);
    await this.writeChunkedItem(msgKey, JSON.stringify(message));
    await this.writeChunkedItem(outboxKey, JSON.stringify(outboxList));
    await this.writeChunkedItem(convKey, JSON.stringify(convList));

    return message;
  }

  /**
   * Updates delivery status, retry count, serverMessageId, and error of an existing message.
   */
  public async updateMessageDeliveryStatus(
    tempId: string,
    status: MessageDeliveryStatus,
    updates?: {
      serverMessageId?: string;
      lastError?: string | null;
      incrementRetry?: boolean;
      tenantSlug?: string;
      userId?: string;
    }
  ): Promise<LocalChatMessage | null> {
    let message = this.inMemoryCache.get(tempId);

    // If not in L1 cache, try reading from storage if tenant & user are known
    if (!message && updates?.tenantSlug && updates?.userId) {
      const msgKey = this.getMsgKey(updates.tenantSlug, updates.userId, tempId);
      const json = await this.readChunkedItem(msgKey);
      if (json) {
        try {
          message = JSON.parse(json);
        } catch { }
      }
    }

    if (!message) return null;

    const nowIso = new Date().toISOString();
    message.deliveryStatus = status;
    message.updatedAt = nowIso;

    if (updates?.serverMessageId) {
      message.serverMessageId = updates.serverMessageId;
    }
    if (updates?.lastError !== undefined) {
      message.lastError = updates.lastError;
    }
    if (updates?.incrementRetry) {
      message.retryCount = (message.retryCount || 0) + 1;
    }
    if (updates && 'attachment' in updates && updates.attachment) {
      message.attachment = {
        ...(message.attachment || {}),
        ...updates.attachment,
      } as ChatAttachmentInput;
    }

    // Update L1
    this.inMemoryCache.set(tempId, message);
    if (message.serverMessageId) {
      this.inMemoryCache.set(message.serverMessageId, message);
    }

    // If status is 'sent', remove from outbox index
    if (status === 'sent') {
      const outboxKey = this.getOutboxKey(message.tenantSlug, message.userId);
      let outboxList = this.outboxIndex.get(outboxKey) || [];
      outboxList = outboxList.filter((id) => id !== tempId);
      this.outboxIndex.set(outboxKey, outboxList);
      await this.writeChunkedItem(outboxKey, JSON.stringify(outboxList));
    }

    // Persist updated message
    const msgKey = this.getMsgKey(message.tenantSlug, message.userId, tempId);
    await this.writeChunkedItem(msgKey, JSON.stringify(message));

    return message;
  }

  /**
   * Updates attachment metadata on a stored message (e.g. after successful Phase 1 upload).
   * Prevents duplicate re-uploads on retry or restart.
   */
  public async updateMessageAttachment(
    tempId: string,
    attachment: Partial<ChatAttachmentInput>,
    options?: { tenantSlug?: string; userId?: string }
  ): Promise<LocalChatMessage | null> {
    let message = this.inMemoryCache.get(tempId);

    if (!message && options?.tenantSlug && options?.userId) {
      const msgKey = this.getMsgKey(options.tenantSlug, options.userId, tempId);
      const json = await this.readChunkedItem(msgKey);
      if (json) {
        try {
          message = JSON.parse(json);
        } catch { }
      }
    }

    if (!message) return null;

    message.attachment = {
      ...(message.attachment || {}),
      ...attachment,
    } as ChatAttachmentInput;
    message.updatedAt = new Date().toISOString();

    // Update in-memory
    this.inMemoryCache.set(tempId, message);

    // Update persistent storage
    const msgKey = this.getMsgKey(message.tenantSlug, message.userId, tempId);
    await this.writeChunkedItem(msgKey, JSON.stringify(message));

    return message;
  }

  /**
   * Updates reactions on an in-memory and persistently cached message.
   */
  public async updateMessageReactions(
    messageIdOrTempId: string,
    reactions: ChatReactionSummary[]
  ): Promise<void> {
    const msg = this.inMemoryCache.get(messageIdOrTempId);
    if (msg) {
      msg.reactions = reactions;
      msg.updatedAt = new Date().toISOString();
      this.inMemoryCache.set(messageIdOrTempId, msg);
      if (msg.serverMessageId && msg.serverMessageId !== messageIdOrTempId) {
        this.inMemoryCache.set(msg.serverMessageId, msg);
      }
      if (msg.tempId && msg.tempId !== messageIdOrTempId) {
        this.inMemoryCache.set(msg.tempId, msg);
      }
      const msgKey = this.getMsgKey(msg.tenantSlug, msg.userId, msg.tempId);
      await this.writeChunkedItem(msgKey, JSON.stringify(msg));
    }
  }

  /**
   * Updates message content (e.g. replaced by deleted placeholder).
   */
  public async updateMessageContent(
    messageIdOrTempId: string,
    content: string,
    isDeletedForEveryone: boolean = true
  ): Promise<void> {
    const msg = this.inMemoryCache.get(messageIdOrTempId);
    if (msg) {
      msg.content = content;
      if (isDeletedForEveryone) {
        msg.attachment = null as any;
        msg.reactions = [];
      }
      msg.updatedAt = new Date().toISOString();
      this.inMemoryCache.set(messageIdOrTempId, msg);
      if (msg.serverMessageId && msg.serverMessageId !== messageIdOrTempId) {
        this.inMemoryCache.set(msg.serverMessageId, msg);
      }
      if (msg.tempId && msg.tempId !== messageIdOrTempId) {
        this.inMemoryCache.set(msg.tempId, msg);
      }
      const msgKey = this.getMsgKey(msg.tenantSlug, msg.userId, msg.tempId);
      await this.writeChunkedItem(msgKey, JSON.stringify(msg));
    }
  }

  /**
   * Deletes a local message from memory cache and storage (for "Delete for Me").
   */
  public async deleteLocalMessage(messageIdOrTempId: string): Promise<void> {
    const msg = this.inMemoryCache.get(messageIdOrTempId);
    if (msg) {
      this.inMemoryCache.delete(messageIdOrTempId);
      if (msg.serverMessageId) this.inMemoryCache.delete(msg.serverMessageId);
      if (msg.tempId) this.inMemoryCache.delete(msg.tempId);

      const convKey = this.getConvKey(msg.tenantSlug, msg.conversationId);
      const convList = this.conversationIndex.get(convKey);
      if (convList) {
        this.conversationIndex.set(
          convKey,
          convList.filter((id) => id !== messageIdOrTempId && id !== msg.tempId && id !== msg.serverMessageId)
        );
      }

      const msgKey = this.getMsgKey(msg.tenantSlug, msg.userId, msg.tempId);
      await this.removeChunkedItem(msgKey);
    }
  }

  /**
   * Saves recently received server messages into local conversation cache.
   */
  public async saveReceivedMessages(
    conversationId: string,
    conversationType: 'DIRECT' | 'GROUP',
    messages: any[],
    tenantSlug: string,
    userId: string
  ): Promise<void> {
    if (!messages || messages.length === 0 || !tenantSlug || !conversationId) return;

    const convKey = this.getConvKey(tenantSlug, conversationId);
    let convList = this.conversationIndex.get(convKey) || [];

    for (const msg of messages) {
      const keyId = msg.tempId || msg.id;
      if (!keyId) continue;

      const localMsg: LocalChatMessage = {
        localId: msg.id || keyId,
        tempId: msg.tempId || msg.id,
        serverMessageId: msg.id || null,
        conversationId,
        conversationType,
        senderId: msg.senderId || msg.sender?.id || '',
        content: msg.content || '',
        attachment: msg.attachments?.[0]
          ? {
            id: msg.attachments[0].id,
            type: msg.attachments[0].type,
            fileName: msg.attachments[0].fileName,
            mimeType: msg.attachments[0].mimeType,
            fileSizeBytes: msg.attachments[0].fileSizeBytes,
            storagePath: msg.attachments[0].storagePath,
            duration: msg.attachments[0].duration,
          }
          : null,
        replyToMessageId: msg.replyToMessageId || null,
        replyTo: msg.replyTo || null,
        reactions: msg.reactions || [],
        deliveryStatus: 'sent',
        retryCount: 0,
        createdAt: msg.createdAt || new Date().toISOString(),
        updatedAt: msg.updatedAt || new Date().toISOString(),
        tenantSlug,
        userId,
      };

      this.inMemoryCache.set(keyId, localMsg);
      if (msg.id) {
        this.inMemoryCache.set(msg.id, localMsg);
      }

      if (!convList.includes(keyId)) {
        convList.push(keyId);
      }

      const msgKey = this.getMsgKey(tenantSlug, userId, keyId);
      await this.writeChunkedItem(msgKey, JSON.stringify(localMsg));
    }

    // Keep bounded cache size
    convList = convList.slice(0, MAX_CONVERSATION_CACHE_SIZE);
    this.conversationIndex.set(convKey, convList);
    await this.writeChunkedItem(convKey, JSON.stringify(convList));
  }

  /**
   * Retrieves messages for a conversation from local cache.
   */
  public async getConversationMessages(
    conversationId: string,
    tenantSlug: string,
    userId: string
  ): Promise<LocalChatMessage[]> {
    if (!conversationId || !tenantSlug) return [];

    const convKey = this.getConvKey(tenantSlug, conversationId);
    let idList = this.conversationIndex.get(convKey);

    if (!idList) {
      const json = await this.readChunkedItem(convKey);
      if (json) {
        try {
          idList = JSON.parse(json);
          this.conversationIndex.set(convKey, idList || []);
        } catch {
          idList = [];
        }
      } else {
        idList = [];
      }
    }

    const result: LocalChatMessage[] = [];
    for (const id of idList || []) {
      let item = this.inMemoryCache.get(id);
      if (!item) {
        const msgKey = this.getMsgKey(tenantSlug, userId, id);
        const json = await this.readChunkedItem(msgKey);
        if (json) {
          try {
            item = JSON.parse(json);
            if (item) this.inMemoryCache.set(id, item);
          } catch { }
        }
      }
      if (item && item.tenantSlug === tenantSlug && (!userId || item.userId === userId)) {
        result.push(item);
      }
    }

    // Sort descending by createdAt (newest first)
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Searches locally cached messages for the given conversation.
   * Scoped strictly to the active tenant and user session.
   * Performs case-insensitive matching on message content and attachment fileName.
   * Clearly flags matchSource as 'local' without claiming full server coverage.
   */
  public async searchLocalMessages(
    conversationId: string,
    tenantSlug: string,
    userId: string,
    query: string
  ): Promise<ChatSearchResultItem[]> {
    if (!conversationId || !tenantSlug || !query || !query.trim()) return [];

    const messages = await this.getConversationMessages(conversationId, tenantSlug, userId);
    const normalized = query.trim().toLowerCase();

    const matches: ChatSearchResultItem[] = [];

    for (const msg of messages) {
      const contentMatch = msg.content && msg.content.toLowerCase().includes(normalized);
      const attachmentMatch = Boolean(msg.attachment?.fileName && msg.attachment.fileName.toLowerCase().includes(normalized));

      if (contentMatch || attachmentMatch) {
        matches.push({
          id: msg.serverMessageId || msg.tempId || msg.localId,
          conversationId: msg.conversationId,
          groupId: msg.conversationType === 'GROUP' ? msg.conversationId : undefined,
          conversationType: msg.conversationType,
          senderId: msg.senderId,
          senderName: msg.senderId === userId ? 'You' : 'Member',
          senderAvatarUrl: null,
          content: msg.content,
          createdAt: msg.createdAt,
          attachmentType: msg.attachment?.type || null,
          attachmentName: msg.attachment?.fileName || null,
          matchSource: 'local',
          matchedSubstring: query.trim(),
        });
      }
    }

    return matches;
  }


  /**
   * Retrieves all pending or failed outbox messages for a user and tenant.
   */
  public async getPendingOutboxMessages(
    tenantSlug: string,
    userId: string
  ): Promise<LocalChatMessage[]> {
    if (!tenantSlug || !userId) return [];

    const outboxKey = this.getOutboxKey(tenantSlug, userId);
    let idList = this.outboxIndex.get(outboxKey);

    if (!idList) {
      const json = await this.readChunkedItem(outboxKey);
      if (json) {
        try {
          idList = JSON.parse(json);
          this.outboxIndex.set(outboxKey, idList || []);
        } catch {
          idList = [];
        }
      } else {
        idList = [];
      }
    }

    const result: LocalChatMessage[] = [];
    for (const tempId of idList || []) {
      let item = this.inMemoryCache.get(tempId);
      if (!item) {
        const msgKey = this.getMsgKey(tenantSlug, userId, tempId);
        const json = await this.readChunkedItem(msgKey);
        if (json) {
          try {
            item = JSON.parse(json);
            if (item) this.inMemoryCache.set(tempId, item);
          } catch { }
        }
      }
      if (item && item.tenantSlug === tenantSlug && item.userId === userId && item.deliveryStatus !== 'sent') {
        result.push(item);
      }
    }

    // Sort ascending by createdAt (oldest first for FIFO delivery)
    return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Removes an item from the pending outbox queue.
   */
  public async removeOutboxMessage(
    tempId: string,
    tenantSlug: string,
    userId: string
  ): Promise<void> {
    const outboxKey = this.getOutboxKey(tenantSlug, userId);
    let outboxList = this.outboxIndex.get(outboxKey) || [];
    outboxList = outboxList.filter((id) => id !== tempId);
    this.outboxIndex.set(outboxKey, outboxList);
    await this.writeChunkedItem(outboxKey, JSON.stringify(outboxList));
  }

  /**
   * Scans outbox and resets any messages stuck in 'sending' status back to 'pending'.
   * Invoked on app startup to recover from abrupt crashes or app termination mid-send.
   */
  public async recoverStuckSendingMessages(
    tenantSlug: string,
    userId: string
  ): Promise<number> {
    const pendingList = await this.getPendingOutboxMessages(tenantSlug, userId);
    let recoveredCount = 0;

    for (const msg of pendingList) {
      if (msg.deliveryStatus === 'sending') {
        await this.updateMessageDeliveryStatus(msg.tempId, 'pending', {
          tenantSlug,
          userId,
        });
        recoveredCount++;
      }
    }

    return recoveredCount;
  }

  /**
   * Evicts in-memory session caches (L1 Map caches) on logout or community switch.
   * SAFETY INVARIANT: Persistent outbox storage records in L2 are PRESERVED in their
   * isolated tenant/user namespace so unsent messages are never silently destroyed.
   * When the user re-authenticates to the same tenant, their pending messages resume.
   */
  public evictMemorySession(): void {
    this.inMemoryCache.clear();
    this.conversationIndex.clear();
    this.outboxIndex.clear();
  }

  /**
   * Alias for backward compatibility with callers expecting clearAllCache.
   */
  public async clearAllCache(): Promise<void> {
    this.evictMemorySession();
  }

  /**
   * Evicts memory cache for a specific tenant on community switch.
   * Persistent outbox messages in storage are PRESERVED safely in their namespace.
   */
  public async clearTenantCache(tenantSlug: string, userId?: string): Promise<void> {
    if (!tenantSlug) return;

    for (const [key, msg] of this.inMemoryCache.entries()) {
      if (msg.tenantSlug === tenantSlug) {
        this.inMemoryCache.delete(key);
      }
    }

    if (userId) {
      const outboxKey = this.getOutboxKey(tenantSlug, userId);
      this.outboxIndex.delete(outboxKey);
    }
  }

  /**
   * Permanently clears all chat records from both memory and persistent storage.
   * Used exclusively for unit test teardown or explicit user-confirmed cache purge.
   */
  public async clearAllDataPermanentlyForTesting(): Promise<void> {
    for (const convKey of Array.from(this.conversationIndex.keys())) {
      await this.removeChunkedItem(convKey);
    }
    for (const outboxKey of Array.from(this.outboxIndex.keys())) {
      await this.removeChunkedItem(outboxKey);
    }
    this.inMemoryCache.clear();
    this.conversationIndex.clear();
    this.outboxIndex.clear();
  }
}

export const chatPersistenceService = new ChatPersistenceService();


import React, { useState, useRef, useEffect } from 'react';
import {
  Smile,
  Play,
  Pause,
  FileText,
  Download,
  MapPin,
  Trash2,
  Sparkles,
  Pin,
  Reply,
  Forward,
  Edit2,
  Plus,
  BarChart2,
  ExternalLink,
  Copy,
  Loader2,
  Heart,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Message as MessageType, User, MessageReaction } from '../../types';

export interface MessageProps {
  message: MessageType;
  isMe: boolean;
  currentUser: User;
  searchQuery: string;
  isHovered: boolean;
  isActiveContextMenu: boolean;
  activeReactionPickerMsgId: string | null;
  playingVoiceId: string | null;
  voicePlaybackRate: number;
  transcribingMessageId: string | null;
  copiedTranscriptId: string | null;
  quickReactions: string[];
  extendedReactions: string[];
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent, msg: MessageType) => void;
  onReact: (msgId: string, emoji: string) => void;
  onToggleReactionPicker: (msgId: string | null) => void;
  onReply: (msg: MessageType) => void;
  onForward: (msg: MessageType) => void;
  onPin: (msgId: string) => void;
  onEdit: (msg: MessageType) => void;
  onDelete: (msgId: string, forEveryone: boolean) => void;
  onScrollToMessage: (msgId: string) => void;
  onToggleVoicePlay: (msgId: string, audioUrl?: string) => void;
  onCycleSpeed: () => void;
  onTranscribeMessage: (msg: MessageType) => void;
  onCopyTranscript: (msgId: string, text: string) => void;
  onImageClick: (url: string) => void;
  onVotePoll: (messageId: string, optionId: string) => void;
  onQuickMessageContact: (name: string) => void;
  onStartVoiceCall: () => void;
  renderStatusBadge: (msg: MessageType) => React.ReactNode;
  renderSeenIndicator: (msg: MessageType, isMe: boolean) => React.ReactNode;
  highlightMatches: (text: string, query: string) => React.ReactNode;
  formatMessageTime: (isoDate: string) => string;
}

export const Message: React.FC<MessageProps> = ({
  message: msg,
  isMe,
  currentUser,
  searchQuery,
  isHovered,
  isActiveContextMenu,
  activeReactionPickerMsgId,
  playingVoiceId,
  voicePlaybackRate,
  transcribingMessageId,
  copiedTranscriptId,
  quickReactions,
  extendedReactions,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  onReact,
  onToggleReactionPicker,
  onReply,
  onForward,
  onPin,
  onEdit,
  onDelete,
  onScrollToMessage,
  onToggleVoicePlay,
  onCycleSpeed,
  onTranscribeMessage,
  onCopyTranscript,
  onImageClick,
  onVotePoll,
  onQuickMessageContact,
  onStartVoiceCall,
  renderStatusBadge,
  renderSeenIndicator,
  highlightMatches,
  formatMessageTime,
}) => {
  const [isLongPressed, setIsLongPressed] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleContainerRef = useRef<HTMLDivElement | null>(null);

  const isPickerOpen = activeReactionPickerMsgId === msg.id;
  const showReactionToolbar = isHovered || isLongPressed || isPickerOpen;

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Dismiss long-press toolbar when clicking or touching outside this message bubble
  useEffect(() => {
    if (!isLongPressed) return;

    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      if (
        bubbleContainerRef.current &&
        !bubbleContainerRef.current.contains(e.target as Node)
      ) {
        setIsLongPressed(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideInteraction);
    window.addEventListener('touchstart', handleOutsideInteraction);
    return () => {
      window.removeEventListener('mousedown', handleOutsideInteraction);
      window.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [isLongPressed]);

  const startLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressed(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(15);
        } catch {
          // ignore vibration errors
        }
      }
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Group reactions by emoji and calculate counts + reacted status
  const getGroupedReactions = (reactions?: MessageReaction[]) => {
    if (!reactions || reactions.length === 0) return [];
    const map = new Map<
      string,
      { emoji: string; count: number; hasReacted: boolean; users: string[] }
    >();

    for (const r of reactions) {
      if (!r || !r.emoji) continue;
      const isCurrentUser = r.userId === currentUser.id;
      const displayName = isCurrentUser ? 'You' : r.userDisplayName || 'User';
      if (map.has(r.emoji)) {
        const item = map.get(r.emoji)!;
        item.count += 1;
        if (isCurrentUser) item.hasReacted = true;
        if (!item.users.includes(displayName)) {
          if (isCurrentUser) {
            item.users.unshift('You');
          } else {
            item.users.push(displayName);
          }
        }
      } else {
        map.set(r.emoji, {
          emoji: r.emoji,
          count: 1,
          hasReacted: isCurrentUser,
          users: [displayName],
        });
      }
    }

    return Array.from(map.values());
  };

  const groupedReactions = getGroupedReactions(msg.reactions);

  return (
    <div
      id={`msg-${msg.id}`}
      ref={bubbleContainerRef}
      onMouseEnter={() => onMouseEnter(msg.id)}
      onMouseLeave={() => {
        cancelLongPress();
        onMouseLeave();
      }}
      onPointerDown={e => {
        if (e.button === 0) {
          startLongPress();
        }
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onContextMenu={e => onContextMenu(e, msg)}
      className={`relative group flex flex-col ${
        isMe ? 'items-end' : 'items-start'
      } transition-all ${
        isActiveContextMenu || isLongPressed
          ? 'ring-1 ring-white/40 rounded-2xl'
          : ''
      }`}
    >
      {/* Floating Reaction & Quick Action Toolbar on Hover or Long-Press */}
      {showReactionToolbar && (
        <div
          data-testid={`reaction-toolbar-${msg.id}`}
          onClick={e => e.stopPropagation()}
          className={`absolute -top-10 z-30 flex items-center gap-1 p-1 rounded-2xl bg-[#0d0d0d]/95 backdrop-blur-md border border-white/20 shadow-2xl text-neutral-300 animate-in fade-in zoom-in-95 duration-150 ${
            isMe ? 'right-1' : 'left-1'
          }`}
        >
          {/* Featured Heart & Thumbs Up + Quick Emoji Reactions */}
          <div className="flex items-center gap-0.5 px-0.5">
            {quickReactions.map(em => {
              const hasReacted = msg.reactions?.some(
                r => r.userId === currentUser.id && r.emoji === em
              );
              const isHeart = em === '❤️';
              const isThumbsUp = em === '👍';

              return (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    onReact(msg.id, em);
                    setIsLongPressed(false);
                  }}
                  title={
                    isHeart
                      ? 'React with Heart (❤️)'
                      : isThumbsUp
                        ? 'React with Thumbs Up (👍)'
                        : `React with ${em}`
                  }
                  aria-label={`React with ${em}`}
                  className={`w-7 h-7 rounded-xl flex items-center justify-center hover:scale-125 active:scale-95 transition-all text-xs cursor-pointer ${
                    hasReacted
                      ? 'bg-white text-black ring-1 ring-white font-bold scale-110 shadow-sm'
                      : 'hover:bg-white/15 text-white'
                  }`}
                >
                  <span>{em}</span>
                </button>
              );
            })}

            {/* More Emojis Popover Trigger */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onToggleReactionPicker(isPickerOpen ? null : msg.id);
              }}
              title="More reactions"
              aria-label="More reactions"
              className={`w-7 h-7 rounded-xl flex items-center justify-center hover:text-white hover:bg-white/15 transition cursor-pointer ${
                isPickerOpen
                  ? 'bg-white text-black'
                  : 'text-neutral-400'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

          {/* Reply */}
          <button
            type="button"
            onClick={() => {
              onReply(msg);
              setIsLongPressed(false);
            }}
            title="Reply"
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>

          {/* Forward */}
          <button
            type="button"
            onClick={() => {
              onForward(msg);
              setIsLongPressed(false);
            }}
            title="Forward"
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <Forward className="w-3.5 h-3.5" />
          </button>

          {/* Pin */}
          <button
            type="button"
            onClick={() => {
              onPin(msg.id);
              setIsLongPressed(false);
            }}
            title={msg.isPinned ? 'Unpin' : 'Pin'}
            className={`p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer ${
              msg.isPinned ? 'text-white bg-white/15' : ''
            }`}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>

          {/* Edit (if current user and text) */}
          {isMe && msg.type === 'text' && (
            <button
              type="button"
              onClick={() => {
                onEdit(msg);
                setIsLongPressed(false);
              }}
              title="Edit"
              className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => {
              onDelete(msg.id, isMe);
              setIsLongPressed(false);
            }}
            title="Delete"
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {isMe && (
            <>
              <div className="w-[1px] h-4 bg-white/15 mx-0.5" />
              <div
                title="Message status"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-neutral-300 select-none"
              >
                {renderStatusBadge(msg)}
              </div>
            </>
          )}

          {isLongPressed && (
            <button
              type="button"
              onClick={() => setIsLongPressed(false)}
              title="Close toolbar"
              className="p-1 ml-0.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Replied-To Message Header inside bubble */}
      {msg.replyTo && (
        <div
          onClick={() => msg.replyTo && onScrollToMessage(msg.replyTo.id)}
          className="mb-1 text-[11px] px-3 py-1.5 rounded-lg bg-[#111111] border-l-2 border-white text-neutral-300 max-w-xs cursor-pointer hover:bg-[#1a1a1a] transition"
        >
          <span className="font-semibold text-white mr-1">
            {msg.replyTo.senderName}:
          </span>
          <span className="truncate">{msg.replyTo.content || 'Attachment'}</span>
        </div>
      )}

      {/* Forwarded Header */}
      {msg.forwardedFromName && (
        <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-1 px-1">
          <Forward className="w-3 h-3 text-white" />
          <span>Forwarded from {msg.forwardedFromName}</span>
        </div>
      )}

      {/* Voice Message Bubble */}
      {msg.type === 'voice' && (
        <div
          className={`flex flex-col gap-2.5 px-4 py-3 rounded-2xl max-w-sm ${
            isMe
              ? 'bg-[#1f1f1f] text-white border border-white/25 shadow-lg'
              : 'bg-[#121212] text-neutral-100 border border-white/15'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onToggleVoicePlay(msg.id, msg.mediaUrl)}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition cursor-pointer shadow-md active:scale-95 shrink-0"
            >
              {playingVoiceId === msg.id ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 h-5">
                {[35, 75, 40, 90, 60, 45, 85, 55, 70, 35, 80, 50, 65].map(
                  (h, i) => (
                    <div
                      key={i}
                      className={`w-0.5 rounded-full transition-all ${
                        playingVoiceId === msg.id
                          ? 'bg-white animate-pulse'
                          : 'bg-neutral-500'
                      }`}
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>
              <span className="text-xs font-mono font-semibold text-neutral-300 ml-1">
                {msg.voiceDuration || msg.duration
                  ? `${Math.round(msg.voiceDuration || msg.duration || 0)}s`
                  : 'Voice note'}
              </span>
            </div>

            {/* Speed Toggle Button */}
            <button
              type="button"
              onClick={onCycleSpeed}
              className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-mono text-white transition cursor-pointer"
            >
              {voicePlaybackRate}x
            </button>

            <span className="text-[10px] text-neutral-400 ml-auto flex items-center gap-1 shrink-0">
              <span>{formatMessageTime(msg.createdAt)}</span>
              {renderSeenIndicator(msg, isMe)}
            </span>
          </div>

          {/* Transcribed Voice Content */}
          {msg.transcription ? (
            <div className="mt-0.5 pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] text-white font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-white" />
                  Transcript
                </span>
                <button
                  type="button"
                  onClick={() => onCopyTranscript(msg.id, msg.transcription!)}
                  className="text-[10px] text-neutral-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
                  title="Copy transcript text"
                >
                  {copiedTranscriptId === msg.id ? (
                    <span className="text-white font-bold">Copied!</span>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-neutral-200 text-xs leading-relaxed select-text font-normal">
                &ldquo;{highlightMatches(msg.transcription, searchQuery)}&rdquo;
              </p>
            </div>
          ) : (
            <div className="mt-0.5 pt-1.5 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onTranscribeMessage(msg)}
                disabled={transcribingMessageId === msg.id}
                className="flex items-center gap-1 text-[11px] text-neutral-300 hover:text-white hover:underline cursor-pointer disabled:opacity-50 transition"
              >
                {transcribingMessageId === msg.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-white" />
                    <span>Transcribing audio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-white" />
                    <span>Transcribe with AI</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Photo Bubble */}
      {msg.type === 'image' && (
        <div className="rounded-2xl overflow-hidden max-w-xs border border-white/15 group cursor-pointer shadow-xl bg-[#121212]">
          <img
            src={msg.mediaUrl}
            alt="Photo"
            onClick={() => msg.mediaUrl && onImageClick(msg.mediaUrl)}
            className="w-full h-auto object-cover max-h-72 hover:scale-[1.02] transition duration-200"
            referrerPolicy="no-referrer"
          />
          {msg.content && msg.content !== '📷 Photo' && (
            <div className="p-2.5 bg-[#161616] text-xs text-white">
              {msg.content}
            </div>
          )}
          <div className="px-2.5 pb-1.5 pt-0.5 text-[10px] text-neutral-400 flex items-center justify-end gap-1">
            <span>{formatMessageTime(msg.createdAt)}</span>
            {renderSeenIndicator(msg, isMe)}
          </div>
        </div>
      )}

      {/* Poll Card Bubble */}
      {msg.type === 'poll' && msg.poll && (
        <div className="rounded-2xl bg-[#121212] border border-white/15 p-4 max-w-sm w-full shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 className="w-4 h-4 text-white shrink-0" />
            <h4 className="text-xs font-bold text-white leading-snug">
              {msg.poll.question}
            </h4>
          </div>

          <div className="space-y-2 mt-3">
            {(() => {
              const totalVotes = msg.poll.options.reduce(
                (acc, opt) => acc + (opt.voterIds?.length || 0),
                0
              );
              return msg.poll.options.map(opt => {
                const votes = opt.voterIds?.length || 0;
                const percent =
                  totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                const hasVoted = opt.voterIds?.includes(currentUser.id);

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onVotePoll(msg.id, opt.id)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs transition relative overflow-hidden flex items-center justify-between cursor-pointer ${
                      hasVoted
                        ? 'border-white bg-white/15 text-white font-semibold'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 text-neutral-200'
                    }`}
                  >
                    <div
                      className="absolute inset-0 bg-white/10 pointer-events-none transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />

                    <div className="relative z-10 flex items-center gap-2 truncate">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          hasVoted ? 'border-white bg-white' : 'border-neutral-500'
                        }`}
                      >
                        {hasVoted && (
                          <div className="w-1.5 h-1.5 rounded-full bg-black" />
                        )}
                      </div>
                      <span className="font-medium truncate">{opt.text}</span>
                    </div>

                    <span className="relative z-10 font-mono text-[11px] text-neutral-300 shrink-0 ml-2">
                      {percent}%
                    </span>
                  </button>
                );
              });
            })()}
          </div>

          <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-neutral-400">
            <span>
              {msg.poll.options.reduce(
                (acc, opt) => acc + (opt.voterIds?.length || 0),
                0
              )}{' '}
              total votes
            </span>
            <div className="flex items-center gap-1">
              <span>{formatMessageTime(msg.createdAt)}</span>
              {renderSeenIndicator(msg, isMe)}
            </div>
          </div>
        </div>
      )}

      {/* Location Card Bubble */}
      {msg.type === 'location' && msg.location && (
        <div className="rounded-2xl bg-[#121212] border border-white/15 p-3.5 max-w-xs w-full shadow-xl">
          <div className="w-full h-24 rounded-xl bg-[#0a0a0a] border border-white/10 relative overflow-hidden flex flex-col items-center justify-center text-center p-2 mb-2">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:12px_12px]" />
            <MapPin className="w-6 h-6 text-white mb-1" />
            <span className="text-[11px] font-bold text-white truncate max-w-full">
              {msg.location.title || 'Location Pin'}
            </span>
            <span className="text-[9px] font-mono text-neutral-400">
              {msg.location.latitude}, {msg.location.longitude}
            </span>
          </div>

          <a
            href={`https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white hover:text-black border border-white/15 text-[11px] text-white font-medium flex items-center justify-center gap-1.5 transition"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open in Maps</span>
          </a>

          <div className="mt-2 text-[10px] text-neutral-400 flex items-center justify-end gap-1">
            <span>{formatMessageTime(msg.createdAt)}</span>
            {renderSeenIndicator(msg, isMe)}
          </div>
        </div>
      )}

      {/* Contact Card Bubble */}
      {msg.type === 'contact' && msg.contactCard && (
        <div className="rounded-2xl bg-[#121212] border border-white/15 p-3.5 max-w-xs w-full shadow-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold text-sm shrink-0">
              {msg.contactCard.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate">
                {highlightMatches(msg.contactCard.name, searchQuery)}
              </h4>
              <p className="text-[11px] font-mono text-neutral-400 truncate">
                {msg.contactCard.phone}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => onQuickMessageContact(msg.contactCard!.name)}
              className="py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white transition text-center cursor-pointer"
            >
              Message
            </button>
            <button
              type="button"
              onClick={onStartVoiceCall}
              className="py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-[11px] transition text-center cursor-pointer"
            >
              Call Contact
            </button>
          </div>

          <div className="mt-2 text-[10px] text-neutral-400 flex items-center justify-end gap-1">
            <span>{formatMessageTime(msg.createdAt)}</span>
            {renderSeenIndicator(msg, isMe)}
          </div>
        </div>
      )}

      {/* File Attachment Bubble */}
      {msg.type === 'file' && (
        <div className="rounded-2xl bg-[#121212] border border-white/15 p-3 max-w-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">
              {highlightMatches(msg.content || 'Document.pdf', searchQuery)}
            </div>
            <div className="text-[10px] text-neutral-400 flex items-center gap-1">
              <span>{formatMessageTime(msg.createdAt)}</span>
              {renderSeenIndicator(msg, isMe)}
            </div>
          </div>
          {msg.mediaUrl && (
            <a
              href={msg.mediaUrl}
              download
              className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      )}

      {/* Standard Text Message (or fallback for text/custom types) */}
      {(msg.type === 'text' ||
        !['voice', 'image', 'poll', 'location', 'contact', 'file'].includes(
          msg.type
        )) && (
        <div
          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
            isMe
              ? 'bg-white text-black font-medium rounded-br-none border border-white'
              : 'bg-[#121212] text-white border border-white/15 rounded-bl-none'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">
            {highlightMatches(msg.content, searchQuery)}
          </p>
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono ${
              isMe ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            {msg.isEdited && <span className="italic mr-1">(edited)</span>}
            <span>{formatMessageTime(msg.createdAt)}</span>
            {renderSeenIndicator(msg, isMe)}
          </div>
        </div>
      )}

      {/* Expanded Reaction Picker Popover */}
      {isPickerOpen && (
        <div
          id="message-reaction-picker-popover"
          className={`absolute -top-28 z-40 p-2 rounded-2xl bg-[#0a0a0a] border border-white/20 shadow-2xl grid grid-cols-8 gap-1 w-64 animate-in fade-in zoom-in-95 duration-100 ${
            isMe ? 'right-2' : 'left-2'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {extendedReactions.map(em => {
            const hasReacted = msg.reactions?.some(
              r => r.userId === currentUser.id && r.emoji === em
            );
            return (
              <button
                key={em}
                type="button"
                onClick={() => {
                  onReact(msg.id, em);
                  onToggleReactionPicker(null);
                  setIsLongPressed(false);
                }}
                title={`React ${em}`}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm hover:scale-125 active:scale-90 transition cursor-pointer ${
                  hasReacted
                    ? 'bg-white text-black ring-1 ring-white'
                    : 'hover:bg-white/10'
                }`}
              >
                {em}
              </button>
            );
          })}
        </div>
      )}

      {/* Reaction Badges Displayed Beneath Message */}
      {groupedReactions.length > 0 && (
        <div
          id={`msg-reactions-${msg.id}`}
          className={`flex flex-wrap items-center gap-1.5 mt-1.5 px-0.5 ${
            isMe ? 'justify-end' : 'justify-start'
          }`}
        >
          {groupedReactions.map(({ emoji, count, hasReacted, users }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(msg.id, emoji)}
              title={`${users.join(', ')} reacted with ${emoji}`}
              className={`group/r px-2 py-0.5 rounded-full text-xs flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                hasReacted
                  ? 'bg-white text-black border border-white font-bold'
                  : 'bg-[#141414] hover:bg-[#1f1f1f] border border-white/15 text-neutral-300 hover:text-white'
              }`}
            >
              <span className="text-sm group-hover/r:scale-125 transition-transform duration-150">
                {emoji}
              </span>
              <span
                className={`text-[11px] font-mono font-semibold ${
                  hasReacted ? 'text-black' : 'text-neutral-400'
                }`}
              >
                {count}
              </span>
            </button>
          ))}

          {/* Add reaction (+) button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onToggleReactionPicker(isPickerOpen ? null : msg.id);
            }}
            title="Add reaction"
            className="w-6 h-6 rounded-full bg-[#141414] hover:bg-white hover:text-black border border-white/15 text-neutral-400 flex items-center justify-center transition cursor-pointer active:scale-95"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

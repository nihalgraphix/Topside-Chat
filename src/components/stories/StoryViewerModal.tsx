import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  Heart,
  Flame,
  Laugh,
  Send,
  Sparkles,
  Users,
  Check,
} from 'lucide-react';
import { Story, User } from '../../types';
import { api } from '../../lib/api';

export interface StoryViewerModalProps {
  story: Story | null;
  stories: Story[];
  currentUser: User;
  onClose: () => void;
  onEditStory: (story: Story) => void;
  onDeleteStory: (storyId: string) => void;
  onSendMessage?: (recipientId: string, content: string) => void;
}

const FONTS_MAP: Record<string, string> = {
  sans: 'font-sans font-semibold',
  display: 'font-extrabold tracking-tight uppercase',
  serif: 'font-serif italic font-medium',
  script: 'italic tracking-wider font-light',
  mono: 'font-mono uppercase tracking-widest',
  neon: 'font-sans font-black tracking-wide drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]',
};

const FILTERS_MAP: Record<string, string> = {
  none: 'none',
  vivid: 'saturate(1.4) contrast(1.1)',
  warm: 'sepia(0.25) saturate(1.3) brightness(1.05)',
  noir: 'grayscale(1) contrast(1.25)',
  emerald: 'hue-rotate(60deg) saturate(1.2)',
  cyber: 'contrast(1.3) brightness(1.1) hue-rotate(180deg)',
  sepia: 'sepia(0.7) contrast(0.95)',
};

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  story,
  stories,
  currentUser,
  onClose,
  onEditStory,
  onDeleteStory,
  onSendMessage,
}) => {
  if (!story) return null;

  // Filter all stories related to this user or sequence
  const activeIndex = stories.findIndex(s => s.id === story.id);
  const currentStory = activeIndex !== -1 ? stories[activeIndex] : story;
  const isAuthor = currentStory.userId === currentUser.id;

  const [currentIndex, setCurrentIndex] = useState(activeIndex !== -1 ? activeIndex : 0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [reactionSent, setReactionSent] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mark story as viewed on render
  useEffect(() => {
    if (currentStory && currentStory.id && !isAuthor) {
      api.viewStory(currentStory.id).catch(() => {});
    }
  }, [currentStory?.id, isAuthor]);

  // 5-second timer per story
  useEffect(() => {
    setProgress(0);
    if (isPaused || showViewers) return;

    const interval = 50; // ms
    const totalDuration = 5000; // 5 seconds
    const step = (interval / totalDuration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          // Advance to next story or close
          if (currentIndex < stories.length - 1) {
            setCurrentIndex(i => i + 1);
          } else {
            onClose();
          }
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused, showViewers, stories.length, onClose]);

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this story? This action cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await api.deleteStory(currentStory.id);
      onDeleteStory(currentStory.id);
      if (stories.length <= 1) {
        onClose();
      } else {
        handleNext();
      }
    } catch (err) {
      console.error('Failed to delete story:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuickReaction = (emoji: string) => {
    setReactionSent(emoji);
    if (onSendMessage && currentStory.userId) {
      onSendMessage(currentStory.userId, `Reacted ${emoji} to your story: "${currentStory.text || 'Photo story'}"`);
    }
    setTimeout(() => setReactionSent(null), 2000);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !onSendMessage || !currentStory.userId) return;
    onSendMessage(
      currentStory.userId,
      `Replying to story "${currentStory.text || 'Photo story'}": ${replyText.trim()}`
    );
    setReplyText('');
    setReactionSent('Sent!');
    setTimeout(() => setReactionSent(null), 2000);
  };

  const getTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      return `${hours}h ago`;
    } catch {
      return '';
    }
  };

  const storyToRender = stories[currentIndex] || currentStory;
  const author = storyToRender.user || {
    displayName: isAuthor ? currentUser.displayName : 'Story Author',
    avatarUrl: isAuthor ? currentUser.avatarUrl : '',
  };

  const fontClass = FONTS_MAP[storyToRender.fontStyle || 'sans'] || FONTS_MAP.sans;
  const filterStyle = FILTERS_MAP[storyToRender.filter || 'none'] || 'none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-2xl select-none">
      {/* Background Click to Close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Story Window */}
      <div
        className="relative z-10 w-full max-w-sm sm:max-w-md h-[88vh] max-h-[720px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col justify-between bg-[#111b21] group"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* STORY MEDIA / BACKGROUND */}
        {storyToRender.type === 'image' && storyToRender.mediaUrl ? (
          <div className="absolute inset-0 z-0 bg-black overflow-hidden">
            <img
              src={storyToRender.mediaUrl}
              alt="Story content"
              className="w-full h-full object-cover"
              style={{ filter: filterStyle }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />
          </div>
        ) : (
          <div
            className="absolute inset-0 z-0 transition-all"
            style={{
              background:
                storyToRender.background ||
                'linear-gradient(135deg, #00a884 0%, #005c4b 100%)',
            }}
          />
        )}

        {/* DOODLE LAYER OVERLAY */}
        {storyToRender.doodleData && (
          <img
            src={storyToRender.doodleData}
            alt="Doodle drawing"
            className="absolute inset-0 z-10 w-full h-full object-cover pointer-events-none"
          />
        )}

        {/* STICKERS OVERLAY */}
        {storyToRender.stickers &&
          storyToRender.stickers.map(s => (
            <div
              key={s.id}
              style={{ top: `${s.y}%`, left: `${s.x}%` }}
              className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2 text-4xl filter drop-shadow-xl pointer-events-none"
            >
              {s.emoji}
            </div>
          ))}

        {/* LEFT / RIGHT CLICK JUMP ZONES */}
        <div
          onClick={e => {
            e.stopPropagation();
            handlePrev();
          }}
          className="absolute left-0 top-16 bottom-20 w-1/3 z-20 cursor-pointer"
          title="Previous story"
        />
        <div
          onClick={e => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-0 top-16 bottom-20 w-1/3 z-20 cursor-pointer"
          title="Next story"
        />

        {/* TOP BAR: PROGRESS TIMERS & AUTHOR INFO */}
        <div className="relative z-30 p-4 pt-3.5 space-y-3 bg-gradient-to-b from-black/80 to-transparent">
          {/* Progress Segments */}
          <div className="flex items-center gap-1.5">
            {stories.map((s, idx) => {
              const isPassed = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <div
                  key={s.id}
                  className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden backdrop-blur-sm"
                >
                  <div
                    className="h-full bg-white rounded-full transition-all duration-75"
                    style={{
                      width: isPassed ? '100%' : isCurrent ? `${progress}%` : '0%',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Author Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-[#00a884] bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold text-xs select-none">
                {(author.displayName || 'U').charAt(0).toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white leading-tight truncate max-w-[130px]">
                    {author.displayName}
                  </span>
                  {storyToRender.isEdited && (
                    <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full font-semibold border border-amber-500/20">
                      Edited
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-300">
                  {getTimeAgo(storyToRender.createdAt)}
                </div>
              </div>
            </div>

            {/* Top Action Buttons (Author Edit/Delete, Close) */}
            <div className="flex items-center gap-1.5">
              {isAuthor && (
                <>
                  {/* Edit Story Button */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onEditStory(storyToRender);
                    }}
                    title="Edit this story"
                    className="p-1.5 rounded-full bg-black/40 hover:bg-[#00a884] hover:text-slate-950 text-white backdrop-blur-md transition cursor-pointer border border-white/10"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  {/* Delete Story Button */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    disabled={isDeleting}
                    title="Delete story"
                    className="p-1.5 rounded-full bg-black/40 hover:bg-rose-500 text-white backdrop-blur-md transition cursor-pointer border border-white/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={e => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-full bg-black/40 hover:bg-white/20 text-white backdrop-blur-md transition cursor-pointer border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER STORY TEXT CONTENT */}
        <div className="relative z-20 flex-1 flex flex-col justify-center items-center px-6 text-center pointer-events-none">
          {storyToRender.text && (
            <div
              className={`transition-all ${fontClass} ${
                storyToRender.textHighlight === 'pill'
                  ? 'bg-black/75 backdrop-blur-md px-5 py-3 rounded-2xl text-white border border-white/20 shadow-2xl'
                  : storyToRender.textHighlight === 'box'
                  ? 'bg-white text-black px-5 py-3 rounded-2xl shadow-2xl font-bold'
                  : storyToRender.textHighlight === 'glow'
                  ? 'text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.95)]'
                  : 'text-white drop-shadow-md'
              } ${storyToRender.type === 'image' ? 'text-lg max-w-[280px]' : 'text-2xl leading-relaxed max-w-[300px]'}`}
            >
              {storyToRender.text}
            </div>
          )}
        </div>

        {/* BOTTOM FOOTER: VIEWS (AUTHOR) OR REPLY/REACTIONS (VIEWER) */}
        <div className="relative z-30 p-4 pb-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {isAuthor ? (
            /* Author View: Viewers count and details toggle */
            <div className="flex items-center justify-between">
              <button
                onClick={e => {
                  e.stopPropagation();
                  setShowViewers(!showViewers);
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/10 transition cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#00a884]" />
                <span>{storyToRender.viewers?.length || 0} views</span>
              </button>

              <button
                onClick={e => {
                  e.stopPropagation();
                  onEditStory(storyToRender);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-slate-950 text-xs font-bold transition shadow-lg cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Story</span>
              </button>
            </div>
          ) : (
            /* Viewer View: Quick reactions & direct message reply */
            <div className="space-y-2.5">
              {/* Quick reactions tray */}
              <div className="flex items-center justify-center gap-2">
                {['❤️', '🔥', '😂', '👏', '😮', '😍'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={e => {
                      e.stopPropagation();
                      handleQuickReaction(emoji);
                    }}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-lg active:scale-125 transition cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Reply message input */}
              <form onSubmit={handleSendReply} className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Reply to ${author.displayName.split(' ')[0]}...`}
                  className="flex-1 px-3.5 py-2 rounded-full bg-white/15 backdrop-blur-md border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00a884] transition"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="p-2 rounded-full bg-[#00a884] text-slate-950 font-bold hover:bg-[#06cf9c] disabled:opacity-40 transition cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* Reaction toast confirmation */}
          {reactionSent && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 bg-[#00a884] text-slate-950 font-bold px-3 py-1 rounded-full text-xs shadow-xl animate-in fade-in zoom-in">
              {reactionSent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Plus, Sparkles, X, Eye } from 'lucide-react';
import { Story, User } from '../../types';
import { Avatar } from '../common/Avatar';
import { api } from '../../lib/api';

interface StoriesBarProps {
  stories: Story[];
  currentUser: User;
  onRefreshStories: () => void;
  onSelectStory: (story: Story) => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  stories,
  currentUser,
  onRefreshStories,
  onSelectStory,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newText, setNewText] = useState('');
  const [bgGradient, setBgGradient] = useState('linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group stories by user
  const userStories = stories.reduce((acc, story) => {
    if (!acc[story.userId]) {
      acc[story.userId] = [];
    }
    acc[story.userId].push(story);
    return acc;
  }, {} as Record<string, Story[]>);

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    setIsSubmitting(true);
    try {
      await api.createStory({
        type: 'text',
        text: newText.trim(),
        background: bgGradient,
      });
      setNewText('');
      setIsCreating(false);
      onRefreshStories();
    } catch (err) {
      console.error('Failed to create story', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const gradients = [
    'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  ];

  return (
    <div className="flex items-center gap-3 overflow-x-auto py-2.5 px-4 scrollbar-none border-b border-white/5 bg-slate-950/30">
      {/* Create Story Button */}
      <div className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group" onClick={() => setIsCreating(true)}>
        <div className="relative w-12 h-12 rounded-2xl p-0.5 border border-dashed border-cyan-400/50 flex items-center justify-center group-hover:border-cyan-400 transition">
          <Avatar name={currentUser.displayName} src={currentUser.avatarUrl} size="sm" />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-white flex items-center justify-center shadow-md">
            <Plus className="w-3 h-3 stroke-[3]" />
          </div>
        </div>
        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[56px]">Your Story</span>
      </div>

      {/* Story Bubbles */}
      {(Object.entries(userStories) as [string, Story[]][]).map(([userId, uStories]) => {
        const first = uStories[0];
        const user = first.user || { displayName: 'User', avatarUrl: '' };
        const hasUnviewed = uStories.some(s => !s.viewers.includes(currentUser.id));

        return (
          <div
            key={userId}
            className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group"
            onClick={() => onSelectStory(first)}
          >
            <div
              className={`w-12 h-12 rounded-2xl p-0.5 transition-transform group-hover:scale-105 ${
                hasUnviewed
                  ? 'bg-gradient-to-tr from-cyan-400 via-sky-400 to-blue-500 p-[2px] shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'border border-white/20 p-0.5'
              }`}
            >
              <div className="w-full h-full rounded-[14px] overflow-hidden">
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" className="w-full h-full" />
              </div>
            </div>
            <span className="text-[10px] text-slate-300 font-medium truncate max-w-[56px]">
              {user.displayName.split(' ')[0]}
            </span>
          </div>
        );
      })}

      {/* Create Story Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl glass-panel border border-white/10 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreating(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-slate-100">Create 24h Story</h3>
            </div>

            {/* Preview Card */}
            <div
              className="w-full h-56 rounded-2xl p-4 flex items-center justify-center text-center text-white font-medium text-lg shadow-inner mb-4 transition-all"
              style={{ background: bgGradient }}
            >
              {newText || 'Type your status update...'}
            </div>

            {/* Gradient Selector */}
            <div className="flex items-center gap-2 mb-4 justify-center">
              {gradients.map((grad, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBgGradient(grad)}
                  className={`w-7 h-7 rounded-xl transition ${bgGradient === grad ? 'scale-110 ring-2 ring-white' : ''}`}
                  style={{ background: grad }}
                />
              ))}
            </div>

            <form onSubmit={handleCreateStory}>
              <textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="What's happening in your digital space?"
                rows={2}
                maxLength={140}
                required
                className="w-full p-3 rounded-xl glass-input text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 mb-4 resize-none"
              />
              <button
                type="submit"
                disabled={isSubmitting || !newText.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Publishing...' : 'Share Status Story'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const StoryViewer: React.FC<{
  story: Story | null;
  currentUser: User;
  onClose: () => void;
}> = ({ story, currentUser, onClose }) => {
  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
      <div className="relative w-full max-w-sm h-[580px] rounded-3xl overflow-hidden glass-panel border border-white/10 shadow-2xl flex flex-col justify-between p-6">
        {/* Progress Bar */}
        <div className="absolute top-3 inset-x-6 h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-cyan-400 rounded-full w-full animate-[progress_6s_linear_forwards]" />
        </div>

        {/* Top User Info */}
        <div className="flex items-center justify-between mt-3 z-10">
          <div className="flex items-center gap-2.5">
            <Avatar name={story.user?.displayName || 'User'} src={story.user?.avatarUrl} size="sm" />
            <div>
              <div className="text-sm font-semibold text-slate-100">{story.user?.displayName}</div>
              <div className="text-[10px] text-slate-400">24h Status</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Story Content */}
        <div
          className="absolute inset-0 flex items-center justify-center p-8 text-center"
          style={story.background ? { background: story.background } : undefined}
        >
          {story.mediaUrl ? (
            <img src={story.mediaUrl} alt="Story" className="w-full h-full object-cover" />
          ) : (
            <p className="text-xl font-medium text-white leading-relaxed">{story.text}</p>
          )}
        </div>

        {/* Bottom Footer */}
        <div className="z-10 flex items-center justify-between text-xs text-white/80 pt-4 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span>{story.viewers.length} views</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/20 backdrop-blur-md hover:bg-white/30 text-white font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

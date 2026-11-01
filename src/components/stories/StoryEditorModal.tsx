import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Type,
  Smile,
  Pencil,
  RotateCcw,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
} from 'lucide-react';
import { Story, User } from '../../types';
import { api } from '../../lib/api';

export interface StoryEditorModalProps {
  isOpen: boolean;
  currentUser: User;
  editingStory?: Story | null;
  onClose: () => void;
  onSaved: (story: Story) => void;
}

const GRADIENTS = [
  { id: 'whatsapp', name: 'WhatsApp Teal', css: 'linear-gradient(135deg, #00a884 0%, #005c4b 100%)' },
  { id: 'aurora', name: 'Aurora Sky', css: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)' },
  { id: 'cyber', name: 'Cyber Neon', css: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #3b82f6 100%)' },
  { id: 'sunset', name: 'Sunset Flame', css: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)' },
  { id: 'emerald', name: 'Emerald Wave', css: 'linear-gradient(135deg, #059669 0%, #0284c7 100%)' },
  { id: 'space', name: 'Deep Space', css: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%)' },
  { id: 'forest', name: 'Forest Moss', css: 'linear-gradient(135deg, #14532d 0%, #15803d 100%)' },
  { id: 'pastel', name: 'Blossom Pastel', css: 'linear-gradient(135deg, #f472b6 0%, #a78bfa 100%)' },
  { id: 'dark_slate', name: 'Midnight Slate', css: 'linear-gradient(135deg, #111b21 0%, #202c33 100%)' },
  { id: 'gold', name: 'Liquid Gold', css: 'linear-gradient(135deg, #ca8a04 0%, #eab308 50%, #854d0e 100%)' },
  { id: 'violet', name: 'Royal Violet', css: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)' },
  { id: 'carbon', name: 'Pure Carbon', css: 'linear-gradient(135deg, #0b141a 0%, #090e11 100%)' },
];

const FONTS = [
  { id: 'sans', name: 'Modern', className: 'font-sans font-semibold' },
  { id: 'display', name: 'Bold Display', className: 'font-extrabold tracking-tight uppercase' },
  { id: 'serif', name: 'Editorial Serif', className: 'font-serif italic font-medium' },
  { id: 'script', name: 'Handwritten', className: 'italic tracking-wider font-light' },
  { id: 'mono', name: 'Monospace', className: 'font-mono uppercase tracking-widest' },
  { id: 'neon', name: 'Neon Glow', className: 'font-sans font-black tracking-wide drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]' },
] as const;

const STICKER_PRESETS = ['🔥', '❤️', '✨', '💯', '☕', '🚀', '💬', '🎵', '📍', '🕒', '💡', '⚡', '🎉', '😎', '🏖️', '🍕', '💻', '🥳'];

export const StoryEditorModal: React.FC<StoryEditorModalProps> = ({
  isOpen,
  currentUser,
  editingStory,
  onClose,
  onSaved,
}) => {
  if (!isOpen) return null;

  const isEditMode = !!editingStory;

  // Story Content
  const [text, setText] = useState(editingStory?.text || '');
  const [background, setBackground] = useState(editingStory?.background || GRADIENTS[0].css);
  const [fontStyle, setFontStyle] = useState<'sans' | 'display' | 'serif' | 'script' | 'mono' | 'neon'>(
    editingStory?.fontStyle || 'sans'
  );
  const [textHighlight, setTextHighlight] = useState<'none' | 'pill' | 'box' | 'glow'>(
    editingStory?.textHighlight || 'none'
  );
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [stickers, setStickers] = useState<{ id: string; emoji: string; x: number; y: number }[]>(
    editingStory?.stickers || []
  );

  // Doodle Drawing Tool
  const [isDoodling, setIsDoodling] = useState(false);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  // Initialize doodle data if present
  useEffect(() => {
    if (editingStory?.doodleData && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = editingStory.doodleData;
    }
  }, [editingStory, isOpen]);

  // Handle Canvas Drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDoodling || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = isEraser ? '#000000' : brushColor;
    ctx.lineWidth = isEraser ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isDoodling || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
  };

  const handleClearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  // Add Sticker
  const handleAddSticker = (emoji: string) => {
    setStickers(prev => [
      ...prev,
      {
        id: `stk_${Date.now()}_${Math.random()}`,
        emoji,
        x: Math.floor(Math.random() * 40) + 30,
        y: Math.floor(Math.random() * 40) + 30,
      },
    ]);
    setShowStickerPicker(false);
  };

  const handleRemoveSticker = (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id));
  };

  // Save or Update Story
  const handleSave = async () => {
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const doodleData = canvasRef.current ? canvasRef.current.toDataURL() : undefined;

      const storyPayload: Partial<Story> = {
        type: 'text',
        text: text.trim(),
        background,
        fontStyle,
        textHighlight,
        stickers,
        doodleData,
      };

      let result: Story;
      if (isEditMode && editingStory) {
        result = await api.updateStory(editingStory.id, storyPayload);
      } else {
        result = await api.createStory(storyPayload);
      }

      onSaved(result);
      onClose();
    } catch (err) {
      console.error('Failed to save story:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedFontObj = FONTS.find(f => f.id === fontStyle) || FONTS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl select-none overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-4xl bg-[#111b21] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] max-h-[760px]">
        {/* LEFT COLUMN: Interactive Story 9:16 Preview Canvas */}
        <div className="w-full md:w-[380px] lg:w-[420px] bg-[#0b141a] p-4 flex flex-col items-center justify-center relative border-r border-[#222d34] shrink-0">
          <div className="relative w-[270px] sm:w-[290px] h-[480px] sm:h-[515px] rounded-3xl overflow-hidden shadow-2xl border border-white/15 flex flex-col justify-between p-4 group">
            {/* Background Layer */}
            <div
              className="absolute inset-0 z-0 transition-all duration-300"
              style={{ background }}
            />

            {/* Doodle Drawing Canvas Overlay */}
            <canvas
              ref={canvasRef}
              width={300}
              height={530}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className={`absolute inset-0 z-10 w-full h-full ${
                isDoodling ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
              }`}
            />

            {/* Top Author Header Badge */}
            <div className="relative z-20 flex items-center justify-between">
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00a884] to-[#005c4b] flex items-center justify-center text-white font-bold text-[10px] select-none shrink-0">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-bold text-white truncate max-w-[120px]">
                  {currentUser.displayName}
                </span>
                <span className="text-[10px] text-slate-300">
                  {isEditMode ? 'Editing' : 'Status'}
                </span>
              </div>

              {isDoodling && (
                <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded-full text-[10px] text-[#00a884] font-semibold animate-pulse">
                  <Pencil className="w-3 h-3" />
                  <span>Doodle active</span>
                </div>
              )}
            </div>

            {/* Center Text Layer */}
            <div
              className={`relative z-20 flex-1 flex flex-col justify-center px-4 transition-all ${
                textAlign === 'left'
                  ? 'items-start text-left'
                  : textAlign === 'right'
                  ? 'items-end text-right'
                  : 'items-center text-center'
              }`}
            >
              {text ? (
                <div
                  className={`transition-all ${selectedFontObj.className} ${
                    textHighlight === 'pill'
                      ? 'bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl text-white border border-white/20'
                      : textHighlight === 'box'
                      ? 'bg-white text-black px-4 py-2.5 rounded-xl shadow-xl'
                      : textHighlight === 'glow'
                      ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.9)]'
                      : 'text-white drop-shadow-md'
                  } text-xl leading-relaxed max-w-[250px]`}
                >
                  {text}
                </div>
              ) : (
                <div className="text-white/40 text-sm font-medium italic">
                  Type your status message...
                </div>
              )}
            </div>

            {/* Sticker Layer */}
            {stickers.map(s => (
              <div
                key={s.id}
                style={{ top: `${s.y}%`, left: `${s.x}%` }}
                className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 group/stk cursor-pointer select-none"
              >
                <div className="text-4xl filter drop-shadow-lg transition transform hover:scale-125 active:scale-95">
                  {s.emoji}
                </div>
                <button
                  onClick={() => handleRemoveSticker(s.id)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover/stk:opacity-100 transition shadow"
                  title="Remove sticker"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Bottom 24h expiration indicator */}
            <div className="relative z-20 flex items-center justify-between text-[10px] text-white/70">
              <span className="bg-black/30 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/5">
                ⏱️ Disappears in 24 hours
              </span>
              {isEditMode && (
                <span className="bg-amber-500/30 text-amber-300 backdrop-blur-sm px-2.5 py-1 rounded-full border border-amber-500/30 font-semibold">
                  Edited Status
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Rich Editing Toolset */}
        <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar p-6 bg-[#111b21]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#222d34]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00a884]/20 border border-[#00a884]/40 flex items-center justify-center text-[#00a884]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {isEditMode ? 'Edit Status Story' : 'Create Status Story'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isEditMode ? 'Update your active 24h status' : 'Share status updates with your contacts'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#202c33] transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content Controls */}
          <div className="flex-1 py-4 space-y-5">
            {/* TEXT INPUT FIELD */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Status Message
              </label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What's on your mind? Type a status update..."
                rows={3}
                maxLength={240}
                className="w-full p-3.5 rounded-2xl bg-[#202c33] border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884] transition resize-none"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1">
                <span>{text.length} / 240 characters</span>
                {text && (
                  <button
                    onClick={() => setText('')}
                    className="text-slate-400 hover:text-rose-400 transition"
                  >
                    Clear text
                  </button>
                )}
              </div>
            </div>

            {/* BACKGROUND GRADIENTS */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Canvas Background
              </label>
              <div className="grid grid-cols-6 gap-2">
                {GRADIENTS.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setBackground(g.css)}
                    title={g.name}
                    style={{ background: g.css }}
                    className={`h-10 rounded-xl transition transform active:scale-95 cursor-pointer relative ${
                      background === g.css
                        ? 'ring-2 ring-white scale-105 shadow-lg'
                        : 'ring-1 ring-white/10 hover:ring-white/40'
                    }`}
                  >
                    {background === g.css && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white drop-shadow" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* TYPOGRAPHY & TEXT STYLES */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Typography & Styling
              </label>

              {/* Font families */}
              <div className="grid grid-cols-3 gap-2">
                {FONTS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFontStyle(f.id)}
                    className={`py-2 px-2.5 rounded-xl text-xs transition cursor-pointer border truncate ${
                      fontStyle === f.id
                        ? 'bg-[#00a884]/20 border-[#00a884] text-[#00a884] font-bold'
                        : 'bg-[#202c33] border-white/5 text-slate-300 hover:bg-[#2a3942]'
                    }`}
                  >
                    <span className={f.className}>{f.name}</span>
                  </button>
                ))}
              </div>

              {/* Alignment & Highlight styles */}
              <div className="flex items-center justify-between gap-3 pt-1">
                {/* Alignment */}
                <div className="flex items-center gap-1 bg-[#202c33] p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setTextAlign('left')}
                    className={`p-1.5 rounded-lg transition ${
                      textAlign === 'left' ? 'bg-[#00a884] text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlign('center')}
                    className={`p-1.5 rounded-lg transition ${
                      textAlign === 'center' ? 'bg-[#00a884] text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextAlign('right')}
                    className={`p-1.5 rounded-lg transition ${
                      textAlign === 'right' ? 'bg-[#00a884] text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Highlight style */}
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'none', label: 'Plain' },
                    { id: 'pill', label: 'Pill' },
                    { id: 'box', label: 'Solid' },
                    { id: 'glow', label: 'Glow' },
                  ].map(h => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setTextHighlight(h.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        textHighlight === h.id
                          ? 'bg-[#00a884] text-slate-950'
                          : 'bg-[#202c33] text-slate-400 hover:text-white'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* STICKERS & DOODLE TOOLBAR */}
            <div className="pt-2 border-t border-[#222d34] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Interactive Extras
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStickerPicker(!showStickerPicker)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      showStickerPicker
                        ? 'bg-[#00a884] text-slate-950'
                        : 'bg-[#202c33] text-slate-300 hover:text-white'
                    }`}
                  >
                    <Smile className="w-3.5 h-3.5" />
                    <span>Add Sticker</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDoodling(!isDoodling)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      isDoodling
                        ? 'bg-[#00a884] text-slate-950'
                        : 'bg-[#202c33] text-slate-300 hover:text-white'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isDoodling ? 'Done Drawing' : 'Draw Doodle'}</span>
                  </button>
                </div>
              </div>

              {/* Sticker Selector Tray */}
              {showStickerPicker && (
                <div className="p-3 bg-[#202c33] rounded-2xl border border-white/10 grid grid-cols-9 gap-2 animate-in fade-in">
                  {STICKER_PRESETS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleAddSticker(emoji)}
                      className="text-2xl p-1.5 rounded-xl hover:bg-white/10 active:scale-95 transition flex items-center justify-center cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Doodle Drawing Controls */}
              {isDoodling && (
                <div className="p-3 bg-[#202c33] rounded-2xl border border-white/10 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Draw on Canvas</span>
                    <button
                      type="button"
                      onClick={handleClearCanvas}
                      className="text-rose-400 hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear Canvas</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {['#ffffff', '#00a884', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7', '#000000'].map(
                      c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setBrushColor(c);
                            setIsEraser(false);
                          }}
                          style={{ backgroundColor: c }}
                          className={`w-6 h-6 rounded-full border border-white/20 transition ${
                            brushColor === c && !isEraser ? 'scale-125 ring-2 ring-white' : ''
                          }`}
                        />
                      )
                    )}

                    <div className="h-4 w-px bg-white/20 mx-1" />

                    <button
                      type="button"
                      onClick={() => setIsEraser(!isEraser)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        isEraser ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      Eraser
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-[#222d34] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#202c33] transition"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSubmitting || !text.trim()}
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#06cf9c] text-slate-950 font-bold text-xs transition shadow-lg disabled:opacity-50 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : isEditMode ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Share Status Story</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Palette,
  Shield,
  Bell,
  HardDrive,
  Check,
  Smartphone,
  Trash2,
  Download,
  Key,
  Sparkles,
  Mic,
  Video,
  Volume2,
  VolumeX,
  Play,
  Database,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { User as UserType, AccentTheme } from '../../types';
import { Avatar } from '../common/Avatar';
import { api } from '../../lib/api';
import { audioEffects } from '../../lib/audioEffects';

interface SettingsModalProps {
  isOpen: boolean;
  currentUser: UserType;
  accent: AccentTheme;
  theme: 'dark' | 'light' | 'system';
  onClose: () => void;
  onUpdateUser: (user: UserType) => void;
  onUpdateTheme: (theme: 'dark' | 'light' | 'system', accent: AccentTheme) => void;
  onResetAllData?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  currentUser,
  accent,
  theme,
  onClose,
  onUpdateUser,
  onUpdateTheme,
  onResetAllData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'profile' | 'media' | 'appearance' | 'privacy' | 'notifications' | 'storage'
  >('profile');

  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [selectedAccent, setSelectedAccent] = useState<AccentTheme>(accent);
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>(theme);

  // Audio / Video device testing states
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isCameraTesting, setIsCameraTesting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Database stats
  const [sqlStats, setSqlStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const avatarUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'storage') {
      fetchSqlStats();
    }
  }, [isOpen, activeTab]);

  // Clean up device test streams when closing or switching tabs
  useEffect(() => {
    return () => {
      stopMicTest();
      stopCameraTest();
    };
  }, [isOpen, activeTab]);

  const fetchSqlStats = async () => {
    setIsLoadingStats(true);
    try {
      const stats = await api.getSqlStats();
      setSqlStats(stats);
    } catch (err) {
      console.warn('Failed to load SQL stats', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStreamRef.current = stream;
      setIsMicTesting(true);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      micAudioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setMicVolume(Math.min(1, sum / (dataArray.length * 80)));
        micAnimRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      console.warn('Mic test failed:', err);
      setStatusMsg('Could not access microphone.');
    }
  };

  const stopMicTest = () => {
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
      micAudioCtxRef.current.close().catch(() => {});
    }
    if (testStreamRef.current) {
      testStreamRef.current.getAudioTracks().forEach(t => t.stop());
    }
    setIsMicTesting(false);
    setMicVolume(0);
  };

  const startCameraTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
      }
      setIsCameraTesting(true);
    } catch (err) {
      console.warn('Camera test failed:', err);
      setStatusMsg('Could not access camera.');
    }
  };

  const stopCameraTest = () => {
    if (testVideoRef.current && testVideoRef.current.srcObject) {
      const stream = testVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      testVideoRef.current.srcObject = null;
    }
    setIsCameraTesting(false);
  };

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const updated = await api.updateProfile({
        displayName,
        bio,
        phone,
        avatarUrl,
      });
      onUpdateUser(updated);
      setStatusMsg('Profile successfully updated');
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setStatusMsg('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        setAvatarUrl(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAppearance = () => {
    onUpdateTheme(selectedTheme, selectedAccent);
    setStatusMsg('Theme preferences saved');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleExportData = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(currentUser, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aether-data-${currentUser.username}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const accentOptions: { id: AccentTheme; label: string; color: string }[] = [
    { id: 'aurora', label: 'Aurora Cyan', color: 'from-cyan-400 to-blue-500' },
    { id: 'ocean', label: 'Ocean Blue', color: 'from-blue-500 to-indigo-600' },
    { id: 'midnight', label: 'Midnight Obsidian', color: 'from-slate-600 to-slate-800' },
    { id: 'purple', label: 'Nebula Purple', color: 'from-purple-500 to-pink-500' },
    { id: 'emerald', label: 'Emerald Mint', color: 'from-emerald-400 to-teal-600' },
    { id: 'sunset', label: 'Cosmic Sunset', color: 'from-rose-400 to-orange-500' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-3xl rounded-3xl bg-[#111116] border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px]">
        {/* Left Sidebar Navigation */}
        <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-white/5 p-4 flex flex-col justify-between shrink-0 bg-black/40">
          <div>
            <div className="flex items-center gap-2 mb-6 px-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">Settings & Preferences</h2>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <User className="w-4 h-4" />
                <span>My Profile</span>
              </button>

              <button
                onClick={() => setActiveTab('media')}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition cursor-pointer ${
                  activeTab === 'media'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Voice & Video Devices</span>
              </button>

              <button
                onClick={() => setActiveTab('appearance')}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition cursor-pointer ${
                  activeTab === 'appearance'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Palette className="w-4 h-4" />
                <span>Appearance</span>
              </button>

              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition cursor-pointer ${
                  activeTab === 'notifications'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Notifications & Sounds</span>
              </button>

              <button
                onClick={() => setActiveTab('storage')}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition cursor-pointer ${
                  activeTab === 'storage'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>SQL Database & Storage</span>
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 px-2 font-mono flex items-center justify-between">
            <span>Aether v3.1</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              SQLite Connected
            </span>
          </div>
        </div>

        {/* Right Settings Content */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c10] p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {statusMsg && (
            <div className="mb-4 p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium flex items-center justify-between animate-in fade-in">
              <span>{statusMsg}</span>
              <Check className="w-4 h-4" />
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <h3 className="text-sm font-bold text-white mb-2">Profile & Identity</h3>

              <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/5 border border-white/5">
                <Avatar name={displayName} src={avatarUrl} size="lg" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => avatarUploadRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAvatarUrl(
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                            displayName
                          )}`
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition cursor-pointer"
                    >
                      Use Initials
                    </button>
                  </div>
                  <input
                    ref={avatarUploadRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFile}
                  />
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={e => setAvatarUrl(e.target.value)}
                    placeholder="Or paste an image URL..."
                    className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bio / Status</label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={2}
                  placeholder="Tell your contacts about yourself..."
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 019-2834"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="py-2.5 px-6 rounded-xl font-semibold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg disabled:opacity-50 transition cursor-pointer"
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {/* TAB 2: VOICE & VIDEO DEVICES */}
          {activeTab === 'media' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <h3 className="text-sm font-bold text-white">Audio & Video Devices Test</h3>

              {/* Microphone Tester */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Microphone Input</span>
                  </div>

                  <button
                    type="button"
                    onClick={isMicTesting ? stopMicTest : startMicTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      isMicTesting
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                    }`}
                  >
                    {isMicTesting ? 'Stop Mic Test' : 'Test Microphone'}
                  </button>
                </div>

                {isMicTesting && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Speak into your mic:</span>
                      <span className="font-mono text-cyan-400">
                        {Math.round(micVolume * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-black/40 overflow-hidden p-0.5 border border-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-rose-500 transition-all duration-75"
                        style={{ width: `${Math.max(4, micVolume * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Tester */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Webcam Video Preview</span>
                  </div>

                  <button
                    type="button"
                    onClick={isCameraTesting ? stopCameraTest : startCameraTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      isCameraTesting
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                    }`}
                  >
                    {isCameraTesting ? 'Stop Camera Test' : 'Test Webcam'}
                  </button>
                </div>

                {isCameraTesting && (
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
                    <video
                      ref={testVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  </div>
                )}
              </div>

              {/* Ringtone Sound Effect Tests */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-white">Test Audio Ringtones</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => audioEffects.startIncomingRingtone()}
                    className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/5 text-[11px] font-medium text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    Incoming Ring
                  </button>
                  <button
                    type="button"
                    onClick={() => audioEffects.startOutgoingRingtone()}
                    className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/5 text-[11px] font-medium text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    Outgoing Ring
                  </button>
                  <button
                    type="button"
                    onClick={() => audioEffects.playCallConnected()}
                    className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/5 text-[11px] font-medium text-slate-300 hover:text-white transition cursor-pointer"
                  >
                    Connect Chime
                  </button>
                  <button
                    type="button"
                    onClick={() => audioEffects.stopRingtone()}
                    className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-[11px] font-medium text-rose-300 transition cursor-pointer"
                  >
                    Stop Sound
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              <div>
                <h3 className="text-sm font-bold text-white mb-3">Theme Mode</h3>
                <div className="grid grid-cols-3 gap-3">
                  {(['dark', 'light', 'system'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setSelectedTheme(m)}
                      className={`p-3 rounded-2xl border text-xs font-semibold capitalize transition cursor-pointer ${
                        selectedTheme === m
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white mb-3">Accent Aura</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {accentOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedAccent(opt.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition cursor-pointer ${
                        selectedAccent === opt.id
                          ? 'border-cyan-500 bg-cyan-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${opt.color}`} />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveAppearance}
                className="py-2.5 px-6 rounded-xl font-semibold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer"
              >
                Apply Appearance Settings
              </button>
            </div>
          )}

          {/* TAB 4: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <h3 className="text-sm font-bold text-white">Alerts & Ringtones</h3>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-xs font-semibold text-white">Call & Message Audio</div>
                  <div className="text-[10px] text-slate-400">Play real-time telephone and message chimes</div>
                </div>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-10 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    soundEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      soundEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: STORAGE & SQL DATABASE */}
          {activeTab === 'storage' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Persistent SQLite Storage</h3>
                <button
                  onClick={fetchSqlStats}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Refresh Database Stats"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {sqlStats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div className="text-lg font-mono font-bold text-cyan-400">
                      {sqlStats.messagesCount ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400">Messages in SQL</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div className="text-lg font-mono font-bold text-cyan-400">
                      {sqlStats.conversationsCount ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400">Conversations</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div className="text-lg font-mono font-bold text-cyan-400">
                      {sqlStats.usersCount ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400">Registered Users</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center">
                    <div className="text-lg font-mono font-bold text-emerald-400">Active</div>
                    <div className="text-[10px] text-slate-400">WASM Storage</div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 text-xs text-slate-400 text-center">
                  Loading SQLite persistence metrics...
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Export Personal Data</div>
                  <div className="text-[10px] text-slate-400">Download your profile metadata archive</div>
                </div>
                <button
                  onClick={handleExportData}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Danger Zone */}
              <div className="pt-2 border-t border-rose-500/20">
                <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Reset All Data</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Clears messages and restores fresh workspace data.
                    </div>
                  </div>
                  {onResetAllData && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            'Are you sure you want to reset all data? This will clear local records and reset default conversations.'
                          )
                        ) {
                          onResetAllData();
                          onClose();
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition cursor-pointer shrink-0"
                    >
                      Reset All Data
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

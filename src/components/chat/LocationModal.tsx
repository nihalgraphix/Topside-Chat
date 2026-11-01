import React, { useState } from 'react';
import { X, MapPin, Navigation, Compass } from 'lucide-react';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendLocation: (location: { latitude: number; longitude: number; title: string }) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  onSendLocation,
}) => {
  const [title, setTitle] = useState('Current Location');
  const [latitude, setLatitude] = useState(37.7749);
  const [longitude, setLongitude] = useState(-122.4194);
  const [isLocating, setIsLocating] = useState(false);

  if (!isOpen) return null;

  const handleDetectGPS = () => {
    if ('geolocation' in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLatitude(parseFloat(pos.coords.latitude.toFixed(4)));
          setLongitude(parseFloat(pos.coords.longitude.toFixed(4)));
          setTitle('Live Geolocation');
          setIsLocating(false);
        },
        () => {
          setIsLocating(false);
        }
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendLocation({
      latitude,
      longitude,
      title: title.trim() || 'Pinned Location',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-[#111116] border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Share Location</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Simulated Map Graphic / Canvas */}
          <div className="w-full h-36 rounded-xl bg-gradient-to-br from-slate-900 to-[#101928] border border-white/10 relative overflow-hidden flex flex-col items-center justify-center text-center p-3">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="relative z-10 w-10 h-10 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-1 shadow-lg ring-4 ring-cyan-500/10 animate-pulse">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="relative z-10 text-xs font-bold text-white">{title}</div>
            <div className="relative z-10 text-[10px] font-mono text-slate-400">
              {latitude}° N, {longitude}° W
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Location Name / Address
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. San Francisco Bay Area"
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40"
            />
          </div>

          <button
            type="button"
            onClick={handleDetectGPS}
            disabled={isLocating}
            className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-slate-300 hover:text-white flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Detecting coordinates...' : 'Use Current Device GPS'}</span>
          </button>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Send Pin</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

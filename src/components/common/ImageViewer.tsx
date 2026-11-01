import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface ImageViewerProps {
  url: string | null;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ url, onClose }) => {
  if (!url) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition z-10"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="absolute top-6 left-6 flex items-center gap-3 z-10">
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-2 text-xs font-medium"
        >
          <Download className="w-4 h-4" />
          <span>Download Media</span>
        </a>
      </div>

      <div className="max-w-5xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        <img src={url} alt="Fullscreen Media" className="w-full h-full object-contain max-h-[85vh]" />
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, X, Send, AlertCircle, Sparkles, Upload } from 'lucide-react';
import { audioEffects } from '../../lib/audioEffects';

interface PhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendPhoto: (dataUrl: string, caption?: string) => void;
}

export const PhotoCaptureModal: React.FC<PhotoCaptureModalProps> = ({
  isOpen,
  onClose,
  onSendPhoto,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera when opened
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setCaption('');
      setCameraError(null);
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (mode: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera permissions or upload a photo from your files.'
          : 'Could not connect to camera device. You can still upload photos from your device.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleTakePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flash effect & shutter sound
    audioEffects.playCameraShutter();
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);

    // If front-facing camera, mirror the image horizontally so it looks natural
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCaption('');
    startCamera(facingMode);
  };

  const handleFlipCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleSend = () => {
    if (!capturedPhoto) return;
    onSendPhoto(capturedPhoto, caption.trim() || undefined);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (result) {
        setCapturedPhoto(result);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in">
      <div className="w-full max-w-lg bg-[#0f0f13] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
        {/* Header */}
        <div className="p-4 px-5 border-b border-white/5 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-white">
              {capturedPhoto ? 'Preview Photo' : 'Take a Photo'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Stage */}
        <div className="relative aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          {/* Flash animation */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-150" />
          )}

          {capturedPhoto ? (
            /* Snapshot Preview */
            <img
              src={capturedPhoto}
              alt="Snapshot"
              className="w-full h-full object-cover"
            />
          ) : cameraError ? (
            /* Camera Permission / Error Fallback */
            <div className="p-6 text-center max-w-xs flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-300 mb-4">{cameraError}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium border border-white/10 flex items-center gap-2 transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload from Device</span>
              </button>
            </div>
          ) : (
            /* Live Camera Stream */
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Viewfinder corner brackets overlay */}
              <div className="absolute inset-6 pointer-events-none border border-white/20 rounded-2xl flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                    LIVE HD
                  </span>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400/70 animate-pulse" />
                </div>
                <div className="text-center text-[10px] text-white/50 bg-black/30 py-0.5 rounded backdrop-blur-sm">
                  Click the capture button to take photo
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hidden File Input for fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Controls Footer */}
        <div className="p-4 px-5 bg-[#141418] border-t border-white/5">
          {capturedPhoto ? (
            /* Photo has been taken: Caption + Send/Retake */
            <div className="space-y-3">
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption... (optional)"
                className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40"
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleRetake}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition cursor-pointer"
                >
                  Retake Photo
                </button>

                <button
                  onClick={handleSend}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Photo</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Camera Controls: Flip, Snap, Upload */
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload from computer or phone"
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <Upload className="w-5 h-5" />
              </button>

              {/* Large Shutter Button */}
              <button
                type="button"
                onClick={handleTakePhoto}
                disabled={Boolean(cameraError)}
                className="w-14 h-14 rounded-full border-4 border-white/30 p-1 flex items-center justify-center hover:scale-105 active:scale-95 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed group shadow-xl"
              >
                <div className="w-full h-full rounded-full bg-white group-hover:bg-cyan-400 transition" />
              </button>

              {/* Flip camera */}
              <button
                type="button"
                onClick={handleFlipCamera}
                title="Flip camera"
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

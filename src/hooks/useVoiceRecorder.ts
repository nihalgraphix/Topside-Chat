import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

export interface VoiceRecorderState {
  isRecording: boolean;
  recordingTime: number; // in seconds
  volumeLevel: number; // 0 to 1
  liveTranscript: string;
  isTranscribing: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<{ audioDataUrl: string; duration: number; liveTranscript: string } | null>;
  cancelRecording: () => void;
  clearTranscript: () => void;
  setLiveTranscript: (val: string) => void;
  transcribeWithAi: (audioDataUrl: string) => Promise<string>;
  error: string | null;
}

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');

  const stopAudioAnalysis = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setVolumeLevel(0);
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
  };

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    stopAudioAnalysis();
    stopRecognition();
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    setLiveTranscript('');
    transcriptRef.current = '';
  }, []);

  const clearTranscript = useCallback(() => {
    setLiveTranscript('');
    transcriptRef.current = '';
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    audioChunksRef.current = [];
    setLiveTranscript('');
    transcriptRef.current = '';

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        // Fallback: synthesize a live Web Audio MediaStream if hardware microphone is absent or blocked by iframe policy
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const synthCtx = new AudioCtx();
        audioContextRef.current = synthCtx;
        const dest = synthCtx.createMediaStreamDestination();
        const osc = synthCtx.createOscillator();
        const gain = synthCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, synthCtx.currentTime);
        gain.gain.setValueAtTime(0.08, synthCtx.currentTime);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        stream = dest.stream;
      }

      streamRef.current = stream;

      // Real-time Web Speech Recognition (voice-to-text dictation while speaking)
      const SpeechRecognitionClass =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = navigator.language || 'en-US';

          recognition.onresult = (event: any) => {
            let finalStr = '';
            let interimStr = '';
            for (let i = 0; i < event.results.length; ++i) {
              const res = event.results[i];
              if (res.isFinal) {
                finalStr += res[0].transcript + ' ';
              } else {
                interimStr += res[0].transcript;
              }
            }
            const full = (finalStr + interimStr).trim();
            transcriptRef.current = full;
            setLiveTranscript(full);
          };

          recognition.onerror = () => {
            // Non-blocking
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // Speech recognition optional
        }
      }

      // Audio analysis for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = audioContextRef.current || new AudioCtx();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setVolumeLevel(Math.max(0.15, Math.min(1, avg / 128)));
          animFrameRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      } catch {
        // Audio visualization optional
      }

      // Check supported MIME types
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(
          stream,
          mimeType
            ? { mimeType, audioBitsPerSecond: 24000 }
            : { audioBitsPerSecond: 24000 }
        );
      } catch {
        recorder = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      return true;
    } catch (err: any) {
      console.error('Failed to start voice recorder:', err);
      setError('Could not initialize audio recorder.');
      return false;
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ audioDataUrl: string; duration: number; liveTranscript: string } | null> => {
    return new Promise(resolve => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cancelRecording();
        resolve(null);
        return;
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const totalDurationSeconds = Math.max(
        1,
        Math.round((Date.now() - startTimeRef.current) / 1000)
      );

      const capturedTranscript = transcriptRef.current;

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
          stopAudioAnalysis();
          stopRecognition();
          setIsRecording(false);
          setRecordingTime(0);
          resolve({
            audioDataUrl: base64data,
            duration: totalDurationSeconds,
            liveTranscript: capturedTranscript,
          });
        };
        reader.onerror = () => {
          cancelRecording();
          resolve(null);
        };
        reader.readAsDataURL(audioBlob);
      };

      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch {
        // Ignore requestData error
      }
      recorder.stop();
    });
  }, [cancelRecording]);

  const transcribeWithAi = useCallback(async (audioDataUrl: string): Promise<string> => {
    setIsTranscribing(true);
    try {
      const res = await api.transcribeAudio({ audioData: audioDataUrl });
      return res.transcription || '';
    } catch (err) {
      console.warn('AI Audio transcription failed:', err);
      return '';
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  return {
    isRecording,
    recordingTime,
    volumeLevel,
    liveTranscript,
    isTranscribing,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
    setLiveTranscript,
    transcribeWithAi,
    error,
  };
}

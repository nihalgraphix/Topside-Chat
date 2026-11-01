import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Phone,
  MonitorUp,
  Lock,
  Volume2,
  VolumeX,
  Wifi,
  Radio,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { Call, User } from '../../types';
import { Avatar } from '../common/Avatar';
import { audioEffects } from '../../lib/audioEffects';

export interface IncomingCallSignal {
  id: number;
  seq?: number;
  fromUserId: string;
  callId?: string;
  signal: any;
}

interface CallOverlayProps {
  call: Call | null;
  currentUser: User;
  isIncoming: boolean;
  onAccept: (withVideo?: boolean) => void;
  onReject: () => void;
  onEnd: () => void;
  onSendSignal?: (toUserId: string, signal: any, callId?: string) => void;
  incomingSignals?: IncomingCallSignal[];
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

export const CallOverlay: React.FC<CallOverlayProps> = ({
  call,
  currentUser,
  isIncoming,
  onAccept,
  onReject,
  onEnd,
  onSendSignal,
  incomingSignals = [],
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [liveVolume, setLiveVolume] = useState<number>(0);
  const [remoteVolume, setRemoteVolume] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState('Ringing...');
  const [rtcState, setRtcState] = useState<'new' | 'connecting' | 'connected' | 'reconnecting'>('new');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteVideoOff, setRemoteVideoOff] = useState(false);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [swappedFeeds, setSwappedFeeds] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const syntheticCanvasIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const processedSignalIdsRef = useRef<Set<number>>(new Set());
  const isMakingOfferRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isOutgoing = Boolean(call && call.callerId === currentUser.id);
  const otherUser = isOutgoing ? call?.receiver : call?.caller;
  const otherUserId = isOutgoing ? call?.receiverId : call?.callerId;
  const isSyntheticDial = Boolean(otherUserId && String(otherUserId).startsWith('dial_'));
  const isRinging = Boolean(call && (call.status === 'ringing' || call.status === 'initiating'));

  // Sync initial call type when a new call starts
  useEffect(() => {
    if (!call) {
      setIsMuted(false);
      setIsVideoOff(false);
      setIsScreenSharing(false);
      setIsSpeakerMuted(false);
      setCallDuration(0);
      setRtcState('new');
      setHasRemoteVideo(false);
      setRemoteMuted(false);
      setRemoteVideoOff(false);
      setRemoteScreenSharing(false);
      setSwappedFeeds(false);
      processedSignalIdsRef.current.clear();
      pendingCandidatesRef.current = [];
      return;
    }
    const wantVideo = call.type === 'video';
    setIsVideoMode(wantVideo);
    setIsVideoOff(!wantVideo);
    setRemoteVideoOff(!wantVideo);
  }, [call?.id, call?.type]);

  // Helper to send WebRTC signal to the remote participant
  const sendSignalToPeer = useCallback(
    (signalPayload: any) => {
      if (!call || !otherUserId || isSyntheticDial) return;
      onSendSignal?.(
        otherUserId,
        {
          ...signalPayload,
          callId: call.id,
        },
        call.id
      );
    },
    [call, otherUserId, isSyntheticDial, onSendSignal]
  );

  // Create a fallback synthetic audio/video stream when hardware webcam/mic is busy or unavailable
  const createSyntheticFallbackStream = useCallback(
    (includeAudio: boolean, includeVideo: boolean): MediaStream => {
      const stream = new MediaStream();

      if (includeAudio) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          const dest = ctx.createMediaStreamDestination();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.0001; // near-silent keepalive tone for WebRTC RTP packets
          osc.connect(gain);
          gain.connect(dest);
          osc.start();
          dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        } catch {
          // ignore
        }
      }

      if (includeVideo) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d');
          let frame = 0;

          if (syntheticCanvasIntervalRef.current) {
            clearInterval(syntheticCanvasIntervalRef.current);
          }

          const drawFrame = () => {
            if (!ctx) return;
            frame++;
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle concentric pulse rings
            const radius = 58 + Math.sin(frame * 0.08) * 8;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2 - 14, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#18181b';
            ctx.beginPath();
            ctx.arc(canvas.width / 2, canvas.height / 2 - 14, 46, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.stroke();

            const initials = (currentUser.displayName || 'U')
              .split(' ')
              .map(p => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initials, canvas.width / 2, canvas.height / 2 - 14);

            ctx.fillStyle = '#e4e4e7';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(currentUser.displayName || 'User', canvas.width / 2, canvas.height / 2 + 58);

            ctx.fillStyle = '#a1a1aa';
            ctx.font = '12px monospace';
            ctx.fillText('LIVE WEBRTC STREAM', canvas.width / 2, canvas.height / 2 + 80);
          };

          drawFrame();
          syntheticCanvasIntervalRef.current = setInterval(drawFrame, 1000 / 24);
          const canvasStream = (canvas as any).captureStream?.(24) as MediaStream | undefined;
          if (canvasStream) {
            canvasStream.getVideoTracks().forEach(t => stream.addTrack(t));
          }
        } catch {
          // ignore
        }
      }

      return stream;
    },
    [currentUser.displayName]
  );

  // Acquire local camera/mic stream with automatic fallback if hardware is busy in another tab
  const acquireLocalStream = useCallback(
    async (wantVideo: boolean): Promise<MediaStream> => {
      if (localStreamRef.current) {
        const hasVid = localStreamRef.current.getVideoTracks().length > 0;
        if (!wantVideo || hasVid) {
          return localStreamRef.current;
        }
      }

      let stream: MediaStream | null = null;

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: wantVideo
              ? {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  facingMode: 'user',
                }
              : false,
          });
        } catch (err) {
          console.warn('Primary getUserMedia failed, trying audio-only fallback:', err);
          if (wantVideo) {
            try {
              const audioOnly = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              const syntheticVideo = createSyntheticFallbackStream(false, true);
              syntheticVideo.getVideoTracks().forEach(t => audioOnly.addTrack(t));
              stream = audioOnly;
            } catch {
              stream = null;
            }
          }
        }
      }

      if (!stream) {
        stream = createSyntheticFallbackStream(true, wantVideo);
      }

      // Apply current mute / video-off state
      stream.getAudioTracks().forEach(t => {
        t.enabled = !isMuted;
      });
      stream.getVideoTracks().forEach(t => {
        t.enabled = wantVideo && !isVideoOff;
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    },
    [createSyntheticFallbackStream, isMuted, isVideoOff]
  );

  // Attach streams to video/audio DOM elements whenever refs or modes change
  const syncMediaElements = useCallback(() => {
    const activeLocalStream = screenStreamRef.current || localStreamRef.current;
    const activeRemoteStream = remoteStreamRef.current;

    if (remoteAudioRef.current && activeRemoteStream) {
      if (remoteAudioRef.current.srcObject !== activeRemoteStream) {
        remoteAudioRef.current.srcObject = activeRemoteStream;
      }
      remoteAudioRef.current.muted = isSpeakerMuted;
      remoteAudioRef.current.play().catch(() => {});
    }

    if (swappedFeeds) {
      if (remoteVideoRef.current && activeLocalStream) {
        if (remoteVideoRef.current.srcObject !== activeLocalStream) {
          remoteVideoRef.current.srcObject = activeLocalStream;
        }
        remoteVideoRef.current.muted = true;
      }
      if (localVideoRef.current && activeRemoteStream) {
        if (localVideoRef.current.srcObject !== activeRemoteStream) {
          localVideoRef.current.srcObject = activeRemoteStream;
        }
        localVideoRef.current.muted = isSpeakerMuted;
      }
    } else {
      if (localVideoRef.current && activeLocalStream) {
        if (localVideoRef.current.srcObject !== activeLocalStream) {
          localVideoRef.current.srcObject = activeLocalStream;
        }
        localVideoRef.current.muted = true;
      }
      if (remoteVideoRef.current && activeRemoteStream) {
        if (remoteVideoRef.current.srcObject !== activeRemoteStream) {
          remoteVideoRef.current.srcObject = activeRemoteStream;
        }
        remoteVideoRef.current.muted = isSpeakerMuted;
        remoteVideoRef.current.play().catch(() => {});
      }
    }
  }, [isSpeakerMuted, swappedFeeds]);

  useEffect(() => {
    syncMediaElements();
  });

  // Start local camera preview immediately during ringing for video calls
  useEffect(() => {
    if (!call) return;
    if (isRinging && call.type === 'video') {
      acquireLocalStream(true).then(() => {
        syncMediaElements();
      });
    }
  }, [call?.id, isRinging, call?.type, acquireLocalStream, syncMediaElements]);

  // Handle Ringtones for ringing state
  useEffect(() => {
    if (!call) {
      audioEffects.stopRingtone();
      return;
    }

    if (isRinging) {
      if (isIncoming) {
        audioEffects.startIncomingRingtone();
        setStatusMessage('Incoming Call...');
      } else {
        audioEffects.startOutgoingRingtone();
        setStatusMessage('Ringing...');

        // Only auto-connect for synthetic dialpad numbers; real chat users accept manually
        if (isSyntheticDial) {
          const autoAnswerTimer = setTimeout(() => {
            audioEffects.stopRingtone();
            audioEffects.playCallConnected();
            onAccept(call.type === 'video');
          }, 2500);

          return () => {
            clearTimeout(autoAnswerTimer);
            audioEffects.stopRingtone();
          };
        } else {
          // 60-second unanswered timeout for real calls
          const missedTimer = setTimeout(() => {
            audioEffects.stopRingtone();
            audioEffects.playCallEnded();
            onEnd();
          }, 60000);

          return () => {
            clearTimeout(missedTimer);
            audioEffects.stopRingtone();
          };
        }
      }
    } else if (call.status === 'active') {
      audioEffects.stopRingtone();
    }

    return () => {
      audioEffects.stopRingtone();
    };
  }, [call?.id, call?.status, call?.type, isRinging, isIncoming, isSyntheticDial, onAccept, onEnd]);

  // Call duration timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (call && call.status === 'active') {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [call?.status]);

  // Flush queued ICE candidates once remoteDescription is set
  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription || !pc.remoteDescription.type) return;
    const queue = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error adding queued ICE candidate:', err);
      }
    }
  }, []);

  // Create and send SDP Offer
  const createAndSendOffer = useCallback(
    async (pc: RTCPeerConnection) => {
      if (isMakingOfferRef.current) return;
      try {
        isMakingOfferRef.current = true;
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sendSignalToPeer({
          type: 'offer',
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.warn('Failed to create/send WebRTC offer:', err);
      } finally {
        isMakingOfferRef.current = false;
      }
    },
    [sendSignalToPeer]
  );

  // Initialize WebRTC PeerConnection when call becomes active
  useEffect(() => {
    if (!call || call.status !== 'active') return;

    let isCancelled = false;

    const setupWebRTC = async () => {
      const wantVideo = call.type === 'video' || isVideoMode;
      const stream = await acquireLocalStream(wantVideo);
      if (isCancelled) return;

      // Setup Local & Remote Audio Visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        if (stream.getAudioTracks().length > 0) {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          const source = ctx.createMediaStreamSource(stream);
          source.connect(analyser);
        }

        const dataArray = new Uint8Array(32);
        const remoteDataArray = new Uint8Array(32);

        const updateVolume = () => {
          if (isCancelled) return;
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            setLiveVolume(Math.min(1, sum / (dataArray.length * 100)));
          }
          if (remoteAnalyserRef.current) {
            remoteAnalyserRef.current.getByteFrequencyData(remoteDataArray);
            let rSum = 0;
            for (let i = 0; i < remoteDataArray.length; i++) rSum += remoteDataArray[i];
            setRemoteVolume(Math.min(1, rSum / (remoteDataArray.length * 100)));
          }
          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      } catch {
        // ignore audio context errors
      }

      if (isSyntheticDial) {
        setRtcState('connected');
        return;
      }

      if (pcRef.current) {
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      setRtcState('connecting');

      // Add local media tracks to RTCPeerConnection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Listen for ICE candidates
      pc.onicecandidate = event => {
        if (event.candidate) {
          sendSignalToPeer({
            type: 'ice-candidate',
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          });
        }
      };

      // Listen for connection state transitions
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          setRtcState('connected');
        } else if (st === 'connecting') {
          setRtcState('connecting');
        } else if (st === 'disconnected' || st === 'failed') {
          setRtcState('reconnecting');
          if (isOutgoing) {
            createAndSendOffer(pc);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const ist = pc.iceConnectionState;
        if (ist === 'connected' || ist === 'completed') {
          setRtcState('connected');
        }
      };

      // Receive remote media tracks
      pc.ontrack = event => {
        let remoteStream = event.streams && event.streams[0];
        if (!remoteStream) {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(event.track);
          remoteStream = remoteStreamRef.current;
        } else {
          remoteStreamRef.current = remoteStream;
        }

        if (event.track.kind === 'video' || remoteStream.getVideoTracks().length > 0) {
          setHasRemoteVideo(true);
        }

        setRtcState('connected');
        syncMediaElements();

        // Hook remote audio into analyser for voice call visualizer
        try {
          if (audioContextRef.current && remoteStream.getAudioTracks().length > 0 && !remoteAnalyserRef.current) {
            const rAnalyser = audioContextRef.current.createAnalyser();
            rAnalyser.fftSize = 64;
            remoteAnalyserRef.current = rAnalyser;
            const rSource = audioContextRef.current.createMediaStreamSource(remoteStream);
            rSource.connect(rAnalyser);
          }
        } catch {
          // ignore
        }
      };

      // Broadcast initial media state to peer
      sendSignalToPeer({
        type: 'media-state',
        isMuted,
        isVideoOff: !wantVideo,
        isScreenSharing: false,
        isVideoCall: wantVideo,
      });

      if (isOutgoing) {
        // Caller sends initial offer
        await createAndSendOffer(pc);
      } else {
        // Callee announces readiness so caller sends/re-sends offer immediately
        sendSignalToPeer({
          type: 'ready',
        });
      }
    };

    setupWebRTC();

    return () => {
      isCancelled = true;
    };
  }, [call?.id, call?.status]);

  // Process incoming WebRTC signals (offer, answer, ice-candidate, ready, media-state)
  useEffect(() => {
    if (!call || call.status !== 'active' || incomingSignals.length === 0) return;
    const pc = pcRef.current;
    if (!pc) return;

    const handleSignals = async () => {
      for (const item of incomingSignals) {
        if (processedSignalIdsRef.current.has(item.id)) continue;
        if (item.callId && item.callId !== call.id && item.callId !== 'default') continue;
        processedSignalIdsRef.current.add(item.id);

        const sig = item.signal;
        if (!sig || !sig.type) continue;

        try {
          if (sig.type === 'ready') {
            // Receiver is ready for WebRTC handshake; caller sends offer
            if (isOutgoing) {
              await createAndSendOffer(pc);
            }
            sendSignalToPeer({
              type: 'media-state',
              isMuted,
              isVideoOff,
              isScreenSharing,
              isVideoCall: isVideoMode,
            });
          } else if (sig.type === 'offer' && sig.sdp) {
            const offerCollision = isMakingOfferRef.current || pc.signalingState !== 'stable';
            const polite = !isOutgoing;
            if (offerCollision && !polite) {
              continue;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
            await flushPendingIceCandidates(pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignalToPeer({
              type: 'answer',
              sdp: pc.localDescription,
            });
          } else if (sig.type === 'answer' && sig.sdp) {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
              await flushPendingIceCandidates(pc);
            }
          } else if (sig.type === 'ice-candidate' && sig.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
            } else {
              pendingCandidatesRef.current.push(sig.candidate);
            }
          } else if (sig.type === 'media-state') {
            if (typeof sig.isMuted === 'boolean') setRemoteMuted(sig.isMuted);
            if (typeof sig.isVideoOff === 'boolean') setRemoteVideoOff(sig.isVideoOff);
            if (typeof sig.isScreenSharing === 'boolean') setRemoteScreenSharing(sig.isScreenSharing);
            if (sig.isVideoCall) {
              setIsVideoMode(true);
            }
          }
        } catch (err) {
          console.warn('WebRTC signal handling warning:', err);
        }
      }
    };

    handleSignals();
  }, [
    incomingSignals,
    call?.id,
    call?.status,
    isOutgoing,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isVideoMode,
    createAndSendOffer,
    flushPendingIceCandidates,
    sendSignalToPeer,
  ]);

  // Clean up all streams and peer connections when CallOverlay unmounts or call becomes null
  useEffect(() => {
    if (call) return;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (syntheticCanvasIntervalRef.current) {
      clearInterval(syntheticCanvasIntervalRef.current);
      syntheticCanvasIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    remoteAnalyserRef.current = null;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    remoteStreamRef.current = null;
  }, [call]);

  // Mute / Unmute Microphone
  const toggleMute = () => {
    const nextMuted = !isMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !nextMuted;
      });
    }
    setIsMuted(nextMuted);
    sendSignalToPeer({
      type: 'media-state',
      isMuted: nextMuted,
      isVideoOff,
      isScreenSharing,
      isVideoCall: isVideoMode,
    });
  };

  // Toggle Camera On/Off (also supports upgrading a Voice call to Video mid-call!)
  const toggleVideo = async () => {
    const nextVideoOff = !isVideoOff;

    if (!nextVideoOff) {
      setIsVideoMode(true);
      // Ensure we have a video track
      let videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (!videoTrack) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          });
          videoTrack = camStream.getVideoTracks()[0];
        } catch {
          const fallback = createSyntheticFallbackStream(false, true);
          videoTrack = fallback.getVideoTracks()[0];
        }

        if (videoTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(videoTrack);
          if (pcRef.current) {
            const existingSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (existingSender) {
              await existingSender.replaceTrack(videoTrack);
            } else {
              pcRef.current.addTrack(videoTrack, localStreamRef.current);
              await createAndSendOffer(pcRef.current);
            }
          }
        }
      } else {
        videoTrack.enabled = true;
      }
    } else if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = false;
      });
    }

    setIsVideoOff(nextVideoOff);
    syncMediaElements();
    sendSignalToPeer({
      type: 'media-state',
      isMuted,
      isVideoOff: nextVideoOff,
      isScreenSharing,
      isVideoCall: !nextVideoOff || isVideoMode,
    });
  };

  // Screen Share with live WebRTC track replacement
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (pcRef.current && screenTrack) {
          const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(screenTrack);
          } else if (localStreamRef.current) {
            pcRef.current.addTrack(screenTrack, localStreamRef.current);
            await createAndSendOffer(pcRef.current);
          }
        }

        setIsVideoMode(true);
        setIsScreenSharing(true);
        syncMediaElements();
        sendSignalToPeer({
          type: 'media-state',
          isMuted,
          isVideoOff: false,
          isScreenSharing: true,
          isVideoCall: true,
        });

        screenTrack.onended = async () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          const camTrack = localStreamRef.current?.getVideoTracks()[0] || null;
          if (pcRef.current && camTrack) {
            const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(camTrack).catch(() => {});
            }
          }
          syncMediaElements();
          sendSignalToPeer({
            type: 'media-state',
            isMuted,
            isVideoOff,
            isScreenSharing: false,
            isVideoCall: isVideoMode,
          });
        };
      } catch (err) {
        console.warn('Screen sharing cancelled or failed:', err);
      }
    } else {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      const camTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      if (pcRef.current && camTrack) {
        const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(camTrack).catch(() => {});
        }
      }
      setIsScreenSharing(false);
      syncMediaElements();
      sendSignalToPeer({
        type: 'media-state',
        isMuted,
        isVideoOff,
        isScreenSharing: false,
        isVideoCall: isVideoMode,
      });
    }
  };

  const handleEndCall = () => {
    audioEffects.playCallEnded();
    onEnd();
  };

  const handleAcceptCall = async (withVideo?: boolean) => {
    audioEffects.playCallConnected();
    const shouldUseVideo = withVideo !== undefined ? withVideo : call?.type === 'video';
    setIsVideoMode(shouldUseVideo);
    setIsVideoOff(!shouldUseVideo);
    await acquireLocalStream(shouldUseVideo);
    onAccept(shouldUseVideo);
  };

  const handleRejectCall = () => {
    audioEffects.playCallEnded();
    onReject();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!call) return null;

  // 1. INCOMING CALL MODAL (shown when another chat user calls currentUser)
  if (isIncoming && isRinging) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in select-none">
        <div className="w-full max-w-sm rounded-3xl bg-[#0a0a0c] border border-white/25 p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
          {/* Local Camera Preview in background if Incoming Video Call */}
          {call.type === 'video' && !isVideoOff && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-20 scale-x-[-1] pointer-events-none"
            />
          )}

          {/* Pulsing Avatar */}
          <div className="relative mb-6 z-10">
            <div className="absolute inset-0 rounded-full bg-white/15 animate-ping scale-125" />
            <Avatar name={call.caller?.displayName || 'User'} src={call.caller?.avatarUrl} size="xl" />
          </div>

          <h3 className="text-xl font-bold text-white tracking-tight z-10">
            {call.caller?.displayName || 'Incoming Caller'}
          </h3>
          <p className="text-xs text-neutral-300 font-mono mt-1 z-10">
            Incoming {call.type === 'video' ? 'HD Video' : 'HD Voice'} Call...
          </p>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-[11px] text-neutral-300 mt-4 z-10">
            <Lock className="w-3 h-3 text-white" />
            <span>End-to-End Encrypted WebRTC</span>
          </div>

          <div className="flex items-center justify-center gap-5 mt-8 z-10">
            {/* Decline */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={handleRejectCall}
                className="w-14 h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition shadow-lg cursor-pointer active:scale-95"
                title="Decline Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-[10px] font-semibold text-neutral-400">Decline</span>
            </div>

            {/* If video call, allow answering as Voice Only */}
            {call.type === 'video' && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => handleAcceptCall(false)}
                  className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition cursor-pointer active:scale-95"
                  title="Accept as Voice Only"
                >
                  <Phone className="w-5 h-5" />
                </button>
                <span className="text-[10px] font-semibold text-neutral-400">Audio Only</span>
              </div>
            )}

            {/* Accept */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={() => handleAcceptCall(call.type === 'video')}
                className="w-14 h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition shadow-[0_0_25px_rgba(255,255,255,0.4)] animate-pulse cursor-pointer active:scale-95"
                title="Accept Call"
              >
                {call.type === 'video' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              </button>
              <span className="text-[10px] font-bold text-white">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. OUTGOING CALLING SCREEN (shown while waiting for other chat user to answer)
  if (!isIncoming && isRinging) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl text-white animate-in fade-in select-none">
        <div className="w-full max-w-md rounded-3xl bg-[#0a0a0c] border border-white/20 p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
          {/* Live Local Video Preview when making a Video Call */}
          {call.type === 'video' && !isVideoOff && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-25 scale-x-[-1] pointer-events-none"
            />
          )}

          {/* Radar Ring Animation */}
          <div className="relative mb-6 flex items-center justify-center z-10">
            <div className="absolute w-36 h-36 rounded-full border border-white/25 animate-ping duration-1000" />
            <div className="absolute w-28 h-28 rounded-full bg-white/5 animate-pulse" />
            <Avatar name={otherUser?.displayName || 'Contact'} src={otherUser?.avatarUrl} size="xl" />
          </div>

          <h3 className="text-xl font-bold text-white tracking-tight z-10">
            {otherUser?.displayName || 'Calling...'}
          </h3>
          <div className="text-xs text-neutral-300 font-mono mt-1 flex items-center gap-1.5 z-10">
            <Radio className="w-3.5 h-3.5 animate-pulse text-white" />
            <span>
              Calling {call.type === 'video' ? 'Video' : 'Voice'} • {statusMessage}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-[10px] text-neutral-400 mt-4 z-10">
            <Lock className="w-3 h-3 text-white" />
            <span>Waiting for {otherUser?.displayName || 'recipient'} to answer...</span>
          </div>

          {/* Pre-call Controls + Cancel Call */}
          <div className="mt-8 flex items-center justify-center gap-4 z-10">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
                isMuted
                  ? 'bg-white text-black'
                  : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
              }`}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {call.type === 'video' && (
              <button
                onClick={toggleVideo}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
                  isVideoOff
                    ? 'bg-white text-black'
                    : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                }`}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            <button
              onClick={handleEndCall}
              className="w-14 h-14 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition shadow-lg active:scale-95 cursor-pointer"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE CALL FULLSCREEN OVERLAY
  const showRemoteVideoFeed = isVideoMode && hasRemoteVideo && (!remoteVideoOff || remoteScreenSharing);
  const combinedVoiceLevel = Math.max(liveVolume, remoteVolume);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-white animate-in fade-in select-none">
      {/* Hidden Remote Audio Element (ensures remote voice stream plays in both Voice & Video calls) */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Header */}
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-white/15 bg-black/80 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Avatar name={otherUser?.displayName || 'User'} src={otherUser?.avatarUrl} size="sm" />
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>{otherUser?.displayName || 'Participant'}</span>
              {remoteMuted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-medium text-neutral-300">
                  <MicOff className="w-2.5 h-2.5" /> Muted
                </span>
              )}
              {remoteScreenSharing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-black text-[10px] font-bold">
                  <MonitorUp className="w-2.5 h-2.5" /> Sharing Screen
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-300 font-mono font-semibold flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  rtcState === 'connected' ? 'bg-white animate-pulse' : 'bg-neutral-400 animate-ping'
                }`}
              />
              <span>{formatTime(callDuration)}</span>
              <span className="text-neutral-500">•</span>
              <span className="text-[11px] text-neutral-400">
                {rtcState === 'connected' ? 'Connected P2P' : 'Establishing media stream...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-xs text-neutral-200">
            <Wifi className="w-3.5 h-3.5 text-white" />
            <span className="font-mono text-[11px]">
              {isVideoMode ? 'HD Video' : 'HD Voice'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-xs text-neutral-300">
            <Lock className="w-3.5 h-3.5 text-white" />
            <span>E2EE</span>
          </div>

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen?.().catch(() => {});
                setIsFullscreen(false);
              }
            }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-neutral-300 hover:text-white transition cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Video / Voice Stage */}
      <div className="flex-1 relative flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {isVideoMode ? (
          <div className="w-full h-full max-w-6xl rounded-3xl overflow-hidden bg-[#0e0e12] border border-white/15 relative flex items-center justify-center shadow-2xl">
            {/* Primary Video Element (Remote stream by default, or Local stream if swapped) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover ${
                swappedFeeds
                  ? !isVideoOff || isScreenSharing
                    ? 'block'
                    : 'hidden'
                  : showRemoteVideoFeed
                  ? 'block'
                  : 'hidden'
              } ${swappedFeeds && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
            />

            {/* Fallback Avatar Stage when remote camera is off or still connecting */}
            {((!swappedFeeds && !showRemoteVideoFeed) || (swappedFeeds && isVideoOff && !isScreenSharing)) && (
              <div className="flex flex-col items-center text-center p-6 z-10">
                <div className="relative mb-4">
                  <div
                    className="w-32 h-32 rounded-full bg-white/5 border border-white/25 flex items-center justify-center transition-all duration-150"
                    style={{
                      transform: `scale(${1 + combinedVoiceLevel * 0.2})`,
                    }}
                  >
                    <Avatar
                      name={swappedFeeds ? currentUser.displayName : otherUser?.displayName || 'User'}
                      src={swappedFeeds ? currentUser.avatarUrl : otherUser?.avatarUrl}
                      size="xl"
                    />
                  </div>
                </div>
                <div className="text-lg font-bold text-white">
                  {swappedFeeds ? currentUser.displayName : otherUser?.displayName}
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-1 flex items-center gap-1.5">
                  {remoteVideoOff && !swappedFeeds ? (
                    <>
                      <VideoOff className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Camera is off • Voice active</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5 animate-pulse text-white" />
                      <span>
                        {rtcState === 'connected' ? 'Live WebRTC Stream Connected' : 'Connecting peer video stream...'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Picture-in-Picture (PiP) Corner Video — click to swap main & PiP views */}
            <div
              onClick={() => setSwappedFeeds(prev => !prev)}
              title="Click to swap main and Picture-in-Picture video"
              className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 w-40 sm:w-60 h-28 sm:h-40 rounded-2xl overflow-hidden border-2 border-white/30 hover:border-white shadow-2xl bg-[#070709] cursor-pointer group z-20 transition-transform hover:scale-[1.02]"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  swappedFeeds
                    ? showRemoteVideoFeed
                      ? 'block'
                      : 'hidden'
                    : !isVideoOff || isScreenSharing
                    ? 'block'
                    : 'hidden'
                } ${!swappedFeeds && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
              />

              {/* If PiP feed has camera off */}
              {((!swappedFeeds && isVideoOff && !isScreenSharing) || (swappedFeeds && !showRemoteVideoFeed)) && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#121216] text-xs text-neutral-400">
                  <VideoOff className="w-5 h-5 mb-1 opacity-60" />
                  <span>{swappedFeeds ? otherUser?.displayName || 'Peer' : 'Your Camera Off'}</span>
                </div>
              )}

              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-semibold text-white bg-black/65 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10">
                <span className="truncate">
                  {swappedFeeds ? otherUser?.displayName || 'Participant' : `You (${currentUser.displayName})`}
                </span>
                <RefreshCw className="w-3 h-3 opacity-70 group-hover:opacity-100 shrink-0 ml-1" />
              </div>
            </div>
          </div>
        ) : (
          /* Voice Call Stage */
          <div className="flex flex-col items-center text-center max-w-md">
            <div className="relative mb-6">
              <div
                className="w-36 h-36 rounded-full bg-white/5 border border-white/30 flex items-center justify-center transition-all duration-150"
                style={{
                  transform: `scale(${1 + combinedVoiceLevel * 0.25})`,
                  boxShadow: `0 0 ${20 + combinedVoiceLevel * 45}px rgba(255, 255, 255, 0.25)`,
                }}
              >
                <Avatar name={otherUser?.displayName || 'User'} src={otherUser?.avatarUrl} size="xl" />
              </div>
            </div>

            <h2 className="text-2xl font-black text-white tracking-tight mb-1">{otherUser?.displayName}</h2>
            <div className="text-xs text-neutral-300 font-mono mb-8 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse text-white" />
              <span>
                {rtcState === 'connected' ? 'Crystal HD Voice Call Connected' : 'Connecting Peer-to-Peer Audio...'}
              </span>
            </div>

            {/* Live Audio Equalizer reactively driven by both participants' voices */}
            <div className="flex items-center gap-1.5 h-12 mb-4">
              {[25, 60, 90, 45, 80, 100, 70, 50, 95, 40, 85, 60, 90, 30].map((h, i) => {
                const dynamicHeight = Math.max(15, h * (0.28 + combinedVoiceLevel * 0.92));
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-white transition-all duration-75"
                    style={{ height: `${dynamicHeight}%` }}
                  />
                );
              })}
            </div>
            <div className="text-[11px] text-neutral-400 font-mono">
              {remoteMuted
                ? `${otherUser?.displayName || 'Peer'} is muted`
                : combinedVoiceLevel > 0.04
                ? 'Live voice audio transmitting'
                : 'Listening for audio...'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="h-24 px-6 flex items-center justify-center gap-3 sm:gap-4 bg-black/90 border-t border-white/15 shrink-0 z-20">
        {/* Mute / Unmute Microphone */}
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
            isMuted
              ? 'bg-white text-black font-bold shadow-lg'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera On / Off (Available in both Video Calls and Voice Calls to switch to video!) */}
        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
            !isVideoOff && isVideoMode
              ? 'bg-white text-black font-bold shadow-lg'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
          }`}
          title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Share Screen */}
        <button
          onClick={toggleScreenShare}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
            isScreenSharing
              ? 'bg-white text-black font-bold shadow-lg'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
          }`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          <MonitorUp className="w-5 h-5" />
        </button>

        {/* Speaker Volume Toggle */}
        <button
          onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition cursor-pointer active:scale-95 ${
            isSpeakerMuted
              ? 'bg-white text-black font-bold shadow-lg'
              : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
          }`}
          title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
        >
          {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* End Call Button */}
        <button
          onClick={handleEndCall}
          className="w-16 h-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition shadow-[0_0_25px_rgba(225,29,72,0.5)] active:scale-95 cursor-pointer"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

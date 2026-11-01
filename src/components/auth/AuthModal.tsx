import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Lock, Mail, User, Sparkles, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider, syncUserToCloudDirectory } from '../../lib/firebase';
import { api } from '../../lib/api';
import { User as UserType } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  canClose?: boolean;
  onClose: () => void;
  onSuccess: (user: UserType) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  canClose = true,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Google Sign-In custom prompt state
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleNameInput, setGoogleNameInput] = useState('');

  if (!isOpen) return null;

  const syncUserToFirestore = async (user: UserType) => {
    await syncUserToCloudDirectory(user);
  };

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const cleanId = identifier.trim();
        const res = await api.login(cleanId, password);

        // Non-blocking background sync with Firebase
        void (async () => {
          try {
            if (cleanId.includes('@')) {
              await signInWithEmailAndPassword(auth, cleanId, password).catch(() => {});
            }
            await syncUserToFirestore(res.user);
          } catch {
            // Ignore background Firebase sync errors
          }
        })();

        onSuccess(res.user);
        onClose();
      } else if (mode === 'register') {
        const cleanEmail = email.trim().toLowerCase();
        const cleanUsername =
          username.trim() || cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
        const cleanName = displayName.trim() || cleanUsername;

        const res = await api.register({
          username: cleanUsername,
          displayName: cleanName,
          email: cleanEmail,
          password,
          phone: phone.trim() || undefined,
        });

        // Non-blocking background sync with Firebase
        void (async () => {
          try {
            await createUserWithEmailAndPassword(auth, cleanEmail, password).catch(() => {});
            await syncUserToFirestore(res.user);
          } catch {
            // Ignore background Firebase sync errors
          }
        })();

        onSuccess(res.user);
        onClose();
      } else if (mode === 'forgot') {
        const targetEmail = (email || identifier).trim();
        if (!targetEmail) {
          throw new Error('Please provide your registered email address.');
        }
        void sendPasswordResetEmail(auth, targetEmail).catch(() => {});
        await api.forgotPassword(targetEmail);
        setSuccessMsg(`Password reset instructions have been dispatched to ${targetEmail}.`);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (userEmail: string, userName?: string, avatarUrl?: string) => {
    const cleanEmail = userEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your Google email address.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const resolvedName =
        (userName || '').trim() ||
        cleanEmail
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
      const res = await api.googleLogin({
        email: cleanEmail,
        displayName: resolvedName,
        avatarUrl,
      });
      void syncUserToFirestore(res.user);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
      setShowGooglePrompt(false);
    }
  };

  const handleGooglePopupOrFallback = async () => {
    setError(null);

    // If user already entered a Google email in the prompt or login/register field, use it if popup fails
    const candidateEmail =
      googleEmailInput.trim() ||
      (identifier.includes('@') ? identifier.trim() : '') ||
      (email.includes('@') ? email.trim() : '');

    // If Firebase Auth already has an active Google user, sign in immediately
    if (auth.currentUser?.email) {
      await handleGoogleSignIn(
        auth.currentUser.email,
        auth.currentUser.displayName || googleNameInput,
        auth.currentUser.photoURL || undefined
      );
      return;
    }

    setIsLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const gUser = cred.user;
      const gEmail = gUser.email || candidateEmail;
      if (gEmail) {
        await handleGoogleSignIn(
          gEmail,
          gUser.displayName || googleNameInput,
          gUser.photoURL || undefined
        );
        return;
      }
    } catch {
      // Popup was blocked by iframe/browser or closed
    }

    setIsLoading(false);
    if (candidateEmail) {
      await handleGoogleSignIn(candidateEmail, googleNameInput || displayName);
    } else {
      setShowGooglePrompt(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md rounded-3xl bg-[#0a0a0a] border border-white/20 p-7 sm:p-8 shadow-2xl relative overflow-hidden my-auto text-white"
      >
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-white text-black flex items-center justify-center shadow">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {mode === 'login' ? 'Sign In to Aether' : mode === 'register' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className="text-xs text-neutral-400">
              {mode === 'login'
                ? 'Sign in with Google or Email & Password'
                : mode === 'register'
                ? 'Encrypted real-time monochrome workspace'
                : 'Enter your email for recovery instructions'}
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/30 text-white text-xs leading-relaxed flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success notification */}
        {successMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-white text-black font-medium text-xs leading-relaxed flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Primary Google Sign-In Action */}
        <div className="space-y-2.5 mb-5">
          <button
            type="button"
            onClick={handleGooglePopupOrFallback}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2.5 transition shadow cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#000000"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="truncate">Continue with Google</span>
          </button>

          <div className="flex items-center justify-end text-[11px] text-neutral-400 px-1">
            <button
              type="button"
              onClick={() => setShowGooglePrompt(!showGooglePrompt)}
              className="text-white underline hover:text-neutral-300 cursor-pointer"
            >
              {showGooglePrompt ? 'Hide Google email input' : 'Enter Google email directly'}
            </button>
          </div>

          {showGooglePrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3.5 rounded-xl bg-[#141414] border border-white/20 space-y-2.5"
            >
              <p className="text-[11px] text-neutral-300">
                Enter your Google email below to sign in directly:
              </p>
              <div>
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">Google Email</label>
                <input
                  type="email"
                  autoFocus
                  value={googleEmailInput}
                  onChange={e => setGoogleEmailInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && googleEmailInput.trim()) {
                      e.preventDefault();
                      handleGoogleSignIn(googleEmailInput, googleNameInput);
                    }
                  }}
                  placeholder="your.email@gmail.com"
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-300 mb-1">Display Name (optional)</label>
                <input
                  type="text"
                  value={googleNameInput}
                  onChange={e => setGoogleNameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && googleEmailInput.trim()) {
                      e.preventDefault();
                      handleGoogleSignIn(googleEmailInput, googleNameInput);
                    }
                  }}
                  placeholder="Your Name"
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                />
              </div>
              <button
                type="button"
                onClick={() => handleGoogleSignIn(googleEmailInput, googleNameInput)}
                disabled={isLoading || !googleEmailInput.trim()}
                className="w-full py-2 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                Sign In with Google Account
              </button>
            </motion.div>
          )}
        </div>

        {/* Divider */}
        <div className="relative flex py-2 items-center mb-5">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase tracking-widest text-neutral-500 font-mono">
            or mail & password
          </span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        {/* Mode Switcher Tabs */}
        {mode !== 'forgot' && (
          <div className="flex p-1 bg-[#141414] rounded-xl border border-white/10 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                mode === 'login' ? 'bg-white text-black shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                mode === 'register' ? 'bg-white text-black shadow' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
          {mode === 'login' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email or Username</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="user@example.com or username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-neutral-300">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Full Name / Display Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={e => {
                      setDisplayName(e.target.value);
                      if (!username) {
                        setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_').slice(0, 20));
                      }
                    }}
                    placeholder="e.g. Nihal Graphix"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@mail.com"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="nihal_g"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter a password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Registered Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-400">
                We will send a password recovery verification link to this address.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl font-bold text-xs bg-white text-black hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Recovery Email'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Mode Footer Switching */}
        <div className="mt-5 text-center text-xs text-neutral-400">
          {mode === 'login' && (
            <>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="text-white font-bold hover:underline cursor-pointer"
              >
                Sign up free
              </button>
            </>
          )}

          {mode === 'register' && (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-white font-bold hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className="text-white font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

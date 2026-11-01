import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Sparkles, Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../../lib/firebase';
import { api } from '../../lib/api';
import { User } from '../../types';

interface SignUpPageProps {
  onSuccess: (user: User) => void;
}

export const SignUpPage: React.FC<SignUpPageProps> = ({ onSuccess }) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Google Sign-In helper state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');

  const syncUserToFirestore = async (user: User) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl || '',
          bio: user.bio || '',
          onlineStatus: 'online',
          createdAt: user.createdAt || new Date().toISOString(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, 'users', uid, 'private', 'info'),
        {
          uid,
          email: user.email,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      } catch {
        // Non-blocking sync
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (authMode === 'login') {
        const cleanId = email.trim();
        if (!cleanId || !password) {
          throw new Error('Please enter your email/username and password.');
        }

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

        setSuccessMsg(`Welcome back, ${res.user.displayName}!`);
        onSuccess(res.user);
      } else if (authMode === 'register') {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
          throw new Error('Please enter your email address and password.');
        }

        const res = await api.register({
          firstName: firstName.trim() || cleanEmail.split('@')[0],
          lastName: lastName.trim(),
          email: cleanEmail,
          password,
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

        setSuccessMsg(`Account created! Welcome, ${res.user.displayName}.`);
        onSuccess(res.user);
      } else if (authMode === 'forgot') {
        if (!email.trim()) {
          throw new Error('Please enter your registered email address.');
        }
        void sendPasswordResetEmail(auth, email.trim()).catch(() => {});
        const res = await api.forgotPassword(email.trim());
        setSuccessMsg(res.message || `Password recovery link sent to ${email.trim()}.`);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogleAccount = async (targetEmail: string, targetName?: string, avatarUrl?: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your Google email address.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const resolvedName =
        (targetName || '').trim() ||
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
      setShowGoogleModal(false);
      setSuccessMsg(`Signed in with Google as ${res.user.email}`);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirebaseGooglePopup = async () => {
    setError(null);
    setSuccessMsg(null);

    const candidateEmail =
      googleEmail.trim() || (email.includes('@') ? email.trim() : '');

    if (auth.currentUser?.email) {
      await signInWithGoogleAccount(
        auth.currentUser.email,
        auth.currentUser.displayName || googleName,
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
        await signInWithGoogleAccount(
          gEmail,
          gUser.displayName || googleName,
          gUser.photoURL || undefined
        );
        return;
      }
    } catch {
      // In restricted preview iframes where browser blocks third-party popups, fall back to direct Google email sign-in
    }

    setIsLoading(false);
    if (candidateEmail) {
      await signInWithGoogleAccount(
        candidateEmail,
        googleName || [firstName, lastName].filter(Boolean).join(' ')
      );
    } else {
      setShowGoogleModal(true);
    }
  };

  const handleGoogleAccountConfirm = async () => {
    await signInWithGoogleAccount(googleEmail, googleName);
  };

  return (
    <div className="min-h-screen w-full bg-[#000000] flex items-center justify-center p-3 sm:p-6 lg:p-10 font-sans text-white selection:bg-white selection:text-black relative overflow-hidden">
      {/* Subtle Monochrome Architectural Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-5xl rounded-[28px] overflow-hidden border border-white/15 bg-[#080808] shadow-[0_25px_80px_rgba(0,0,0,0.9)] grid grid-cols-1 lg:grid-cols-12 min-h-[640px] relative z-10">
        
        {/* LEFT PANEL: High-Contrast Monochrome Architectural Showcase */}
        <div className="lg:col-span-6 relative overflow-hidden bg-gradient-to-br from-[#141414] via-[#0a0a0a] to-[#000000] p-7 sm:p-10 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/15">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/[0.05] rounded-full blur-3xl pointer-events-none" />

          {/* Brand Header */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold shadow">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold tracking-widest text-white uppercase block">AETHER</span>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Monochrome Edition</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md border border-white/15 bg-white/5 text-[10px] font-mono text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-white" /> E2E Encrypted
            </span>
          </div>

          {/* Center Editorial Typography */}
          <div className="relative z-10 my-10 lg:my-12">
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-400 mb-3">
              Pure Signal • Zero Noise
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-white tracking-tight leading-[1.12] mb-4">
              {authMode === 'login'
                ? 'Welcome back to Aether.'
                : authMode === 'register'
                ? 'Create your Aether identity.'
                : 'Recover your account access.'}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md leading-relaxed">
              Sign in instantly with Google OAuth or your Email & Password credentials. Real-time messaging, voice notes, polls, and encrypted cloud sync.
            </p>
          </div>

          {/* Bottom 3 Step Cards */}
          <div className="relative z-10 grid grid-cols-3 gap-2.5 sm:gap-3.5">
            <div
              onClick={() => setAuthMode('login')}
              className={`rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px] transition cursor-pointer border ${
                authMode === 'login'
                  ? 'bg-white text-black border-white shadow-xl'
                  : 'bg-white/[0.04] text-white border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  authMode === 'login' ? 'bg-black text-white' : 'bg-white/15 text-white'
                }`}
              >
                1
              </div>
              <p className="text-[11px] sm:text-xs font-bold leading-tight">
                Sign In with Google or Mail
              </p>
            </div>

            <div
              onClick={() => setAuthMode('register')}
              className={`rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[96px] transition cursor-pointer border ${
                authMode === 'register'
                  ? 'bg-white text-black border-white shadow-xl'
                  : 'bg-white/[0.04] text-white border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  authMode === 'register' ? 'bg-black text-white' : 'bg-white/15 text-white'
                }`}
              >
                2
              </div>
              <p className="text-[11px] sm:text-xs font-bold leading-tight">
                Register New Account
              </p>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 sm:p-4 text-white flex flex-col justify-between min-h-[96px]">
              <div className="w-6 h-6 rounded-full bg-white/15 text-white flex items-center justify-center text-xs font-medium">
                3
              </div>
              <p className="text-[11px] sm:text-xs font-medium text-neutral-300 leading-tight">
                Start Real-Time Chat
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Auth Form */}
        <div className="lg:col-span-6 bg-[#050505] p-7 sm:p-10 flex flex-col justify-center relative">
          <div className="w-full max-w-sm mx-auto">
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#111111] rounded-xl border border-white/10 mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Header */}
            <div className="mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {authMode === 'login'
                  ? 'Sign In to Your Account'
                  : authMode === 'register'
                  ? 'Create Your Account'
                  : 'Reset Your Password'}
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                {authMode === 'login'
                  ? 'Use Google Auth or enter your email and password.'
                  : authMode === 'register'
                  ? 'Complete your details below or continue with Google.'
                  : 'Enter your registered email to receive a reset link.'}
              </p>
            </div>

            {/* Google Sign-In Primary Button */}
            {authMode !== 'forgot' && (
              <div className="space-y-2 mb-5">
                <button
                  type="button"
                  id="btn-google-auth"
                  onClick={handleFirebaseGooglePopup}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2.5 transition cursor-pointer shadow"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#000000"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17zM12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24zM5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15zM12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  Continue with Google
                </button>
                <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                  <span>Supports Firebase & Instant Google Auth</span>
                  <button
                    type="button"
                    onClick={() => setShowGoogleModal(true)}
                    className="text-white underline hover:text-neutral-300 cursor-pointer"
                  >
                    Choose Google email
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            {authMode !== 'forgot' && (
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <span className="relative bg-[#050505] px-3 text-[10px] uppercase tracking-widest text-neutral-500 font-mono">
                  Or with Mail & Password
                </span>
              </div>
            )}

            {/* Notifications */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/30 text-white text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-white" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-white text-black font-medium text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-black" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Email & Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {authMode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-neutral-300 block mb-1">
                      First Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        id="input-first-name"
                        required
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-[#111111] border border-white/15 text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-white transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-neutral-300 block mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="input-last-name"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#111111] border border-white/15 text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-white transition"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="text-[11px] font-medium text-neutral-300 block mb-1">
                  {authMode === 'login' ? 'Email or Username' : 'Email Address'}
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={authMode === 'login' ? 'text' : 'email'}
                    id="input-email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={authMode === 'login' ? 'you@example.com or username' : 'you@example.com'}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#111111] border border-white/15 text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-white transition"
                  />
                </div>
              </div>

              {/* Password */}
              {authMode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-neutral-300">
                      Password
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('forgot');
                          setError(null);
                          setSuccessMsg(null);
                        }}
                        className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="input-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#111111] border border-white/15 text-white text-xs placeholder-neutral-600 focus:outline-none focus:border-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition cursor-pointer p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {authMode === 'register' && (
                    <p className="text-[10px] text-neutral-500 mt-1">
                      Minimum 6 characters required.
                    </p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-submit-auth"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs tracking-wide shadow-lg transition cursor-pointer mt-2 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <>
                    <span>
                      {authMode === 'login'
                        ? 'Sign In with Email'
                        : authMode === 'register'
                        ? 'Create Account'
                        : 'Send Password Reset Link'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {authMode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full py-2 text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  Back to Sign In
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Google Sign-In Account Selector Modal */}
      <AnimatePresence>
        {showGoogleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/20 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold shadow">
                  G
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Continue with Google</h3>
                  <p className="text-xs text-neutral-400">Enter or confirm your Google account</p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-neutral-300 font-medium block mb-1">Google Email</label>
                  <input
                    type="email"
                    autoFocus
                    value={googleEmail}
                    onChange={e => setGoogleEmail(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && googleEmail.trim()) {
                        e.preventDefault();
                        handleGoogleAccountConfirm();
                      }
                    }}
                    placeholder="yourname@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-white text-xs focus:outline-none focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-300 font-medium block mb-1">Display Name (optional)</label>
                  <input
                    type="text"
                    value={googleName}
                    onChange={e => setGoogleName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && googleEmail.trim()) {
                        e.preventDefault();
                        handleGoogleAccountConfirm();
                      }
                    }}
                    placeholder="Your Full Name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/15 text-white text-xs focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGoogleAccountConfirm}
                  disabled={isLoading || !googleEmail.trim()}
                  className="px-5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer flex items-center gap-2"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sign In with Google
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

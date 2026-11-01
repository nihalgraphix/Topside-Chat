import React from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-2xl',
};

const dotSize = {
  xs: 'w-2 h-2 ring-1',
  sm: 'w-2.5 h-2.5 ring-1.5',
  md: 'w-3 h-3 ring-2',
  lg: 'w-3.5 h-3.5 ring-2',
  xl: 'w-4 h-4 ring-3',
};

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', isOnline, className = '' }) => {
  const initials = (name || 'User')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  return (
    <div className={`relative shrink-0 select-none ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-2xl overflow-hidden flex items-center justify-center font-semibold shadow-md border border-white/15 ${
          src ? 'bg-[#121212] text-white' : 'bg-white text-black'
        }`}
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            onError={e => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {isOnline !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-black transition-colors ${dotSize[size]} ${
            isOnline ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-neutral-600'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};

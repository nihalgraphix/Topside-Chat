import React from 'react';

interface BackgroundAuroraProps {
  theme: 'dark' | 'light';
  accent: string;
}

export const BackgroundAurora: React.FC<BackgroundAuroraProps> = ({ theme }) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`fixed inset-0 -z-10 overflow-hidden transition-colors duration-500 ${
        isDark ? 'bg-[#000000]' : 'bg-[#ffffff]'
      }`}
    >
      {/* Subtle Monochrome Radial Luminance */}
      <div
        className={`absolute -top-[20%] -left-[10%] w-[55vw] h-[55vw] rounded-full blur-[150px] pointer-events-none ${
          isDark ? 'bg-white/[0.04]' : 'bg-black/[0.03]'
        }`}
      />
      <div
        className={`absolute top-[25%] -right-[15%] w-[45vw] h-[45vw] rounded-full blur-[140px] pointer-events-none ${
          isDark ? 'bg-white/[0.03]' : 'bg-black/[0.025]'
        }`}
      />

      {/* Precision Monochrome Architectural Grid */}
      <div
        className={`absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px] ${
          isDark ? 'opacity-40' : 'opacity-60'
        }`}
      />
    </div>
  );
};

import React from 'react';

interface PlacaMercosulProps {
  placa: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PlacaMercosul({ placa, size = 'md', className = '' }: PlacaMercosulProps) {
  const cleanPlaca = (placa || '').toUpperCase().replace(/[- ]/g, '').trim();

  // Dimensions & text sizing based on size
  let containerClasses = '';
  let headerClasses = '';
  let textClasses = '';
  let flagSizeClasses = '';
  let logoClasses = '';

  if (size === 'sm') {
    containerClasses = 'w-[80px] h-[26px] border-1.5 border-slate-800 rounded shadow-xs';
    headerClasses = 'h-[7px] text-[5px] px-0.5 border-b border-slate-800';
    textClasses = 'text-[9.5px]';
    flagSizeClasses = 'w-2 h-1 border border-white/5';
    logoClasses = 'text-[4px]';
  } else if (size === 'lg') {
    containerClasses = 'w-[140px] h-[48px] border-2.5 border-slate-900 rounded-lg shadow-md';
    headerClasses = 'h-[14px] text-[10px] px-1.5 border-b-2 border-slate-900';
    textClasses = 'text-[18px]';
    flagSizeClasses = 'w-4 h-2.5 border border-white/10';
    logoClasses = 'text-[9px]';
  } else {
    // 'md' is default
    containerClasses = 'w-[105px] h-[34px] border-2 border-slate-800 rounded-md shadow-xs';
    headerClasses = 'h-[10px] text-[7px] px-1 border-b border-slate-800';
    textClasses = 'text-[12.5px]';
    flagSizeClasses = 'w-3 h-2 border border-white/10';
    logoClasses = 'text-[6px]';
  }

  // Format plate nicely (e.g. AAA 1A11 or ABC1D23 or old ABC-1234 but Mercosul style)
  // Standard Mercosul: 3 letters, 1 number, 1 letter, 2 numbers (e.g. ABC1D23)
  // Let's format it for better reading if it fits
  let formattedPlaca = cleanPlaca;
  if (cleanPlaca.length === 7) {
    // Format: AAA1A11 -> AAA1A11 (or with subtle spacer if lg/md)
    formattedPlaca = cleanPlaca;
  }

  return (
    <span 
      className={`inline-flex flex-col items-center justify-center bg-white overflow-hidden font-mono font-black select-all shrink-0 ${containerClasses} ${className}`}
      style={{ boxSizing: 'border-box' }}
    >
      {/* Top Blue Header Band */}
      <span 
        className={`w-full bg-[#003399] text-white flex items-center justify-between font-sans font-bold uppercase leading-none select-none shrink-0 ${headerClasses}`}
      >
        <span className="flex items-center gap-0.5">
          <span className={`text-blue-200 ${logoClasses}`}>⛬</span>
          <span className="opacity-90">MERCOSUL</span>
        </span>
        
        <span className="font-extrabold tracking-widest text-white">
          BRASIL
        </span>
        
        {/* Tiny Brazil Flag */}
        <span className="flex items-center">
          <span className={`bg-emerald-600 relative overflow-hidden flex items-center justify-center ${flagSizeClasses}`}>
            <span className="absolute w-[120%] h-[120%] bg-yellow-400 rotate-45 flex items-center justify-center">
              <span className="absolute w-[45%] h-[45%] rounded-full bg-blue-800"></span>
            </span>
          </span>
        </span>
      </span>

      {/* Main plate body containing the code */}
      <span className={`flex-1 flex items-center justify-center text-slate-900 tracking-widest leading-none font-black ${textClasses}`}>
        {formattedPlaca}
      </span>
    </span>
  );
}

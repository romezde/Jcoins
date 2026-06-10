import React from "react";

export default function JCoinLogo({ size = 32, className = "" }) {
  return <svg
    className={`jcoin-logo ${className}`.trim()}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    role="img"
    aria-label="JCoin"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="jcoin-face" x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FEF08A" />
        <stop offset=".43" stopColor="#FACC15" />
        <stop offset="1" stopColor="#F97316" />
      </linearGradient>
      <linearGradient id="jcoin-rim" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFF7AD" />
        <stop offset=".48" stopColor="#F59E0B" />
        <stop offset="1" stopColor="#92400E" />
      </linearGradient>
      <filter id="jcoin-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity=".28" />
      </filter>
    </defs>
    <circle cx="32" cy="32" r="27" fill="url(#jcoin-rim)" filter="url(#jcoin-shadow)" />
    <circle cx="32" cy="32" r="21.5" fill="url(#jcoin-face)" stroke="#FFF7AD" strokeWidth="2" />
    <path d="M21 18c5-5 16-7 24-1" fill="none" stroke="#FFF7AD" strokeWidth="4" strokeLinecap="round" opacity=".75" />
    <path d="M38 19v21c0 8-5 12-13 12-5 0-9-2-12-5l6-7c2 2 4 3 6 3 3 0 5-2 5-6V19h8Z" fill="#7C2D12" opacity=".32" />
    <path d="M36 17v21c0 8-5 12-13 12-5 0-9-2-12-5l6-7c2 2 4 3 6 3 3 0 5-2 5-6V17h8Z" fill="#111827" />
    <path d="M36 17v21c0 8-5 12-13 12-5 0-9-2-12-5l6-7c2 2 4 3 6 3 3 0 5-2 5-6V17h8Z" fill="#FFFFFF" opacity=".14" />
    <path d="M49 24l2.2 4.6 4.8.8-3.5 3.5.8 5-4.3-2.4-4.3 2.4.8-5-3.5-3.5 4.8-.8L49 24Z" fill="#FFF7AD" opacity=".85" />
  </svg>;
}

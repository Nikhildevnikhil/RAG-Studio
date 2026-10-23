import React from "react";

interface RagLogoProps {
  className?: string;
  size?: number;
}

export const RagLogo: React.FC<RagLogoProps> = ({ className = "", size = 36 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="RAG Studio Logo"
    >
      <defs>
        {/* Dynamic Multi-Stop Gradient: Cyan (Vector) -> Sapphire (Retrieval) -> Indigo (LLM) */}
        <linearGradient id="ragBgGrad" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>

        {/* Core Radiance Gradient */}
        <linearGradient id="coreGlowGrad" x1="10" y1="8" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>

        {/* Ambient Drop Shadow for Precision Hardware Depth */}
        <filter id="ragShadow" x="-15%" y="-15%" width="130%" height="130%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#082f49" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Hardware Enclosure with Inner Bevel & Outer Gradient */}
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        fill="url(#ragBgGrad)"
        className="transition-all"
      />
      <rect
        x="1.75"
        y="1.75"
        width="36.5"
        height="36.5"
        rx="9.25"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="1.2"
      />

      {/* Semantic Graphic: 3-Tier Layered Retrieval Stack + Piercing Vector Beam + Generative Star */}
      <g filter="url(#ragShadow)">
        {/* Foundation Layer 1: Document Corpus & Raw Tokens */}
        <path
          d="M11 29L20 33L29 29L20 25.5L11 29Z"
          fill="rgba(255, 255, 255, 0.3)"
        />

        {/* Middle Layer 2: Vector Embeddings & Similarity Indexing */}
        <path
          d="M11 23L20 27L29 23L20 19.5L11 23Z"
          fill="rgba(255, 255, 255, 0.6)"
        />

        {/* Top Layer 3: Augmented Synthesis Plane */}
        <path
          d="M11 17L20 21L29 17L20 13.5L11 17Z"
          fill="url(#coreGlowGrad)"
        />

        {/* Vertical Retrieval-to-Generation Synthesis Beam */}
        <path
          d="M20 7.5V26"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Intelligence Star / Generative Apex (The 'G' in RAG) */}
        <path
          d="M20 4.5L21.2 7.2L24 8.2L21.2 9.2L20 12L18.8 9.2L16 8.2L18.8 7.2L20 4.5Z"
          fill="#ffffff"
        />
        <circle cx="20" cy="8.2" r="1.2" fill="#0284c7" />
      </g>
    </svg>
  );
};

export default RagLogo;

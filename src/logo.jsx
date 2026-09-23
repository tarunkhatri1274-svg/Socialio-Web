import React from "react";

const Logo = () => {
  const center = 100;
  const bigR = 38;
  const smallR = 6;
  const nodes = 7;

  const orbitR = bigR + smallR;

  const circles = [];

  for (let i = 0; i < nodes; i++) {
    const angle = (-90 + (i * 360) / nodes) * (Math.PI / 180);

    const x = center + orbitR * Math.cos(angle);
    const y = center + orbitR * Math.sin(angle);

    circles.push(
      <circle
        key={i}
        cx={x}
        cy={y}
        r={smallR}
        fill="#e3b07a"
        stroke="black"
        strokeWidth="1.5"
      />
    );
  }

  return (
    <svg width="160" height="160" viewBox="0 0 200 200">
      
      <g className="rotate-group">
        <circle
          cx={center}
          cy={center}
          r={bigR}
          fill="#e3b07a"
          stroke="black"
          strokeWidth="1.5"
        />
        {circles}
      </g>

      <text
        x={center}
        y={center + 12}
        textAnchor="middle"
        fontSize="42"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
        fill="black"
      >
        S
      </text>

      <style>
        {`
          .rotate-group {
            transform-origin: 100px 100px;
            animation: spin 6s linear infinite;
          }

          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

    </svg>
  );
};

export default Logo;
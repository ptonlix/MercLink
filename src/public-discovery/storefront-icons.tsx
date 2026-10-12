import type { ReactNode } from "react";

export function DetailIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}

export function SkillIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14M6 9h3m-3 4h3m6-4h3m-3 4h3" />
    </svg>
  );
}

export function ChengduMark(): ReactNode {
  return (
    <svg
      className="chengduMark"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="成都大熊猫标识"
    >
      <rect width="64" height="64" rx="16" fill="#9ee8e0" />
      <g fill="#0c1218">
        <circle cx="17" cy="17" r="9" />
        <circle cx="47" cy="17" r="9" />
      </g>
      <ellipse cx="32" cy="35" rx="23" ry="22" fill="#edf4f7" />
      <g fill="#0c1218">
        <ellipse cx="23" cy="34" rx="7" ry="9" transform="rotate(25 23 34)" />
        <ellipse cx="41" cy="34" rx="7" ry="9" transform="rotate(-25 41 34)" />
        <path d="M28 44Q32 41 36 44Q36 48 32 49Q28 48 28 44Z" />
      </g>
      <g fill="#edf4f7">
        <circle cx="25" cy="32" r="2.6" />
        <circle cx="39" cy="32" r="2.6" />
      </g>
      <path
        d="M32 48v3m-6-1c2 4 10 4 12 0"
        stroke="#0c1218"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Panda(): ReactNode {
  return (
    <svg viewBox="0 0 80 60" className="pandaDrawing" aria-hidden="true">
      <g className="pandaFeet" fill="#172731">
        <ellipse cx="21" cy="47" rx="9" ry="7" />
        <ellipse cx="48" cy="48" rx="8" ry="7" />
      </g>
      <ellipse cx="32" cy="35" rx="24" ry="17" fill="#edf4f7" />
      <ellipse cx="37" cy="35" rx="9" ry="17" fill="#172731" />
      <circle cx="48" cy="16" r="8" fill="#172731" />
      <circle cx="68" cy="20" r="7" fill="#172731" />
      <ellipse cx="58" cy="31" rx="19" ry="17" fill="#edf4f7" />
      <ellipse cx="51" cy="30" rx="5" ry="7" transform="rotate(25 51 30)" fill="#172731" />
      <ellipse cx="66" cy="32" rx="5" ry="7" transform="rotate(-20 66 32)" fill="#172731" />
      <circle cx="53" cy="29" r="1.8" fill="#edf4f7" />
      <circle cx="67" cy="31" r="1.8" fill="#edf4f7" />
      <path d="m57 38 6 1-3 4Z" fill="#172731" />
      <circle cx="12" cy="30" r="5" fill="#edf4f7" />
    </svg>
  );
}

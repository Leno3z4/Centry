'use client';

export default function CentryCoin({ label, mark }) {
  return (
    <div className="centry-coin">
      <div className="centry-coin-edge" />
      <div className="centry-coin-face centry-coin-face-front">
        <span>{mark}</span>
        <small>{label}</small>
      </div>
      <div className="centry-coin-face centry-coin-face-back">
        <span>{mark}</span>
      </div>
    </div>
  );
}

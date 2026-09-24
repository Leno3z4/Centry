'use client';

import dynamic from 'next/dynamic';
import LandingHome from '../components/LandingHome';

const AeroShards = dynamic(() => import('../components/AeroShards'), { ssr: false, loading: () => null });

export default function Page() {
  return (
    <main className="landing-aero-shell">
      <div className="landing-aero-background" aria-hidden="true">
        <AeroShards
          backgroundColor="#050505"
          shardColor="#d7d9dc"
          accentColor="#ffffff"
          placement="right"
          flow="stream"
          material="chrome"
          detail="fine"
          effect="none"
          scale={1}
          spread={1.15}
          depth={1.15}
          speed={0.18}
          spin={0.18}
          interaction="repel"
          density={1.25}
          shardSize={0.78}
          stretch={1.2}
          turbulence={0.28}
          glow={0.42}
          edgeSoftness={1.5}
          bloom={0.12}
          grain={0.012}
          chromaticAberration={0.001}
          transitionDuration={0.9}
          interactionRadius={1.5}
          interactionStrength={0.18}
          rippleIntensity={0.18}
          holdToGather={false}
        />
      </div>
      <LandingHome />
      <style jsx global>{`
        .landing-aero-shell {
          position: relative;
          min-height: 100vh;
          isolation: isolate;
          overflow: hidden;
          background: #050505;
        }
        .landing-aero-background {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          opacity: .48;
          mix-blend-mode: screen;
        }
        .landing-aero-background > * { width: 100%; height: 100%; }
        .landing-aero-shell > .landing-home { position: relative; z-index: 1; background: transparent !important; }
      `}</style>
    </main>
  );
}

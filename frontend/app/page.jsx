'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import LandingHome from '../components/LandingHome';

const AeroShards = dynamic(() => import('../components/AeroShards'), {
    ssr: false,
    loading: () => null,
});

export default function Page() {
    return (
        <main className="landing-aero-shell">
            <div className="landing-aero-background" aria-hidden="true">
                <AeroShards
                    backgroundColor="#080808"
                    shardColor="#73787d"
                    accentColor="#0a84ff"
                    placement="full"
                    flow="stream"
                    material="pearl"
                    detail="balanced"
                    effect="none"
                    scale={1}
                    spread={1}
                    depth={1}
                    speed={0.7}
                    spin={0.8}
                    interaction="repel"
                    density={1.05}
                    shardSize={1.05}
                    stretch={1}
                    turbulence={0.75}
                    glow={0.7}
                    edgeSoftness={2}
                    bloom={0.25}
                    grain={0.035}
                    chromaticAberration={0.004}
                    transitionDuration={1}
                    interactionRadius={1.5}
                    interactionStrength={0.35}
                    rippleIntensity={0.65}
                    holdToGather={true}
                />
            </div>
            <LandingHome />
            <style jsx global>{`
                .landing-aero-shell {
                    position: relative;
                    min-height: 100vh;
                    isolation: isolate;
                    background: #080808;
                    overflow: hidden;
                }

                .landing-aero-background {
                    position: fixed;
                    inset: 0;
                    z-index: 0;
                    height: 100vh;
                    opacity: .12;
                    pointer-events: none;
                    overflow: hidden;
                    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 30%, rgba(0,0,0,.72) 52%, transparent 82%);
                    mask-image: linear-gradient(to bottom, #000 0%, #000 30%, rgba(0,0,0,.72) 52%, transparent 82%);
                }

                .landing-aero-background > * {
                    width: 100%;
                    height: 100%;
                }

                .landing-aero-shell > .landing-home {
                    position: relative;
                    z-index: 1;
                    background: transparent !important;
                }
            `}</style>
        </main>
    );
}

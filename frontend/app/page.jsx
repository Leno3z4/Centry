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
                    backgroundColor="#120F17"
                    shardColor="#896ABD"
                    accentColor="#A855F7"
                    placement="full"
                    flow="stream"
                    material="pearl"
                    detail="balanced"
                    effect="none"
                    scale={1}
                    spread={1}
                    depth={1}
                    speed={1}
                    spin={1}
                    interaction="repel"
                    density={1.5}
                    shardSize={1.1}
                    stretch={1}
                    turbulence={1}
                    glow={1}
                    edgeSoftness={2}
                    bloom={0.5}
                    grain={0.05}
                    chromaticAberration={0.0075}
                    transitionDuration={1}
                    interactionRadius={1.5}
                    interactionStrength={0.5}
                    rippleIntensity={1}
                    holdToGather={true}
                />
            </div>
            <LandingHome />
            <style jsx global>{`
                .landing-aero-shell {
                    position: relative;
                    min-height: 100vh;
                    isolation: isolate;
                    background: #120F17;
                    overflow: hidden;
                }

                .landing-aero-background {
                    position: fixed;
                    inset: 0;
                    z-index: 0;
                    height: 100vh;
                    opacity: .14;
                    pointer-events: none;
                    overflow: hidden;
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

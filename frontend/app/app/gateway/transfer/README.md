# Gateway transfer test route

This route exercises Circle Gateway unified-balance transfers independently from the existing `/app/gateway` Phase 1 page.

Flow: available Gateway balance → fee estimate → EIP-712 burn-intent signature → Gateway attestation → destination `gatewayMint`.

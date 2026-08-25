// The first Centry Arc deployment deliberately does not expose a separate vault contract.
// Keep this hook as a compatibility shim so older components fail closed instead of
// calling stale contract addresses.
export function useSelfRepayingVault() {
  return {
    configured: false,
    vaultData: null,
    isPending: false,
    isConfirming: false,
    isConfirmed: false,
    error: null,
    refetchAll: async () => {},
  };
}

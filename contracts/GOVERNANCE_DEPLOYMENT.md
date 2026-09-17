# Centry governance deployment

Centry governance uses the OpenZeppelin 5.4 Governor + TimelockController pattern.

## Deployment order

1. Deploy `CentryTimelockController` with:
   - the intended minimum delay;
   - the deployer/bootstrap admin as the temporary admin;
   - the bootstrap admin as a temporary proposer;
   - an executor (or `address(0)` if public execution is desired after the delay).
2. Deploy `CentryGovernor`, passing the deployed veCENT address and timelock address.
3. Grant `PROPOSER_ROLE` and `CANCELLER_ROLE` on the timelock to `CentryGovernor`.
4. Grant `EXECUTOR_ROLE` to the chosen executor(s), or `address(0)` for open execution.
5. Revoke the temporary bootstrap proposer's proposer/canceller roles.
6. Renounce the temporary bootstrap admin role. The timelock retains its self-admin role so future role changes require a timelocked governance operation.
7. Transfer ownership of governance-controlled `Ownable2Step` contracts to the timelock, using each contract's two-step ownership flow.
8. Verify that no personal EOA remains as a privileged owner/admin for production-controlled contracts unless intentionally retained as an emergency/bootstrap role.

## Governance behavior

- Voting clock: timestamp.
- Voting delay: 1 day.
- Voting period: 3 days.
- Quorum: 4% of historical veCENT voting power at the proposal snapshot.
- Proposal threshold: 0 for initial bootstrap.
- Execution: successful proposals are queued and executed through the timelock.

veCENT exposes historical voting power directly through `IVotes`. Voting power is based on the existing linear lock decay and does not require iterating over every NFT during a governance vote. Historical checkpoints use timestamp-indexed binary search.

## Important security boundary

The Governor is the proposer of timelocked protocol actions. The Timelock must own/administer the contracts that governance is intended to control. Do not leave an additional trusted proposer/canceller on the timelock in production unless that role is explicitly part of the security model; OpenZeppelin warns that additional proposer/canceller roles can block or execute governance-controlled operations.

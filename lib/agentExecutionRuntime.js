import { Contract, Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import {
  ACTIONS,
  ARC_MAINNET_CHAIN_ID,
  LENDING_POOL,
  ORACLE,
  SUPPORTED_ASSETS,
  actionCatalog,
  buildAction,
  parseUint,
  resolveAsset,
} from "./agentExecutionCatalog";

export const ACCOUNT_ABI = [
  "function active() view returns (bool)",
  "function agentOperators(address) view returns (bool)",
  "function canExecute(address operator,address target,bytes4 selector,uint256 value) view returns (bool)",
  "function execute(address target,uint256 value,bytes data) returns (bytes)",
  "function executeBatch(address[] targets,uint256[] values,bytes[] data) returns (bytes[])",
];

export const ACCOUNT_INTERFACE = new Interface([
  "function execute(address target,uint256 value,bytes data)",
  "function executeBatch(address[] targets,uint256[] values,bytes[] data)",
]);

export function assertAddress(value, field) {
  if (!isAddress(value)) throw new Error(`invalid_${field}`);
  return getAddress(value);
}

export function createAccountContract(rpcUrl, account) {
  return new Contract(getAddress(account), ACCOUNT_ABI, new JsonRpcProvider(rpcUrl));
}

export async function assertLiveOperator({ rpcUrl, account, operator }) {
  if (!rpcUrl) throw new Error("agent_rpc_not_configured");
  const normalizedAccount = assertAddress(account, "account");
  const normalizedOperator = assertAddress(operator, "operator");
  const contract = createAccountContract(rpcUrl, normalizedAccount);
  const [authorized, active] = await Promise.all([
    contract.agentOperators(normalizedOperator),
    contract.active(),
  ]);
  if (!active) throw new Error("agent_inactive");
  if (!authorized) throw new Error("operator_not_authorized");
  return { account: normalizedAccount, operator: normalizedOperator };
}

export async function checkActionPermissions({ rpcUrl, account, operator, calls }) {
  if (!Array.isArray(calls) || calls.length === 0 || calls.length > 32) throw new Error("invalid_call_batch");
  await assertLiveOperator({ rpcUrl, account, operator });
  const contract = createAccountContract(rpcUrl, account);
  const checked = [];
  for (const current of calls) {
    const permitted = await contract.canExecute(operator, current.target, current.selector, current.value);
    if (!permitted) {
      return {
        permitted: false,
        denied: current,
        calls: checked,
      };
    }
    checked.push(current);
  }
  return { permitted: true, calls: checked };
}

export {
  ACTIONS,
  ARC_MAINNET_CHAIN_ID,
  LENDING_POOL,
  ORACLE,
  SUPPORTED_ASSETS,
  actionCatalog,
  buildAction,
  parseUint,
  resolveAsset,
};

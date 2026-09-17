import { Contract, Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { ACTIONS, ARC_TESTNET_CHAIN_ID, LENDING_POOL, SUPPORTED_ASSETS, actionCatalog, buildAction, parseUint, resolveAsset } from "./agentExecutionCatalog";

export const ACCOUNT_ABI = [
  "function agentOperators(address) view returns (bool)",
  "function canExecute(address operator,address target,bytes4 selector,uint256 value) view returns (bool)",
  "function execute(address target,uint256 value,bytes data) returns (bytes)",
];

export const ACCOUNT_INTERFACE = new Interface([
  "function execute(address target,uint256 value,bytes data)",
]);

export function assertAddress(value, field) {
  if (!isAddress(value)) throw new Error(`invalid_${field}`);
  return getAddress(value);
}

export function createAccountContract(rpcUrl, account) {
  return new Contract(getAddress(account), ACCOUNT_ABI, new JsonRpcProvider(rpcUrl));
}

export {
  ACTIONS,
  ARC_TESTNET_CHAIN_ID,
  LENDING_POOL,
  SUPPORTED_ASSETS,
  actionCatalog,
  buildAction,
  parseUint,
  resolveAsset,
};

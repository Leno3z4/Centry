import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";

const ACCOUNT_FACTORY_ABI = ["function factory() view returns (address)"];
const FACTORY_REGISTRY_ABI = ["function isCentryAgentAccount(address account) view returns (bool)"];

function configuredGenesisFactory() {
  const value = String(process.env.CENTRY_AGENT_FACTORY || "").trim();
  if (!isAddress(value)) throw new Error("agent_genesis_factory_not_configured");
  return getAddress(value);
}

export async function verifyGenesisAccount(account, { rpcUrl, expectedFactory, role = "target" } = {}) {
  const provider = new JsonRpcProvider(rpcUrl || "https://rpc.mainnet.arc.io");
  const expected = getAddress(expectedFactory || configuredGenesisFactory());
  const normalizedAccount = getAddress(account);
  const accountContract = new Contract(normalizedAccount, ACCOUNT_FACTORY_ABI, provider);
  const accountFactory = getAddress(await accountContract.factory());

  if (accountFactory.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(role === "source"
      ? "source_not_created_by_genesis_factory"
      : "external_genesis_agent_prohibited");
  }

  const factory = new Contract(expected, FACTORY_REGISTRY_ABI, provider);
  const registered = await factory.isCentryAgentAccount(normalizedAccount);
  if (!registered) {
    throw new Error(role === "source"
      ? "source_not_registered_by_genesis_factory"
      : "target_not_created_by_genesis_factory");
  }

  return { account: normalizedAccount, factory: expected };
}

export async function verifyAgentGenesisPair(sourceAccount, targetAccount, { rpcUrl } = {}) {
  const expected = configuredGenesisFactory();
  const source = await verifyGenesisAccount(sourceAccount, { rpcUrl, expectedFactory: expected, role: "source" });
  const target = await verifyGenesisAccount(targetAccount, { rpcUrl, expectedFactory: expected, role: "target" });
  return { factory: expected, source, target };
}

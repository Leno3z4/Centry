import { Providers } from '../components/Providers';
import { WalletConnect } from '../components/WalletConnect';
import { VaultCard } from '../components/VaultCard';
import { LendingCard } from '../components/LendingCard';
import { GovernanceCard } from '../components/GovernanceCard';
import MainDashboard from './MainDashboard';

export default function App() {
  return (
    <Providers>
      <MainDashboard
        WalletConnect={WalletConnect}
        VaultCard={VaultCard}
        LendingCard={LendingCard}
        GovernanceCard={GovernanceCard}
      />
    </Providers>
  );
}

import { Desk } from './components/Desk';
import { GameProvider } from './state/GameProvider';
import { SettingsProvider } from './state/SettingsProvider';

export default function App() {
  return (
    <SettingsProvider>
      <GameProvider>
        <Desk />
      </GameProvider>
    </SettingsProvider>
  );
}

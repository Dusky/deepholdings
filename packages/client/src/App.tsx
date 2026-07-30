import { Desk } from './components/Desk';
import { ServerProvider } from './state/ServerProvider';
import { SettingsProvider } from './state/SettingsProvider';

export default function App() {
  return (
    <SettingsProvider>
      <ServerProvider>
        <Desk />
      </ServerProvider>
    </SettingsProvider>
  );
}

import { Desk } from './components/Desk';
import { ScreenProvider } from './state/ScreenProvider';
import { ServerProvider } from './state/ServerProvider';
import { SettingsProvider } from './state/SettingsProvider';

export default function App() {
  return (
    <SettingsProvider>
      <ServerProvider>
        <ScreenProvider>
          <Desk />
        </ScreenProvider>
      </ServerProvider>
    </SettingsProvider>
  );
}

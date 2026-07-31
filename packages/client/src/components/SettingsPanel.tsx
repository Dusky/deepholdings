import { useEffect, useRef } from 'react';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  useSettings,
} from '../state/settingsContext';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  onClose: () => void;
}

/** Quality floor: every effect in the stack has an off switch (spec §7). */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.panel} ref={panelRef} role="group" aria-label="Quality floor">
      <div className={styles.title}>QUALITY FLOOR</div>

      <div className={styles.row}>
        <span className={styles.label}>Effects</span>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={settings.effectsOn}
          onClick={settings.toggleEffects}
        >
          {settings.effectsOn ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Reduced motion</span>
        {/* Pressed state tracks "motion allowed", matching the other rows'
            lit-means-on reading. */}
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={!settings.reducedMotion}
          onClick={settings.toggleReducedMotion}
        >
          {settings.reducedMotion ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>High contrast</span>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={settings.highContrast}
          onClick={settings.toggleHighContrast}
        >
          {settings.highContrast ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Notifications</span>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={settings.notifications.enabled}
          onClick={settings.toggleNotifications}
        >
          {settings.notifications.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {settings.notifications.enabled && (
        <>
          <div className={styles.row}>
            <span className={`${styles.label} ${styles.sub}`}>Permit approved</span>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={settings.notifications.permitReady}
              onClick={() => settings.toggleNotificationKind('permitReady')}
            >
              {settings.notifications.permitReady ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className={styles.row}>
            <span className={`${styles.label} ${styles.sub}`}>Shift report</span>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={settings.notifications.shiftReady}
              onClick={() => settings.toggleNotificationKind('shiftReady')}
            >
              {settings.notifications.shiftReady ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className={`${styles.label} ${styles.quiet}`}>
            Quiet {settings.notifications.quietFrom}:00–{settings.notifications.quietTo}:00.
            Deliveries wait.
          </div>
        </>
      )}

      <div className={styles.row}>
        <span className={styles.label}>Font size</span>
        <div className={styles.stepRow}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={settings.decreaseFont}
            disabled={settings.fontScale <= FONT_SCALE_MIN}
            aria-label="Decrease font size"
          >
            A-
          </button>
          <button
            type="button"
            className={styles.stepButton}
            onClick={settings.increaseFont}
            disabled={settings.fontScale >= FONT_SCALE_MAX}
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>
      </div>
    </div>
  );
}

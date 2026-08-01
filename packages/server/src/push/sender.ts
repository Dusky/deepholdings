import type { Config } from '../config.js';
import { FcmSender, parseServiceAccount } from './fcm.js';
import { NullSender, type PushSender } from './port.js';

/**
 * Builds the push transport the configuration asks for.
 *
 * A server without credentials gets `NullSender` and says so once, at boot,
 * rather than failing at the first death — hours later, on a schedule nobody
 * is watching. A server with *bad* credentials fails immediately, because a
 * typo in a private key should not present as "push is quietly off".
 */
export function makeSender(
  config: Config,
  log: { info(msg: string): void; warn(msg: string): void },
): PushSender {
  if (!config.fcmServiceAccount) {
    log.warn(
      'FCM_SERVICE_ACCOUNT not set — deaths will be resolved and recorded as usual, ' +
        'but nothing will be pushed.',
    );
    return new NullSender();
  }

  const account = parseServiceAccount(config.fcmServiceAccount);
  log.info(`FCM configured for project ${account.project_id}`);
  return new FcmSender(account);
}

/**
 * The BIOS crawl is the one piece of content the client still owns: it plays
 * before the first API call returns, so it cannot come from the server.
 *
 * Everything else — journal copy, market, bulletin, tavern — is served.
 */
export const BOOT_LINES: readonly string[] = [
  'SUBTERRANEAN RESOURCE AUTHORITY — TERMINAL BIOS v2.3',
  'MEMORY CHECK ......... 640K OK',
  'DRIVE 0 ............... READY',
  'DRIVE 1 ............... READY',
  'LOADING CASE MANAGEMENT SYSTEM...',
  '',
  'This terminal is the property of the Subterranean Resource Authority.',
  'Unauthorized descent is a Class B filing violation.',
  '',
  'LOGIN: CASE OFFICER 04417',
  'PASSWORD: ****************',
  'ACCESS GRANTED. WELCOME BACK.',
];

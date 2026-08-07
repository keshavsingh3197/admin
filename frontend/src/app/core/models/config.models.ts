/**
 * The runtime-config shapes and the key list now live in `@keshavsingh3197/web-config`, shared with the
 * blog and the portfolio so the three cannot drift. Re-exported here because a lot of this app imports
 * them from `core/models/config.models`, and that is a reasonable place to keep looking.
 *
 * `PublicConfig` is kept as an alias for the older name used across this app's components.
 */
export { CONFIG_KEYS } from '@keshavsingh3197/web-config';
export type { ConfigKey, PublicLocale, RuntimeConfig } from '@keshavsingh3197/web-config';

import type { RuntimeConfig } from '@keshavsingh3197/web-config';

/** @deprecated Prefer `RuntimeConfig`. Kept so existing imports keep compiling. */
export type PublicConfig = RuntimeConfig;

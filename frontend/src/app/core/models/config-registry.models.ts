/** Mirrors Admin.Api ConfigRegistryDtos. */

export type ConfigValueType = 'string' | 'number' | 'bool' | 'json' | 'url' | 'icon' | 'color';
export type ConfigScope = 'public' | 'authenticated' | 'internal';

/**
 * One runtime-configurable value. `value` is null for secret entries — the API never returns a
 * stored secret, only `isSet`. Sending a non-empty value replaces it; sending nothing keeps it.
 */
export interface ConfigEntryView {
  key: string;
  group: string;
  valueType: ConfigValueType;
  value: string | null;
  defaultValue: string;
  scope: ConfigScope;
  isSecret: boolean;
  isSet: boolean;
  localized: boolean;
  description: string;
  /** Built-in entries can be edited but not deleted: other apps rely on the key existing. */
  isSystem: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface UpsertConfigEntryRequest {
  key: string;
  group?: string;
  valueType?: ConfigValueType;
  value?: string;
  defaultValue?: string;
  scope?: ConfigScope;
  isSecret?: boolean;
  localized?: boolean;
  description?: string;
}

export interface ConfigImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** The allow-lists the API enforces, so the UI's dropdowns aren't a second hard-coded copy. */
export interface ConfigMeta {
  valueTypes: ConfigValueType[];
  scopes: ConfigScope[];
  allowedHosts: string[];
  version: string;
}

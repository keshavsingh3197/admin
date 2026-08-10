export type PackageStatus = 'current' | 'publish-required' | 'upgrade-required';

export interface PackageConsumer {
  project: string;
  requestedVersion: string;
  isCurrent: boolean;
}

export interface PackageInventoryItem {
  ecosystem: 'nuget' | 'npm';
  name: string;
  sourceVersion: string;
  publishedVersion: string | null;
  repository: string;
  status: PackageStatus;
  consumers: PackageConsumer[];
}

export interface PackageInventory {
  generatedAtUtc: string;
  workspaceAvailable: boolean;
  packages: PackageInventoryItem[];
}
/** Mirrors the KeshavSingh.Mongo.NoSql console types the API returns. */

export interface DbConsoleCapabilities {
  canWrite: boolean;
  defaultLimit: number;
  maxLimit: number;
  database: string;
}

export interface MongoCollectionSummary {
  name: string;
  estimatedCount: number;
}

export interface DatabaseCollectionUsage { name: string; documents: number; dataBytes: number; storageBytes: number; indexBytes: number; }
export interface DatabaseUsage { database: string; dataBytes: number; storageBytes: number; indexBytes: number; capacityBytes: number | null; remainingBytes: number | null; usedPercent: number | null; collections: DatabaseCollectionUsage[]; }

/**
 * Documents arrive as extended-JSON strings, not objects: BSON has types (ObjectId, dates, decimals)
 * that would be flattened into plain strings by an ordinary JSON round trip, and an editor has to show
 * a document as it actually is.
 */
export interface MongoConsolePage {
  collection: string;
  operation: string;
  documents: string[];
  returned: number;
  limit: number;
  skip: number;
  elapsedMilliseconds: number;
  redacted: boolean;
  hasMore: boolean;
}

export interface MongoConsoleWriteResult {
  collection: string;
  operation: string;
  matched: number;
  modified: number;
  deleted: number;
  insertedId: string | null;
}

export interface DbFindRequest {
  collection: string;
  filter?: string | null;
  projection?: string | null;
  sort?: string | null;
  skip?: number | null;
  limit?: number | null;
}

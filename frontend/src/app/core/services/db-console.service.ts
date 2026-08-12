import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DbConsoleCapabilities, DbFindRequest, MongoCollectionSummary, MongoConsolePage, MongoConsoleWriteResult, DatabaseUsage, DatabaseBackup,
} from '../models/db-console.models';

/**
 * The Admin-only database console API. Every query is validated and bounded server-side (see the
 * KeshavSingh.Mongo.NoSql console guard) — nothing here decides what is safe to run.
 */
@Injectable({ providedIn: 'root' })
export class DbConsoleService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/db-console`;

  capabilities(): Observable<DbConsoleCapabilities> {
    return this.http.get<DbConsoleCapabilities>(`${this.baseUrl}/capabilities`);
  }

  collections(): Observable<MongoCollectionSummary[]> {
    return this.http.get<MongoCollectionSummary[]>(`${this.baseUrl}/collections`);
  }

  usage(): Observable<DatabaseUsage> { return this.http.get<DatabaseUsage>(`${this.baseUrl}/usage`); }
  backups(): Observable<DatabaseBackup[]> { return this.http.get<DatabaseBackup[]>(`${this.baseUrl}/backups`); }
  createBackup(): Observable<DatabaseBackup> { return this.http.post<DatabaseBackup>(`${this.baseUrl}/backups`, {}); }

  indexes(collection: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/collections/${encodeURIComponent(collection)}/indexes`);
  }

  find(request: DbFindRequest): Observable<MongoConsolePage> {
    return this.http.post<MongoConsolePage>(`${this.baseUrl}/find`, request);
  }

  count(collection: string, filter: string | null): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/count`, { collection, filter });
  }

  aggregate(collection: string, pipeline: string, limit: number | null): Observable<MongoConsolePage> {
    return this.http.post<MongoConsolePage>(`${this.baseUrl}/aggregate`, { collection, pipeline, limit });
  }

  distinct(collection: string, field: string, filter: string | null): Observable<string[]> {
    return this.http.post<string[]>(`${this.baseUrl}/distinct`, { collection, field, filter });
  }

  insertOne(collection: string, document: string): Observable<MongoConsoleWriteResult> {
    return this.http.post<MongoConsoleWriteResult>(`${this.baseUrl}/insert-one`, { collection, document });
  }

  updateOne(collection: string, id: string, update: string): Observable<MongoConsoleWriteResult> {
    return this.http.post<MongoConsoleWriteResult>(`${this.baseUrl}/update-one`, { collection, id, update });
  }

  deleteOne(collection: string, id: string): Observable<MongoConsoleWriteResult> {
    return this.http.post<MongoConsoleWriteResult>(`${this.baseUrl}/delete-one`, { collection, id });
  }
}

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PackageInventory } from '../models/package-inventory.models';

@Injectable({ providedIn: 'root' })
export class PackageInventoryService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(refresh = false): Observable<PackageInventory> {
    const params = new HttpParams().set('refresh', refresh);
    return this.http.get<PackageInventory>(`${this.baseUrl}/packages`, { params });
  }

  /** Every repo the configured GitHub token can see — the candidates for the Settings picker. */
  repositories(query = ''): Observable<string[]> {
    const params = new HttpParams().set('query', query);
    return this.http.get<string[]>(`${this.baseUrl}/packages/repositories`, { params });
  }
}
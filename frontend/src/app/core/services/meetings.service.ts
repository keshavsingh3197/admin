import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Meeting, MeetingJoin, SaveMeeting } from '../models/meeting.models';

/**
 * Scheduled meetings. Joining one hands off to CallService — a meeting is only a plan, the call it opens
 * is a normal peer-to-peer room. Reminders arrive over the chat hub (see ChatService.meetingReminder).
 */
@Injectable({ providedIn: 'root' })
export class MeetingsService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(includePast = false): Observable<Meeting[]> {
    return this.http.get<Meeting[]>(`${this.base}/meetings?includePast=${includePast}`);
  }

  get(id: string): Observable<Meeting> {
    return this.http.get<Meeting>(`${this.base}/meetings/${id}`);
  }

  create(meeting: SaveMeeting): Observable<Meeting> {
    return this.http.post<Meeting>(`${this.base}/meetings`, meeting);
  }

  update(id: string, meeting: SaveMeeting): Observable<Meeting> {
    return this.http.put<Meeting>(`${this.base}/meetings/${id}`, meeting);
  }

  /** Adds people without rewriting the meeting — the details panel's "add participant". */
  addInvitees(id: string, inviteeUserIds: string[]): Observable<Meeting> {
    return this.http.post<Meeting>(`${this.base}/meetings/${id}/invitees`, { inviteeUserIds });
  }

  cancel(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/meetings/${id}/cancel`, {});
  }

  /** Removes it outright. Cancelling is usually kinder — invitees keep an explanation. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/meetings/${id}`);
  }

  /** The shareable link that opens this meeting's details (and its Join button) in admin. */
  linkFor(id: string): string {
    return `${location.origin}/meetings?meeting=${encodeURIComponent(id)}`;
  }

  /** Opens (or joins) the meeting's room. CallService.joinMeeting drives this for the call UI. */
  join(id: string): Observable<MeetingJoin> {
    return this.http.post<MeetingJoin>(`${this.base}/meetings/${id}/join`, {});
  }
}

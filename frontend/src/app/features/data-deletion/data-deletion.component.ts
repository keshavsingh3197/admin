import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-data-deletion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-deletion.component.html',
  styleUrls: ['./data-deletion.component.css']
})
export class DataDeletionComponent {
  email = '';
  reason = '';
  isSubmitting = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  constructor(private http: HttpClient) {}

  onSubmit() {
    if (!this.email || !this.email.includes('@')) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.successMessage = null;

    const apiUrl = `${environment.apiUrl}/family/data-deletion-request`;
    this.http.post<{ message: string }>(apiUrl, {
      email: this.email.trim(),
      reason: this.reason.trim() || 'User requested account & tracking data deletion.'
    }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.successMessage = res.message || 'Your data deletion request has been submitted successfully.';
        this.email = '';
        this.reason = '';
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err?.error?.error || 'Failed to submit data deletion request. Please try again or contact privacy@keshavsingh.in.';
      }
    });
  }
}


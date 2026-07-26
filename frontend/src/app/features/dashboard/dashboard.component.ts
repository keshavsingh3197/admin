import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="dashboard">
      <h1>Dashboard</h1>
      <p class="subtitle">Welcome to your personal admin panel.</p>

      <div class="cards">
        <a class="card" routerLink="/notes">
          <span class="card-icon">📝</span>
          <h2>Notes</h2>
          <p>Manage your notes and important information.</p>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { padding: 2rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .cards { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .card {
      display: flex; flex-direction: column; align-items: center;
      padding: 2rem; border-radius: 8px; border: 1px solid #e0e0e0;
      text-decoration: none; color: inherit; min-width: 160px;
      transition: box-shadow 0.2s;
    }
    .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .card-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
    h2 { margin: 0 0 0.5rem; }
    p { margin: 0; color: #666; font-size: 0.9rem; text-align: center; }
  `]
})
export class DashboardComponent {}

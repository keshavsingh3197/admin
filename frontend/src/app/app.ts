import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly auth = inject(AuthService);
  private router = inject(Router);

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigate(['/login']) });
  }
}

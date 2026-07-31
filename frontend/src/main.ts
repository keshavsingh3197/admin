import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    const loader = document.getElementById('boot-loader');
    if (!loader) return;
    loader.classList.add('hidden');
    window.setTimeout(() => loader.remove(), 220);
  })
  .catch((err) => console.error(err));

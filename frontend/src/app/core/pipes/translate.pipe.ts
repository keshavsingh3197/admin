import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

/**
 * `{{ 'common.actions.save' | t }}` — the terse form of {@link I18nService.t}.
 *
 * Deliberately NOT `pure: false`: the underlying lookup reads a signal, so Angular re-evaluates the
 * pipe when the bundle or locale changes without the cost of running it on every change detection.
 */
@Pipe({ name: 't' })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

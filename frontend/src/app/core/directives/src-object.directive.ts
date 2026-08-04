import { Directive, ElementRef, Input, inject } from '@angular/core';

/**
 * Binds a MediaStream to a &lt;video&gt;/&lt;audio&gt; element. `srcObject` isn't in Angular's DOM schema,
 * so `[srcObject]="stream"` won't compile — this sets the property directly instead.
 */
@Directive({
  selector: '[appSrcObject]',
  standalone: true,
})
export class SrcObjectDirective {
  private el = inject<ElementRef<HTMLMediaElement>>(ElementRef);

  @Input({ required: true })
  set appSrcObject(stream: MediaStream | null) {
    const element = this.el.nativeElement;
    if (element.srcObject === stream) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => { /* autoplay policy — handled by CallService for audio */ });
  }
}

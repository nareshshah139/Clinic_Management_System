declare module 'pagedjs' {
  // Minimal typings for pagedjs Previewer used by the app
  export interface PreviewerOptions {
    hooks?: Record<string, unknown>;
    auto?: boolean;
  }

  export class Previewer {
    constructor(options?: PreviewerOptions);
    preview(content?: unknown, styles?: string[], pagesHost?: unknown): Promise<unknown>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    removeAllListeners?(event?: string): void;
  }
}


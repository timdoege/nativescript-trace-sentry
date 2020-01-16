export declare class TraceSentry {
  constructor(dsn: string, environment?: string, appVersion?: string, release?: string, enableAppBreadcrumbs?: boolean);
  write(message: string, category: string, type?: number): void;
}
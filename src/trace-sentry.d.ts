export declare class TraceSentry {
    private batteryPercent;
    constructor(dsn: string, environment?: string, appVersion?: string, release?: string, enableAppBreadcrumbs?: boolean);
    write(message: string, category: string, type?: number): void;
    private initSentry(dsn, environment, release, enableAppBreadcrumbs);
    private initAutoCrumbs();
    private initAppVersion();
    private initBatteryStatus();
}

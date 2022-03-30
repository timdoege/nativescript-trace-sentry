import { Http, Device, Trace, Page, EventData, ShownModallyData, CoreTypes, HttpResponseEncoding  } from '@nativescript/core';
import * as Sentry from '@sentry/browser';
import { eventToSentryRequest } from '@sentry/core';
import { Event, Response, SentryRequest, SentryRequestType, Session } from '@sentry/types';
import { logger, parseRetryAfterHeader, SyncPromise, eventStatusFromHttpCode } from '@sentry/utils';
import { SDK_VERSION } from '@sentry/core';
import { BaseTransport } from '@sentry/browser/dist/transports';

let page = require('@nativescript/core').Page; // Needed for global events
let appversion = require('@nativescript/appversion');

declare var global: any;


function requestTypeToCategory(ty: SentryRequestType): string {
  const tyStr = ty as string;
  return tyStr === 'event' ? 'error' : tyStr;
}

/**
 * NativeScript specific transport
 */
 class NativeScriptTransport extends BaseTransport {

  /**
   * @param sentryRequest Prepared SentryRequest to be delivered
   * @param originalPayload Original payload used to create SentryRequest
   */
  public _sendRequest(sentryRequest: SentryRequest, originalPayload: Event | Session): PromiseLike<Response> {
    if (this._isRateLimited(sentryRequest.type)) {
      console.log('>NativeScriptTransport< _sendRequest isRateLimited');
      return Promise.reject({
        event: originalPayload,
        type: sentryRequest.type,
        reason: `Transport locked till ${this._disabledUntil(sentryRequest.type)} due to too many requests.`,
        status: 429,
      });
    }
    console.log(`---- <NativeScriptTransport._sendRequest> addPOST request to buffer (size=${this._buffer.$.length}`);

    return this._buffer.add(
      () =>
        new SyncPromise<Response>((resolve, reject) => {
          try {
            console.log(`---- <NativeScriptTransport._sendRequest> - buffer=${this._buffer.$.length}`);
            Http
            .request({
              method: 'POST',
              headers: this.options.headers,
              url: sentryRequest.url,
              timeout: 2000,
              content: sentryRequest.body,
            })
              .then(response => {
                console.log('---- <NativeScriptTransport._sendRequest> done');
                const status = eventStatusFromHttpCode(response.statusCode);
                console.log(`---- <NativeScriptTransport._sendRequest> >${status} - buffer=${this._buffer.$.length}`);
                const headers = {
                  'x-sentry-rate-limits': response.headers['X-Sentry-Rate-Limits'],
                  'retry-after': response.headers['Retry-After'],
                };
                const limited = this._handleCustomRateLimit(headers);
                if (limited) {
                  logger.warn(`Too many requests, backing off until: ${this._disabledUntil(sentryRequest.type)}`);
                  console.log('---- <NativeScriptTransport._sendRequest> backoff');
                }
            
                if (status === 'success') {
                  // console.log('---- <SENTRY.POST> SUCCESS');
                  resolve({ status });
                  return;
                }
               reject(response);
  
              })
              .catch(reject);
            }
            catch (httpErr) {
              console.log('---- <NativeScriptTransport._sendRequest> HTTP ERR >', httpErr,'<');

              // Ignore NS Http client throwing "TypeError e is not a function"
              reject();
            }
        })
    );

  }

  /**
   * Sets internal _rateLimits from incoming headers. Returns true if headers contains a non-empty rate limiting header.
   */
     protected _handleCustomRateLimit(headers: any): boolean {
      const now = Date.now();
      const rlHeader = headers['x-sentry-rate-limits'];
      const raHeader = headers['retry-after'];
  
      if (rlHeader) {

        for (const limit of rlHeader.trim().split(',')) {
          const parameters = limit.split(':', 2);
          const headerDelay = parseInt(parameters[0], 10);
          const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1000; // 60sec default
          for (const category of parameters[1].split(';')) {
            
            this._rateLimits[category] = now + delay;
          }
        }
        return true;
      } else if (raHeader) {
        this._rateLimits.all = now + parseRetryAfterHeader(raHeader, now);
        return true;
      }
      return false;
    }

}

export class TraceSentry {
  private batteryPercent: number;
  private contextInfo: string;

  constructor(dsn: string, environment = 'debug', appVersion = '', release = '', enableAppBreadcrumbs = true) {
    if (dsn === undefined || dsn === '') {
      throw new Error('Sentry DSN string required to configure Sentry TraceWriter');
    }
    this.initSentry(dsn, environment, appVersion, release, enableAppBreadcrumbs);
  }

  public setContextInfo(s: string) {
    this.contextInfo = s;
  }

  public write(message: string, category: string, type?: number): void {
    console.log('---- <TraceSentry.WRITE> >', message, '<', 'cat=', category, 'type=', type);
    if (typeof(Sentry) === 'undefined') {
      // console.log('---- <SENTRY.WRITE>: Sentry is undefined');
      return; // Do not process if Sentry plugin not loaded
    }
    // Category: "Debug" or "Error"
    // SeverityLevels: readonly ["fatal", "error", "warning", "log", "info", "debug", "critical"];
    let level = Sentry.Severity.Info;
    if (!type) {
      if ('Debug' === category) {
        level = Sentry.Severity.Debug;
      }
      else if ('Info' === category) {
        level = Sentry.Severity.Info;
      }
      else if ('Error' === category) {
        level = Sentry.Severity.Error;
      }
    }
    else {
      if (type === Trace.messageType.log) { 
        level = Sentry.Severity.Log;
      } else if (type === Trace.messageType.info) { 
        level = Sentry.Severity.Info;
      } else if (type === Trace.messageType.warn) { 
        level = Sentry.Severity.Warning;
      } else if (type === Trace.messageType.error) { 
        level = Sentry.Severity.Error;
      }
    }
    // Add category as a tag for log
    Sentry.setTag('trace_category', category );
    let msg = this.contextInfo ? '[' + this.contextInfo + ']' + message : message;
    Sentry.captureMessage(msg, level);
    console.log('---- <TraceSentry.WRITE>: captureMessage done', msg, level);
  }


  private initSentry(dsn: string, environment: string, appVersion: string, release: string, enableAppBreadcrumbs: boolean) {
    Sentry.init(
        {
        dsn: dsn,
        environment: environment,
        release: release,
        transport: NativeScriptTransport,
      });
      Sentry.setTags({
          app_version: appVersion,
          release: release,
          serverName: Device.uuid,
          device_type: Device.deviceType,
          device_lang: Device.language,
          device_family: Device.manufacturer,
          device_model: Device.model,
          device_orientation: CoreTypes.DeviceOrientation.portrait,
          os_name: Device.os,
          os_version: Device.osVersion,
          runtime_name: 'nativescript',
          runtime_version: global.__runtimeVersion
      });

      if (enableAppBreadcrumbs) {
        this.initAutoCrumbs();
      }
      if (!appVersion) {
        this.initAppVersion();
      }
      if (!release) {
        this.initAppRelease();
      }
    }

  private initAutoCrumbs() {
    // Loaded
    page.on(Page.loadedEvent, (args: EventData) => {
      let p = <Page>args.object;
      Sentry.addBreadcrumb({
        message: `Page loaded`,
        category: 'debug',
        data: {
          binding_context: p.bindingContext
        },
        level: Sentry.Severity.Info
      });
    });

    // NavigatedTo
    page.on(Page.navigatedToEvent, (args: EventData) => {
      let p = <Page>args.object;
      Sentry.addBreadcrumb({
        message: `App navigated to new page`,
        category: 'navigation',
        data: {
          binding_context: p.bindingContext,
          nav_context: p.navigationContext
        },
        level: Sentry.Severity.Info
      })
    });

    //Shown Modally
    page.on(Page.shownModallyEvent, (args: ShownModallyData) => {
      let p = <Page>args.object;
      Sentry.addBreadcrumb({
        message: `Page shown modally`,
        category: 'navigation',
        data: {
          binding_context: p.bindingContext,
          nav_context: args.context
        },
        level: Sentry.Severity.Info
      })
    });
  }

  private initAppVersion() {
    // Add app version tag (async)
    appversion.getVersionName()
      .then((version) => {
        Sentry.setTag('app_version' , version);
    });
  }

  private initAppRelease() {
    // Add app version code tag (async)
    appversion.getVersionCode()
      .then((versionCode) => {
        Sentry.setTag('release' , versionCode);
    });
  }

}

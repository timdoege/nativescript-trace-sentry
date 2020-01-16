import * as Sentry from '@sentry/browser';
import { Event, Response, Status } from '@sentry/types';
import { logger, parseRetryAfterHeader, SyncPromise } from '@sentry/utils';
import * as http from "tns-core-modules/http";
import { device, isAndroid } from 'tns-core-modules/platform/platform';
import * as trace from "tns-core-modules/trace";
import { DeviceOrientation } from "tns-core-modules/ui/enums";
import { Page, ShownModallyData } from "tns-core-modules/ui/page";
import { EventData } from "tns-core-modules/data/observable";
import { BaseTransport } from '@sentry/browser/dist/transports';

let page = require("tns-core-modules/ui/page").Page; // Needed for global events
let appversion = require("nativescript-appversion");
let orientation = require('nativescript-orientation'); 
require("nativescript-globalevents");

declare var global: any;

/**
 * NativeScript specific transport
 */
class NativeScriptTransport extends BaseTransport {
  
  // Locks transport after receiving 429 response
  private _disabledUntil: Date = new Date(Date.now());

  public sendEvent(event: Event): PromiseLike<Response> {
    if (new Date(Date.now()) < this._disabledUntil) {
      return Promise.reject({
        event,
        reason: `Transport locked till ${this._disabledUntil} due to too many requests.`,
        status: 429,
      });
    }

    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
        http.request({
          method: "POST",
          headers: this.options.headers,
          url: this.url,
          timeout: 2000,
          content: JSON.stringify(event)
        }).then((response) => {
            if (response.statusCode === 200) {
              resolve();
              return;
            }
    
            if (status === Status.RateLimit) {
              const now = Date.now();
              const retryAfter = response.headers['Retry-After'] + '';
              this._disabledUntil = new Date(now + parseRetryAfterHeader(now, retryAfter));
              logger.warn(`Too many requests, backing off till: ${this._disabledUntil}`);
            }
            reject(response);
          })
          .catch((err) => {
            let msg = `Sentry Transport Error: ${err}`;
            logger.error(msg);
            reject(err);
          });
      }),
    );
  }
}

export class TraceSentry {
  private batteryPercent: number;

  constructor(dsn: string, environment = "debug", appVersion = "", release = "", enableAppBreadcrumbs = true) {
    if (dsn === undefined || dsn === "") {
      throw new Error("Sentry DSN string required to configure Sentry TraceWriter");
    }
    this.initSentry(dsn, environment, appVersion, release, enableAppBreadcrumbs);
  }

  public write(message: string, category: string, type?: number): void {
    if (typeof(Sentry) === "undefined") return; // Do not process if Sentry plugin not loaded

    // Sentry only recognizes 'info', 'warning' and 'error' ('error' is default)
    let level = Sentry.Severity.Error;
    if (type === trace.messageType.log || type === trace.messageType.info) { 
      level = Sentry.Severity.Info;
    } else if (type === trace.messageType.warn) { 
      level = Sentry.Severity.Warning;
    }

    // Add category as a tag for log
    Sentry.setTag('trace_category', category );
    Sentry.captureMessage(message, level);
  }

  private initSentry(dsn: string, environment: string, appVersion: string, release: string, enableAppBreadcrumbs: boolean) {
    Sentry
      .init({
        dsn: dsn,
        environment: environment,
        release: release,
        transport: NativeScriptTransport,
      });
      Sentry.setTags({
          serverName: device.uuid,
          device_type: device.deviceType,
          device_lang: device.language,
          device_family: device.manufacturer,
          device_model: device.model,
          device_orientation: DeviceOrientation[orientation.getOrientation()],
          device_battery_level: ''+this.batteryPercent,
          os_name: device.os,
          os_version: device.osVersion,
          runtime_name: 'nativescript',
          runtime_version: global.__runtimeVersion
      });

      if (enableAppBreadcrumbs) {
        this.initAutoCrumbs();
      }
      if (!appVersion) {
        this.initAppVersion();
      }
    }

  private initAutoCrumbs() {
    // Loaded
    page.on(Page.loadedEvent, (args: EventData) => {
      let p = <Page>args.object;
      Sentry.addBreadcrumb({
        message: `Page loaded`,
        category: "debug",
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
        category: "navigation",
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
        category: "navigation",
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

}

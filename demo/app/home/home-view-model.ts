import * as Sentry from '@sentry/browser';
import { Button } from 'tns-core-modules/ui/button';
import { Observable } from "tns-core-modules/data/observable";
import * as trace from 'tns-core-modules/trace';

declare var ios: any;

export class HomeViewModel extends Observable {
    constructor() {
        super();
    }


    public btnLog() {
        this.writeMessage(`A test log from the demo app. Random number: ${ Math.random().toString() }`, trace.categories.Debug, trace.messageType.log);
      }
      
      public btnError() {
        this.writeMessage(`A test ERROR log from the demo app. Random number: ${ Math.random().toString() }`, trace.categories.Error, trace.messageType.error);
      }
    
      public btnLogWithCrumb(args: any) {
        let btn = <Button>args.object;
        Sentry.addBreadcrumb({
          message: `Button tapped`,
          category: "action",
          data: {
            id: btn.id,
            text: btn.text
          },
          level: Sentry.Severity.Info
        });
        this.writeMessage(`A test log with a CRUMB`, trace.categories.Debug, trace.messageType.warn);
      }
    
      public btnException() {
        try {
          throw new Error("A text EXCEPTION from the demo app");
        } catch (error) {
            Sentry.captureException(error);
        }
      }
    
      public btnCrashApp() {
        throw new Error("An UNCAUGHT EXCEPTION test from the demo app");
        // var btn = new ios.widget.Button();
      }
    
      private writeMessage(message: string, category: string, type: number) {
        trace.write(message, category, type);
      }    
}

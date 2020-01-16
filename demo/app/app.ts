import * as app from "tns-core-modules/application";
import * as trace from 'tns-core-modules/trace';
import { TraceSentry } from 'nativescript-trace-sentry';
import * as Sentry from '@sentry/browser';

app.on(app.launchEvent, (args: app.ApplicationEventData) => {
    let sentryDsn = "[YOUR SENTRY.IO DSN KEY]";

    if (sentryDsn === "[YOUR SENTRY.IO DSN KEY]") {
        let msg = "You must provide your own Sentry.io DSN key in app.ts to initialize this demo. Visit Sentry.io to get a key.";
        throw new Error(msg);
    }
    
    trace.setCategories(trace.categories.concat(trace.categories.Error, trace.categories.Debug));
    // Uncomment the line below to remove `console` TraceWriter before adding new Sentry TraceWriter
    // NOTE: It's okay to keep console writer. Will just additional breadcrumbs in Sentry logs.
    // trace.clearWriters();
    trace.addWriter(new TraceSentry(sentryDsn, "debug"));
    trace.enable();
});

app.on(app.uncaughtErrorEvent, (args: app.ApplicationEventData) => {
    if (app.android) {
        console.log("** Android Error Detected **");
        // For Android applications, args.android is an NativeScriptError.
        Sentry.captureException(args.android);
    } else if (app.ios) {
        console.log("** iOS Error Detected **");
        // For iOS applications, args.ios is NativeScriptError.
        Sentry.captureException(args.ios);
    }
});



app.run({ moduleName: "app-root" });

/*
Do not place any code after the application has been started as it will not
be executed on iOS.
*/

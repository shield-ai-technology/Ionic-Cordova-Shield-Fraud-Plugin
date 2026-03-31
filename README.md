# Cordova Shield Fraud Plugin

Cordova Plugin for Shield Fraud (www.shield.com)

Cordova Shield Fraud Plugin helps developers to assess malicious activities performed on mobile devices and return risk intelligence based on user's behaviour. It collects device's fingerprint, social metrics and network information. 

There are seven steps to getting started with the SHIELD SDK:

1. [Integrate the SDK](#integrate-the-sdk)

2. [Initialize the SDK](#initialize-the-sdk)

3. [Check Initialization Status](#check-initialization-status)

4. [Get Session ID](#get-session-id)

5. [Get Device Results](#get-device-results)

6. [Send Custom Attributes](#send-custom-attributes)

7. [Send Device Signature](#send-device-signature)


### Integrate the SDK

Run the following command in terminal at your project root directory. 

```
npm install shield-fraud-plugin
```
```
npx cap sync
```

**Note**: We make continuous enhancements to our fraud library and detection capabilities which includes new functionalities, bug fixes and security updates. We recommend updating to the latest SDK version to protect against rapidly evolving fraud risks.

You can refer to the Changelog to see more details about our updates.

### Android

This plugin now integrates SHIELD Android SDK `2.4.0`.

For Cordova Android projects, the plugin declares the SHIELD Maven repository directly from its Android Gradle integration:

```
https://cashshield-sdk.s3.amazonaws.com/release/
```

Android-specific init option:

```
{
  siteID: "SHIELD_SITE_ID",
  secretKey: "SHIELD_SECRET_KEY",
  blockScreenRecording: true
}
```

Public init change for Android: `blockScreenRecording` is supported as an optional config field.

### Initialize the SDK

The SDK must be initialized only once during app launch to enable successful device fingerprint generation and processing. This should be done at the earliest possible point in the app lifecycle.

To initialize the SDK, you will need your `SHIELD_SITE_ID` and `SHIELD_SECRET_KEY`.

Initializing the SDK more than once will result in an exception.

You can also pass optional public config fields during initialization:

```
{
  environment: ShieldFraudPlugin.Environment.PROD,
  logLevel: ShieldFraudPlugin.LogLevel.NONE,
  blockedDialog: {
    title: "Access blocked",
    body: "This action is unavailable on this device."
  },
  blockScreenRecording: true
}
```

#### Ionic + Capacitor (Angular)

Add the following to your `src/app/home/home.page.ts`:

```
declare var ShieldFraudPlugin: any;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  constructor() {
    var config = {
      siteID: "SHIELD_SITE_ID",
      secretKey: "SHIELD_SECRET_KEY"
    };

    ShieldFraudPlugin.initShieldFraud(config);
  }
}
```

#### Ionic + Capacitor (React)

Add the following to your `src/App.tsx` inside the `useEffect`:

```
setupIonicReact();

declare var ShieldFraudPlugin: any;

const config = {
  siteID: "SHIELD_SITE_ID",
  secretKey: "SHIELD_SECRET_KEY"
};

const App: React.FC = () => {
  useEffect(() => {
    ShieldFraudPlugin.initShieldFraud(config);
  }, []);
};
```

#### Ionic + Capacitor (Vue)

Add the following to your `src/main.ts`:

```
declare var ShieldFraudPlugin: any;

const app = createApp(App)
  .use(IonicVue)
  .use(router);

router.isReady().then(() => {
  app.mount('#app');

  const config = {
    siteID: "SHIELD_SITE_ID",
    secretKey: "SHIELD_SECRET_KEY"
  };

  ShieldFraudPlugin.initShieldFraud(config);
});
```

### Check Initialization Status

To verify that the SDK has initialized successfully, use the following method:

```
ShieldFraudPlugin.isShieldInitialized(callbackSuccess, callbackError);

function callbackSuccess(status) {
    console.log("Shield initialize Callback:", status);
}

function callbackError(status) {
    console.log("Shield initialize Callback:", status);
}
```

### Get Session ID
Session ID is the unique identifier of a user’s app session and acts as a point of reference when retrieving the device result for that session.


Session ID follows the OS lifecycle management, in-line with industry best practice. This means that a user’s session is active for as long as the device maintains it, unless the user terminates the app or the device runs out of memory and has to kill the app.

If you would like to retrieve device results using the backend API, it is important that you store the Session ID on your system. You will need to call the SHIELD backend API using this Session ID.

```
ShieldFraudPlugin.getSessionID(successSessionID, errorSessionID);

function successSessionID(message) {
    console.log("Shield SessionID Callback:", message);
}

function errorSessionID(error) {
    console.log("Shield SessionID Callback:", error);
}
```

### Get Device Results

#### SHIELD Sentinel (Real-time Monitoring)

SHIELD Sentinel enables continuous, real-time monitoring throughout a device session, ensuring your app always receives the latest device intelligence without the need for frequent or redundant API calls. The SHIELD SDK automatically delivers updated intelligence payloads to your app in real time whenever changes in device intelligence occur.

This patent-pending technology maximizes detection coverage by comparing fingerprint deltas (differences between the current and baseline device states) to detect changes in the device state or risk profile.

SHIELD recommends SHIELD Sentinel as the most effective way to monitor in real time.

Use the code below to set up automatic delivery of device intelligence during a session.

Pass an additional callbacks object during initialization in order to register listener callbacks:

```
var config = {
  siteID: "SHIELD_SITE_ID",
  secretKey: "SHIELD_SECRET_KEY"
};

ShieldFraudPlugin.initShieldFraud(config, {
  onSuccess: function(message) {
    console.log("Shield Callback Success:", message);

    ShieldFraudPlugin.getSessionID(successSessionID, errorSessionID);

    function successSessionID(sessionID) {
      console.log("Shield SessionID:", sessionID);
    }

    function errorSessionID(error) {
      console.log("Shield SessionID Error:", error);
    }
  },
  onFailure: function(error) {
    console.log("Shield Callback Error:", error);
  }
});
```

The Session ID is a unique identifier generated locally at the start of a device session. It links SHIELD's intelligence to that specific app session and remains valid for the duration of the session, from app launch until the app is closed by the user or terminated by the system.

Storing the Session ID allows you to retrieve device intelligence through SHIELD's backend API and provides a consistent reference point for investigation, debugging, or risk evaluation.

#### Retrieve device results manually

You can also retrieve device results manually at specific user checkpoints or activities, such as account registration, login, or checkout.

```
ShieldFraudPlugin.getDeviceResult(successDeviceResult, errorDeviceResult);

function successDeviceResult(message) {
    console.log("DeviceResult Success Callback:", message);
}

function errorDeviceResult(error) {
    console.log("DeviceResult Error Callback:", error);
}
```

It is possible that `getDeviceResult` returns no payload if device result retrieval is unsuccessful or not ready yet.

### Send Custom Attributes

Use the sendAttributes function to sent event-based attributes such as user_id or activity_id for enhanced analytics. This function accepts two parameters:screenName where the function is triggered, and data to provide any custom fields in key, value pairs.

```
var data = {"key1": "value1", "key2": "value2"}

ShieldFraudPlugin.sendAttributes("Screen_Name", data, successCallback, errorCallback);

function successCallback(message) {
    console.log("sendAttributes success:", message);
}

function errorCallback(error) {
    console.log("sendAttributes error:", error);
}
```

### Send Device Signature

Use the `sendDeviceSignature` function to manually trigger device signature collection for a screen or user checkpoint.

```
ShieldFraudPlugin.sendDeviceSignature("Checkout", successCallback, errorCallback);

function successCallback(message) {
    console.log("sendDeviceSignature success:", message);
}

function errorCallback(error) {
    console.log("sendDeviceSignature error:", error);
}
```

# ShieldFraudPlugin
Cordova Plugin for Shield SDK (www.shield.com) 

SHIELD SDK helps developers to assess malicious activities performed on mobile devices and return risk intelligence based on user's behaviour. It collects device's fingerprint, social metrics and network information. SHIELD SDK is built with Java for Android and Swift for iOS.

## Getting Started

### Install the Library

```
ionic cordova plugin add shield-fraud-plugin
```

### Initialise the Client

Initialise Shield inside onDeviceReady() function where Cordova is initialized.

```
var config = {siteID: "site_id", secretKey: "secret_key"}

ShieldFraudPlugin.initShieldFraud(config);
```

### Get Session ID
Session ID is the unique identifier of a user’s app session
```
ShieldFraudPlugin.getSessionID(errorSessionID, successSessionID);

function successSessionID(message) {
    console.log("SessionID Succcess Callback:", message);
}

function errorSessionID(error) {
    console.log("SessionID Error Callback:", error);
}
```

### Get Device Result
#### - Retrieve device results via Optimised Listener

```
var config = {siteID: "site_id", secretKey: "secret_key"}
    
ShieldFraudPlugin.initShieldFraud(config, success, error);

function success(message) {
    console.log("Shield Succcess Callback:", message);
}
    
function error(error) {
    console.log("Shield Error Callback:", error);
}
```

#### - Retrieve device results via Customised Pull

You can also retrieve latest device result.

```
ShieldFraudPlugin.getDeviceResult(successDeviceResult, errorDeviceResult);

function successDeviceResult(message) {
    console.log("DeviceResult Succcess Callback:", message);
}
    
function errorDeviceResult(error) {
    console.log("DeviceResult Error Callback:", error);
}
```

## Send Custom Attributes
Use the `sendAttributes` function to sent event-based attributes such as `user_id` for enhanced analytics. This function accepts two parameters:`screenName` where the function is triggered, and  `data` to provide any custom fields in key, value pairs.

```
var data = {"user_id": "12345abcdef", "email": "test@gmail.com"}
ShieldFraudPlugin.sendAttributes("Test", data);
```

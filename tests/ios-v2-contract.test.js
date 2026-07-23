const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const swift = read("src/ios/ShieldFraudPlugin.swift");
const podfile = read("src/ios/Podfile");
const pluginXml = read("plugin.xml");
const javascript = read("www/js/ShieldFraudPlugin.js");
const android = read("src/android/ShieldFraudPlugin.java");

test("pins ShieldFraud iOS SDK 2.0.0 in both pod declarations", () => {
    assert.match(podfile, /pod 'ShieldFraud', '2\.0\.0'/);
    assert.match(pluginXml, /<pod name="ShieldFraud" spec="2\.0\.0"\/>/);
});

test("uses the ShieldFraud iOS 2.0 instance API", () => {
    assert.match(swift, /private static var shieldInstance: Shield\?/);
    assert.match(swift, /ShieldConfig\(siteId: siteID, secretKey: key\)/);
    assert.match(swift, /ShieldFactory\.createShield\(config: config\)/);
    assert.match(swift, /shield\.onDeviceResult/);
    assert.match(swift, /shield\.getLatestDeviceResult\(\)\?\.data/);
    assert.match(swift, /shield\.sendAttributes\(screenName: screenName, data: data\)/);
    assert.match(swift, /shield\.sendDeviceSignature\(userData: userData\)/);
});

test("does not use removed ShieldFraud iOS 1.x APIs", () => {
    assert.doesNotMatch(
        swift,
        /Shield\.shared|Shield\.setUp|Configuration\(withSiteId|DeviceShieldCallback|deviceShieldCallback|setDeviceResultStateListener|getErrorResponse/
    );
});

test("preserves the customer-facing JavaScript API", () => {
    assert.match(javascript, /initShieldFraud: function\(config, callbacks, legacyErrorCallback\)/);
    assert.match(javascript, /sendDeviceSignature: function\(screenName, success, error, userId\)/);
});

test("maps partnerId into both native ShieldConfig instances", () => {
    assert.match(swift, /config\.partnerId\s*=\s*partnerId/);
    assert.match(android, /shieldConfig\.setPartnerId\(partnerId\)/);
});

test("maps needBackgroundListener into Android ShieldConfig with the native true default", () => {
    assert.match(
        android,
        /shieldConfig\.setNeedBackgroundListener\(\s*payload\.optBoolean\("needBackgroundListener", true\)\s*\)/
    );
});

test("checks the sendAttributes argument count before Swift array subscripting", () => {
    const methodStart = swift.indexOf("@objc(sendAttributes:)");
    const methodEnd = swift.indexOf("@objc(sendDeviceSignature:)");
    const method = swift.slice(methodStart, methodEnd);
    const countGuard = method.indexOf("command.arguments.count >= 2");
    const firstSubscript = method.indexOf("command.arguments[0]");

    assert.notEqual(methodStart, -1);
    assert.notEqual(methodEnd, -1);
    assert.notEqual(countGuard, -1);
    assert.ok(countGuard < firstSubscript);
});

test("uses the configured CocoaPods Git Specs source", () => {
    assert.match(
        pluginXml,
        /<source url="https:\/\/github\.com\/CocoaPods\/Specs\.git" \/>/
    );
});

test("dispatches Android actions without a boundary try-catch", () => {
    const executeStart = android.indexOf("public boolean execute");
    const executeEnd = android.indexOf("public void onReset");
    const executeMethod = android.slice(executeStart, executeEnd);

    assert.ok(executeStart >= 0 && executeEnd > executeStart);
    assert.doesNotMatch(executeMethod, /\btry\b/);
    assert.doesNotMatch(executeMethod, /\bcatch\b/);
    assert.match(executeMethod, /return false;/);
});

test("routes Android device results to the latest Cordova callback context", () => {
    assert.doesNotMatch(android, /DeviceResultCallbackRouter/);
    assert.match(android, /private volatile CallbackContext deviceResultCallbackContext/);
    assert.match(android, /deviceResultCallbackContext = callbackContext/);
    assert.match(android, /CallbackContext currentContext = deviceResultCallbackContext/);
    assert.doesNotMatch(android, /replayCachedResult/);
    assert.match(android, /void onReset\(\)[\s\S]*deviceResultCallbackContext = null/);
});

test("routes iOS device results to the latest saved callback ID", () => {
    assert.match(swift, /private var deviceResultCallbackId: String\?/);
    assert.match(swift, /registerDeviceResultListener\(shield: Shield\)/);
    assert.match(swift, /let callbackId = self\.deviceResultCallbackId/);
    assert.match(swift, /self\.deviceResultCallbackId = command\.callbackId/);
    assert.match(
        swift,
        /if ShieldFraudPlugin\.shieldInstance != nil[\s\S]*if enableDeviceResultListener[\s\S]*self\.deviceResultCallbackId = command\.callbackId/
    );
});

test("reports iOS device-result serialization failures explicitly", () => {
    assert.match(swift, /try JSONSerialization\.data\(withJSONObject: data, options: \[\]\)/);
    assert.match(swift, /catch/);
    assert.match(swift, /Failed to serialize device result:/);
    assert.doesNotMatch(swift, /try\? JSONSerialization\.data/);
});

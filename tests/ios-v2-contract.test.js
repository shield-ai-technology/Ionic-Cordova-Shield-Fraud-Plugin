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

test("strictly maps needBackgroundListener into Android ShieldConfig", () => {
    assert.match(android, /needBackgroundListenerValue\s+instanceof\s+Boolean/);
    assert.match(
        android,
        /shieldConfig\.setNeedBackgroundListener\(needBackgroundListener\)/
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

test("uses the CocoaPods CDN instead of the legacy Git Specs source", () => {
    assert.match(pluginXml, /<source url="https:\/\/cdn\.cocoapods\.org\/" \/>/);
    assert.doesNotMatch(pluginXml, /github\.com\/CocoaPods\/Specs\.git/);
});

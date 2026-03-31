var exec = require('cordova/exec');

var PLUGIN_NAME = "ShieldFraudPlugin";
var CROSS_PLATFORM_NAME = "ionic-shield-fraud-plugin";
var CROSS_PLATFORM_VERSION = "2.0.0";

var Environment = {
    PROD: 0,
    DEV:  1,
    STAG: 2,
    STAGING: 2
};

var LogLevel = {
    NONE:    0,
    INFO:    1,
    DEBUG:   2,
    VERBOSE: 3
};

function noop() {}

function normalizeResult(value) {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return value;
    }
}

function normalizeSuccessCallback(callback) {
    callback = callback || noop;
    return function(result) {
        callback(normalizeResult(result));
    };
}

function extractListenerCallbacks(callbacks, legacyErrorCallback) {
    if (callbacks && typeof callbacks === "object" && !Array.isArray(callbacks)) {
        return {
            onSuccess: typeof callbacks.onSuccess === "function" ? callbacks.onSuccess : noop,
            onFailure: typeof callbacks.onFailure === "function" ? callbacks.onFailure : noop
        };
    }

    if (typeof callbacks === "function" || typeof legacyErrorCallback === "function") {
        return {
            onSuccess: typeof callbacks === "function" ? callbacks : noop,
            onFailure: typeof legacyErrorCallback === "function" ? legacyErrorCallback : noop
        };
    }

    return null;
}

var ShieldFraudPlugin = {
    initShieldFraud: function(config, callbacks, legacyErrorCallback) {
        config  = config || {};
        if (!config || !config.siteID || !config.secretKey) {
            var invalidConfigCallbacks = extractListenerCallbacks(callbacks, legacyErrorCallback);
            (invalidConfigCallbacks ? invalidConfigCallbacks.onFailure : noop)("siteID and secretKey are required");
            return;
        }

        var listenerCallbacks = extractListenerCallbacks(callbacks, legacyErrorCallback);
        var enableDeviceResultListener = !!listenerCallbacks;

        var payload = {
            siteID:        config.siteID,
            secretKey:     config.secretKey,
            environment:   (config.environment   !== undefined) ? config.environment   : Environment.PROD,
            logLevel:      (config.logLevel      !== undefined) ? config.logLevel      : LogLevel.NONE,
            blockedDialog: (config.blockedDialog !== undefined) ? config.blockedDialog : null,
            blockScreenRecording: !!config.blockScreenRecording,
            enableDeviceResultListener: enableDeviceResultListener,
            crossPlatformName: CROSS_PLATFORM_NAME,
            crossPlatformVersion: CROSS_PLATFORM_VERSION
        };

        exec(
            enableDeviceResultListener ? normalizeSuccessCallback(listenerCallbacks.onSuccess) : noop,
            enableDeviceResultListener ? listenerCallbacks.onFailure : noop,
            PLUGIN_NAME,
            "initShieldFraud",
            [payload]
        );
    },

    getSessionID: function(success, error) {
        success = success || noop;
        error   = error || noop;
        exec(success, error, PLUGIN_NAME, "getSessionID", []);
    },

    getDeviceResult: function(success, error) {
        exec(normalizeSuccessCallback(success), error || noop, PLUGIN_NAME, "getDeviceResult", []);
    },

    sendAttributes: function(screenName, data, success, error) {
        exec(success || noop, error || noop, PLUGIN_NAME, "sendAttributes", [screenName, data]);
    },

    sendDeviceSignature: function(screenName, success, error) {
        exec(normalizeSuccessCallback(success), error || noop, PLUGIN_NAME, "sendDeviceSignature", [screenName]);
    },

    isShieldInitialized: function(success, error) {
        exec(success || noop, error || noop, PLUGIN_NAME, "isShieldInitialized", []);
    }
};

ShieldFraudPlugin.Environment = Environment;
ShieldFraudPlugin.LogLevel    = LogLevel;

module.exports = ShieldFraudPlugin;

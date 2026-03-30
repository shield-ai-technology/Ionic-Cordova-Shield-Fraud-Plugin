var exec = require('cordova/exec');

var PLUGIN_NAME = "ShieldFraudPlugin";

var Environment = {
    PROD: 0,
    DEV:  1,
    STAG: 2
};

var LogLevel = {
    NONE:    0,
    INFO:    1,
    DEBUG:   2,
    VERBOSE: 3
};

var ShieldFraudPlugin = {
    initShieldFraud: function(config, success, error) {
        success = success || function() {};
        error   = error   || function() {};
        if (!config || !config.siteID || !config.secretKey) {
            error("siteID and secretKey are required");
            return;
        }
        var payload = {
            siteID:        config.siteID,
            secretKey:     config.secretKey,
            environment:   (config.environment   !== undefined) ? config.environment   : Environment.PROD,
            logLevel:      (config.logLevel      !== undefined) ? config.logLevel      : LogLevel.NONE,
            blockedDialog: (config.blockedDialog !== undefined) ? config.blockedDialog : null
        };
        exec(success, error, PLUGIN_NAME, "initShieldFraud", [payload]);
    },

    getSessionID: function(success, error) {
        success = success || function() {};
        error   = error   || function() {};
        exec(success, error, PLUGIN_NAME, "getSessionID", []);
    },

    getDeviceResult: function(success, error) {
        success = success || function() {};
        error   = error   || function() {};
        exec(success, error, PLUGIN_NAME, "getDeviceResult", []);
    },

    sendAttributes: function(screenName, data, success, error) {
        success = success || function() {};
        error   = error   || function() {};
        exec(success, error, PLUGIN_NAME, "sendAttributes", [screenName, data]);
    },

    sendDeviceSignature: function(screenName, success, error) {
        success = success || function() {};
        error   = error   || function() {};
        exec(success, error, PLUGIN_NAME, "sendDeviceSignature", [screenName]);
    },

    isShieldInitialized: function(success, error) {
        success = success || function() {};
        error   = error   || function() {};
        exec(success, error, PLUGIN_NAME, "isShieldInitialized", []);
    }
};

ShieldFraudPlugin.Environment = Environment;
ShieldFraudPlugin.LogLevel    = LogLevel;

module.exports = ShieldFraudPlugin;

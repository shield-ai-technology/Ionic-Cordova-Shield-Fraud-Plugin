var exec = require('cordova/exec');

var PLUGIN_NAME = "ShieldFraudPlugin";

var ShieldFraudPlugin = {
    initShieldFraud: function(config, success, error) {
        success = success || function() {};
        error = error || function() {};
        exec(success, error, PLUGIN_NAME, "initShieldFraud", [config.siteID, config.secretKey]);
    },

    getSessionID: function(success, error) {
        exec(success, error, PLUGIN_NAME, "getSessionID", []);
    },
      
    getDeviceResult: function(success, error) {
        exec(success, error, PLUGIN_NAME, "getDeviceResult", []);
    },
      
    sendAttributes: function(screen, data, success, error) {
        success = success || function() {};
        error = error || function() {};
        exec(success, error, PLUGIN_NAME, "sendAttributes", [screen, data]);
    },
      
    sendDeviceSignature: function(arg0, success, error) {
        success = success || function() {};
        error = error || function() {};
        exec(success, error, PLUGIN_NAME, "sendDeviceSignature", [arg0]);
    },
      
    isShieldInitialized: function(success, error) {
        exec(success, error, PLUGIN_NAME, "isShieldInitialized", []);
    }
};

module.exports = ShieldFraudPlugin;
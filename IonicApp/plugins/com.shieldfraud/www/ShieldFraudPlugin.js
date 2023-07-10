var exec = require('cordova/exec');

var PLUGIN_NAME = "ShieldFraudPlugin";

exports.initShieldFraud = function(config, success, error) {
    exec(success, error, PLUGIN_NAME, "initShieldFraud", [config.siteID, config.secretKey]);
};

exports.getSessionID = function(arg0, success, error) {
  exec(success, error, PLUGIN_NAME, "getSessionID", [arg0]);
};

exports.getDeviceResult = function(success, error) {
  exec(success, error, PLUGIN_NAME, "getDeviceResult");
};

exports.sendAttributes = function(screen, data, success, error) {
  exec(success, error, PLUGIN_NAME, "sendAttributes", [screen, data]);
};

exports.sendDeviceSignature = function(arg0, success, error) {
  exec(success, error, PLUGIN_NAME, "sendDeviceSignature", [arg0]);
};

exports.isShieldInitialized = function(success, error) {
  exec(success, error, PLUGIN_NAME, "isShieldInitialized");
};

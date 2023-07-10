cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "com.shieldfraud.ShieldFraudPlugin",
      "file": "plugins/com.shieldfraud/www/ShieldFraudPlugin.js",
      "pluginId": "com.shieldfraud",
      "clobbers": [
        "ShieldFraudPlugin"
      ]
    }
  ];
  module.exports.metadata = {
    "cordova-plugin-add-swift-support": "2.0.2",
    "com.shieldfraud": "0.0.1"
  };
});
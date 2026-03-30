import ShieldFraud

@objc(ShieldFraudPlugin) class ShieldFraudPlugin : CDVPlugin {

    private static var isShieldInitialized: Bool = false
    private var callbackId: String = ""

    private func sendPluginResult(_ pluginResult: CDVPluginResult, callbackId: String) {
        DispatchQueue.main.async {
            self.commandDelegate.send(pluginResult, callbackId: callbackId)
        }
    }

    @objc(initShieldFraud:) func initShieldFraud(command: CDVInvokedUrlCommand) {
        self.callbackId = command.callbackId

        if ShieldFraudPlugin.isShieldInitialized {
            let pluginResult = CDVPluginResult(status: .ok, messageAs: true)
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }
        guard let payload = command.arguments[0] as? [String: Any],
              let siteID  = payload["siteID"]    as? String,
              let key     = payload["secretKey"] as? String else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "siteID and secretKey are required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }

        let rawEnv      = payload["environment"] as? Int ?? 0
        let environment = Environment(rawValue: rawEnv) ?? .prod

        // JS LogLevel: NONE=0, INFO=1, DEBUG=2, VERBOSE=3
        // iOS LogLevel: none=1, info=2, debug=3 (no VERBOSE — map to debug)
        let rawLog = payload["logLevel"] as? Int ?? 0
        let logLevel: LogLevel
        switch rawLog {
        case 1:  logLevel = .info
        case 2:  logLevel = .debug
        case 3:  logLevel = .debug  // VERBOSE not available on iOS, use debug
        default: logLevel = .none
        }

        let config = Configuration(withSiteId: siteID, secretKey: key)
        config.environment = environment
        config.logLevel    = logLevel
        let enableDeviceResultListener = payload["enableDeviceResultListener"] as? Bool ?? false
        if enableDeviceResultListener {
            config.deviceShieldCallback = self
        }
        if let dialogArg = payload["blockedDialog"] as? [String: String],
           let title = dialogArg["title"],
           let body  = dialogArg["body"] {
            config.defaultBlockedDialog = BlockedDialog(title: title, body: body)
        }
        Shield.setUp(with: config)
        ShieldFraudPlugin.isShieldInitialized = true
    }

    @objc(setCrossPlatformParameters:) func setCrossPlatformParameters(command: CDVInvokedUrlCommand) {
        guard let name = command.arguments[0] as? String,
              let version = command.arguments[1] as? String,
              !name.isEmpty,
              !version.isEmpty else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "name and version are required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }

        let params = ShieldCrossPlatformParams(name: name, version: version)
        ShieldCrossPlatformHelper.setCrossPlatformParameters(params)
        let pluginResult = CDVPluginResult(status: .ok, messageAs: true)
        self.sendPluginResult(pluginResult, callbackId: command.callbackId)
    }

    @objc(getSessionID:) func getSessionID(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run {
            guard ShieldFraudPlugin.isShieldInitialized else {
                let pluginResult = CDVPluginResult(status: .error, messageAs: "Initialize SDK before calling getSessionID")
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
                return
            }
            let sessionId    = Shield.shared().sessionId
            let pluginResult = CDVPluginResult(status: .ok, messageAs: sessionId)
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
        }
    }

    @objc(getDeviceResult:) func getDeviceResult(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run {
            Shield.shared().setDeviceResultStateListener {
                var pluginResult: CDVPluginResult
                if let deviceResult = Shield.shared().getLatestDeviceResult(),
                   let jsonData     = try? JSONSerialization.data(withJSONObject: deviceResult, options: []),
                   let dataString   = String(bytes: jsonData, encoding: .utf8) {
                    pluginResult = CDVPluginResult(status: .ok, messageAs: dataString)
                } else if let error = Shield.shared().getErrorResponse() {
                    pluginResult = CDVPluginResult(status: .error, messageAs: error.localizedDescription)
                } else {
                    pluginResult = CDVPluginResult(status: .error, messageAs: "No device result available")
                }
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    @objc(sendAttributes:) func sendAttributes(command: CDVInvokedUrlCommand) {
        guard let screenName = command.arguments[0] as? String,
              let data       = command.arguments[1] as? [String: String] else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "screenName and data are required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }
        self.commandDelegate.run {
            Shield.shared().sendAttributes(withScreenName: screenName, data: data) { (status, error) in
                let pluginResult: CDVPluginResult
                if let error = error {
                    pluginResult = CDVPluginResult(status: .error, messageAs: error.localizedDescription)
                } else {
                    pluginResult = CDVPluginResult(status: .ok, messageAs: status)
                }
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    @objc(sendDeviceSignature:) func sendDeviceSignature(command: CDVInvokedUrlCommand) {
        guard let screenName = command.arguments[0] as? String else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "screenName is required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }
        self.commandDelegate.run {
            Shield.shared().sendDeviceSignature(withScreenName: screenName) {
                let pluginResult = CDVPluginResult(status: .ok, messageAs: true)
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    @objc(isShieldInitialized:) func isShieldInitialized(command: CDVInvokedUrlCommand) {
        let pluginResult = CDVPluginResult(status: .ok, messageAs: ShieldFraudPlugin.isShieldInitialized)
        self.sendPluginResult(pluginResult, callbackId: command.callbackId)
    }
}

extension ShieldFraudPlugin: DeviceShieldCallback {

    public func didSuccess(result: [String: Any]) {
        guard let jsonData   = try? JSONSerialization.data(withJSONObject: result, options: []),
              let dataString = String(bytes: jsonData, encoding: .utf8) else { return }
        let pluginResult = CDVPluginResult(status: .ok, messageAs: dataString)
        pluginResult.setKeepCallbackAs(true)
        self.sendPluginResult(pluginResult, callbackId: self.callbackId)
    }

    public func didError(error: NSError) {
        let pluginResult = CDVPluginResult(status: .error, messageAs: error.localizedDescription)
        self.sendPluginResult(pluginResult, callbackId: self.callbackId)
    }
}

import ShieldFraud

@objc(ShieldFraudPlugin) class ShieldFraudPlugin : CDVPlugin {

    private static var shieldInstance: Shield?

    private func sendPluginResult(_ pluginResult: CDVPluginResult?, callbackId: String) {
        guard let pluginResult = pluginResult else {
            return
        }

        DispatchQueue.main.async {
            self.commandDelegate.send(pluginResult, callbackId: callbackId)
        }
    }

    private func requireShield(command: CDVInvokedUrlCommand, methodName: String) -> Shield? {
        guard let shield = ShieldFraudPlugin.shieldInstance else {
            let pluginResult = CDVPluginResult(
                status: .error,
                messageAs: "Initialize SDK before calling \(methodName)"
            )
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return nil
        }
        return shield
    }

    private func shieldErrorMessage(_ error: ShieldError) -> String {
        if !error.errorMessage.isEmpty {
            return error.errorMessage
        }
        if !error.errorCode.isEmpty {
            return error.errorCode
        }
        return error.localizedDescription
    }

    private func serializeDeviceResult(_ data: [String: Any]) throws -> String {
        let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
        guard let dataString = String(data: jsonData, encoding: .utf8) else {
            throw NSError(
                domain: "ShieldFraudPlugin",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Device result is not valid UTF-8"]
            )
        }
        return dataString
    }

    private func serializationErrorMessage(_ error: Error) -> String {
        return "Failed to serialize device result: \(error.localizedDescription)"
    }

    private func registerDeviceResultListener(shield: Shield, callbackId: String) {
        shield.onDeviceResult { [weak self] intelligence, error in
            guard let self = self else {
                return
            }

            let pluginResult: CDVPluginResult?
            if let error = error {
                pluginResult = CDVPluginResult(
                    status: .error,
                    messageAs: self.shieldErrorMessage(error)
                )
            } else if let data = intelligence?.data {
                do {
                    let dataString = try self.serializeDeviceResult(data)
                    pluginResult = CDVPluginResult(status: .ok, messageAs: dataString)
                } catch {
                    pluginResult = CDVPluginResult(
                        status: .error,
                        messageAs: self.serializationErrorMessage(error)
                    )
                }
            } else {
                pluginResult = CDVPluginResult(
                    status: .error,
                    messageAs: "Device result data is unavailable"
                )
            }

            pluginResult?.setKeepCallbackAs(true)
            self.sendPluginResult(pluginResult, callbackId: callbackId)
        }
    }

    @objc(initShieldFraud:) func initShieldFraud(command: CDVInvokedUrlCommand) {
        guard command.arguments.count > 0,
              let payload = command.arguments[0] as? [String: Any],
              let siteID = payload["siteID"] as? String,
              let key = payload["secretKey"] as? String,
              !siteID.isEmpty,
              !key.isEmpty else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "siteID and secretKey are required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }

        let enableDeviceResultListener = payload["enableDeviceResultListener"] as? Bool ?? false
        if let shield = ShieldFraudPlugin.shieldInstance {
            if enableDeviceResultListener {
                registerDeviceResultListener(shield: shield, callbackId: command.callbackId)
            } else {
                let pluginResult = CDVPluginResult(status: .ok, messageAs: true)
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
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

        if let crossPlatformName = payload["crossPlatformName"] as? String,
           let crossPlatformVersion = payload["crossPlatformVersion"] as? String,
           !crossPlatformName.isEmpty,
           !crossPlatformVersion.isEmpty {
            let params = ShieldCrossPlatformParams(name: crossPlatformName, version: crossPlatformVersion)
            ShieldCrossPlatformHelper.setCrossPlatformParameters(params)
        }

        let config = ShieldConfig(siteId: siteID, secretKey: key)
        config.environment = environment
        config.logLevel = logLevel
        if let partnerId = payload["partnerId"] as? String,
           !partnerId.isEmpty {
            config.partnerId = partnerId
        }
        if let dialogArg = payload["blockedDialog"] as? [String: String],
           let title = dialogArg["title"],
           let body = dialogArg["body"] {
            config.defaultBlockedDialog = BlockedDialog(title: title, body: body)
        }

        let shield = ShieldFactory.createShield(config: config)
        ShieldFraudPlugin.shieldInstance = shield

        if enableDeviceResultListener {
            registerDeviceResultListener(shield: shield, callbackId: command.callbackId)
        } else {
            let pluginResult = CDVPluginResult(status: .ok, messageAs: true)
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
        }
    }

    @objc(getSessionID:) func getSessionID(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run {
            guard let shield = self.requireShield(command: command, methodName: "getSessionID") else {
                return
            }
            let sessionId = shield.sessionId
            let pluginResult = CDVPluginResult(status: .ok, messageAs: sessionId)
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
        }
    }

    @objc(getDeviceResult:) func getDeviceResult(command: CDVInvokedUrlCommand) {
        self.commandDelegate.run {
            guard let shield = self.requireShield(command: command, methodName: "getDeviceResult") else {
                return
            }

            guard let deviceResult = shield.getLatestDeviceResult()?.data else {
                let pluginResult = CDVPluginResult(status: .error, messageAs: "No device result available")
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
                return
            }

            let pluginResult: CDVPluginResult?
            do {
                let dataString = try self.serializeDeviceResult(deviceResult)
                pluginResult = CDVPluginResult(status: .ok, messageAs: dataString)
            } catch {
                pluginResult = CDVPluginResult(
                    status: .error,
                    messageAs: self.serializationErrorMessage(error)
                )
            }
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
        }
    }

    @objc(sendAttributes:) func sendAttributes(command: CDVInvokedUrlCommand) {
        guard command.arguments.count >= 2,
              let screenName = command.arguments[0] as? String,
              let data       = command.arguments[1] as? [String: String] else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "screenName and data are required")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }
        self.commandDelegate.run {
            guard let shield = self.requireShield(command: command, methodName: "sendAttributes") else {
                return
            }

            shield.sendAttributes(screenName: screenName, data: data) { sessionId, error in
                let pluginResult: CDVPluginResult?
                if let error = error {
                    pluginResult = CDVPluginResult(
                        status: .error,
                        messageAs: self.shieldErrorMessage(error)
                    )
                } else {
                    pluginResult = CDVPluginResult(
                        status: .ok,
                        messageAs: sessionId ?? shield.sessionId
                    )
                }
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    @objc(sendDeviceSignature:) func sendDeviceSignature(command: CDVInvokedUrlCommand) {
        guard command.arguments.count > 0,
            let payload = command.arguments[0] as? [String: Any] else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "Invalid arguments")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }

        guard let screenName = payload["screenName"] as? String else {
            let pluginResult = CDVPluginResult(status: .error, messageAs: "Invalid arguments")
            self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            return
        }

        var userId: String? = nil

        if let userIdValue = payload["userId"],
        !(userIdValue is NSNull) {
            guard let validUserId = userIdValue as? String else {
                let pluginResult = CDVPluginResult(status: .error, messageAs: "Invalid arguments")
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
                return
            }

            userId = validUserId
        }

        self.commandDelegate.run {
            guard let shield = self.requireShield(command: command, methodName: "sendDeviceSignature") else {
                return
            }

            let userData: ShieldUserData

            if let userId = userId,
               !userId.isEmpty {
                userData = ShieldUserData(
                    screenName: screenName,
                    userId: userId
                )
            } else {
                userData = ShieldUserData(
                    screenName: screenName
                )
            }

            shield.sendDeviceSignature(userData: userData) { sessionId, error in
                let pluginResult: CDVPluginResult?
                if let error = error {
                    pluginResult = CDVPluginResult(
                        status: .error,
                        messageAs: self.shieldErrorMessage(error)
                    )
                } else {
                    pluginResult = CDVPluginResult(
                        status: .ok,
                        messageAs: sessionId ?? shield.sessionId
                    )
                }
                self.sendPluginResult(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    @objc(isShieldInitialized:) func isShieldInitialized(command: CDVInvokedUrlCommand) {
        let pluginResult = CDVPluginResult(
            status: .ok,
            messageAs: ShieldFraudPlugin.shieldInstance != nil
        )
        self.sendPluginResult(pluginResult, callbackId: command.callbackId)
    }
}

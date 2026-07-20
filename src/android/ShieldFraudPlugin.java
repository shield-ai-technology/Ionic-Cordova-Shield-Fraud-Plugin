package com.shieldfraud;

import android.app.Application;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;
import com.shield.android.BlockedDialog;
import com.shield.android.Callback;
import com.shield.android.DeviceIntelligence;
import com.shield.android.Environment;
import com.shield.android.LogLevel;
import com.shield.android.Result;
import com.shield.android.Shield;
import com.shield.android.ShieldConfig;
import com.shield.android.ShieldCrossPlatformHelper;
import com.shield.android.ShieldCrossPlatformParams;
import com.shield.android.ShieldError;
import com.shield.android.ShieldFactory;
import com.shield.android.ShieldUserData;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class ShieldFraudPlugin extends CordovaPlugin {

    private static Shield shieldInstance;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final DeviceResultCallbackRouter deviceResultCallbackRouter = new DeviceResultCallbackRouter();

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        try {
            if ("initShieldFraud".equals(action)) {
                initShieldFraud(callbackContext, args);
                return true;
            } else if ("getSessionID".equals(action)) {
                getSessionId(callbackContext);
                return true;
            } else if ("getDeviceResult".equals(action)) {
                getDeviceResult(callbackContext);
                return true;
            } else if ("sendAttributes".equals(action)) {
                sendAttributes(callbackContext, args);
                return true;
            } else if ("sendDeviceSignature".equals(action)) {
                sendDeviceSignature(callbackContext, args);
                return true;
            } else if ("isShieldInitialized".equals(action)) {
                isShieldInitialized(callbackContext);
                return true;
            }
        } catch (Exception exception) {
            if ("initShieldFraud".equals(action)) {
                shieldInstance = null;
                deviceResultCallbackRouter.clear();
            }
            sendExceptionError(callbackContext, action, exception);
            return true;
        }
        return false;
    }

    @Override
    public void onReset() {
        deviceResultCallbackRouter.clear();
        super.onReset();
    }

    private void initShieldFraud(CallbackContext callbackContext, JSONArray args) {
        if (args == null) {
            callbackContext.error("Invalid arguments");
            return;
        }

        JSONObject payload = args.optJSONObject(0);
        if (payload == null) {
            callbackContext.error("Invalid arguments");
            return;
        }

        String siteID = payload.optString("siteID", "").trim();
        String key = payload.optString("secretKey", "").trim();

        if (siteID.isEmpty() || key.isEmpty()) {
            callbackContext.error("siteID and secretKey are required");
            return;
        }

        boolean enableDeviceResultListener = payload.optBoolean("enableDeviceResultListener", false);
        if (ShieldFraudPlugin.shieldInstance != null) {
            if (enableDeviceResultListener) {
                deviceResultCallbackRouter.setCallbackContext(callbackContext);
                JSONObject cachedResult = shieldInstance.getLatestDeviceResult();
                if (cachedResult != null) {
                    deviceResultCallbackRouter.replayCachedResult(cachedResult);
                }
            } else {
                runOnMainThread(() -> callbackContext.success(1));
            }
            return;
        }

        ShieldConfig shieldConfig = new ShieldConfig(siteID, key);
        shieldConfig.setEnvironment(parseEnvironment(payload.optInt("environment", 0)));
        shieldConfig.setLogLevel(parseLogLevel(payload.optInt("logLevel", 0)));
        shieldConfig.setBlockScreenRecording(payload.optBoolean("blockScreenRecording", false));
        String partnerId = payload.optString("partnerId", "");
        if (!partnerId.isEmpty()) {
            shieldConfig.setPartnerId(partnerId);
        }
        Object needBackgroundListenerValue = payload.opt("needBackgroundListener");
        if (needBackgroundListenerValue instanceof Boolean) {
            boolean needBackgroundListener = (Boolean) needBackgroundListenerValue;
            shieldConfig.setNeedBackgroundListener(needBackgroundListener);
        }

        String crossPlatformName = payload.optString("crossPlatformName", "").trim();
        String crossPlatformVersion = payload.optString("crossPlatformVersion", "").trim();
        if (!crossPlatformName.isEmpty() && !crossPlatformVersion.isEmpty()) {
            ShieldCrossPlatformHelper.setCrossPlatformParameters(
                    new ShieldCrossPlatformParams(crossPlatformName, crossPlatformVersion)
            );
        }

        JSONObject dialogArg = payload.optJSONObject("blockedDialog");
        if (dialogArg != null) {
            String dialogTitle = dialogArg.optString("title", "");
            String dialogBody = dialogArg.optString("body", "");
            shieldConfig.setBlockedDialog(new BlockedDialog(dialogTitle, dialogBody));
        }

        Application application = cordova.getActivity().getApplication();
        if (enableDeviceResultListener) {
            deviceResultCallbackRouter.setCallbackContext(callbackContext);
            ShieldFraudPlugin.shieldInstance = ShieldFactory.createShieldWithCallback(
                    application,
                    shieldConfig,
                    deviceResultCallbackRouter
            );
            return;
        }

        ShieldFraudPlugin.shieldInstance = ShieldFactory.createShield(application, shieldConfig);
        runOnMainThread(() -> callbackContext.success(1));
    }

    private void isShieldInitialized(CallbackContext callbackContext) {
        runOnMainThread(() -> callbackContext.success(ShieldFraudPlugin.shieldInstance != null ? 1 : 0));
    }

    private void getSessionId(CallbackContext callbackContext) {
        Shield shield = requireShield(callbackContext);
        if (shield == null) {
            return;
        }

        runOnMainThread(() -> callbackContext.success(shield.getSessionId()));
    }

    private void getDeviceResult(CallbackContext callbackContext) {
        Shield shield = requireShield(callbackContext);
        if (shield == null) {
            return;
        }

        JSONObject result = shield.getLatestDeviceResult();
        if (result != null) {
            runOnMainThread(() -> callbackContext.success(result));
        } else {
            runOnMainThread(() -> callbackContext.error("No device result available"));
        }
    }

    private void sendAttributes(CallbackContext callbackContext, JSONArray args) {
        Shield shield = requireShield(callbackContext);
        if (shield == null) {
            return;
        }

        if (args == null) {
            callbackContext.error("Invalid arguments");
            return;
        }

        try {
            String screenName = args.optString(0);
            JSONObject object = args.getJSONObject(1);
            Map<String, String> data = jsonObjectToHashMap(object);

            shield.sendAttributesWithCallback(screenName, data, new Callback<String>() {
                @Override
                public void onCallback(Result<String> result) {
                    handleStringResult(result, callbackContext);
                }
            });
        } catch (JSONException e) {
            sendExceptionError(callbackContext, "sendAttributes", e);
        }
    }
    
    private void sendDeviceSignature(CallbackContext callbackContext, JSONArray args) {
        Shield shield = requireShield(callbackContext);
        if (shield == null) {
            return;
        }
    
        if (args == null || args.length() == 0) {
            callbackContext.error("Invalid arguments");
            return;
        }
    
        JSONObject payload = args.optJSONObject(0);
        if (payload == null) {
            callbackContext.error("Invalid arguments");
            return;
        }
    
        Object screenNameValue = payload.opt("screenName");
        if (!(screenNameValue instanceof String)) {
            callbackContext.error("Invalid arguments");
            return;
        }
    
        String screenName = (String) screenNameValue;
        String userId = null;
    
        if (payload.has("userId") && !payload.isNull("userId")) {
            Object userIdValue = payload.opt("userId");
            if (!(userIdValue instanceof String)) {
                callbackContext.error("Invalid arguments");
                return;
            }
    
            userId = (String) userIdValue;
        }
    
        ShieldUserData userData = new ShieldUserData(screenName);
    
        if (userId != null && !userId.isEmpty()) {
            userData.setUserId(userId);
        }
    
        shield.sendDeviceSignatureWithCallback(userData, new Callback<String>() {
            @Override
            public void onCallback(Result<String> result) {
                handleStringResult(result, callbackContext);
            }
        });
    }

    private Shield requireShield(CallbackContext callbackContext) {
        if (ShieldFraudPlugin.shieldInstance == null) {
            callbackContext.error("Initialize SDK before calling this method");
            return null;
        }

        return ShieldFraudPlugin.shieldInstance;
    }

    private Environment parseEnvironment(int envValue) {
        switch (envValue) {
            case 1:
                return Environment.DEV;
            case 2:
                return Environment.STAGING;
            default:
                return Environment.PROD;
        }
    }

    private LogLevel parseLogLevel(int logValue) {
        switch (logValue) {
            case 1:
                return LogLevel.INFO;
            case 2:
                return LogLevel.DEBUG;
            case 3:
                return LogLevel.VERBOSE;
            default:
                return LogLevel.NONE;
        }
    }

    private static String shieldErrorToMessage(@Nullable ShieldError shieldError) {
        if (shieldError == null) {
            return "Unknown error";
        }

        if (shieldError.getErrorMessage() != null && !shieldError.getErrorMessage().isEmpty()) {
            return shieldError.getErrorMessage();
        }

        if (shieldError.getErrorCode() != null && !shieldError.getErrorCode().isEmpty()) {
            return shieldError.getErrorCode();
        }

        return shieldError.toString();
    }

    private static void runOnMainThread(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
            return;
        }

        mainHandler.post(runnable);
    }

    private static void handleStringResult(Result<String> result, CallbackContext callbackContext) {
        runOnMainThread(() -> {
            try {
                if (result instanceof Result.Success) {
                    String sessionId = ((Result.Success<String>) result).getData();
                    callbackContext.success(sessionId != null ? sessionId : "");
                } else if (result instanceof Result.Failure) {
                    ShieldError shieldError = ((Result.Failure<String>) result).getError();
                    callbackContext.error(shieldErrorToMessage(shieldError));
                } else {
                    callbackContext.error("Unexpected SDK result");
                }
            } catch (Exception exception) {
                sendExceptionError(callbackContext, "processing SDK callback", exception);
            }
        });
    }

    private static void sendExceptionError(
            CallbackContext callbackContext,
            String action,
            Exception exception
    ) {
        String detail = exception.getMessage();
        if (detail == null || detail.isEmpty()) {
            detail = exception.getClass().getSimpleName();
        }
        String message = "Failed to " + action + ": " + detail;
        runOnMainThread(() -> callbackContext.error(message));
    }

    private static final class DeviceResultCallbackRouter implements Callback<DeviceIntelligence> {
        private volatile CallbackContext callbackContext;

        void setCallbackContext(CallbackContext callbackContext) {
            this.callbackContext = callbackContext;
        }

        void clear() {
            callbackContext = null;
        }

        void replayCachedResult(JSONObject cachedResult) {
            sendSuccess(cachedResult);
        }

        @Override
        public void onCallback(Result<DeviceIntelligence> result) {
            runOnMainThread(() -> {
                CallbackContext currentContext = callbackContext;
                if (currentContext == null) {
                    return;
                }

                try {
                    if (result instanceof Result.Success) {
                        DeviceIntelligence intelligence = ((Result.Success<DeviceIntelligence>) result).getData();
                        JSONObject payload = intelligence != null ? intelligence.getData() : null;
                        sendSuccess(payload != null ? payload : new JSONObject());
                    } else if (result instanceof Result.Failure) {
                        ShieldError shieldError = ((Result.Failure<DeviceIntelligence>) result).getError();
                        sendError(shieldErrorToMessage(shieldError));
                    } else {
                        sendError("Unexpected SDK result");
                    }
                } catch (Exception exception) {
                    String detail = exception.getMessage();
                    sendError(detail != null && !detail.isEmpty()
                            ? detail
                            : exception.getClass().getSimpleName());
                }
            });
        }

        private void sendSuccess(JSONObject payload) {
            runOnMainThread(() -> {
                CallbackContext currentContext = callbackContext;
                if (currentContext == null) {
                    return;
                }
                PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, payload);
                pluginResult.setKeepCallback(true);
                currentContext.sendPluginResult(pluginResult);
            });
        }

        private void sendError(String message) {
            runOnMainThread(() -> {
                CallbackContext currentContext = callbackContext;
                if (currentContext == null) {
                    return;
                }
                PluginResult pluginResult = new PluginResult(PluginResult.Status.ERROR, message);
                pluginResult.setKeepCallback(true);
                currentContext.sendPluginResult(pluginResult);
            });
        }
    }

    private static HashMap<String, String> jsonObjectToHashMap(JSONObject jsonObject) throws JSONException {
        HashMap<String, String> hashMap = new HashMap<>();
        Iterator<String> iterator = jsonObject.keys();
        while (iterator.hasNext()) {
            String key = iterator.next();
            String value = jsonObject.getString(key);
            hashMap.put(key, value);
        }
        return hashMap;
    }
}

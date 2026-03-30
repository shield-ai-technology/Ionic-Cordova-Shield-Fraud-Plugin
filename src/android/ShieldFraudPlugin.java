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
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        if (action.equals("initShieldFraud")) {
            initShieldFraud(callbackContext, args);
            return true;
        } else if (action.equals("getSessionID")) {
            getSessionId(callbackContext);
            return true;
        } else if (action.equals("getDeviceResult")) {
            getDeviceResult(callbackContext);
            return true;
        } else if (action.equals("sendAttributes")) {
            sendAttributes(callbackContext, args);
            return true;
        } else if (action.equals("sendDeviceSignature")) {
            String screenName = args.getString(0);
            sendDeviceSignature(callbackContext, screenName);
            return true;
        } else if (action.equals("isShieldInitialized")) {
            isShieldInitialized(callbackContext);
            return true;
        } else if (action.equals("setCrossPlatformParameters")) {
            setCrossPlatformParameters(callbackContext, args);
            return true;
        }
        return false;
    }

    private void initShieldFraud(CallbackContext callbackContext, JSONArray args) {
        if (ShieldFraudPlugin.shieldInstance != null) {
            runOnMainThread(() -> callbackContext.success(1));
            return;
        }

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

        ShieldConfig shieldConfig = new ShieldConfig(siteID, key);
        shieldConfig.setEnvironment(parseEnvironment(payload.optInt("environment", 0)));
        shieldConfig.setLogLevel(parseLogLevel(payload.optInt("logLevel", 0)));
        shieldConfig.setBlockScreenRecording(payload.optBoolean("blockScreenRecording", false));

        JSONObject dialogArg = payload.optJSONObject("blockedDialog");
        if (dialogArg != null) {
            String dialogTitle = dialogArg.optString("title", "");
            String dialogBody = dialogArg.optString("body", "");
            shieldConfig.setBlockedDialog(new BlockedDialog(dialogTitle, dialogBody));
        }

        boolean enableDeviceResultListener = payload.optBoolean("enableDeviceResultListener", false);

        try {
            Application application = cordova.getActivity().getApplication();
            if (enableDeviceResultListener) {
                ShieldFraudPlugin.shieldInstance = ShieldFactory.createShieldWithCallback(
                        application,
                        shieldConfig,
                        new Callback<DeviceIntelligence>() {
                            @Override
                            public void onCallback(Result<DeviceIntelligence> result) {
                                runOnMainThread(() -> {
                                    if (result instanceof Result.Success) {
                                        DeviceIntelligence intelligence = ((Result.Success<DeviceIntelligence>) result).getData();
                                        JSONObject payload = intelligence != null ? intelligence.getData() : null;
                                        PluginResult pluginResult = new PluginResult(
                                                PluginResult.Status.OK,
                                                payload != null ? payload : new JSONObject()
                                        );
                                        pluginResult.setKeepCallback(true);
                                        callbackContext.sendPluginResult(pluginResult);
                                        return;
                                    }

                                    if (result instanceof Result.Failure) {
                                        ShieldError shieldError = ((Result.Failure<DeviceIntelligence>) result).getError();
                                        PluginResult pluginResult = new PluginResult(
                                                PluginResult.Status.ERROR,
                                                shieldErrorToMessage(shieldError)
                                        );
                                        pluginResult.setKeepCallback(true);
                                        callbackContext.sendPluginResult(pluginResult);
                                    }
                                });
                            }
                        }
                );
                return;
            }

            ShieldFraudPlugin.shieldInstance = ShieldFactory.createShield(application, shieldConfig);
            runOnMainThread(() -> callbackContext.success(1));
        } catch (Throwable throwable) {
            ShieldFraudPlugin.shieldInstance = null;
            runOnMainThread(() -> callbackContext.error(throwable.getMessage() != null ? throwable.getMessage() : "Failed to initialize Shield SDK"));
        }
    }

    private void isShieldInitialized(CallbackContext callbackContext) {
        runOnMainThread(() -> callbackContext.success(ShieldFraudPlugin.shieldInstance != null ? 1 : 0));
    }

    private void setCrossPlatformParameters(CallbackContext callbackContext, JSONArray args) {
        if (args == null) {
            runOnMainThread(() -> callbackContext.error("Invalid arguments"));
            return;
        }

        String name = args.optString(0, "").trim();
        String version = args.optString(1, "").trim();

        if (name.isEmpty() || version.isEmpty()) {
            runOnMainThread(() -> callbackContext.error("name and version are required"));
            return;
        }

        try {
            ShieldCrossPlatformHelper.setCrossPlatformParameters(new ShieldCrossPlatformParams(name, version));
            runOnMainThread(() -> callbackContext.success());
        } catch (Throwable throwable) {
            runOnMainThread(() -> callbackContext.error(throwable.getMessage() != null ? throwable.getMessage() : "Failed to set cross platform parameters"));
        }
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
                    runOnMainThread(() -> {
                        if (result instanceof Result.Success) {
                            String sessionId = ((Result.Success<String>) result).getData();
                            callbackContext.success(sessionId != null ? sessionId : "");
                            return;
                        }

                        if (result instanceof Result.Failure) {
                            ShieldError shieldError = ((Result.Failure<String>) result).getError();
                            callbackContext.error(shieldErrorToMessage(shieldError));
                        }
                    });
                }
            });
        } catch (JSONException e) {
            runOnMainThread(() -> callbackContext.error(e.getMessage()));
        }
    }

    private void sendDeviceSignature(CallbackContext callbackContext, String screenName) {
        Shield shield = requireShield(callbackContext);
        if (shield == null) {
            return;
        }

        shield.sendDeviceSignatureWithCallback(screenName, new Callback<String>() {
            @Override
            public void onCallback(Result<String> result) {
                runOnMainThread(() -> {
                    if (result instanceof Result.Success) {
                        JSONObject latestDeviceResult = shield.getLatestDeviceResult();
                        if (latestDeviceResult != null) {
                            callbackContext.success(latestDeviceResult);
                        } else {
                            callbackContext.error("No device result available");
                        }
                        return;
                    }

                    if (result instanceof Result.Failure) {
                        ShieldError shieldError = ((Result.Failure<String>) result).getError();
                        callbackContext.error(shieldErrorToMessage(shieldError));
                    }
                });
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

    private String shieldErrorToMessage(@Nullable ShieldError shieldError) {
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

    private void runOnMainThread(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
            return;
        }

        mainHandler.post(runnable);
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

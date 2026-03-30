package com.shieldfraud;

import androidx.annotation.Nullable;

import com.shield.android.BlockedDialog;
import com.shield.android.Shield;
import com.shield.android.ShieldCallback;
import com.shield.android.ShieldException;

import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CallbackContext;

import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;

public class ShieldFraudPlugin extends CordovaPlugin {

    private static boolean isShieldInitialized = false;

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
        }
        return false;
    }

    private void initShieldFraud(CallbackContext callbackContext, JSONArray args) throws JSONException {
        if (ShieldFraudPlugin.isShieldInitialized) {
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

        String siteID = payload.optString("siteID");
        String key    = payload.optString("secretKey");

        int envValue = payload.optInt("environment", 0);
        String environment;
        switch (envValue) {
            case 1:  environment = Shield.ENVIRONMENT_DEV;     break;
            case 2:  environment = Shield.ENVIRONMENT_STAGING; break;
            default: environment = Shield.ENVIRONMENT_PROD;    break;
        }

        // JS LogLevel: NONE=0, INFO=1, DEBUG=2, VERBOSE=3
        int logValue = payload.optInt("logLevel", 0);
        Shield.LogLevel logLevel;
        switch (logValue) {
            case 1:  logLevel = Shield.LogLevel.INFO;    break;
            case 2:  logLevel = Shield.LogLevel.DEBUG;   break;
            case 3:  logLevel = Shield.LogLevel.VERBOSE; break;
            default: logLevel = Shield.LogLevel.NONE;    break;
        }

        Shield.Builder builder = new Shield.Builder(cordova.getActivity(), siteID, key)
                .setEnvironment(environment)
                .setLogLevel(logLevel);

        JSONObject dialogArg = payload.optJSONObject("blockedDialog");
        if (dialogArg != null) {
            String dialogTitle = dialogArg.optString("title", "");
            String dialogBody  = dialogArg.optString("body", "");
            builder.setAutoBlockDialog(new BlockedDialog(dialogTitle, dialogBody));
        }

        Shield shield = builder.registerDeviceShieldCallback(new ShieldCallback<JSONObject>() {
            @Override
            public void onSuccess(@Nullable JSONObject jsonObject) {
                PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, jsonObject != null ? jsonObject.toString() : "{}");
                pluginResult.setKeepCallback(true);
                callbackContext.sendPluginResult(pluginResult);
            }
            @Override
            public void onFailure(@Nullable ShieldException e) {
                PluginResult pluginResult = new PluginResult(PluginResult.Status.ERROR, e != null ? e.message : "Unknown error");
                callbackContext.sendPluginResult(pluginResult);
            }
        }).build();

        Shield.setSingletonInstance(shield);
        ShieldFraudPlugin.isShieldInitialized = true;
    }

    private void isShieldInitialized(CallbackContext callbackContext) {
        callbackContext.success(ShieldFraudPlugin.isShieldInitialized ? 1 : 0);
    }

    private void getSessionId(CallbackContext callbackContext) {
        try {
            String sessionId = Shield.getInstance().getSessionId();
            callbackContext.success(sessionId);
        } catch (IllegalStateException e) {
            callbackContext.error(e.getMessage());
        }
    }

    private void getDeviceResult(CallbackContext callbackContext) {
        try {
            JSONObject result = Shield.getInstance().getLatestDeviceResult();
            if (result != null) {
                callbackContext.success(result.toString());
            } else {
                callbackContext.error("No device result available");
            }
        } catch (IllegalStateException e) {
            callbackContext.error(e.getMessage());
        }
    }

    private void sendAttributes(CallbackContext callbackContext, JSONArray args) {
        if (args == null) {
            callbackContext.error("Invalid arguments");
            return;
        }
        try {
            String screenName = args.optString(0);
            JSONObject object = args.getJSONObject(1);
            HashMap<String, String> data = jsonObjectToHashMap(object);
            Shield.getInstance().sendAttributes(screenName, data, new ShieldCallback<Boolean>() {
                @Override
                public void onSuccess(@Nullable Boolean aBoolean) {
                    callbackContext.success(String.valueOf(aBoolean));
                }
                @Override
                public void onFailure(@Nullable ShieldException e) {
                    callbackContext.error(e != null ? e.message : "Unknown error");
                }
            });
        } catch (JSONException e) {
            callbackContext.error(e.getMessage());
        }
    }

    private void sendDeviceSignature(CallbackContext callbackContext, String screenName) {
        Shield.getInstance().sendDeviceSignature(screenName, new Shield.DeviceResultStateListener() {
            @Override
            public void isReady() {
                callbackContext.success(String.valueOf(true));
            }
        });
    }

    private static HashMap<String, String> jsonObjectToHashMap(JSONObject jsonObject) throws JSONException {
        HashMap<String, String> hashMap = new HashMap<>();
        Iterator<String> iterator = jsonObject.keys();
        while (iterator.hasNext()) {
            String key   = iterator.next();
            String value = jsonObject.getString(key);
            hashMap.put(key, value);
        }
        return hashMap;
    }
}

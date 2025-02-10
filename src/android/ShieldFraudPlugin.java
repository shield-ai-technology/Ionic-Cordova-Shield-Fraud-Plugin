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

/**
 * This class echoes a string called from JavaScript.
 */
public class ShieldFraudPlugin extends CordovaPlugin {
    static boolean isShieldInitialized = false;

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
            sendAttributes(callbackContext,args);
            return true;
        } else if (action.equals("sendDeviceSignature")) {
            String screenName = args.getString(0);
            sendDeviceSignature(callbackContext,screenName);
            return true;
        } else if (action.equals("isShieldInitialized")) {
            isShieldInitialized(callbackContext);
            return true;
        }
        return false;
    }

    private void isShieldInitialized(CallbackContext callbackContext) {
        try {
            callbackContext.success(String.valueOf(ShieldFraudPlugin.isShieldInitialized));
        } catch (IllegalStateException exception) {
            callbackContext.error(String.valueOf(false));
        }
    }

    private void initShieldFraud(CallbackContext callbackContext, JSONArray args) throws JSONException {
        if (args == null || ShieldFraudPlugin.isShieldInitialized) {
            return;
        }
        String siteID = args.optString(0);
        String key = args.optString(1);

        Shield shield = new Shield.Builder(cordova.getActivity(), siteID, key).registerDeviceShieldCallback(new ShieldCallback<JSONObject>() {
            @Override
            public void onSuccess(@Nullable JSONObject jsonObject) {
                PluginResult pluginResult = new PluginResult(PluginResult.Status.OK, jsonObject.toString());
                pluginResult.setKeepCallback(true);
                callbackContext.sendPluginResult(pluginResult);
            }
            @Override
            public void onFailure(@Nullable ShieldException e) {
                PluginResult pluginResult = new PluginResult(PluginResult.Status.ERROR, e.message);
                pluginResult.setKeepCallback(true);
                callbackContext.sendPluginResult(pluginResult);
            }
        }).build();

        Shield.setSingletonInstance(shield);
        ShieldFraudPlugin.isShieldInitialized = true;
    }

    private void getSessionId(CallbackContext callbackContext) {
        try {
            String sessionId = Shield.getInstance().getSessionId();
            callbackContext.success(sessionId);
        } catch (IllegalStateException e) {
            callbackContext.error(e.toString());
        }
    }

    private void getDeviceResult(CallbackContext callbackContext) {
        try {
            JSONObject result = Shield.getInstance().getLatestDeviceResult();
            if (result != null) {
                callbackContext.success(result.toString());
            }
        } catch (IllegalStateException e) {
            callbackContext.error(e.toString());
        }
    }


    private void sendAttributes(CallbackContext callbackContext, JSONArray args) {
        try {
            if (args == null) {
                return;
            }
            String screenName = args.optString(0);
            JSONObject object = args.getJSONObject(1);
            HashMap<String,String> data = jsonObjectToHashMap(object);
            Shield.getInstance().sendAttributes(screenName, data, new ShieldCallback<Boolean>() {
                @Override
                public void onSuccess(@Nullable Boolean aBoolean) {
                    callbackContext.success(String.valueOf(aBoolean));
                }
                @Override
                public void onFailure(@Nullable ShieldException e) {
                    callbackContext.error(e.message);
                }
            });
        } catch (JSONException e) {
            e.printStackTrace();
            callbackContext.error(e.toString());
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
            String key = iterator.next();
            String value = jsonObject.getString(key);
            hashMap.put(key, value);
        }
        return hashMap;
    }
}
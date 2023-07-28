/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Wait for the deviceready event before using any of Cordova's device APIs.
// See https://cordova.apache.org/docs/en/latest/cordova/events/events.html#deviceready
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    // Cordova is now initialized. Have fun!
    
    var config = {siteID: "SITE_ID", secretKey: "SECRET_KEY"}
    
    ShieldFraudPlugin.initShieldFraud(config, success, error);

    ShieldFraudPlugin.isShieldInitialized(initShield);
    
    function initShield(message) {
        console.log("Shield initilize Callback:", message);
        ShieldFraudPlugin.getDeviceResult(successDeviceResult, errorDeviceResult);
        ShieldFraudPlugin.getSessionID(errorSessionID, successSessionID);
        
        var data = {"user_id": "12345abcdef", "email": "test@gmail.com"}
        ShieldFraudPlugin.sendAttributes("Test", data, sendAttributesStatus);
    }
    
    function sendAttributesStatus(status) {
        console.log("sendAttributesStatus Callback:", status);
    }
    
    function success(message) {
        console.log("Akash Succcess Callback:", message);
    }
    
    function error(error) {
        console.log("Akash Error Callback:", error);
    }
    
    function successDeviceResult(message) {
        console.log("DeviceResult Succcess Callback:", message);
    }
    
    function errorDeviceResult(error) {
        console.log("DeviceResult Error Callback:", error);
    }
    
    function successSessionID(message) {
        console.log("SessionID Succcess Callback:", message);
    }
    
    function errorSessionID(error) {
        console.log("SessionID Error Callback:", error);
    }
    
    console.log('Running cordova-' + cordova.platformId + '@' + cordova.version);
    document.getElementById('deviceready').classList.add('ready');
}

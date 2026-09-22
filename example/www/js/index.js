/*
 * SHIELD Fraud Ionic-Cordova Plugin Example Application
 */

(function () {
    'use strict';

    var LOG_TAG = "[ShieldIonicExample]";

    var state = {
        jsonString: "",
        errorMessage: null,
        isLoading: true,
        isSending: false
    };

    function log(message) {
        console.log(LOG_TAG + " " + message);
    }

    var toastTimeout = null;
    function showToast(message, type, duration) {
        type = type || "info";
        duration = duration || 3500;
        var container = document.getElementById("toast-container");
        if (!container) return;

        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toastTimeout = null;
        }

        container.textContent = message;
        container.className = "toast-container toast-" + type;

        toastTimeout = setTimeout(function () {
            container.className = "toast-container hidden";
        }, duration);
    }

    // -------------------------------------------------
    // UI RENDER
    // -------------------------------------------------

    function render() {
        var loadingEl = document.getElementById("state-loading");
        var errorEl = document.getElementById("state-error");
        var errorTextEl = document.getElementById("error-text");
        var emptyEl = document.getElementById("state-empty");
        var successEl = document.getElementById("state-success");
        var jsonTextEl = document.getElementById("json-text");

        var btnSig = document.getElementById("btn-signature");
        var btnAttr = document.getElementById("btn-attributes");

        // Update button states
        if (btnSig) btnSig.disabled = state.isSending;
        if (btnAttr) btnAttr.disabled = state.isSending;

        // Hide all state containers first
        if (loadingEl) loadingEl.classList.add("hidden");
        if (errorEl) errorEl.classList.add("hidden");
        if (emptyEl) emptyEl.classList.add("hidden");
        if (successEl) successEl.classList.add("hidden");

        if (state.isLoading) {
            if (loadingEl) loadingEl.classList.remove("hidden");
            return;
        }

        if (state.errorMessage) {
            if (errorTextEl) errorTextEl.textContent = state.errorMessage;
            if (errorEl) errorEl.classList.remove("hidden");
            return;
        }

        if (!state.jsonString) {
            if (emptyEl) emptyEl.classList.remove("hidden");
            return;
        }

        if (jsonTextEl) jsonTextEl.textContent = state.jsonString;
        if (successEl) successEl.classList.remove("hidden");
    }

    // -------------------------------------------------
    // SDK INIT (Crash Safe + Timeout Safe)
    // -------------------------------------------------

    function initShield() {
        if (!window.ShieldFraudPlugin) {
            log("ShieldFraudPlugin not found on window object.");
            state.errorMessage = "ShieldFraudPlugin not loaded. Make sure Cordova is ready.";
            state.isLoading = false;
            render();
            return;
        }

        try {
            var shieldCallback = {
                onSuccess: function (result) {
                    var parsed = (typeof result === "string") ? (function () {
                        try { return JSON.parse(result); } catch (e) { return result; }
                    })() : result;

                    var sid = (parsed && (parsed.session_id || parsed.sessionId)) || "";
                    log("SHIELD_VERIFIED_SESSION_ID: " + sid);

                    state.jsonString = JSON.stringify(parsed, null, 2);
                    state.errorMessage = null;
                    state.isLoading = false;
                    render();
                },
                onFailure: function (error) {
                    var errObj = error || {};
                    var code = errObj.code !== undefined ? errObj.code : "UNKNOWN";
                    var message = errObj.message || (typeof error === "string" ? error : "Unknown error");
                    var exception = errObj.exception || "";

                    log("Device Result ERROR code=" + code + ", message=" + message + ", exception=" + exception);

                    state.errorMessage = exception ? (code + " : " + message + "\n" + exception) : (code + " : " + message);
                    state.isLoading = false;
                    render();
                }
            };

            // Timeout protection (prevents infinite spinner)
            var initTimeout = setTimeout(function () {
                if (state.isLoading) {
                    log("Initialization timed out after 15s.");
                    state.isLoading = false;
                    render();
                }
            }, 15000);

            window.ShieldFraudPlugin.isShieldInitialized(function (alreadyInit) {
                if (!alreadyInit) {
                    var siteId = (window.SHIELD_ENV && window.SHIELD_ENV.SHIELD_SITE_ID) || window.SHIELD_SITE_ID || "SITE_ID";
                    var secretKey = (window.SHIELD_ENV && window.SHIELD_ENV.SHIELD_SECRET_KEY) || window.SHIELD_SECRET_KEY || "SECRET_KEY";

                    var config = {
                        siteID: siteId,
                        secretKey: secretKey,
                        environment: (window.ShieldFraudPlugin.Environment && window.ShieldFraudPlugin.Environment.PROD !== undefined) ? window.ShieldFraudPlugin.Environment.PROD : 0,
                        logLevel: (window.ShieldFraudPlugin.LogLevel && window.ShieldFraudPlugin.LogLevel.VERBOSE !== undefined) ? window.ShieldFraudPlugin.LogLevel.VERBOSE : 3,
                        blockScreenRecording: true,
                        blockedDialog: {
                            title: "Access Blocked",
                            body: "This device does not meet the required security checks."
                        },
                        partnerId: "2444666666",
                        needBackgroundListener: true
                    };

                    window.ShieldFraudPlugin.initShieldFraud(config, shieldCallback);
                } else {
                    clearTimeout(initTimeout);
                    window.ShieldFraudPlugin.getDeviceResult(function (latest) {
                        if (latest) {
                            var parsed = (typeof latest === "string") ? (function () {
                                try { return JSON.parse(latest); } catch (e) { return latest; }
                            })() : latest;

                            state.jsonString = JSON.stringify(parsed, null, 2);
                            state.errorMessage = null;
                        } else {
                            state.errorMessage = "No latest device result available";
                        }
                        state.isLoading = false;
                        render();
                    }, function (err) {
                        var errObj = err || {};
                        var code = errObj.code !== undefined ? errObj.code : "";
                        var msg = errObj.message || (typeof err === "string" ? err : "Error fetching latest result");
                        state.errorMessage = code ? (code + " : " + msg) : msg;
                        state.isLoading = false;
                        render();
                    });
                }
            }, function (checkErr) {
                log("isShieldInitialized error: " + JSON.stringify(checkErr));
                // Fallback to init
                var siteId = (window.SHIELD_ENV && window.SHIELD_ENV.SHIELD_SITE_ID) || window.SHIELD_SITE_ID || "SITE_ID";
                var secretKey = (window.SHIELD_ENV && window.SHIELD_ENV.SHIELD_SECRET_KEY) || window.SHIELD_SECRET_KEY || "SECRET_KEY";
                var config = {
                    siteID: siteId,
                    secretKey: secretKey,
                    environment: 0,
                    logLevel: 3,
                    blockScreenRecording: true,
                    blockedDialog: {
                        title: "Access Blocked",
                        body: "This device does not meet the required security checks."
                    },
                    partnerId: "2444666666",
                    needBackgroundListener: true
                };
                window.ShieldFraudPlugin.initShieldFraud(config, shieldCallback);
            });
        } catch (e) {
            log("Init Exception: " + e.message);
            state.errorMessage = e.message || String(e);
            state.isLoading = false;
            render();
        }
    }

    // -------------------------------------------------
    // SWIPE / REFRESH LATEST RESULT
    // -------------------------------------------------

    function refreshLatestResult() {
        log("Refresh triggered");
        var ptrIndicator = document.getElementById("ptr-indicator");
        if (ptrIndicator) ptrIndicator.classList.add("active");

        if (!window.ShieldFraudPlugin) {
            if (ptrIndicator) ptrIndicator.classList.remove("active");
            showToast("ShieldFraudPlugin not available", "error");
            return;
        }

        window.ShieldFraudPlugin.getDeviceResult(function (latest) {
            if (ptrIndicator) ptrIndicator.classList.remove("active");
            if (latest) {
                var parsed = (typeof latest === "string") ? (function () {
                    try { return JSON.parse(latest); } catch (e) { return latest; }
                })() : latest;

                state.jsonString = JSON.stringify(parsed, null, 2);
                state.errorMessage = null;
                log("Latest device result refreshed");
                showToast("Device Result Refreshed", "success");
            } else {
                state.errorMessage = "No latest device result available";
                log("Latest device result unavailable");
                showToast("No device result available", "info");
            }
            render();
        }, function (error) {
            if (ptrIndicator) ptrIndicator.classList.remove("active");
            var errObj = error || {};
            var code = errObj.code !== undefined ? errObj.code : "";
            var msg = errObj.message || (typeof error === "string" ? error : "Refresh failed");
            log("Refresh error: " + code + " " + msg);
            state.errorMessage = code ? (code + " : " + msg) : msg;
            showToast("Refresh Failed: " + (code ? code + " " + msg : msg), "error");
            render();
        });
    }

    // -------------------------------------------------
    // BUTTON ACTIONS (Tap Safe)
    // -------------------------------------------------

    function sendSignature(userId) {
        if (state.isSending) return;

        state.isSending = true;
        render();

        log("Manual Signature Triggered with userId = " + userId);

        if (!window.ShieldFraudPlugin) {
            state.isSending = false;
            state.errorMessage = "ShieldFraudPlugin not available";
            showToast("ShieldFraudPlugin not available", "error");
            render();
            return;
        }

        showToast("Sending Device Signature...", "info", 1500);

        window.ShieldFraudPlugin.sendDeviceSignature("manual", function (result) {
            state.isSending = false;
            var sessionId = "";
            if (typeof result === "string") {
                sessionId = result;
            } else if (result && (result.sessionId || result.session_id)) {
                sessionId = result.sessionId || result.session_id;
            }

            if (sessionId) {
                log("Signature success = true ::: sessionId = " + sessionId);
                state.errorMessage = null;
                showToast("Signature Success: " + sessionId, "success");
            } else {
                log("Signature completed with response: " + JSON.stringify(result));
                showToast("Signature Completed", "success");
            }
            render();
        }, function (error) {
            state.isSending = false;
            var errObj = error || {};
            var code = errObj.code !== undefined ? errObj.code : "";
            var msg = errObj.message || (typeof error === "string" ? error : "Signature failed");
            log("Signature FAILED ::: " + code + " " + msg);
            state.errorMessage = code ? (code + " : " + msg) : msg;
            showToast("Signature Failed: " + (code ? code + " " + msg : msg), "error");
            render();
        }, userId || undefined);
    }

    function sendAttributes(userId) {
        if (state.isSending) return;

        state.isSending = true;
        render();

        log("Manual Attributes Triggered with userId = " + userId);

        if (!window.ShieldFraudPlugin) {
            state.isSending = false;
            state.errorMessage = "ShieldFraudPlugin not available";
            showToast("ShieldFraudPlugin not available", "error");
            render();
            return;
        }

        showToast("Sending Device Attribute...", "info", 1500);

        window.ShieldFraudPlugin.sendAttributes("login", {
            "user_id": userId
        }, function (result) {
            state.isSending = false;
            var sessionId = "";
            if (typeof result === "string") {
                sessionId = result;
            } else if (result && (result.sessionId || result.session_id)) {
                sessionId = result.sessionId || result.session_id;
            }

            if (sessionId) {
                log("Attributes SUCCESS - sessionId = " + sessionId);
                showToast("Attributes Sent Successfully: " + sessionId, "success");
            } else {
                log("Attributes completed with result: " + JSON.stringify(result));
                showToast("Attributes Sent Successfully", "success");
            }
            state.errorMessage = null;
            render();
        }, function (error) {
            state.isSending = false;
            var errObj = error || {};
            var code = errObj.code !== undefined ? errObj.code : "";
            var msg = errObj.message || (typeof error === "string" ? error : "Attributes failed");
            log("Attributes FAILED ::: " + code + " " + msg);
            state.errorMessage = code ? (code + " : " + msg) : msg;
            showToast("Attributes Failed: " + (code ? code + " " + msg : msg), "error");
            render();
        });
    }

    // -------------------------------------------------
    // DIALOGS
    // -------------------------------------------------

    function showSignatureUserIdDialog() {
        var modal = document.getElementById("modal-signature-userid");
        var input = document.getElementById("input-signature-userid");
        if (input) input.value = "";
        if (modal) {
            modal.classList.remove("hidden");
            if (input) setTimeout(function () { input.focus(); }, 100);
        }
    }

    function hideSignatureUserIdDialog() {
        var modal = document.getElementById("modal-signature-userid");
        if (modal) modal.classList.add("hidden");
    }

    function showUserIdDialog() {
        var modal = document.getElementById("modal-attributes-userid");
        var input = document.getElementById("input-attributes-userid");
        if (input) input.value = "";
        if (modal) {
            modal.classList.remove("hidden");
            if (input) setTimeout(function () { input.focus(); }, 100);
        }
    }

    function hideUserIdDialog() {
        var modal = document.getElementById("modal-attributes-userid");
        if (modal) modal.classList.add("hidden");
    }

    function submitSignatureUserId() {
        var inputSig = document.getElementById("input-signature-userid");
        var val = inputSig ? inputSig.value.trim() : "";
        hideSignatureUserIdDialog();
        sendSignature(val || null);
    }

    function submitUserIdAttributes() {
        var inputAttr = document.getElementById("input-attributes-userid");
        var val = inputAttr ? inputAttr.value.trim() : "";
        if (val.length > 0) {
            hideUserIdDialog();
            sendAttributes(val);
        }
    }

    // Expose handlers globally for inline HTML onclick attributes
    window.showSignatureUserIdDialog = showSignatureUserIdDialog;
    window.hideSignatureUserIdDialog = hideSignatureUserIdDialog;
    window.submitSignatureUserId = submitSignatureUserId;
    window.showUserIdDialog = showUserIdDialog;
    window.hideUserIdDialog = hideUserIdDialog;
    window.submitUserIdAttributes = submitUserIdAttributes;
    window.sendSignature = sendSignature;
    window.sendAttributes = sendAttributes;
    window.refreshLatestResult = refreshLatestResult;

    // -------------------------------------------------
    // EVENT BINDINGS
    // -------------------------------------------------

    function setupEvents() {
        // App bar refresh button
        var btnRefresh = document.getElementById("refresh-button");
        if (btnRefresh && !btnRefresh._bound) {
            btnRefresh._bound = true;
            btnRefresh.addEventListener("click", refreshLatestResult);
        }

        // Bottom buttons
        var btnSig = document.getElementById("btn-signature");
        if (btnSig && !btnSig._bound) {
            btnSig._bound = true;
            btnSig.addEventListener("click", showSignatureUserIdDialog);
        }

        var btnAttr = document.getElementById("btn-attributes");
        if (btnAttr && !btnAttr._bound) {
            btnAttr._bound = true;
            btnAttr.addEventListener("click", showUserIdDialog);
        }

        // Signature Dialog events
        var btnCancelSig = document.getElementById("btn-cancel-signature");
        if (btnCancelSig && !btnCancelSig._bound) {
            btnCancelSig._bound = true;
            btnCancelSig.addEventListener("click", hideSignatureUserIdDialog);
        }

        var btnSendSig = document.getElementById("btn-send-signature");
        if (btnSendSig && !btnSendSig._bound) {
            btnSendSig._bound = true;
            btnSendSig.addEventListener("click", submitSignatureUserId);
        }

        // Attributes Dialog events
        var btnCancelAttr = document.getElementById("btn-cancel-attributes");
        if (btnCancelAttr && !btnCancelAttr._bound) {
            btnCancelAttr._bound = true;
            btnCancelAttr.addEventListener("click", hideUserIdDialog);
        }

        var btnSendAttr = document.getElementById("btn-send-attributes");
        if (btnSendAttr && !btnSendAttr._bound) {
            btnSendAttr._bound = true;
            btnSendAttr.addEventListener("click", submitUserIdAttributes);
        }

        // Pull down touch handling on content area
        var contentArea = document.getElementById("content-area");
        if (contentArea && !contentArea._bound) {
            contentArea._bound = true;
            var startY = 0;
            contentArea.addEventListener("touchstart", function (e) {
                if (contentArea.scrollTop === 0) {
                    startY = e.touches[0].pageY;
                } else {
                    startY = 0;
                }
            }, { passive: true });

            contentArea.addEventListener("touchend", function (e) {
                if (startY > 0) {
                    var endY = e.changedTouches[0].pageY;
                    if (endY - startY > 70 && contentArea.scrollTop === 0) {
                        refreshLatestResult();
                    }
                }
                startY = 0;
            }, { passive: true });
        }
    }

    // -------------------------------------------------
    // APP ENTRY POINT
    // -------------------------------------------------

    function onDeviceReady() {
        log("Cordova deviceready event received.");
        setupEvents();
        render();
        initShield();
    }

    // Attach DOM events immediately
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setupEvents();
    } else {
        document.addEventListener("DOMContentLoaded", setupEvents, false);
    }

    document.addEventListener("deviceready", onDeviceReady, false);

    // Fallback for browser preview if deviceready does not fire
    setTimeout(function () {
        if (state.isLoading && !window.cordova) {
            setupEvents();
            render();
            initShield();
        }
    }, 1000);
})();

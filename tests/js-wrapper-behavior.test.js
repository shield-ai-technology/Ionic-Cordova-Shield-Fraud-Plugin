const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const pluginPath = path.resolve(__dirname, "../www/js/ShieldFraudPlugin.js");

function loadPluginWithCapturedExec() {
    const calls = [];
    const originalLoad = Module._load;

    Module._load = function(request, parent, isMain) {
        if (request === "cordova/exec") {
            return function(success, error, pluginName, action, args) {
                calls.push({ success, error, pluginName, action, args });
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[pluginPath];
    try {
        return {
            plugin: require(pluginPath),
            calls
        };
    } finally {
        Module._load = originalLoad;
    }
}

test("initShieldFraud sends native defaults without an absent partnerId", () => {
    const { plugin, calls } = loadPluginWithCapturedExec();

    plugin.initShieldFraud({ siteID: "site", secretKey: "secret" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].pluginName, "ShieldFraudPlugin");
    assert.equal(calls[0].action, "initShieldFraud");
    assert.equal(calls[0].args.length, 1);
    assert.equal(calls[0].args[0].siteID, "site");
    assert.equal(calls[0].args[0].secretKey, "secret");
    assert.equal(calls[0].args[0].environment, plugin.Environment.PROD);
    assert.equal(calls[0].args[0].logLevel, plugin.LogLevel.NONE);
    assert.equal(calls[0].args[0].enableDeviceResultListener, false);
    assert.equal(Object.hasOwn(calls[0].args[0], "partnerId"), false);
});

test("initShieldFraud forwards a non-empty partnerId unchanged", () => {
    const { plugin, calls } = loadPluginWithCapturedExec();

    plugin.initShieldFraud({
        siteID: "site",
        secretKey: "secret",
        partnerId: "partner-123"
    });

    assert.equal(calls[0].args[0].partnerId, "partner-123");
});

test("initShieldFraud omits empty and non-string partnerId values", () => {
    for (const partnerId of ["", null, 123, {}, []]) {
        const { plugin, calls } = loadPluginWithCapturedExec();

        plugin.initShieldFraud({ siteID: "site", secretKey: "secret", partnerId });

        assert.equal(Object.hasOwn(calls[0].args[0], "partnerId"), false);
    }
});

test("initShieldFraud forwards explicit needBackgroundListener booleans", () => {
    for (const needBackgroundListener of [true, false]) {
        const { plugin, calls } = loadPluginWithCapturedExec();

        plugin.initShieldFraud({
            siteID: "site",
            secretKey: "secret",
            needBackgroundListener
        });

        assert.equal(
            calls[0].args[0].needBackgroundListener,
            needBackgroundListener
        );
    }
});

test("initShieldFraud omits absent and non-boolean needBackgroundListener values", () => {
    for (const configValue of [undefined, null, "false", 0, {}, []]) {
        const { plugin, calls } = loadPluginWithCapturedExec();
        const config = { siteID: "site", secretKey: "secret" };
        if (configValue !== undefined) {
            config.needBackgroundListener = configValue;
        }

        plugin.initShieldFraud(config);

        assert.equal(
            Object.hasOwn(calls[0].args[0], "needBackgroundListener"),
            false
        );
    }
});

test("continuous initialization normalizes JSON results and preserves plain strings", () => {
    const { plugin, calls } = loadPluginWithCapturedExec();
    const results = [];

    plugin.initShieldFraud(
        { siteID: "site", secretKey: "secret" },
        { onSuccess: result => results.push(result), onFailure: assert.fail }
    );

    assert.equal(calls[0].args[0].enableDeviceResultListener, true);
    calls[0].success('{"risk":true}');
    calls[0].success("not-json");
    assert.deepEqual(results, [{ risk: true }, "not-json"]);
});

test("sendAttributes forwards the exact screen name and data", () => {
    const { plugin, calls } = loadPluginWithCapturedExec();
    const data = { orderId: "42" };

    plugin.sendAttributes("Checkout", data);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].pluginName, "ShieldFraudPlugin");
    assert.equal(calls[0].action, "sendAttributes");
    assert.deepEqual(calls[0].args, ["Checkout", data]);
});

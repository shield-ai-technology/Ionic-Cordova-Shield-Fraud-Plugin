#!/usr/bin/env node

/**
 * SHIELD Fraud Ionic-Cordova Plugin - Automated SDK Version Update & Verification Suite
 *
 * Supported flags:
 *   --platform <android|ios|both>  (default: from shield-config.json or 'both')
 *   --androidVersion <version>     (default: from shield-config.json or '2.8.0')
 *   --iosVersion <version>         (default: from shield-config.json or '2.1.0')
 *   --dry-run                      (simulate without running builds or boot commands)
 *   --skip-run                     (update versions/links/credentials without booting/running)
 *   --timeout <ms>                 (verification timeout in milliseconds, default: 120000)
 *   --examplePath <path>           (path to example app, default: ../../ionicexample)
 *   --help, -h                     (show usage guide)
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

const SESSION_ID_REGEX = /\b[a-fA-F0-9]{32}\b/;
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(PLUGIN_ROOT, 'shield-config.json');
const OUTPUT_FILE = path.join(PLUGIN_ROOT, 'shield-output.json');

// Registered cleanup callbacks
const cleanupCallbacks = [];
let cleanupRegistered = false;

function registerCleanup(fn) {
    cleanupCallbacks.push(fn);
    if (!cleanupRegistered) {
        cleanupRegistered = true;
        const runCleanups = () => {
            while (cleanupCallbacks.length > 0) {
                const cb = cleanupCallbacks.pop();
                try {
                    cb();
                } catch (e) {
                    console.error('[Cleanup Error]', e.message);
                }
            }
        };

        process.on('exit', runCleanups);
        process.on('SIGINT', () => {
            runCleanups();
            process.exit(130);
        });
        process.on('SIGTERM', () => {
            runCleanups();
            process.exit(143);
        });
        process.on('uncaughtException', (err) => {
            console.error('[Uncaught Exception]', err);
            runCleanups();
            process.exit(1);
        });
    }
}

/**
 * Parse .env file without external dependencies
 */
function parseEnvFile(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) {
        return env;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
            }
            env[key] = val;
        }
    }
    return env;
}

/**
 * Load config with fallback hierarchy: CLI flags > Process ENV > .env file > shield-config.json > Defaults
 */
function loadConfig(cliArgs = []) {
    const parsedArgs = parseCliArgs(cliArgs);

    let fileConfig = {};
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            console.warn('[Config] Failed to parse shield-config.json:', e.message);
        }
    }

    const localExamplePath = path.resolve(PLUGIN_ROOT, 'example');
    const siblingExamplePath = path.resolve(__dirname, '../../ionicexample');
    const defaultExamplePath = fs.existsSync(localExamplePath) ? localExamplePath : siblingExamplePath;
    const examplePath = parsedArgs.examplePath ? path.resolve(parsedArgs.examplePath) : defaultExamplePath;

    const exampleEnv = parseEnvFile(path.join(examplePath, '.env'));

    const siteId = parsedArgs.siteId || process.env.SHIELD_SITE_ID || exampleEnv.SHIELD_SITE_ID || '';
    const secretKey = parsedArgs.secretKey || process.env.SHIELD_SECRET_KEY || exampleEnv.SHIELD_SECRET_KEY || '';

    return {
        platform: parsedArgs.platform || fileConfig.platform || 'both',
        androidVersion: parsedArgs.androidVersion || fileConfig.androidVersion || '2.8.0',
        iosVersion: parsedArgs.iosVersion || fileConfig.iosVersion || '2.1.0',
        dryRun: Boolean(parsedArgs.dryRun),
        skipRun: Boolean(parsedArgs.skipRun),
        timeout: parsedArgs.timeout ? parseInt(parsedArgs.timeout, 10) : 120000,
        examplePath,
        siteId,
        secretKey,
        help: Boolean(parsedArgs.help)
    };
}

/**
 * Custom CLI arguments parser
 */
function parseCliArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--dry-run') {
            result.dryRun = true;
        } else if (arg === '--skip-run') {
            result.skipRun = true;
        } else if (arg === '--platform') {
            result.platform = args[++i];
        } else if (arg.startsWith('--platform=')) {
            result.platform = arg.split('=')[1];
        } else if (arg === '--androidVersion') {
            result.androidVersion = args[++i];
        } else if (arg.startsWith('--androidVersion=')) {
            result.androidVersion = arg.split('=')[1];
        } else if (arg === '--iosVersion') {
            result.iosVersion = args[++i];
        } else if (arg.startsWith('--iosVersion=')) {
            result.iosVersion = arg.split('=')[1];
        } else if (arg === '--timeout') {
            result.timeout = args[++i];
        } else if (arg.startsWith('--timeout=')) {
            result.timeout = arg.split('=')[1];
        } else if (arg === '--examplePath') {
            result.examplePath = args[++i];
        } else if (arg.startsWith('--examplePath=')) {
            result.examplePath = arg.split('=')[1];
        } else if (arg === '--siteId') {
            result.siteId = args[++i];
        } else if (arg.startsWith('--siteId=')) {
            result.siteId = arg.split('=')[1];
        } else if (arg === '--secretKey') {
            result.secretKey = args[++i];
        } else if (arg.startsWith('--secretKey=')) {
            result.secretKey = arg.split('=')[1];
        }
    }
    return result;
}

/**
 * Update Android native dependency version in src/android/build.gradle
 */
function updateAndroidVersion(pluginRootDir, version) {
    const gradleFile = path.join(pluginRootDir, 'src/android/build.gradle');
    if (!fs.existsSync(gradleFile)) {
        throw new Error(`Android build.gradle not found at ${gradleFile}`);
    }
    let content = fs.readFileSync(gradleFile, 'utf8');
    const regex = /(com\.shield\.android:shield-fraud:)([^"'\r\n]+)/g;
    if (!regex.test(content)) {
        throw new Error('Could not find com.shield.android:shield-fraud dependency in build.gradle');
    }
    content = content.replace(regex, `$1${version}`);
    fs.writeFileSync(gradleFile, content, 'utf8');
    return gradleFile;
}

/**
 * Update iOS native dependency version in plugin.xml
 */
function updateIosVersion(pluginRootDir, version) {
    const pluginXmlFile = path.join(pluginRootDir, 'plugin.xml');
    if (!fs.existsSync(pluginXmlFile)) {
        throw new Error(`plugin.xml not found at ${pluginXmlFile}`);
    }
    let content = fs.readFileSync(pluginXmlFile, 'utf8');
    const regex = /(<pod\s+name="ShieldFraud"\s+spec=")([^"]*)(")/g;
    if (!regex.test(content)) {
        throw new Error('Could not find <pod name="ShieldFraud" spec="..." /> in plugin.xml');
    }
    content = content.replace(regex, `$1${version}$3`);
    fs.writeFileSync(pluginXmlFile, content, 'utf8');
    return pluginXmlFile;
}

/**
 * Update plugin in sibling example app
 */
function syncPluginWithExampleApp(examplePath, pluginRootDir, options = {}) {
    if (!fs.existsSync(examplePath)) {
        throw new Error(`Example app directory does not exist at ${examplePath}`);
    }

    console.log(`[Sync] Updating plugin in example app: ${examplePath}`);
    if (options.dryRun) {
        console.log('[Sync] Dry run: skipping cordova plugin add/prepare');
        return;
    }

    // Ensure platforms/platforms.json exists for Cordova platform detection
    const platformsDir = path.join(examplePath, 'platforms');
    const platformsJsonFile = path.join(platformsDir, 'platforms.json');
    if (fs.existsSync(platformsDir) && !fs.existsSync(platformsJsonFile)) {
        try {
            const detected = {};
            if (fs.existsSync(path.join(platformsDir, 'android'))) detected.android = '14.0.1';
            if (fs.existsSync(path.join(platformsDir, 'ios'))) detected.ios = '8.0.1';
            fs.writeFileSync(platformsJsonFile, JSON.stringify(detected, null, 2), 'utf8');
            console.log('[Sync] Created missing platforms/platforms.json');
        } catch (err) {
            console.warn('[Sync] Could not write platforms.json:', err.message);
        }
    }

    // Ensure config.xml has platform engines declared
    const configXmlPath = path.join(examplePath, 'config.xml');
    if (fs.existsSync(configXmlPath)) {
        try {
            let configXml = fs.readFileSync(configXmlPath, 'utf8');
            let modified = false;
            if (!configXml.includes('engine name="android"')) {
                configXml = configXml.replace('</widget>', '    <engine name="android" spec="^14.0.1" />\n</widget>');
                modified = true;
            }
            if (!configXml.includes('engine name="ios"')) {
                configXml = configXml.replace('</widget>', '    <engine name="ios" spec="^8.0.1" />\n</widget>');
                modified = true;
            }
            if (modified) {
                fs.writeFileSync(configXmlPath, configXml, 'utf8');
                console.log('[Sync] Added missing engines to config.xml');
            }
        } catch (e) {
            console.warn('[Sync] Error verifying config.xml engines:', e.message);
        }
    }

    try {
        // Run cordova prepare
        execSync('cordova prepare', { cwd: examplePath, stdio: 'pipe' });
        console.log('[Sync] cordova prepare completed successfully');
    } catch (e) {
        console.warn('[Sync] cordova prepare returned warning/error, attempting plugin re-add:', e.message);
        try {
            execSync(`cordova plugin add "${pluginRootDir}"`, { cwd: examplePath, stdio: 'pipe' });
            execSync('cordova prepare', { cwd: examplePath, stdio: 'pipe' });
        } catch (addErr) {
            console.error('[Sync] Failed to re-add plugin:', addErr.message);
        }
    }
}

/**
 * Safe Credential Injection & Auto-Init inside example app
 */
function injectCredentialsAndInit(examplePath, siteId, secretKey, options = {}) {
    const targetFile = path.join(examplePath, 'www/js/index.js');
    if (options.dryRun) {
        console.log('[Credentials] Dry run: skipping actual file injection in example app');
        return { targetFile, backupFile: null };
    }

    if (!fs.existsSync(targetFile)) {
        throw new Error(`Target file for injection not found: ${targetFile}`);
    }

    const backupFile = `${targetFile}.backup`;
    const originalContent = fs.readFileSync(targetFile, 'utf8');

    // Create backup
    fs.writeFileSync(backupFile, originalContent, 'utf8');

    // Register cleanup hook
    registerCleanup(() => {
        restoreCredentialsBackup(examplePath);
    });

    const safeSiteId = JSON.stringify(siteId || 'test_site_id');
    const safeSecretKey = JSON.stringify(secretKey || 'test_secret_key');

    const injectionSnippet = `
/* === [SHIELD_AUTOMATION_START] === */
(function() {
    function autoInitShield() {
        console.log('[SHIELD_VERIFICATION] Triggering automatic SDK initialization...');
        if (!window.ShieldFraudPlugin) {
            console.log('[SHIELD_VERIFICATION] Warning: window.ShieldFraudPlugin not found yet.');
            return;
        }

        var config = {
            siteID: ${safeSiteId},
            secretKey: ${safeSecretKey},
            environment: 0,
            logLevel: 2,
            needBackgroundListener: true
        };

        window.ShieldFraudPlugin.initShieldFraud(config, {
            onSuccess: function(result) {
                console.log('[SHIELD_VERIFICATION] initShieldFraud onSuccess: ' + JSON.stringify(result));
            },
            onFailure: function(error) {
                console.log('[SHIELD_VERIFICATION] initShieldFraud onFailure: ' + JSON.stringify(error));
            }
        });

        // Request Session ID
        function pollSessionId(attempts) {
            if (attempts <= 0) return;
            window.ShieldFraudPlugin.getSessionID(function(sessionId) {
                if (sessionId) {
                    console.log('[SHIELD_VERIFICATION] SESSION_ID: ' + sessionId);
                } else {
                    setTimeout(function() { pollSessionId(attempts - 1); }, 500);
                }
            }, function(err) {
                console.log('[SHIELD_VERIFICATION] getSessionID error: ' + JSON.stringify(err));
                setTimeout(function() { pollSessionId(attempts - 1); }, 500);
            });
        }

        setTimeout(function() {
            pollSessionId(10);
        }, 1000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        document.addEventListener('deviceready', autoInitShield, false);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            document.addEventListener('deviceready', autoInitShield, false);
        }, false);
    }
})();
/* === [SHIELD_AUTOMATION_END] === */
`;

    const cleanContent = originalContent.replace(/\/\* === \[SHIELD_AUTOMATION_START\] === \*\/[\s\S]*?\/\* === \[SHIELD_AUTOMATION_END\] === \*\/\s*/g, '').trimEnd();

    const modifiedContent = cleanContent + '\n\n' + injectionSnippet;
    fs.writeFileSync(targetFile, modifiedContent, 'utf8');
    return { targetFile, backupFile };
}

/**
 * Restore index.js from backup file
 */
function restoreCredentialsBackup(examplePath, options = {}) {
    if (options && options.dryRun) {
        return;
    }
    const targetFile = path.join(examplePath, 'www/js/index.js');
    const backupFile = `${targetFile}.backup`;
    if (fs.existsSync(backupFile)) {
        const backupContent = fs.readFileSync(backupFile, 'utf8');
        fs.writeFileSync(targetFile, backupContent, 'utf8');
        fs.unlinkSync(backupFile);
        console.log('[Cleanup] Restored backup file and cleaned up.');
    } else if (fs.existsSync(targetFile)) {
        const currentContent = fs.readFileSync(targetFile, 'utf8');
        const cleanContent = currentContent.replace(/\/\* === \[SHIELD_AUTOMATION_START\] === \*\/[\s\S]*?\/\* === \[SHIELD_AUTOMATION_END\] === \*\/\s*/g, '').trimEnd() + '\n';
        if (cleanContent !== currentContent) {
            fs.writeFileSync(targetFile, cleanContent, 'utf8');
            console.log('[Cleanup] Cleaned automation snippets from index.js.');
        }
    }
}

/**
 * Discover or Boot iOS Simulator
 */
async function discoverOrBootIosSimulator(options = {}) {
    if (options.dryRun) {
        return { deviceId: 'SIMULATOR-IOS-DRY-RUN', name: 'iPhone Simulator (Dry Run)', wasBooted: true };
    }

    try {
        const listJsonStr = execSync('xcrun simctl list devices available -j', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const data = JSON.parse(listJsonStr);
        const devicesByRuntime = data.devices || {};

        let bootedDevice = null;
        let shutdownCandidate = null;

        for (const [runtime, deviceList] of Object.entries(devicesByRuntime)) {
            if (!runtime.toLowerCase().includes('ios')) continue;
            for (const dev of deviceList) {
                if (dev.isAvailable) {
                    if (dev.state === 'Booted') {
                        bootedDevice = dev;
                        break;
                    }
                    if (!shutdownCandidate && dev.name.toLowerCase().includes('iphone')) {
                        shutdownCandidate = dev;
                    }
                }
            }
            if (bootedDevice) break;
        }

        if (bootedDevice) {
            console.log(`[iOS Device] Found booted simulator: ${bootedDevice.name} (${bootedDevice.udid})`);
            return { deviceId: bootedDevice.udid, name: bootedDevice.name, wasBooted: true };
        }

        if (shutdownCandidate) {
            console.log(`[iOS Device] Auto-booting iOS simulator: ${shutdownCandidate.name} (${shutdownCandidate.udid})...`);
            execSync(`xcrun simctl boot ${shutdownCandidate.udid}`, { stdio: 'pipe' });
            execSync('sleep 3');
            return { deviceId: shutdownCandidate.udid, name: shutdownCandidate.name, wasBooted: false };
        }

        throw new Error('No available iOS simulator found.');
    } catch (e) {
        console.warn('[iOS Device] Simulator discovery failed:', e.message);
        return { deviceId: 'booted', name: 'iOS Simulator', wasBooted: true };
    }
}

/**
 * Locate Android emulator executable
 */
function findAndroidEmulatorBinary() {
    const candidates = [
        'emulator',
        path.join(process.env.ANDROID_HOME || '', 'emulator/emulator'),
        path.join(process.env.ANDROID_SDK_ROOT || '', 'emulator/emulator'),
        path.join(os.homedir(), 'Library/Android/sdk/emulator/emulator'),
        path.join(os.homedir(), 'Android/Sdk/emulator/emulator')
    ];

    for (const c of candidates) {
        if (!c) continue;
        try {
            if (c === 'emulator') {
                execSync('which emulator', { stdio: 'pipe' });
                return 'emulator';
            } else if (fs.existsSync(c)) {
                return c;
            }
        } catch (err) {}
    }
    return null;
}

/**
 * Discover or Boot Android Emulator
 */
async function discoverOrBootAndroidEmulator(options = {}) {
    if (options.dryRun) {
        return { deviceId: 'emulator-5554-DRY-RUN', wasBooted: true };
    }

    try {
        const adbDevices = execSync('adb devices', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const lines = adbDevices.split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1] === 'device') {
                console.log(`[Android Device] Found running device/emulator: ${parts[0]}`);
                return { deviceId: parts[0], wasBooted: true };
            }
        }

        console.log('[Android Device] No running emulator detected. Searching for AVDs...');
        const emulatorBin = findAndroidEmulatorBinary();
        if (!emulatorBin) {
            console.warn('[Android Device] Could not locate emulator binary.');
            return { deviceId: 'emulator-5554', wasBooted: false };
        }

        const avdsOutput = execSync(`"${emulatorBin}" -list-avds`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const avds = avdsOutput.split('\n').map(s => s.trim()).filter(Boolean);
        if (avds.length === 0) {
            console.warn('[Android Device] No AVDs configured.');
            return { deviceId: 'emulator-5554', wasBooted: false };
        }

        const targetAvd = avds[0];
        console.log(`[Android Device] Auto-booting AVD "${targetAvd}" with DNS 8.8.8.8,1.1.1.1...`);
        const emulatorProcess = spawn(emulatorBin, ['-avd', targetAvd, '-dns-server', '8.8.8.8,1.1.1.1'], {
            detached: true,
            stdio: 'ignore'
        });
        emulatorProcess.unref();

        // Wait for boot completion
        console.log('[Android Device] Waiting for Android emulator boot completion...');
        const startTime = Date.now();
        while (Date.now() - startTime < 60000) {
            try {
                const bootState = execSync('adb shell getprop sys.boot_completed', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
                if (bootState === '1') {
                    console.log('[Android Device] Emulator fully booted!');
                    break;
                }
            } catch (err) {}
            execSync('sleep 2');
        }

        // Try connecting to AndroidWifi if applicable
        try {
            execSync('adb shell cmd wifi connect-network AndroidWifi open', { stdio: 'pipe' });
        } catch (wifiErr) {}

        const finalAdbDevices = execSync('adb devices', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const match = finalAdbDevices.match(/(\S+)\s+device/);
        const deviceId = match ? match[1] : 'emulator-5554';

        return { deviceId, wasBooted: false };
    } catch (e) {
        console.warn('[Android Device] Device discovery failed:', e.message);
        return { deviceId: 'emulator-5554', wasBooted: false };
    }
}

/**
 * Locate Android APK built by Cordova
 */
function findAndroidApk(examplePath) {
    const candidatePaths = [
        path.join(examplePath, 'platforms/android/app/build/outputs/apk/debug/app-debug.apk'),
        path.join(examplePath, 'platforms/android/build/outputs/apk/debug/app-debug.apk'),
        path.join(examplePath, 'platforms/android/app/build/outputs/apk/app-debug.apk')
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Run Cordova Android and monitor for Session ID
 */
function runAndroidVerification(examplePath, deviceId, timeoutMs = 120000, options = {}) {
    return new Promise((resolve, reject) => {
        if (options.dryRun) {
            return resolve({
                deviceId: deviceId || 'emulator-5554',
                sessionId: '1234567890abcdef1234567890abcdef',
                timestamp: new Date().toISOString(),
                status: 'SUCCESS'
            });
        }

        console.log(`[Android Run] Building and launching Android app on ${deviceId}...`);
        let sessionId = null;
        let resolved = false;

        let activeLogcat = null;
        let fallbackProcess = null;

        const cleanupAndFinish = (resData) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            if (activeLogcat) {
                try { activeLogcat.kill(); } catch (e) {}
            }
            if (fallbackProcess) {
                try { fallbackProcess.kill(); } catch (e) {}
            }
            resolve(resData);
        };

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                if (activeLogcat) {
                    try { activeLogcat.kill(); } catch (e) {}
                }
                if (fallbackProcess) {
                    try { fallbackProcess.kill(); } catch (e) {}
                }
                reject(new Error(`Timeout (${timeoutMs}ms) waiting for Android Session ID verification.`));
            }
        }, timeoutMs);

        try {
            // 1. Build APK
            console.log('[Android Build] Executing cordova build android...');
            execSync('cordova build android', { cwd: examplePath, stdio: 'inherit', env: process.env });

            // 2. Install APK directly via ADB
            const apkPath = findAndroidApk(examplePath);
            if (apkPath && deviceId && !deviceId.includes('DRY-RUN')) {
                console.log(`[Android Deploy] Installing ${apkPath} on ${deviceId}...`);
                execSync(`adb -s "${deviceId}" install -r "${apkPath}"`, { stdio: 'inherit' });

                // 3. Clear logcat buffer and start listener right before launch
                try {
                    execSync(`adb -s "${deviceId}" logcat -c`, { stdio: 'pipe' });
                } catch (e) {}

                const adbArgs = ['-s', deviceId, 'logcat', '-v', 'brief'];
                activeLogcat = spawn('adb', adbArgs);
                activeLogcat.stdout.on('data', (data) => {
                    const text = data.toString();
                    process.stdout.write(`[Android Logcat] ${text}`);
                    const match = extractSessionId(text);
                    if (match) {
                        sessionId = match;
                        console.log(`[Android Verification] Session ID detected: ${sessionId}`);
                        cleanupAndFinish({
                            deviceId: deviceId || 'emulator-5554',
                            sessionId,
                            timestamp: new Date().toISOString(),
                            status: 'SUCCESS'
                        });
                    }
                });

                // 4. Launch MainActivity
                console.log(`[Android Launch] Launching com.shieldfraud.example/.MainActivity on ${deviceId}...`);
                execSync(`adb -s "${deviceId}" shell am start -n com.shieldfraud.example/.MainActivity`, { stdio: 'inherit' });
                return;
            }
        } catch (buildOrDeployErr) {
            console.warn('[Android Direct Runner] Direct adb runner encountered an issue, falling back to cordova run:', buildOrDeployErr.message);
        }

        // Fallback: Run cordova run android
        const cordovaArgs = ['run', 'android'];
        if (deviceId && !deviceId.startsWith('emulator-') && !deviceId.includes('DRY-RUN')) {
            cordovaArgs.push(`--target="${deviceId}"`);
        }
        fallbackProcess = spawn('cordova', cordovaArgs, { cwd: examplePath, shell: true, env: process.env });

        fallbackProcess.stdout.on('data', (data) => {
            const text = data.toString();
            process.stdout.write(`[Android Stdout] ${text}`);
            const match = extractSessionId(text);
            if (match) {
                sessionId = match;
                console.log(`[Android Verification] Session ID detected: ${sessionId}`);
                cleanupAndFinish({
                    deviceId: deviceId || 'emulator-5554',
                    sessionId,
                    timestamp: new Date().toISOString(),
                    status: 'SUCCESS'
                });
            }
        });

        fallbackProcess.stderr.on('data', (data) => {
            process.stderr.write(`[Android Stderr] ${data.toString()}`);
        });

        fallbackProcess.on('error', (err) => {
            console.error('[Android Run] Fallback process error:', err);
        });
    });
}

/**
 * Locate iOS .app bundle built by Cordova
 */
function findIosAppBundle(examplePath) {
    const candidateDirs = [
        path.join(examplePath, 'platforms/ios/build/Debug-iphonesimulator'),
        path.join(examplePath, 'platforms/ios/build/emulator'),
        path.join(examplePath, 'platforms/ios/build/Release-iphonesimulator'),
        path.join(examplePath, 'platforms/ios/build')
    ];
    for (const dir of candidateDirs) {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f.endsWith('.app')) {
                    return path.join(dir, f);
                }
            }
        }
    }
    return null;
}

/**
 * Run Cordova iOS and monitor for Session ID
 */
function runIosVerification(examplePath, iosDevice, timeoutMs = 120000, options = {}) {
    return new Promise((resolve, reject) => {
        const deviceId = typeof iosDevice === 'object' ? iosDevice.deviceId : iosDevice;
        const deviceName = typeof iosDevice === 'object' ? iosDevice.name : null;

        if (options.dryRun) {
            return resolve({
                deviceId: deviceId || 'SIMULATOR-IOS-DRY-RUN',
                sessionId: 'abcdef1234567890abcdef1234567890',
                timestamp: new Date().toISOString(),
                status: 'SUCCESS'
            });
        }

        console.log(`[iOS Run] Building and launching iOS app on ${deviceName || deviceId}...`);
        let sessionId = null;
        let resolved = false;

        let activeProcess = null;
        const cleanupAndFinish = (resData) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            if (activeProcess) {
                try { activeProcess.kill(); } catch (e) {}
            }
            resolve(resData);
        };

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                if (activeProcess) {
                    try { activeProcess.kill(); } catch (e) {}
                }
                reject(new Error(`Timeout (${timeoutMs}ms) waiting for iOS Session ID verification.`));
            }
        }, timeoutMs);

        try {
            // 1. Build the iOS app for emulator
            console.log('[iOS Build] Executing cordova build ios --emulator...');
            execSync('cordova build ios --emulator', { cwd: examplePath, stdio: 'inherit', env: process.env });

            // 2. Locate built .app bundle
            const appBundlePath = findIosAppBundle(examplePath);
            if (appBundlePath && deviceId && deviceId !== 'booted' && !deviceId.includes('DRY-RUN')) {
                console.log(`[iOS Deploy] Installing ${appBundlePath} onto ${deviceId}...`);
                execSync(`xcrun simctl install ${deviceId} "${appBundlePath}"`, { stdio: 'inherit' });

                // Start log stream listener before launching app
                activeProcess = spawn('xcrun', [
                    'simctl', 'spawn', deviceId, 'log', 'stream',
                    '--style', 'compact',
                    '--predicate', 'process CONTAINS "Plugin Example App" OR composedMessage CONTAINS "SESSION_ID" OR composedMessage CONTAINS "Shield" OR composedMessage CONTAINS "com.shieldfraud"'
                ]);

                activeProcess.stdout.on('data', (data) => {
                    const text = data.toString();
                    process.stdout.write(`[iOS Log] ${text}`);
                    const match = extractSessionId(text);
                    if (match) {
                        sessionId = match;
                        console.log(`[iOS Verification] Session ID detected: ${sessionId}`);
                        cleanupAndFinish({
                            deviceId,
                            sessionId,
                            timestamp: new Date().toISOString(),
                            status: 'SUCCESS'
                        });
                    }
                });

                activeProcess.stderr.on('data', (data) => {
                    const text = data.toString();
                    process.stderr.write(`[iOS Log Error] ${text}`);
                    const match = extractSessionId(text);
                    if (match) {
                        sessionId = match;
                        console.log(`[iOS Verification] Session ID detected: ${sessionId}`);
                        cleanupAndFinish({
                            deviceId,
                            sessionId,
                            timestamp: new Date().toISOString(),
                            status: 'SUCCESS'
                        });
                    }
                });

                activeProcess.on('error', (err) => {
                    console.error('[iOS Run] simctl log stream process error:', err);
                });

                console.log(`[iOS Launch] Launching com.shieldfraud.example on ${deviceId}...`);
                execSync(`xcrun simctl launch --terminate-running-process ${deviceId} com.shieldfraud.example`, { stdio: 'inherit' });
                return;
            }
        } catch (buildOrDeployErr) {
            console.warn('[iOS Direct Runner] Direct simctl runner encountered an issue, falling back to cordova run:', buildOrDeployErr.message);
        }

        // Fallback: Run cordova run ios --emulator
        const cordovaArgs = ['run', 'ios', '--emulator'];
        activeProcess = spawn('cordova', cordovaArgs, { cwd: examplePath, shell: true, env: process.env });

        activeProcess.stdout.on('data', (data) => {
            const text = data.toString();
            process.stdout.write(`[iOS Stdout] ${text}`);
            const match = extractSessionId(text);
            if (match) {
                sessionId = match;
                console.log(`[iOS Verification] Session ID detected: ${sessionId}`);
                cleanupAndFinish({
                    deviceId: deviceId || 'booted',
                    sessionId,
                    timestamp: new Date().toISOString(),
                    status: 'SUCCESS'
                });
            }
        });

        activeProcess.stderr.on('data', (data) => {
            process.stderr.write(`[iOS Stderr] ${data.toString()}`);
        });

        activeProcess.on('error', (err) => {
            console.error('[iOS Run] Fallback process error:', err);
        });
    });
}

/**
 * Extract 32-character hex Session ID from text log
 */
function extractSessionId(text, options = {}) {
    if (!text) return null;

    // 1. Explicitly tagged verification / session ID log
    const taggedMatch = text.match(/(?:\[SHIELD_VERIFICATION\]|\[ShieldIonicExample\]|\[Shield Example\]|SHIELD_VERIFIED_SESSION_ID|SESSION_ID|Session ID|session_id|sessionId)[\s:="']+([a-fA-F0-9]{32})/i);
    if (taggedMatch) {
        return taggedMatch[1];
    }

    // 2. JSON structured session_id / sessionId field
    const jsonMatch = text.match(/"(?:session_id|sessionId)"\s*:\s*"([a-fA-F0-9]{32})"/i);
    if (jsonMatch) {
        return jsonMatch[1];
    }

    // 3. Shield SDK context logs with session keyword
    const sessionMatch = text.match(/(?:Session|session|sessionId|session_id)[^\w\n\r]*[:\s=]+["']?([a-fA-F0-9]{32})["']?/i);
    if (sessionMatch) {
        return sessionMatch[1];
    }

    // 4. Fallback to generic 32-character hex if allowGeneralHex is requested
    if (options.allowGeneralHex) {
        const match = text.match(SESSION_ID_REGEX);
        return match ? match[0] : null;
    }

    return null;
}

/**
 * Clear existing shield-output.json
 */
function clearOutputFile() {
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            fs.unlinkSync(OUTPUT_FILE);
            console.log('[Output] Cleared previous shield-output.json');
        } catch (e) {
            console.warn('[Output] Could not remove old shield-output.json:', e.message);
        }
    }
}

/**
 * Write structured output to shield-output.json
 */
function writeOutputFile(data) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Output] Results saved to ${OUTPUT_FILE}`);
}

/**
 * Open file in system viewer
 */
function openInSystemViewer(filePath) {
    try {
        const platform = os.platform();
        if (platform === 'darwin') {
            spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref();
        } else if (platform === 'win32') {
            spawn('cmd.exe', ['/c', 'start', filePath], { detached: true, stdio: 'ignore' }).unref();
        } else {
            spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
        }
    } catch (e) {
        console.warn('[Viewer] Could not open file in system viewer:', e.message);
    }
}

/**
 * Main execution routine
 */
async function main() {
    const config = loadConfig(process.argv.slice(2));

    if (config.help) {
        console.log(`
SHIELD Fraud Ionic-Cordova Automation Runner

Usage:
  node scripts/update-and-run.js [options]

Options:
  --platform <android|ios|both>  Platform to verify (default: both)
  --androidVersion <version>     Android SDK version (default: 2.8.0)
  --iosVersion <version>         iOS SDK version (default: 2.1.0)
  --dry-run                      Simulate execution without running builds
  --skip-run                     Update versions and example app without device boot
  --timeout <ms>                 Timeout in milliseconds for verification (default: 120000)
  --examplePath <path>           Path to example app (default: ../../ionicexample)
  --siteId <id>                  SHIELD Site ID override
  --secretKey <key>              SHIELD Secret Key override
  --help, -h                     Show this help message
`);
        process.exit(0);
    }

    console.log('====================================================');
    console.log('  SHIELD Ionic-Cordova SDK Update & Verification    ');
    console.log('====================================================');
    console.log(`Platform:        ${config.platform}`);
    console.log(`Android Version: ${config.androidVersion}`);
    console.log(`iOS Version:     ${config.iosVersion}`);
    console.log(`Example App:     ${config.examplePath}`);
    console.log(`Dry Run:         ${config.dryRun}`);
    console.log(`Skip Run:        ${config.skipRun}`);
    console.log('----------------------------------------------------');

    // Step 1: Clear previous output
    clearOutputFile();

    // Step 2: Update native dependency versions
    console.log('[Update] Updating Android build.gradle...');
    updateAndroidVersion(PLUGIN_ROOT, config.androidVersion);

    console.log('[Update] Updating iOS plugin.xml podspec...');
    updateIosVersion(PLUGIN_ROOT, config.iosVersion);

    // Step 3: Sibling example app sync & credentials injection
    if (fs.existsSync(config.examplePath)) {
        syncPluginWithExampleApp(config.examplePath, PLUGIN_ROOT, { dryRun: config.dryRun });
        console.log('[Credentials] Injecting credentials & auto-init into example app...');
        injectCredentialsAndInit(config.examplePath, config.siteId, config.secretKey, { dryRun: config.dryRun });
    } else {
        console.warn(`[Warning] Example app path not found: ${config.examplePath}`);
    }

    if (config.skipRun) {
        console.log('[Skip Run] Version updates and credentials configured. Skipping device execution.');
        const skipOutput = {
            status: 'SKIPPED',
            lastUpdated: new Date().toISOString(),
            info: 'Execution skipped due to --skip-run flag'
        };
        writeOutputFile(skipOutput);
        openInSystemViewer(OUTPUT_FILE);
        restoreCredentialsBackup(config.examplePath, { dryRun: config.dryRun });
        return;
    }

    const outputData = {
        status: 'SUCCESS',
        lastUpdated: new Date().toISOString()
    };

    const runAndroid = config.platform === 'android' || config.platform === 'both';
    const runIos = config.platform === 'ios' || config.platform === 'both';

    try {
        if (runAndroid) {
            console.log('\n--- Android Verification ---');
            const androidDevice = await discoverOrBootAndroidEmulator({ dryRun: config.dryRun });
            const androidResult = await runAndroidVerification(
                config.examplePath,
                androidDevice.deviceId,
                config.timeout,
                { dryRun: config.dryRun }
            );
            outputData.android = androidResult;
        }

        if (runIos) {
            console.log('\n--- iOS Verification ---');
            const iosDevice = await discoverOrBootIosSimulator({ dryRun: config.dryRun });
            const iosResult = await runIosVerification(
                config.examplePath,
                iosDevice,
                config.timeout,
                { dryRun: config.dryRun }
            );
            outputData.ios = iosResult;
        }

        // Determine overall status
        const results = [];
        if (outputData.android) results.push(outputData.android.status);
        if (outputData.ios) results.push(outputData.ios.status);
        outputData.status = results.every(s => s === 'SUCCESS') ? 'SUCCESS' : 'FAILED';
    } catch (err) {
        console.error('\n[Error] Verification failed:', err.message);
        outputData.status = 'FAILED';
        outputData.error = err.message;
    } finally {
        // Step 4: Write output & restore backup
        writeOutputFile(outputData);
        openInSystemViewer(OUTPUT_FILE);
        restoreCredentialsBackup(config.examplePath, { dryRun: config.dryRun });
    }

    if (outputData.status !== 'SUCCESS') {
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((e) => {
        console.error('[Fatal Error]', e);
        process.exit(1);
    });
}

module.exports = {
    SESSION_ID_REGEX,
    PLUGIN_ROOT,
    CONFIG_FILE,
    OUTPUT_FILE,
    parseEnvFile,
    parseCliArgs,
    loadConfig,
    updateAndroidVersion,
    updateIosVersion,
    syncPluginWithExampleApp,
    injectCredentialsAndInit,
    restoreCredentialsBackup,
    discoverOrBootIosSimulator,
    discoverOrBootAndroidEmulator,
    runAndroidVerification,
    runIosVerification,
    extractSessionId,
    clearOutputFile,
    writeOutputFile,
    openInSystemViewer,
    main
};

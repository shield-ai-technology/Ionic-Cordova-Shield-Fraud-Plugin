const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    SESSION_ID_REGEX,
    parseEnvFile,
    parseCliArgs,
    loadConfig,
    updateAndroidVersion,
    updateIosVersion,
    injectCredentialsAndInit,
    restoreCredentialsBackup,
    extractSessionId,
    writeOutputFile,
    clearOutputFile,
    runAndroidVerification,
    runIosVerification,
    OUTPUT_FILE
} = require('../update-and-run');

describe('SHIELD Automation Suite Tests', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shield-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        if (fs.existsSync(OUTPUT_FILE)) {
            try { fs.unlinkSync(OUTPUT_FILE); } catch (e) {}
        }
    });

    describe('Session ID Extraction', () => {
        test('extracts valid 32-char lowercase hex session ID', () => {
            const raw = 'Log: [SHIELD_VERIFICATION] SESSION_ID: a1b2c3d4e5f60718293a4b5c6d7e8f90';
            const result = extractSessionId(raw);
            assert.strictEqual(result, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
        });

        test('extracts valid 32-char uppercase hex session ID', () => {
            const raw = 'D/ShieldFraud: Session = A1B2C3D4E5F60718293A4B5C6D7E8F90 in runtime';
            const result = extractSessionId(raw);
            assert.strictEqual(result, 'A1B2C3D4E5F60718293A4B5C6D7E8F90');
        });

        test('extracts session ID from SHIELD_VERIFIED_SESSION_ID log tag', () => {
            const raw = '[ShieldIonicExample] SHIELD_VERIFIED_SESSION_ID: c79c8eed134449ea9430751a34ee9e00';
            const result = extractSessionId(raw);
            assert.strictEqual(result, 'c79c8eed134449ea9430751a34ee9e00');
        });

        test('extracts session ID from JSON string format', () => {
            const raw = '{"platform":"iOS","session_id":"c79c8eed134449ea9430751a34ee9e00","version":"1.1.0"}';
            const result = extractSessionId(raw);
            assert.strictEqual(result, 'c79c8eed134449ea9430751a34ee9e00');
        });

        test('returns null when no valid 32-char hex session ID is present', () => {
            assert.strictEqual(extractSessionId('Short id: 12345'), null);
            assert.strictEqual(extractSessionId('Invalid non-hex: zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), null);
            assert.strictEqual(extractSessionId(''), null);
            assert.strictEqual(extractSessionId(null), null);
        });

        test('matches regex accurately with boundaries', () => {
            const valid = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
            assert.ok(SESSION_ID_REGEX.test(valid));
        });
    });

    describe('CLI Argument Parsing', () => {
        test('parses space-separated flags', () => {
            const args = [
                '--platform', 'ios',
                '--androidVersion', '2.8.0',
                '--iosVersion', '2.1.0',
                '--timeout', '45000',
                '--examplePath', '/tmp/custom-example',
                '--siteId', 'custom_site',
                '--secretKey', 'custom_key'
            ];
            const parsed = parseCliArgs(args);
            assert.strictEqual(parsed.platform, 'ios');
            assert.strictEqual(parsed.androidVersion, '2.8.0');
            assert.strictEqual(parsed.iosVersion, '2.1.0');
            assert.strictEqual(parsed.timeout, '45000');
            assert.strictEqual(parsed.examplePath, '/tmp/custom-example');
            assert.strictEqual(parsed.siteId, 'custom_site');
            assert.strictEqual(parsed.secretKey, 'custom_key');
        });

        test('parses equals-separated flags', () => {
            const args = [
                '--platform=android',
                '--androidVersion=2.8.0',
                '--iosVersion=2.1.0',
                '--timeout=30000',
                '--examplePath=/tmp/app',
                '--siteId=site123',
                '--secretKey=key123'
            ];
            const parsed = parseCliArgs(args);
            assert.strictEqual(parsed.platform, 'android');
            assert.strictEqual(parsed.androidVersion, '2.8.0');
            assert.strictEqual(parsed.iosVersion, '2.1.0');
            assert.strictEqual(parsed.timeout, '30000');
            assert.strictEqual(parsed.examplePath, '/tmp/app');
            assert.strictEqual(parsed.siteId, 'site123');
            assert.strictEqual(parsed.secretKey, 'key123');
        });

        test('parses boolean flags', () => {
            const parsed = parseCliArgs(['--dry-run', '--skip-run', '--help']);
            assert.strictEqual(parsed.dryRun, true);
            assert.strictEqual(parsed.skipRun, true);
            assert.strictEqual(parsed.help, true);
        });
    });

    describe('.env Parser & Config Loading', () => {
        test('parses .env key-value pairs and ignores comments', () => {
            const envPath = path.join(tmpDir, '.env');
            fs.writeFileSync(envPath, `
# SHIELD Config
SHIELD_SITE_ID="test_site_123"
SHIELD_SECRET_KEY='test_secret_456'
OTHER_KEY=simple_value
            `, 'utf8');

            const env = parseEnvFile(envPath);
            assert.strictEqual(env.SHIELD_SITE_ID, 'test_site_123');
            assert.strictEqual(env.SHIELD_SECRET_KEY, 'test_secret_456');
            assert.strictEqual(env.OTHER_KEY, 'simple_value');
        });

        test('returns empty object if .env does not exist', () => {
            const env = parseEnvFile(path.join(tmpDir, 'nonexistent.env'));
            assert.deepStrictEqual(env, {});
        });

        test('loadConfig applies fallback defaults', () => {
            const config = loadConfig(['--platform', 'android']);
            assert.strictEqual(config.platform, 'android');
            assert.strictEqual(config.androidVersion, '2.8.0');
            assert.strictEqual(config.iosVersion, '2.1.0');
            assert.strictEqual(config.timeout, 120000);
            assert.strictEqual(config.dryRun, false);
            assert.strictEqual(config.skipRun, false);
        });

        test('loadConfig reads .env from examplePath if present', () => {
            const exampleEnvPath = path.join(tmpDir, '.env');
            fs.writeFileSync(exampleEnvPath, 'SHIELD_SITE_ID=from_example_app\nSHIELD_SECRET_KEY=from_example_key', 'utf8');
            const config = loadConfig(['--examplePath', tmpDir]);
            assert.strictEqual(config.siteId, 'from_example_app');
            assert.strictEqual(config.secretKey, 'from_example_key');
        });
    });

    describe('Native Version Updates', () => {
        test('updates Android build.gradle dependency version', () => {
            const srcAndroidDir = path.join(tmpDir, 'src/android');
            fs.mkdirSync(srcAndroidDir, { recursive: true });
            const gradleFile = path.join(srcAndroidDir, 'build.gradle');
            fs.writeFileSync(gradleFile, `
dependencies {
  implementation("com.shield.android:shield-fraud:2.7.0")
}
            `, 'utf8');

            updateAndroidVersion(tmpDir, '2.8.0');

            const updatedContent = fs.readFileSync(gradleFile, 'utf8');
            assert.ok(updatedContent.includes('implementation("com.shield.android:shield-fraud:2.8.0")'));
        });

        test('updates iOS plugin.xml podspec version', () => {
            const pluginXmlFile = path.join(tmpDir, 'plugin.xml');
            fs.writeFileSync(pluginXmlFile, `
<?xml version="1.0" encoding="UTF-8"?>
<plugin xmlns="http://apache.org/cordova/ns/plugins/1.0" id="com.shieldfraud" version="2.4.1">
   <platform name="ios">
      <podspec>
         <pods use-frameworks="true">
            <pod name="ShieldFraud" spec="2.0.0"/>
         </pods>
      </podspec>
   </platform>
</plugin>
            `, 'utf8');

            updateIosVersion(tmpDir, '2.1.0');

            const updatedContent = fs.readFileSync(pluginXmlFile, 'utf8');
            assert.ok(updatedContent.includes('<pod name="ShieldFraud" spec="2.1.0"/>'));
        });
    });

    describe('Safe Credential Injection & Restoration', () => {
        test('injects credentials and auto-init code, and creates backup', () => {
            const jsDir = path.join(tmpDir, 'www/js');
            fs.mkdirSync(jsDir, { recursive: true });
            const indexJs = path.join(jsDir, 'index.js');
            const originalCode = 'console.log("hello original ionic app");';
            fs.writeFileSync(indexJs, originalCode, 'utf8');

            const { targetFile, backupFile } = injectCredentialsAndInit(tmpDir, 'test_site', 'test_secret');

            assert.strictEqual(targetFile, indexJs);
            assert.ok(fs.existsSync(backupFile));
            assert.strictEqual(fs.readFileSync(backupFile, 'utf8'), originalCode);

            const modifiedContent = fs.readFileSync(indexJs, 'utf8');
            assert.ok(modifiedContent.includes('test_site'));
            assert.ok(modifiedContent.includes('test_secret'));
            assert.ok(modifiedContent.includes('[SHIELD_AUTOMATION_START]'));

            // Test restore
            restoreCredentialsBackup(tmpDir);
            assert.ok(!fs.existsSync(backupFile));
            assert.strictEqual(fs.readFileSync(indexJs, 'utf8'), originalCode);
        });
    });

    describe('Output File Management & Dry Run Verification', () => {
        test('writes and clears shield-output.json', () => {
            clearOutputFile();
            assert.ok(!fs.existsSync(OUTPUT_FILE));

            const payload = {
                status: 'SUCCESS',
                lastUpdated: new Date().toISOString(),
                android: {
                    deviceId: 'emulator-5554',
                    sessionId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                    timestamp: new Date().toISOString(),
                    status: 'SUCCESS'
                }
            };

            writeOutputFile(payload);
            assert.ok(fs.existsSync(OUTPUT_FILE));

            const readBack = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            assert.strictEqual(readBack.status, 'SUCCESS');
            assert.strictEqual(readBack.android.sessionId, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');

            clearOutputFile();
            assert.ok(!fs.existsSync(OUTPUT_FILE));
        });

        test('runAndroidVerification and runIosVerification return success in dry-run mode', async () => {
            const androidResult = await runAndroidVerification(tmpDir, 'emulator-5554', 1000, { dryRun: true });
            assert.strictEqual(androidResult.status, 'SUCCESS');
            assert.strictEqual(androidResult.sessionId.length, 32);

            const iosResult = await runIosVerification(tmpDir, 'SIM-UDID-123', 1000, { dryRun: true });
            assert.strictEqual(iosResult.status, 'SUCCESS');
            assert.strictEqual(iosResult.sessionId.length, 32);
        });
    });
});

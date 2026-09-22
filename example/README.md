# Example app

Run these commands from this `example/` directory after cloning the repository:

```sh
npm ci
cordova platform add android # or: cordova platform add ios
npm run link-plugin
cordova run android         # or: cordova run ios
```

`link-plugin` links the plugin source in the parent directory. The example is nested inside the plugin repository, so a normal local plugin copy would recursively copy the example into itself. Add the first platform before linking the plugin. Additional platforms can be added after the plugin is linked.

Create `example/.env` with `SHIELD_SITE_ID` and `SHIELD_SECRET_KEY` before running the app. The build hook generates `www/js/env.js` from those values.

After changing native plugin code, refresh its platform installation:

```sh
cordova plugin rm com.shieldfraud --nosave
npm run link-plugin
```

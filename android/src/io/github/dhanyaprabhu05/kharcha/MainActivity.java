package io.github.dhanyaprabhu05.kharcha;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Kharcha's Android shell.
 *
 * The whole app -- screens, SMS parser, storage -- is the same tested web code
 * that runs on the website. It is bundled inside the APK and served to a
 * WebView from a private https origin, so it behaves exactly like the website
 * but with no network involved at all.
 *
 * This class adds only what a website cannot do: read bank SMS from the phone,
 * and save a backup file. Everything else stays in JavaScript.
 */
public class MainActivity extends Activity {

    private static final String TAG = "Kharcha";

    /** Never resolves on the network; the WebView only ever sees our assets. */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private static final int REQUEST_SMS = 1;
    private static final int REQUEST_OPEN_FILE = 2;
    private static final int REQUEST_SAVE_FILE = 3;

    /**
     * Sender-ID fragments of banks and payment apps ("VK-UNIONB", "AD-ICICIB").
     * Only messages from senders matching these are ever handed to the app;
     * personal chats never leave the SMS store. Mirrors js/smsbackup.js.
     */
    private static final String[] BANK_SENDER_CODES = {
        "UNIONB", "UBOI", "UBIN", "ANDBNK", "CORPBK",
        "ICICI", "HDFC", "SBI", "AXIS", "KOTAK", "PNB", "BOB", "BOI", "CANBNK",
        "CANARA", "IDBI", "IDFC", "INDUS", "YESBNK", "RBL", "FEDBNK", "FEDERAL",
        "SIB", "CSB", "KVB", "TMB", "INDBNK", "IOB", "UCO", "CENTBK", "AUBANK",
        "BANDHN", "JUPITER", "FISUPI", "PAYTM", "PHONPE", "PHONEPE", "GPAY",
        "AMZNPAY", "SLICE", "CRED",
    };

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
    }

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSaveText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setBars("#0d1117", true);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);          // IndexedDB and localStorage
        settings.setAllowFileAccess(false);            // assets come only via the https origin
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "KharchaNative");
        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // Coming back to the app is usually right after paying: read new SMS.
        dispatch("kharcha-resume", "{}");
        watchInbox(true);
    }

    @Override
    protected void onPause() {
        watchInbox(false);
        web.onPause();
        super.onPause();
    }

    /* ------------------------------------------- new SMS while open */

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable smsArrived = () -> dispatch("kharcha-sms", "{}");

    /** Told by Android whenever the SMS store changes, only while the app is on screen. */
    private final ContentObserver inboxObserver = new ContentObserver(main) {
        @Override
        public void onChange(boolean selfChange) {
            // A long SMS arrives in parts and fires several changes; wait for it to settle.
            main.removeCallbacks(smsArrived);
            main.postDelayed(smsArrived, 1500);
        }
    };
    private boolean watching;

    private void watchInbox(boolean on) {
        if (on && !watching && hasSmsPermission()) {
            try {
                getContentResolver().registerContentObserver(Uri.parse("content://sms"), true, inboxObserver);
                watching = true;
            } catch (SecurityException e) {
                Log.w(TAG, "Cannot watch the SMS inbox", e);
            }
        } else if (!on && watching) {
            getContentResolver().unregisterContentObserver(inboxObserver);
            main.removeCallbacks(smsArrived);
            watching = false;
        }
    }

    @Override
    public void onBackPressed() {
        // Let the app close an open sheet first; only then leave the app.
        web.evaluateJavascript("window.__kharchaBack ? window.__kharchaBack() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    private void dispatch(String event, String detailJson) {
        if (web == null) return;
        String js = "window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + detailJson + "}))";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private void setBars(String hex, boolean dark) {
        Window window = getWindow();
        int color = Color.parseColor(hex);
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        View decor = window.getDecorView();
        int flags = decor.getSystemUiVisibility();
        if (dark) {
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        } else {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    private boolean hasSmsPermission() {
        return checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /* ------------------------------------------------------------ assets */

    /** Serves the bundled web app from assets/www, and refuses everything else. */
    private final class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) {
                // There is no network permission anyway; answer explicitly.
                return blocked();
            }
            String path = url.getPath();
            if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return blocked();
            try {
                InputStream stream = getAssets().open("www" + path);
                String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
                String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
                WebResourceResponse response = new WebResourceResponse(mime, "utf-8", stream);
                response.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-cache"));
                return response;
            } catch (Exception e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        Collections.<String, String>emptyMap(), null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            // Any outside link opens in the browser, never inside the app.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {
                // Nothing can open it; stay put.
            }
            return true;
        }

        private WebResourceResponse blocked() {
            return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden",
                    Collections.<String, String>emptyMap(), null);
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            Log.i(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQUEST_OPEN_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    /* ----------------------------------------------------- results */

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQUEST_SMS) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            dispatch("kharcha-permission", "{\"granted\":" + granted + "}");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_OPEN_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQUEST_SAVE_FILE) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveText != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out != null) {
                        out.write(pendingSaveText.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Saving backup failed", e);
                }
            }
            pendingSaveText = null;
            dispatch("kharcha-saved", "{\"ok\":" + ok + "}");
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    /* ------------------------------------------------------ the bridge */

    /**
     * The only functions JavaScript can call. Navigation is locked to the
     * bundled app (see AssetClient), so no other page can ever reach these.
     */
    private final class Bridge {

        @JavascriptInterface
        public boolean hasSmsPermission() {
            return MainActivity.this.hasSmsPermission();
        }

        @JavascriptInterface
        public void requestSmsPermission() {
            runOnUiThread(() -> {
                if (MainActivity.this.hasSmsPermission()) {
                    dispatch("kharcha-permission", "{\"granted\":true}");
                } else {
                    requestPermissions(new String[] {Manifest.permission.READ_SMS}, REQUEST_SMS);
                }
            });
        }

        /**
         * Received bank SMS newer than {@code sinceMillis}, oldest first, as a
         * JSON array of {address, date, body}. Messages from anyone who isn't a
         * bank or payment app are filtered out here and never reach the app.
         */
        @JavascriptInterface
        public String readBankSms(double sinceMillis) {
            JSONArray out = new JSONArray();
            if (!MainActivity.this.hasSmsPermission()) return out.toString();

            String[] projection = {"address", "date", "body"};
            String selection = "date > ?";
            String[] args = {String.valueOf((long) sinceMillis)};
            try (Cursor cursor = getContentResolver().query(
                    Uri.parse("content://sms/inbox"), projection, selection, args, "date ASC")) {
                if (cursor == null) return out.toString();
                int addressCol = cursor.getColumnIndexOrThrow("address");
                int dateCol = cursor.getColumnIndexOrThrow("date");
                int bodyCol = cursor.getColumnIndexOrThrow("body");
                while (cursor.moveToNext()) {
                    String address = cursor.getString(addressCol);
                    if (!isBankSender(address)) continue;
                    String body = cursor.getString(bodyCol);
                    if (body == null || body.trim().isEmpty()) continue;
                    JSONObject message = new JSONObject();
                    message.put("address", address);
                    message.put("date", cursor.getLong(dateCol));
                    message.put("body", body);
                    out.put(message);
                }
            } catch (Exception e) {
                Log.w(TAG, "Reading SMS failed", e);
            }
            return out.toString();
        }

        /** Opens the system "Save to…" screen, then writes the file there. */
        @JavascriptInterface
        public void saveTextFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSaveText = text;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(intent, REQUEST_SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSaveText = null;
                    dispatch("kharcha-saved", "{\"ok\":false}");
                }
            });
        }

        @JavascriptInterface
        public void setBars(String hex, boolean dark) {
            runOnUiThread(() -> {
                try {
                    MainActivity.this.setBars(hex, dark);
                } catch (IllegalArgumentException ignored) {
                    // A malformed colour is harmless: keep the current one.
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }

    /** Bank alerts come from alphanumeric sender IDs, never from phone numbers. */
    static boolean isBankSender(String address) {
        if (address == null) return false;
        String upper = address.toUpperCase(Locale.ROOT);
        boolean hasLetter = false;
        for (int i = 0; i < upper.length(); i++) {
            if (Character.isLetter(upper.charAt(i))) { hasLetter = true; break; }
        }
        if (!hasLetter) return false;
        for (String code : BANK_SENDER_CODES) {
            if (upper.contains(code)) return true;
        }
        return false;
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}

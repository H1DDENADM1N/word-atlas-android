package tech.wordatlas.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Offline shell for Word Atlas.
 *
 * The whole application — bundle, 7,298 illustrations, 22,905 recordings and the
 * word data — lives inside the APK. The page is opened straight from
 * `file:///android_asset/www/index.html`: no HTTP server, no socket, no listening
 * port, no `fetch()` to a backend. The manifest requests no network permission,
 * so the process cannot reach the network even if some code tried to.
 */
public class MainActivity extends Activity {

    private static final String TAG = "WordAtlas";
    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final String ASSET_PREFIX = "file:///android_asset/";
    /** How long a staged share file is kept before the next share sweeps it. */
    private static final long SHARE_TTL_MS = 24L * 60 * 60 * 1000;
    private static final int BOOT_BG = 0xFF0D1120;

    private WebView web;
    private View splash;
    private boolean backEnabled;

    /** Pending `<input type="file">` request from the page. */
    private ValueCallback<Uri[]> filePicker;
    private static final int REQ_PICK_FILE = 0x51;

    /** Bundled Piper voice; no system TTS engine is involved. */
    private OfflineVoice voice;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        // Test hook: launching with `--ez wa.debug true` exposes the page to
        // Chrome DevTools over adb, which is how speech and playback get
        // verified on a device. Off by default.
        if (getIntent() != null && getIntent().getBooleanExtra("wa.debug", false)) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        Window window = getWindow();
        window.setStatusBarColor(BOOT_BG);
        window.setNavigationBarColor(BOOT_BG);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BOOT_BG);

        web = new WebView(this);
        web.setBackgroundColor(BOOT_BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        configure(web.getSettings());
        web.setWebViewClient(new ShellClient());
        // Without a WebChromeClient the page gets no dialogs (confirm() silently
        // returns false) and <input type="file"> does nothing.
        web.setWebChromeClient(new ShellChrome());
        web.addJavascriptInterface(new Bridge(), "WordAtlasAndroid");
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.mipmap.ic_launcher);
        int size = Math.round(96 * getResources().getDisplayMetrics().density);
        root.addView(mark, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        splash = mark;

        setContentView(root);
        voice = new OfflineVoice(this);
        maybeExportSample();
        web.loadUrl(START_URL);
    }

    private void configure(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Packaged assets are read through file://; nothing outside the package
        // is reachable, and script-driven file access stays disabled.
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        // Needed so a backup file chosen through the system picker (content://)
        // can be read back by the page.
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setOffscreenPreRaster(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }
        // No network permission is declared, so this only makes the intent explicit.
        s.setBlockNetworkLoads(true);
    }

    private final class ShellClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme() == null ? "" : url.getScheme();
            // In-app hash routes never reach this point; anything else is external.
            if ("file".equals(scheme) || "about".equals(scheme) || "data".equals(scheme)) return false;
            openExternal(url.toString());
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            hideSplash();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // A heavy WebGL scene can exhaust the renderer; rebuild instead of dying.
            Log.w(TAG, "render process gone, restarting");
            recreate();
            return true;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Dialogs and file picker                                             */
    /* ------------------------------------------------------------------ */

    private final class ShellChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePicker != null) {
                filePicker.onReceiveValue(null);
                filePicker = null;
            }
            filePicker = callback;

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            // The page asks for "application/json,.json"; only real MIME types help
            // the picker, and a wrong filter would hide the backup file.
            String[] accept = params == null ? null : params.getAcceptTypes();
            if (accept != null) {
                List<String> mime = new ArrayList<>();
                for (String type : accept) {
                    if (type != null && type.contains("/")) mime.add(type);
                }
                if (!mime.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, mime.toArray(new String[0]));
            }
            try {
                // The system picker is already a chooser; wrapping it in another
                // one can swallow the result on some Android versions.
                startActivityForResult(intent, REQ_PICK_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                filePicker = null;
                toastOnUi("没有可以浏览文件的应用");
                return false;
            }
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    })
                    .setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override
                        public void onCancel(DialogInterface dialog) {
                            result.cancel();
                        }
                    })
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm();
                        }
                    })
                    .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            result.cancel();
                        }
                    })
                    .setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override
                        public void onCancel(DialogInterface dialog) {
                            result.cancel();
                        }
                    })
                    .show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue == null ? "" : defaultValue);
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            result.confirm(input.getText().toString());
                        }
                    })
                    .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            result.cancel();
                        }
                    })
                    .setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override
                        public void onCancel(DialogInterface dialog) {
                            result.cancel();
                        }
                    })
                    .show();
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            Log.i(TAG, "console: " + message.message() + " (line " + message.lineNumber() + ")");
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_FILE) {
            Uri[] picked = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    List<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < count; i++) uris.add(data.getClipData().getItemAt(i).getUri());
                    picked = uris.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    picked = new Uri[]{data.getData()};
                }
            }
            if (filePicker != null) {
                filePicker.onReceiveValue(picked);
                filePicker = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ------------------------------------------------------------------ */
    /* Chrome / splash                                                     */
    /* ------------------------------------------------------------------ */

    private void hideSplash() {
        final View view = splash;
        if (view == null) return;
        splash = null;
        view.animate().alpha(0f).setDuration(280).withEndAction(new Runnable() {
            @Override
            public void run() {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
            }
        }).start();
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            toastOnUi("没有可以打开该链接的应用");
        }
    }

    private void toastOnUi(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Text to speech                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * Test hook: `--es wa.say "some sentence"` renders it to a WAV in the app's
     * external files dir so the voice can be auditioned from a desktop:
     *
     *   adb shell am start -n tech.wordatlas.app/.MainActivity --es wa.say "Hello"
     *   adb pull /sdcard/Android/data/tech.wordatlas.app/files/sample.wav
     */
    private void maybeExportSample() {
        Intent intent = getIntent();
        String text = intent == null ? null : intent.getStringExtra("wa.say");
        if (text == null || text.isEmpty()) return;
        String lang = intent.getStringExtra("wa.lang");
        if (lang == null) lang = "en-GB";
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = getFilesDir();
        final File target = new File(dir, "sample-" + ("en-US".equalsIgnoreCase(lang) ? "us" : "gb") + ".wav");
        voice.exportWav(text, lang, target, null);
    }

    private void notifySpeechDone() {
        if (web == null) return;
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__waSpeakDone&&window.__waSpeakDone()", null);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Files                                                               */
    /* ------------------------------------------------------------------ */

    /** Save a generated file to Downloads and stop there (backups). */
    private void saveFile(String name, String mime, String base64) {
        save(name, mime, base64, null);
    }

    /** Save a generated image and then open the system share sheet for it. */
    private void saveAndShare(String name, String mime, String base64, String title) {
        save(name, mime, base64, title);
    }

    private void save(String name, String mime, String base64, String shareTitle) {
        String safe = name == null ? "word-atlas" : name.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (safe.isEmpty()) safe = "word-atlas";
        byte[] data;
        try {
            data = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            toastOnUi("文件写入失败");
            return;
        }
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        // The shared copy lives in the cache, because the Downloads entry is
        // written through MediaStore and has no File to hand out.
        File staged = null;
        if (shareTitle != null) staged = stage(safe, data);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Word Atlas");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("no media store entry");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IOException("no output stream");
                    out.write(data);
                }
                toastOnUi("已保存到「下载 / Word Atlas」");
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("no directory");
                File file = new File(dir, safe);
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(data);
                }
                toastOnUi("已保存到 " + file.getAbsolutePath());
            }
        } catch (Exception e) {
            Log.w(TAG, "save failed", e);
            toastOnUi("保存失败：" + e.getMessage());
        }
        if (staged != null) share(staged, type, shareTitle);
    }

    /**
     * Copy the bytes into the share directory and drop anything left over from
     * earlier shares. Returns null when the copy fails, which only costs the
     * share sheet — the file is already in Downloads by then.
     */
    private File stage(String name, byte[] data) {
        try {
            File dir = ShareProvider.directory(this);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no share directory");
            long cutoff = System.currentTimeMillis() - SHARE_TTL_MS;
            File[] old = dir.listFiles();
            if (old != null) {
                for (File file : old) if (file.lastModified() < cutoff) file.delete();
            }
            File target = new File(dir, name);
            try (OutputStream out = new FileOutputStream(target)) {
                out.write(data);
            }
            return target;
        } catch (IOException error) {
            Log.w(TAG, "cannot stage " + name, error);
            return null;
        }
    }

    /** Open the system chooser so the card can go to WeChat, mail, or anywhere. */
    private void share(File file, String mime, String title) {
        final Uri uri = ShareProvider.uriFor(file);
        final Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, title);
        // A URI only in EXTRA_STREAM is not granted to the receiver when the
        // intent travels inside a chooser, and the provider is not exported —
        // so the read permission has to be attached as ClipData, on both the
        // target and the chooser (the latter renders the preview thumbnail).
        final ClipData clip = ClipData.newUri(getContentResolver(), "word-atlas", uri);
        send.setClipData(clip);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        final Intent chooser = Intent.createChooser(send, "分享到");
        chooser.setClipData(clip);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    startActivity(chooser);
                } catch (ActivityNotFoundException error) {
                    Log.w(TAG, "no app accepts the share", error);
                    toastOnUi("没有可分享的应用");
                }
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* JS bridge                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * Hand a packaged asset back as a {@code data:} URL.
     *
     * <p>The page runs from {@code file://}, where an image drawn into a canvas
     * taints it, and {@code canvas.toBlob()} then throws — which is why the
     * share card could never be produced. Images with a {@code data:} URL are
     * origin-clean, so the card can be exported without loosening
     * {@code setAllowFileAccessFromFileURLs}.
     *
     * @param url absolute {@code file:///android_asset/...} URL of the asset
     * @return {@code data:} URL, or null when the path is not a packaged asset
     */
    private String assetDataUrl(String url) {
        if (url == null) return null;
        String path = url;
        int cut = path.indexOf('?');
        if (cut >= 0) path = path.substring(0, cut);
        if (path.startsWith(ASSET_PREFIX)) path = path.substring(ASSET_PREFIX.length());
        while (path.startsWith("/")) path = path.substring(1);
        if (!path.startsWith("www/")) {
            Log.w(TAG, "refusing to read outside the packaged page: " + path);
            return null;
        }
        String mime = path.endsWith(".webp") ? "image/webp"
                : path.endsWith(".png") ? "image/png"
                : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg"
                : "application/octet-stream";
        try (InputStream in = getAssets().open(path)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(1 << 17);
            byte[] chunk = new byte[1 << 15];
            int read;
            while ((read = in.read(chunk)) > 0) buffer.write(chunk, 0, read);
            return "data:" + mime + ";base64," + Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        } catch (IOException error) {
            Log.w(TAG, "cannot read asset " + path, error);
            return null;
        }
    }

    private final class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            MainActivity.this.saveFile(name, mime, base64);
        }

        @JavascriptInterface
        public void saveAndShare(String name, String mime, String base64, String title) {
            MainActivity.this.saveAndShare(name, mime, base64, title);
        }

        @JavascriptInterface
        public String assetDataUrl(String url) {
            return MainActivity.this.assetDataUrl(url);
        }

        @JavascriptInterface
        public void speak(final String text, final String lang, final float rate) {
            voice.speak(text, lang, rate, new Runnable() {
                @Override
                public void run() {
                    notifySpeechDone();
                }
            });
        }

        @JavascriptInterface
        public void prepare(String text, String lang, float rate) {
            voice.prepare(text, lang, rate);
        }

        @JavascriptInterface
        public void stopSpeak() {
            voice.stop();
        }

        @JavascriptInterface
        public void setChrome(final String color, final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    int c;
                    try {
                        c = Color.parseColor(color);
                    } catch (IllegalArgumentException e) {
                        c = BOOT_BG;
                    }
                    Window window = getWindow();
                    window.setStatusBarColor(c);
                    window.setNavigationBarColor(c);
                    View decor = window.getDecorView();
                    int flags = decor.getSystemUiVisibility();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                        else flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    decor.setSystemUiVisibility(flags);
                }
            });
        }

        @JavascriptInterface
        public void setBackEnabled(boolean enabled) {
            backEnabled = enabled;
        }

        /**
         * Raise the soft keyboard.
         *
         * <p>The typing stages keep an invisible {@code <input>} focused from the
         * moment they mount, and a WebView answers {@code focus()} on an
         * already-focused field with nothing — so tapping the stage left the
         * page untypable. The page asks here instead of relying on that.
         */
        @JavascriptInterface
        public void showKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    web.requestFocus();
                    InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (imm != null) imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT);
                }
            });
        }

        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (imm != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
                }
            });
        }

        /**
         * The phone's own light/dark setting.
         *
         * Inside a WebView `prefers-color-scheme` follows the *app's* theme, and
         * this app ships a dark platform theme so the launch window never
         * flashes white — which meant "跟随系统" stayed dark on a phone in light
         * mode. The page asks here instead, so system mode is the real system.
         */
        @JavascriptInterface
        public String systemTheme() {
            return systemDark() ? "dark" : "light";
        }

        @JavascriptInterface
        public void openExternal(String url) {
            MainActivity.this.openExternal(url);
        }

        @JavascriptInterface
        public void toast(String message) {
            toastOnUi(message);
        }

        @JavascriptInterface
        public String version() {
            return "1.0.0";
        }
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    @Override
    public void onBackPressed() {
        if (!backEnabled) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("window.__waBack?window.__waBack():false", new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.evaluateJavascript("window.dispatchEvent(new Event('wa:pause'))", null);
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
        // The user may have switched the phone between light and dark while the
        // app sat in the background; a uiMode change is not always delivered.
        pushSystemTheme();
    }

    /**
     * `uiMode` is in the activity's configChanges list, so the activity survives
     * a light/dark switch and has to tell the page itself.
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration config) {
        super.onConfigurationChanged(config);
        pushSystemTheme();
    }

    private boolean systemDark() {
        int mode = getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    private void pushSystemTheme() {
        if (web == null) return;
        final String value = systemDark() ? "dark" : "light";
        web.post(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.__waSystemTheme&&window.__waSystemTheme('" + value + "')", null);
            }
        });
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // The voice holds a ~60 MB model in RAM; drop it when the system is
        // short and reload lazily the next time something is spoken.
        if (level >= TRIM_MEMORY_RUNNING_LOW && voice != null) voice.trim();
    }

    @Override
    protected void onDestroy() {
        if (voice != null) {
            voice.release();
            voice = null;
        }
        if (web != null) {
            web.removeJavascriptInterface("WordAtlasAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

package tech.wordatlas.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Serves the one file that is about to be handed to another app.
 *
 * <p>Android refuses to pass a {@code file://} URI to another app — API 24+
 * throws {@code FileUriExposedException} — so sharing needs a {@code content://}
 * URI. The usual answer is AndroidX's FileProvider, but this build has no
 * AndroidX at all, so this provider covers the same ground: the cache directory
 * is its only root, and it only serves names the app itself staged there.
 *
 * <p>It is declared {@code exported="false"}; other apps can read a file only
 * while the chooser holds the one-shot grant attached to the share intent.
 */
public final class ShareProvider extends ContentProvider {
    static final String AUTHORITY = "tech.wordatlas.app.share";
    private static final String DIR = "share";

    static File directory(Context context) {
        return new File(context.getCacheDir(), DIR);
    }

    /** The {@code content://} URI under which {@link #directory} files are shared. */
    static Uri uriFor(File file) {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath(file.getName())
                .build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    /**
     * Map a URI back to a file inside the share directory, rejecting anything
     * that tries to climb out of it.
     */
    private File resolve(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null || name.isEmpty() || name.indexOf('/') >= 0 || name.contains("..")) return null;
        Context context = getContext();
        if (context == null) return null;
        try {
            File root = directory(context).getCanonicalFile();
            File file = new File(root, name).getCanonicalFile();
            File parent = file.getParentFile();
            if (parent == null || !parent.equals(root)) return null;
            return file;
        } catch (IOException error) {
            return null;
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = resolve(uri);
        if (file == null || !file.isFile()) throw new FileNotFoundException(String.valueOf(uri));
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) return "application/octet-stream";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /** Receiving apps ask for the display name and size before copying the bytes. */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File file = resolve(uri);
        if (file == null || !file.isFile()) return null;
        String[] columns = projection != null
                ? projection
                : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = file.getName();
            else if (OpenableColumns.SIZE.equals(columns[i])) row[i] = file.length();
            else row[i] = null;
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}

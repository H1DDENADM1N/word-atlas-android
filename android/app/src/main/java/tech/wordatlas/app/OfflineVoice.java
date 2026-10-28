package tech.wordatlas.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.k2fsa.sherpa.onnx.TtsVoice;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Offline speech for the few texts that have no bundled recording.
 *
 * <p>The app ships 22,905 human recordings, so this is a fallback: it covers
 * the second example sentence of the ~6,300 words that only have one, and any
 * recording that fails to decode. Everything runs on the device — a neural
 * voice inside the APK, driven by sherpa-onnx — so no system TTS engine (and
 * no network) is involved.
 *
 * <p>Two voice packs are supported and the one in the APK decides which runs:
 * Kokoro-82M (one 24 kHz model, several voices) or Piper VITS (one 16 kHz model
 * per accent). Only one model is kept in memory at a time.
 */
final class OfflineVoice {
    private static final String TAG = "WordAtlasVoice";
    /** Bump when the asset layout changes so stale copies get replaced. */
    private static final String DATA_VERSION = "2";
    private static final String KOKORO_DIR = "tts/kokoro";

    /* Kokoro speaker ids: British Emma, American Heart. */
    private static final int KOKORO_UK = 7;
    private static final int KOKORO_US = 0;

    /** Floats per write; small enough to abort mid-sentence on {@link #stop()}. */
    private static final int PLAY_CHUNK = 4096;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor(new ThreadFactory() {
        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "word-atlas-voice");
            thread.setPriority(Thread.NORM_PRIORITY - 1);
            return thread;
        }
    });

    private final AtomicInteger token = new AtomicInteger();
    private final AtomicInteger warmup = new AtomicInteger();
    private volatile AudioTrack track;
    private TtsVoice engine;
    private String engineKey;

    /** Last rendered sentence, ready to replay. One entry, a few hundred KB. */
    private String cachedKey;
    private float[] cached;

    OfflineVoice(Context context) {
        this.context = context.getApplicationContext();
    }

    /**
     * Speak {@code text}. {@code done} runs on the main thread once playback
     * has finished, failed, or been superseded by another call.
     */
    void speak(final String text, final String lang, final float rate, final Runnable done) {
        if (text == null || text.trim().isEmpty()) {
            finish(done);
            return;
        }
        final int mine = token.incrementAndGet();
        final String key = key(lang);
        worker.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    if (token.get() != mine) return;
                    TtsVoice voice = engine(key);
                    if (voice == null || token.get() != mine) return;
                    int speaker = speaker(lang);
                    String wanted = stamp(text, speaker, rate);
                    float[] samples = wanted.equals(cachedKey) ? cached : null;
                    if (samples == null) {
                        samples = render(voice, text, speaker, rate, gain(key));
                        if (samples.length > 0) {
                            cachedKey = wanted;
                            cached = samples;
                        }
                    }
                    play(voice.sampleRate(), samples, mine);
                } catch (Throwable error) {
                    Log.w(TAG, "speech failed: " + error);
                } finally {
                    finish(done);
                }
            }
        });
    }

    /**
     * Get the voice ready for {@code text}: load the model and render the
     * sentence, so that tapping the speaker starts playing immediately.
     *
     * <p>Rendering is the expensive part — a 40-word sentence takes about three
     * seconds on a phone CPU — and the text is known as soon as the button
     * exists. The web layer calls this while the reader is still looking at the
     * page, which is where the delay goes. A superseded warm-up stops early.
     */
    void prepare(final String text, final String lang, final float rate) {
        if (text == null || text.trim().isEmpty()) return;
        final int seq = warmup.incrementAndGet();
        worker.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    TtsVoice voice = engine(key(lang));
                    if (voice == null || warmup.get() != seq) return;
                    int speaker = speaker(lang);
                    String wanted = stamp(text, speaker, rate);
                    if (wanted.equals(cachedKey) && cached != null) return;
                    float[] samples = render(voice, text, speaker, rate, gain(key(lang)));
                    if (samples.length > 0 && warmup.get() == seq) {
                        cachedKey = wanted;
                        cached = samples;
                    }
                } catch (Throwable error) {
                    Log.w(TAG, "warm-up failed: " + error);
                }
            }
        });
    }

    void stop() {
        token.incrementAndGet();
        AudioTrack current = track;
        if (current != null) {
            try {
                current.pause();
                current.flush();
            } catch (IllegalStateException ignored) {
                // Already torn down by the worker.
            }
        }
    }

    /** Drop the loaded model; it is reloaded on the next utterance. */
    void trim() {
        worker.execute(new Runnable() {
            @Override
            public void run() {
                closeEngine();
            }
        });
    }

    void release() {
        stop();
        worker.shutdownNow();
        closeEngine();
    }

    /**
     * Debug helper: synthesise {@code text} into a WAV file so the voice can be
     * auditioned from a desktop. Used by the {@code wa.say} launch extra.
     */
    void exportWav(final String text, final String lang, final File target, final Runnable done) {
        final int mine = token.incrementAndGet();
        worker.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    TtsVoice voice = engine(key(lang));
                    if (voice == null) {
                        Log.w(TAG, "cannot export: no voice");
                        return;
                    }
                    float[] samples = render(voice, text, speaker(lang), 1f, gain(key(lang)));
                    File parent = target.getParentFile();
                    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                        Log.w(TAG, "cannot create " + parent);
                        return;
                    }
                    writeWav(samples, voice.sampleRate(), target);
                    Log.i(TAG, "exported " + target + " · " + describe(samples));
                } catch (Throwable error) {
                    Log.w(TAG, "export failed: " + error);
                } finally {
                    if (token.get() == mine) finish(done);
                }
            }
        });
    }

    /* ---------------- engine ---------------- */

    private String key(String lang) {
        if (hasAssets(KOKORO_DIR)) return "kokoro";
        return isAmerican(lang) ? "us" : "gb";
    }

    private int speaker(String lang) {
        if (!hasAssets(KOKORO_DIR)) return 0;
        return isAmerican(lang) ? KOKORO_US : KOKORO_UK;
    }

    /** Kokoro's output peaks around 0.45; the recordings are near full scale. */
    private float gain(String key) {
        return "kokoro".equals(key) ? 1.8f : 1f;
    }

    private TtsVoice engine(String key) {
        if (engine != null && key.equals(engineKey)) return engine;
        closeEngine();
        String dataDir = ensurePhonemeData();
        if (dataDir == null) {
            Log.w(TAG, "phoneme data unavailable, speech disabled");
            return null;
        }
        int threads = Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors() - 1));
        long started = System.currentTimeMillis();
        try {
            if ("kokoro".equals(key)) {
                engine = TtsVoice.kokoro(context.getAssets(),
                        KOKORO_DIR + "/model.onnx",
                        KOKORO_DIR + "/voices.bin",
                        KOKORO_DIR + "/tokens.txt",
                        dataDir, threads);
            } else {
                String dir = "tts/" + key;
                engine = TtsVoice.vits(context.getAssets(), dir + "/model.onnx", dir + "/tokens.txt", dataDir, threads);
            }
            engineKey = key;
            Log.i(TAG, "loaded " + key + " in " + (System.currentTimeMillis() - started) + " ms @"
                    + engine.sampleRate() + " Hz · " + engine.numSpeakers() + " speakers");
            return engine;
        } catch (Throwable error) {
            Log.w(TAG, "cannot load voice " + key + ": " + error);
            engine = null;
            engineKey = null;
            return null;
        }
    }

    private void closeEngine() {
        if (engine != null) {
            try {
                engine.close();
            } catch (Throwable error) {
                Log.w(TAG, "closing voice: " + error);
            }
            engine = null;
            engineKey = null;
        }
    }

    /* ---------------- assets ---------------- */

    private boolean hasAssets(String dir) {
        try {
            String[] children = context.getAssets().list(dir);
            return children != null && children.length > 0;
        } catch (IOException error) {
            return false;
        }
    }

    /**
     * espeak-ng loads its phoneme tables through the filesystem, so the copy
     * inside the APK has to be unpacked once (~18 MB) before the first use.
     */
    private String ensurePhonemeData() {
        File root = new File(context.getFilesDir(), "tts");
        File data = new File(root, "espeak-ng-data");
        File stamp = new File(root, "espeak-ng-data.v" + DATA_VERSION);
        if (stamp.isFile() && data.isDirectory()) return data.getAbsolutePath();
        try {
            deleteTree(data);
            copyAssetTree("tts/espeak-ng-data", data);
            File parent = stamp.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                throw new IOException("cannot create " + parent);
            }
            OutputStream out = new FileOutputStream(stamp);
            try {
                out.write(DATA_VERSION.getBytes("UTF-8"));
            } finally {
                out.close();
            }
            return data.getAbsolutePath();
        } catch (IOException error) {
            Log.w(TAG, "cannot unpack phoneme data: " + error);
            return null;
        }
    }

    private void copyAssetTree(String assetPath, File target) throws IOException {
        AssetManager assets = context.getAssets();
        String[] children = assets.list(assetPath);
        if (children == null || children.length == 0) {
            copyAssetFile(assetPath, target);
            return;
        }
        if (!target.isDirectory() && !target.mkdirs()) throw new IOException("cannot create " + target);
        for (String child : children) {
            copyAssetTree(assetPath + "/" + child, new File(target, child));
        }
    }

    private void copyAssetFile(String assetPath, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("cannot create " + parent);
        InputStream in = context.getAssets().open(assetPath);
        try {
            OutputStream out = new FileOutputStream(target);
            try {
                byte[] buffer = new byte[1 << 16];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            } finally {
                out.close();
            }
        } finally {
            in.close();
        }
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    /* ---------------- playback ---------------- */

    /**
     * Synthesise one utterance and apply the level correction.
     *
     * <p>Gain is applied here, once, and the result is what gets cached — so a
     * replay writes exactly the same samples instead of boosting them again.
     */
    private static float[] render(TtsVoice voice, String text, int speaker, float rate, float gain) {
        long started = System.currentTimeMillis();
        float[] samples = voice.synthesize(text, speaker, rate <= 0f ? 1f : rate);
        long took = System.currentTimeMillis() - started;
        applyGain(samples, gain);
        if (samples.length > 0) {
            double seconds = samples.length / (double) voice.sampleRate();
            Log.i(TAG, "rendered " + samples.length + " samples (" + decimal(seconds) + " s) in " + took
                    + " ms · rtf " + decimal(took / 1000.0 / seconds) + " · " + describe(samples));
        } else {
            Log.w(TAG, "no audio for " + text.length() + " characters");
        }
        return samples;
    }

    /** Stream {@code samples} into the speaker, aborting if a newer request wins. */
    private void play(int sampleRate, float[] samples, int mine) {
        if (samples.length == 0) return;
        final AudioTrack audio = openTrack(sampleRate);
        if (audio == null) {
            Log.w(TAG, "cannot open an audio track at " + sampleRate + " Hz");
            return;
        }
        track = audio;
        long started = System.currentTimeMillis();
        int written = 0;
        try {
            audio.play();
            for (int offset = 0; offset < samples.length; offset += PLAY_CHUNK) {
                if (token.get() != mine) break;
                int count = Math.min(PLAY_CHUNK, samples.length - offset);
                int n = audio.write(samples, offset, count, AudioTrack.WRITE_BLOCKING);
                if (n <= 0) break;
                written += n;
            }
            if (token.get() == mine) {
                // The track only buffers the last ~0.7 s, so returning here and
                // releasing would clip the final word. Wait for it to play out.
                drain(audio, written);
                audio.stop();
            }
            long elapsed = System.currentTimeMillis() - started;
            Log.i(TAG, "spoke " + written + " samples (" + decimal(written / (double) sampleRate)
                    + " s) @" + sampleRate + " Hz in " + elapsed + " ms"
                    + (written < samples.length ? " · stopped early" : ""));
        } catch (IllegalStateException error) {
            Log.w(TAG, "playback: " + error);
        } finally {
            track = null;
            try {
                audio.release();
            } catch (Throwable ignored) {
                // Nothing left to release.
            }
        }
    }

    /** Block until everything handed to {@code audio} has actually been played. */
    private static void drain(AudioTrack audio, int written) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (audio.getPlaybackHeadPosition() >= written) return;
            try {
                Thread.sleep(20);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private AudioTrack openTrack(int sampleRate) {
        int chunk = 4096;
        int bufferBytes = chunk * 4 * 4;
        try {
            return new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(bufferBytes)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
        } catch (IllegalArgumentException error) {
            Log.w(TAG, "audio track: " + error);
            return null;
        }
    }

    /** Kokoro is mastered quieter than the bundled recordings; even it out. */
    private static void applyGain(float[] samples, float gain) {
        if (gain == 1f) return;
        for (int i = 0; i < samples.length; i++) {
            float value = samples[i] * gain;
            samples[i] = value > 0.98f ? 0.98f : value < -0.98f ? -0.98f : value;
        }
    }

    /* ---------------- helpers ---------------- */

    /** Identifies a rendered sentence, so a replay can skip synthesis. */
    private static String stamp(String text, int speaker, float rate) {
        return speaker + "|" + rate + "|" + text;
    }

    private static String decimal(double value) {
        return String.format(java.util.Locale.US, "%.2f", value);
    }

    /** 16-bit mono WAV, so the result can be played anywhere. */
    private static void writeWav(float[] samples, int sampleRate, File target) throws IOException {
        int bytes = samples.length * 2;
        BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(target), 1 << 16);
        try {
            writeAscii(out, "RIFF");
            writeInt(out, 36 + bytes);
            writeAscii(out, "WAVEfmt ");
            writeInt(out, 16);
            writeShort(out, 1);          // PCM
            writeShort(out, 1);          // mono
            writeInt(out, sampleRate);
            writeInt(out, sampleRate * 2); // byte rate
            writeShort(out, 2);          // block align
            writeShort(out, 16);         // bits per sample
            writeAscii(out, "data");
            writeInt(out, bytes);
            for (float sample : samples) {
                int value = Math.round(Math.max(-1f, Math.min(1f, sample)) * 32767f);
                out.write(value & 0xFF);
                out.write((value >> 8) & 0xFF);
            }
        } finally {
            out.close();
        }
    }

    private static void writeAscii(OutputStream out, String text) throws IOException {
        out.write(text.getBytes("US-ASCII"));
    }

    private static void writeInt(OutputStream out, int value) throws IOException {
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
        out.write((value >> 16) & 0xFF);
        out.write((value >> 24) & 0xFF);
    }

    private static void writeShort(OutputStream out, int value) throws IOException {
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
    }

    /** Peak and RMS of the synthesised audio — silence would mean a broken voice. */
    private static String describe(float[] samples) {
        double energy = 0;
        float peak = 0;
        for (float sample : samples) {
            float level = Math.abs(sample);
            if (level > peak) peak = level;
            energy += (double) sample * sample;
        }
        return String.format(java.util.Locale.US, "peak %.3f rms %.3f", peak, Math.sqrt(energy / samples.length));
    }

    private static boolean isAmerican(String lang) {
        return lang != null && lang.toLowerCase(java.util.Locale.US).startsWith("en-us");
    }

    private void finish(final Runnable done) {
        if (done == null) return;
        main.post(done);
    }
}

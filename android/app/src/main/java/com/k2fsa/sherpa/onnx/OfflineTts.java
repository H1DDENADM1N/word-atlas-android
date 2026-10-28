// Java mirror of sherpa-onnx's Kotlin API (v1.13.8) — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

import android.content.res.AssetManager;

/**
 * Offline text-to-speech, backed by sherpa-onnx + a Piper VITS voice.
 *
 * <p>Both model files and the espeak-ng phoneme data live inside the APK; the
 * native side reads the model straight from {@code assets} and only the
 * phoneme data needs a real directory on disk (see {@code OfflineVoice}).
 */
final class OfflineTts {
    static {
        System.loadLibrary("sherpa-onnx-jni");
    }

    private long ptr;

    /**
     * @param assets when non-null, every path in {@code config} is resolved
     *               relative to {@code assets/} instead of the filesystem.
     */
    OfflineTts(AssetManager assets, OfflineTtsConfig config) {
        ptr = assets != null ? newFromAsset(assets, config) : newFromFile(config);
        if (ptr == 0L) {
            throw new IllegalStateException("Invalid OfflineTtsConfig: failed to create native OfflineTts");
        }
    }

    /** Native sample rate of the loaded voice, e.g. 16000. */
    int sampleRate() {
        return getSampleRate(ptr);
    }

    int numSpeakers() {
        return getNumSpeakers(ptr);
    }

    /**
     * Synthesise {@code text} into mono float samples.
     *
     * @param sid   speaker id, 0 for single-speaker voices
     * @param speed 1.0 is the voice's natural pace; larger is faster
     */
    GeneratedAudio generate(String text, int sid, float speed) {
        return generateImpl(ptr, text, sid, speed);
    }

    void free() {
        if (ptr != 0L) {
            delete(ptr);
            ptr = 0L;
        }
    }

    private native long newFromAsset(AssetManager assetManager, OfflineTtsConfig config);

    private native long newFromFile(OfflineTtsConfig config);

    private native void delete(long ptr);

    private native int getSampleRate(long ptr);

    private native int getNumSpeakers(long ptr);

    private native GeneratedAudio generateImpl(long ptr, String text, int sid, float speed);
}

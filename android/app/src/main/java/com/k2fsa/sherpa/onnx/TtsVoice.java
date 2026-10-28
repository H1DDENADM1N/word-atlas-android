// Public facade over the mirrored sherpa-onnx API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

import android.content.res.AssetManager;

/**
 * A voice that lives entirely inside the APK.
 *
 * <p>This is the only class the app itself touches; everything else in this
 * package exists to satisfy the JNI field lookups and stays package-private.
 *
 * <p>Two model families are wired up because they have very different
 * trade-offs: Kokoro (330 MB, 24 kHz, natural) is what ships, and Piper VITS
 * (60 MB, 16 kHz) stays available as the small option.
 */
public final class TtsVoice {
    private final OfflineTts tts;
    private final int sampleRate;

    private TtsVoice(OfflineTts tts) {
        this.tts = tts;
        this.sampleRate = tts.sampleRate();
    }

    /**
     * Kokoro-82M. One model covers every English voice; pick one with the
     * {@code speaker} argument of {@link #synthesize}.
     *
     * @param assets  APK assets, used to read the model without copying it
     * @param model   asset path of the ONNX model, e.g. {@code tts/kokoro/model.onnx}
     * @param voices  asset path of {@code voices.bin}
     * @param tokens  asset path of {@code tokens.txt}
     * @param dataDir absolute path of an extracted {@code espeak-ng-data}
     * @param threads inference threads
     */
    public static TtsVoice kokoro(AssetManager assets, String model, String voices, String tokens, String dataDir, int threads) {
        OfflineTtsKokoroModelConfig kokoro = new OfflineTtsKokoroModelConfig();
        kokoro.model = model;
        kokoro.voices = voices;
        kokoro.tokens = tokens;
        kokoro.dataDir = dataDir;
        kokoro.lexicon = "";
        kokoro.lang = "";
        kokoro.lengthScale = 1.0f;

        OfflineTtsModelConfig config = new OfflineTtsModelConfig();
        config.kokoro = kokoro;
        config.numThreads = threads;
        config.debug = false;
        config.provider = "cpu";

        OfflineTtsConfig root = new OfflineTtsConfig();
        root.model = config;
        root.maxNumSentences = 1;
        root.silenceScale = 0.2f;

        return new TtsVoice(new OfflineTts(assets, root));
    }

    /**
     * Piper VITS — the compact option (one model per accent, 16 kHz).
     *
     * @param model   asset path of the ONNX model, e.g. {@code tts/gb/model.onnx}
     * @param tokens  asset path of {@code tokens.txt}
     * @param dataDir absolute path of an extracted {@code espeak-ng-data}
     */
    public static TtsVoice vits(AssetManager assets, String model, String tokens, String dataDir, int threads) {
        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.model = model;
        vits.tokens = tokens;
        vits.dataDir = dataDir;
        vits.noiseScale = 0.667f;
        vits.noiseScaleW = 0.8f;
        vits.lengthScale = 1.0f;

        OfflineTtsModelConfig config = new OfflineTtsModelConfig();
        config.vits = vits;
        config.numThreads = threads;
        config.debug = false;
        config.provider = "cpu";

        OfflineTtsConfig root = new OfflineTtsConfig();
        root.model = config;
        root.maxNumSentences = 1;
        root.silenceScale = 0.2f;

        return new TtsVoice(new OfflineTts(assets, root));
    }

    /** Native sample rate of this voice: 24000 for Kokoro, 16000 for Piper. */
    public int sampleRate() {
        return sampleRate;
    }

    public int numSpeakers() {
        return tts.numSpeakers();
    }

    /**
     * Synthesise a sentence.
     *
     * @param speaker voice id, 0 for single-speaker models
     * @param speed   1.0 is natural pace, larger is faster
     * @return mono samples in [-1, 1] at {@link #sampleRate()}, empty on failure
     */
    public float[] synthesize(String text, int speaker, float speed) {
        GeneratedAudio audio = tts.generate(text, speaker, speed <= 0f ? 1f : speed);
        if (audio == null || audio.samples == null) return new float[0];
        return audio.samples;
    }

    public void close() {
        tts.free();
    }
}

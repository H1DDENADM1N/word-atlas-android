// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

/** PCM the native side hands back: mono float samples in [-1, 1] plus a rate. */
final class GeneratedAudio {
    final float[] samples;
    final int sampleRate;

    GeneratedAudio(float[] samples, int sampleRate) {
        this.samples = samples;
        this.sampleRate = sampleRate;
    }
}

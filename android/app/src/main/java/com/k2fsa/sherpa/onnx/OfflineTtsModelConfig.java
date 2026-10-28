// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsModelConfig {
    OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
    OfflineTtsMatchaModelConfig matcha = new OfflineTtsMatchaModelConfig();
    OfflineTtsKokoroModelConfig kokoro = new OfflineTtsKokoroModelConfig();
    OfflineTtsZipVoiceModelConfig zipvoice = new OfflineTtsZipVoiceModelConfig();
    OfflineTtsKittenModelConfig kitten = new OfflineTtsKittenModelConfig();
    OfflineTtsPocketModelConfig pocket = new OfflineTtsPocketModelConfig();
    OfflineTtsSupertonicModelConfig supertonic = new OfflineTtsSupertonicModelConfig();
    int numThreads = 1;
    boolean debug = false;
    String provider = "cpu";
}

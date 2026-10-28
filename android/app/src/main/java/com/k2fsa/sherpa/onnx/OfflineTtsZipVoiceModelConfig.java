// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsZipVoiceModelConfig {
    String tokens = "";
    String encoder = "";
    String decoder = "";
    String vocoder = "";
    String dataDir = "";
    String lexicon = "";
    float featScale = 0.1f;
    float tShift = 0.5f;
    float targetRms = 0.1f;
    float guidanceScale = 1.0f;
}

// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsMatchaModelConfig {
    String acousticModel = "";
    String vocoder = "";
    String lexicon = "";
    String tokens = "";
    String dataDir = "";
    String dictDir = "";
    float noiseScale = 1.0f;
    float lengthScale = 1.0f;
}

// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsConfig {
    OfflineTtsModelConfig model = new OfflineTtsModelConfig();
    String ruleFsts = "";
    String ruleFars = "";
    int maxNumSentences = 1;
    float silenceScale = 0.2f;
}

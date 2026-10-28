// Java mirror of sherpa-onnx's Kotlin API — see OfflineTtsVitsModelConfig.java.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsPocketModelConfig {
    String lmFlow = "";
    String lmMain = "";
    String encoder = "";
    String decoder = "";
    String textConditioner = "";
    String vocabJson = "";
    String tokenScoresJson = "";
    int voiceEmbeddingCacheCapacity = 50;
}

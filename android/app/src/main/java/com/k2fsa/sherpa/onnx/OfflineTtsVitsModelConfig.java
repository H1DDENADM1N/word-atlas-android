// Hand-written Java mirror of sherpa-onnx's Kotlin API (v1.13.8).
//
// The JNI bridge resolves these classes by name and reads their fields with
// GetFieldID, so package, class names and field types must match
// `sherpa-onnx/kotlin-api/Tts.kt` exactly. Mirroring in Java keeps the APK
// buildable with plain javac + d8 — no Kotlin toolchain required.
package com.k2fsa.sherpa.onnx;

final class OfflineTtsVitsModelConfig {
    String model = "";
    String lexicon = "";
    String tokens = "";
    String dataDir = "";
    String dictDir = "";
    float noiseScale = 0.667f;
    float noiseScaleW = 0.8f;
    float lengthScale = 1.0f;
}

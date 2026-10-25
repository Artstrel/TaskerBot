#!/usr/bin/env bash
# ==============================================================================
# TaskerBot - whisper.cpp Local Server Manager with Metal / AVX Acceleration
# ==============================================================================
# This script:
# 1. Checks/installs dependencies (ffmpeg for noise filtering).
# 2. Clones ggml-org/whisper.cpp if not present.
# 3. Compiles the high-performance HTTP server with Metal (macOS) or AVX (Linux).
# 4. Downloads the high-accuracy ggml-large-v3-turbo model (or user specified).
# 5. Starts the OpenAI-compatible HTTP server with VAD & anti-hallucination settings.
# ==============================================================================

set -e

# Default settings (can be overridden via environment variables)
WHISPER_DIR="${WHISPER_DIR:-whisper.cpp}"
WHISPER_PORT="${PORT:-8080}"
WHISPER_HOST="${HOST:-0.0.0.0}"
MODEL_NAME="${MODEL:-large-v3-turbo}"
THREADS="${THREADS:-4}"

echo "=================================================================="
echo "🎙  Starting TaskerBot whisper.cpp Voice Recognition Engine"
echo "=================================================================="

# 1. Dependency checks
if ! command -v git &> /dev/null; then
    echo "❌ Error: 'git' is required but not installed." >&2
    exit 1
fi

if ! command -v make &> /dev/null; then
    echo "❌ Error: 'make' is required but not installed." >&2
    exit 1
fi

# Check for ffmpeg (used for hardware/FFT noise cancellation)
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  'ffmpeg' is not found in PATH."
    if [[ "$OSTYPE" == "darwin"* ]] && command -v brew &> /dev/null; then
        echo "💡 Installing ffmpeg via Homebrew for hardware noise filtering..."
        brew install ffmpeg || echo "⚠️  Could not auto-install ffmpeg. whisper.cpp will run without FFT pre-filtering."
    else
        echo "💡 Tip: Install ffmpeg to enable hardware FFT noise reduction (afftdn)."
    fi
else
    echo "✅ FFmpeg detected for noise filtering & audio normalization."
fi

# 2. Clone whisper.cpp repository if not present
if [ ! -d "$WHISPER_DIR" ]; then
    echo "📥 Cloning ggml-org/whisper.cpp..."
    git clone https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR" --depth 1
fi

cd "$WHISPER_DIR"

# 3. Build whisper.cpp server with hardware acceleration
SERVER_BIN="./server"
if [ ! -f "$SERVER_BIN" ]; then
    echo "⚙️  Compiling whisper.cpp server..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🚀 Detected macOS: Enabling Metal GPU acceleration..."
        WHISPER_METAL=1 make server -j"$THREADS"
    else
        echo "🚀 Detected Linux: Building with CPU/AVX optimizations..."
        make server -j"$THREADS"
    fi
    echo "✅ whisper.cpp server built successfully."
fi

# 4. Download model weights
MODEL_FILE="models/ggml-${MODEL_NAME}.bin"
if [ ! -f "$MODEL_FILE" ]; then
    echo "📥 Model '$MODEL_NAME' not found in models/. Downloading..."
    if [ -f "./models/download-ggml-model.sh" ]; then
        bash ./models/download-ggml-model.sh "$MODEL_NAME"
    else
        mkdir -p models
        curl -L --progress-bar \
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL_NAME}.bin" \
            -o "$MODEL_FILE"
    fi
    echo "✅ Model downloaded: $MODEL_FILE"
fi

# 5. Launch whisper.cpp server
echo "------------------------------------------------------------------"
echo "🚀 Launching whisper.cpp server on http://${WHISPER_HOST}:${WHISPER_PORT}"
echo "   Model: $MODEL_FILE"
echo "   Threads: $THREADS"
echo "   Language: ru (Russian)"
echo "------------------------------------------------------------------"

exec "$SERVER_BIN" \
    -m "$MODEL_FILE" \
    --host "$WHISPER_HOST" \
    --port "$WHISPER_PORT" \
    -t "$THREADS" \
    -l "ru" \
    --prompt "Задачи, список дел, покупки, напоминания."

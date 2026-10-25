import asyncio
import io
import logging
import os
import re
import shutil
import time
from typing import Optional, Tuple

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

# List of common Whisper hallucination markers that occur in noise / silence
HALLUCINATION_PATTERNS = [
    r"продолжение\s+следует.*",
    r"(?:(?:русские\s+)?субтитр[ыа-я]*(?:\s*(?:сделал\w*|создал\w*|создавал\w*|подготовил\w*|перевел\w*|от|:)).*|субтитр[ыа-я]*$)",
    r"редактор\s+субтитр[ыа-я]*.*",
    r"корректор\s+субтитр[ыа-я]*.*",
    r"автор\s+субтитр[ыа-я]*.*",
    r"спасибо\s+за\s+просмотр.*",
    r"ставьте\s+лайк[иа-я]*",
    r"подписывайтесь.*",
    r"лайк\s+и\s+подписк[а-я]*",
    r"колокольчик[а-я]*",
    r"переведено\s+сообществом.*",
    r"всем\s+пока.*",
    r"до\s+новых\s+встреч.*",
    r"amara\.org",
    r"www\.[a-z0-9\-]+\.[a-z]{2,}",
    r"http[s]?://",
    r"благодарю\s+за\s+внимание.*",
    r"конец\s+связи",
    r"трансляция\s+завершена",
    r"не\s+забудьте\s+подписаться.*",
    r"смотреть\s+далее.*",
    r"оставайтесь\s+с\s+нами.*",
    r"приятного\s+просмотра.*",
    r"thank\s+you\s+for\s+watching.*",
    r"please\s+subscribe.*",
    r"like\s+and\s+subscribe.*",
]

HALLUCINATION_RE = re.compile(r"|".join(HALLUCINATION_PATTERNS), re.IGNORECASE)

# Acoustic / silence descriptor tags injected by Whisper decoders during pauses
BRACKET_NOISE_RE = re.compile(
    r"\s*(?:\[|\()(?:\s*|\.{1,3}|тишина|музыка|звук\w*|вздох|кашель|покашливание|смех|пауза|шепот|звонок|аплодисменты|помехи|silence|music(?:\s+playing)?|cough|laughter|applause|sigh|clears\s+throat|bell|snicker|crying|pant|gasp|whisper|murmuring)(?:\]|\))\s*",
    re.IGNORECASE,
)
EMPTY_BRACKETS_RE = re.compile(r"\s*(?:\[\s*\]|\(\s*\)|\{\s*\})\s*")
PROMPT_ECHO_FULL_RE = re.compile(
    r"^(?:task|tasks|задач[аи]|список\s+дел|напоминани[яе])\s*:\s*(?:\(\s*\)|\[\s*\]|\{\s*\}|\.{1,3}|-)?\s*$",
    re.IGNORECASE,
)
PROMPT_ECHO_PREFIX_RE = re.compile(
    r"^(?:task|tasks|задач[аи]|список\s+дел|напоминани[яе])\s*:\s*",
    re.IGNORECASE,
)


def strip_whisper_hallucinations(text: str) -> str:
    """
    Strips acoustic noise tags, empty brackets, prompt echoes (e.g. 'Task: ()'),
    and known trailing/leading Whisper hallucination phrases from transcribed text,
    preserving genuine task content.
    Example: 'Купить молоко и хлеб (тишина)' -> 'Купить молоко и хлеб'
    Example: 'Task: ()' -> ''
    """
    if not text or not text.strip():
        return ""
    cleaned = text.strip()

    # 1. Check if string is purely a prompt echo / empty task container
    if PROMPT_ECHO_FULL_RE.match(cleaned):
        return ""

    # 2. Strip acoustic bracket tags and empty bracket artifacts
    cleaned = BRACKET_NOISE_RE.sub(" ", cleaned)
    cleaned = EMPTY_BRACKETS_RE.sub(" ", cleaned)

    # 3. Strip prompt echo prefix if speech continues (e.g. 'Task: Купить хлеб' -> 'Купить хлеб')
    cleaned = PROMPT_ECHO_PREFIX_RE.sub("", cleaned).strip()

    # 4. Strip known hallucination patterns
    for pat in HALLUCINATION_PATTERNS:
        # Match as trailing phrase or standalone sentence
        cleaned = re.sub(
            rf"(?:[.,!?;\s]|^){pat}[.,!?;\s]*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()
        # Match as leading phrase
        cleaned = re.sub(
            rf"^[.,!?;\s]*{pat}(?:[.,!?;\s]|$)",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

    # Clean redundant punctuation and whitespace
    cleaned = re.sub(r"^[.,!?;:\s—\-]+|[.,!?;:\s—\-]+$", "", cleaned)
    return cleaned.strip()


def detect_hallucination_or_noise(text: str) -> bool:
    """
    Returns True if the transcribed text is likely a Whisper hallucination,
    background acoustic noise, prompt echo, or a repetitive loop.
    """
    if not text or not text.strip():
        return True

    trimmed = text.strip()

    # Check for empty brackets or prompt placeholder immediately
    if PROMPT_ECHO_FULL_RE.match(trimmed) or EMPTY_BRACKETS_RE.fullmatch(trimmed):
        return True

    # Check after stripping hallucinations & acoustic noise tags
    stripped = strip_whisper_hallucinations(trimmed)
    if not stripped:
        return True

    meaningful_after = re.sub(r"[^\wа-яА-ЯёЁ\d]+", "", stripped)
    if len(meaningful_after) < 2:
        is_legit_task = bool(
            re.search(
                r"\b(написать|сделать|подготовить|добавить|исправить|отредактировать|вставить)\s+субтитр",
                trimmed,
                re.IGNORECASE,
            )
        )
        if not is_legit_task:
            logger.info(f"Discarded Whisper pure hallucination marker: {trimmed!r}")
            return True

    # Drop single generic category words (e.g. if whisper only transcribed 'Задачи' or 'Task')
    clean_lower = re.sub(r"^[^\wа-яА-ЯёЁ\d]+|[^\wа-яА-ЯёЁ\d]+$", "", stripped.lower())
    if clean_lower in {"task", "tasks", "задача", "задачи", "список дел", "напоминания", "дело", "дела"}:
        logger.info(f"Discarded generic prompt artifact: {trimmed!r}")
        return True

    # Detect repetitive phrase/word loops (e.g. 'задача задача задача' or '1. 1. 1.')
    words = stripped.split()
    if len(words) >= 4:
        word_counts = {}
        for w in words:
            w_lower = w.lower().strip(".,!?:;")
            if len(w_lower) > 1:
                word_counts[w_lower] = word_counts.get(w_lower, 0) + 1
        if word_counts:
            most_common_cnt = max(word_counts.values())
            if most_common_cnt >= 4 and (most_common_cnt / len(words)) >= 0.5:
                logger.info(f"Discarded repetitive loop hallucination: {trimmed[:80]!r}")
                return True

    return False


class WhisperCPPService:
    def __init__(self):
        self._is_available: Optional[bool] = None
        self._last_health_check: float = 0.0
        self._health_ttl: float = 15.0  # Cache health check for 15 seconds
        self._ffmpeg_path: Optional[str] = None
        self._find_ffmpeg()

    def _find_ffmpeg(self) -> Optional[str]:
        # Check standard PATH
        path = shutil.which("ffmpeg")
        if path:
            self._ffmpeg_path = path
            return path
        # Check Homebrew / standard Unix locations on macOS/Linux
        common_paths = [
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ]
        for p in common_paths:
            if os.path.isfile(p) and os.access(p, os.X_OK):
                self._ffmpeg_path = p
                return p
        return None

    async def is_available(self) -> bool:
        """
        Check if local whisper.cpp server is reachable.
        Result is cached for 15 seconds to avoid overhead.
        """
        if not settings.WHISPER_CPP_ENABLED:
            return False

        now = time.monotonic()
        if self._is_available is not None and (now - self._last_health_check) < self._health_ttl:
            return self._is_available

        url = settings.WHISPER_CPP_URL.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=0.6) as client:
                # whisper.cpp server responds to GET / or /health
                res = await client.get(f"{url}/")
                self._is_available = (res.status_code < 500)
        except Exception:
            self._is_available = False

        self._last_health_check = now
        return bool(self._is_available)

    async def preprocess_audio_ffmpeg(
        self, audio_bytes: bytes, filename: Optional[str] = None
    ) -> Tuple[bytes, str]:
        """
        Apply hardware/FFT noise reduction, thinking pause compression (VAD), and 16kHz mono WAV conversion.
        - Compresses thinking pauses (>0.8s) down to 0.25s of natural breathing space.
        - Cuts dead air leading/trailing silence to prevent Whisper decoder hallucination.
        - Normalizes speech levels (loudnorm) AFTER silence removal so pauses are never amplified.
        - If audio contains no speech (pure silence), returns (b"", "empty.wav").
        Works across all mobile formats: iOS (mp4/m4a/aac), Android (webm/ogg), Telegram (.oga).
        """
        ffmpeg_bin = self._ffmpeg_path or self._find_ffmpeg()
        if not ffmpeg_bin:
            return audio_bytes, filename or "audio.webm"

        # Filter explanation:
        # 1. highpass=f=120,lowpass=f=7500: Speech bandpass filter
        # 2. afftdn=nf=-25: FFT-based background acoustic noise filter
        # 3. silenceremove: Compresses thinking pauses >0.8s down to 0.25s, and strips dead air
        # 4. loudnorm: Applied AFTER silence compression so silence/room noise is NOT amplified
        filter_str = (
            "highpass=f=120,lowpass=f=7500,"
            "afftdn=nf=-25,"
            "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-40dB:start_silence=0.1:stop_periods=-1:stop_duration=0.8:stop_threshold=-40dB:stop_silence=0.25,"
            "loudnorm=I=-16:TP=-1.5:LRA=11"
        )

        cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-i", "pipe:0",
            "-af", filter_str,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            "-f", "wav",
            "pipe:1",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=audio_bytes),
                timeout=5.0
            )
            if proc.returncode == 0 and stdout:
                if len(stdout) <= 44:
                    logger.info("FFmpeg VAD: Input audio contained pure silence or sub-threshold noise.")
                    return b"", "empty.wav"
                return stdout, "clean_audio.wav"
            else:
                logger.warning(f"FFmpeg denoising failed (code {proc.returncode}): {stderr.decode(errors='ignore')[:150]}")
        except Exception as e:
            logger.warning(f"FFmpeg audio preprocessing exception: {e}")

        return audio_bytes, filename or "audio.webm"

    async def transcribe(
        self, audio_bytes: bytes, filename: Optional[str] = None
    ) -> Optional[str]:
        """
        Transcribe audio via local whisper.cpp server.
        Includes noise filtering, VAD pause compression, neutral speech prompt and post-filtering.
        Returns transcription string, or None if no valid speech is detected.
        """
        if not await self.is_available():
            return None

        # 1. Preprocess audio via FFmpeg (noise suppression, pause compression, 16kHz WAV conversion)
        clean_bytes, clean_fn = await self.preprocess_audio_ffmpeg(audio_bytes, filename)
        if not clean_bytes or len(clean_bytes) <= 44:
            logger.info("Local whisper.cpp: Clean audio is empty or pure silence, skipping transcription.")
            return None

        # 2. Send to whisper.cpp server
        url = settings.WHISPER_CPP_URL.rstrip("/")
        api_endpoint = f"{url}/inference"

        # Neutral prompt avoiding category headers to prevent prompt echo ("Task: ()")
        prompt_text = "Разговорная русская речь без субтитров. Запись повседневных дел и покупок."
        data = {
            "temperature": "0.0",
            "language": "ru",
            "prompt": prompt_text,
            "suppress_blank": "true",
            "response_format": "json",
        }
        files = {
            "file": (clean_fn, clean_bytes, "audio/wav" if clean_fn.endswith(".wav") else "application/octet-stream")
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(api_endpoint, data=data, files=files)
                if res.status_code != 200:
                    # Try fallback to /v1/audio/transcriptions
                    alt_endpoint = f"{url}/v1/audio/transcriptions"
                    alt_data = {
                        "model": "whisper-1",
                        "temperature": "0.0",
                        "language": "ru",
                        "prompt": prompt_text,
                        "response_format": "json",
                    }
                    res = await client.post(alt_endpoint, data=alt_data, files=files)

                if res.status_code == 200:
                    try:
                        res_json = res.json()
                        raw_text = res_json.get("text", "")
                    except Exception:
                        raw_text = res.text

                    raw_text = strip_whisper_hallucinations((raw_text or "").strip())

                    # 3. Filter noise & hallucinations
                    if detect_hallucination_or_noise(raw_text):
                        logger.info(f"whisper.cpp transcription dropped as noise or hallucination: {raw_text!r}")
                        return None

                    logger.info(f"whisper.cpp transcribed successfully: {raw_text[:100]}")
                    return raw_text
                else:
                    logger.warning(f"whisper.cpp server returned HTTP {res.status_code}: {res.text[:200]}")
        except Exception as e:
            logger.warning(f"Error calling whisper.cpp server: {e}")
            self._is_available = False

        return None


whisper_service = WhisperCPPService()

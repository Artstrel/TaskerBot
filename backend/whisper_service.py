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


def strip_whisper_hallucinations(text: str) -> str:
    """
    Strips known trailing or leading Whisper hallucination phrases from transcribed text,
    preserving the genuine task content.
    Example: 'Купить молоко и хлеб. Спасибо за просмотр!' -> 'Купить молоко и хлеб.'
    """
    if not text or not text.strip():
        return ""
    cleaned = text.strip()
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
    return cleaned.strip()


def detect_hallucination_or_noise(text: str) -> bool:
    """
    Returns True if the transcribed text is likely a Whisper hallucination,
    background acoustic noise, or a repetitive loop.
    """
    if not text or not text.strip():
        return True

    trimmed = text.strip()

    # 1. Check for minimum meaningful characters (letters or digits)
    meaningful = re.sub(r"[^\wа-яА-ЯёЁ\d]+", "", trimmed)
    if len(meaningful) < 2:
        return True

    # 2. Check if text is purely a hallucination phrase
    stripped = strip_whisper_hallucinations(trimmed)
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

    # 3. Detect repetitive phrase/word loops (e.g. 'задача задача задача' or '1. 1. 1.')
    words = trimmed.split()
    if len(words) >= 4:
        # Check if the same word appears > 60% of times
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
        Apply hardware/FFT noise reduction, bandpass filtering, and 16kHz mono WAV conversion.
        Works across all mobile formats: iOS (mp4/m4a/aac), Android (webm/ogg), Telegram (.oga).
        If ffmpeg is missing, returns the original bytes.
        """
        ffmpeg_bin = self._ffmpeg_path or self._find_ffmpeg()
        if not ffmpeg_bin:
            return audio_bytes, filename or "audio.webm"

        # Filter explanation:
        # - highpass=f=120,lowpass=f=7500: Isolates typical speech frequencies, cuts low rumbles and high hisses
        # - afftdn=nf=-25: FFT-based noise reduction filter
        # - loudnorm=I=-16:TP=-1.5:LRA=11: Normalizes speech volume so quiet speech in noise is boosted
        # - -ar 16000 -ac 1: Convert to 16kHz Mono as expected by Whisper models
        filter_str = "highpass=f=120,lowpass=f=7500,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"

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
                timeout=4.0
            )
            if proc.returncode == 0 and stdout and len(stdout) > 44:
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
        Includes noise filtering, VAD, anti-hallucination prompt and post-filtering.
        Returns transcription string, or None if no valid speech is detected.
        """
        if not await self.is_available():
            return None

        # 1. Preprocess audio via FFmpeg (noise suppression, bandpass, 16kHz WAV conversion)
        clean_bytes, clean_fn = await self.preprocess_audio_ffmpeg(audio_bytes, filename)

        # 2. Send to whisper.cpp server
        url = settings.WHISPER_CPP_URL.rstrip("/")
        # We target OpenAI compatible /v1/audio/transcriptions or /inference
        api_endpoint = f"{url}/inference"

        prompt_text = "Задачи, список дел, покупки, рутины, напоминания на день."
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

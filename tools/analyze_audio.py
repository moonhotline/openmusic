"""Measure peak, RMS and clipping in one or more signed 16-bit PCM WAVs."""
import argparse
import array
import json
import math
import sys
import wave


def measure(path):
    with wave.open(path, "rb") as audio:
        if audio.getsampwidth() != 2:
            raise ValueError("Expected signed 16-bit PCM")
        rate = audio.getframerate()
        channels = audio.getnchannels()
        frames = audio.getnframes()
        peak, power, clipped, count = 0, 0, 0, 0
        while chunk := audio.readframes(16384):
            samples = array.array("h", chunk)
            if sys.byteorder != "little":
                samples.byteswap()
            peak = max(peak, max(abs(sample) for sample in samples))
            power += sum(sample * sample for sample in samples)
            clipped += sum(sample in (-32768, 32767) for sample in samples)
            count += len(samples)
    return {
        "file": path, "sample_rate": rate, "channels": channels, "seconds": frames / rate,
        "peak_dbfs": db(peak / 32768),
        "rms_dbfs": db(math.sqrt(power / max(count, 1)) / 32768),
        "clipped_samples": clipped,
    }


def db(amplitude):
    return round(20 * math.log10(max(amplitude, 1e-6)), 2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    print(json.dumps([measure(path) for path in args.files], indent=2))

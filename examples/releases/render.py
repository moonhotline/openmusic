"""Render the release scores using VSCO 2 CE recordings and custom synth patches."""
import argparse
from dataclasses import asdict
import json
from pathlib import Path
import re
import subprocess
import warnings

import numpy as np
from scipy import signal
from scipy.io import wavfile

from arrangement import agi, faith


RATE = 48_000
TAIL = 2.4
OCTAVE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
RECORDINGS = {
    "violin": ("Strings/Solo Violin/Arco Vib", 0, r"_([A-G]#?[45])_([pf])\.wav"),
    "section": ("Strings/Violin Section/susVib", 12, r"_([A-G]#?[345])_v([12])\.wav"),
    "cello": ("Strings/Cello Section/susvib", 12, r"_([A-G]#?[234])_v([13])_1\.wav"),
    "horn": ("Brass/F Horn/sus", 12, r"_([A-G]#?[234])_v([13])_1\.wav"),
    "piano": ("Keys/Upright Piano", 0, r"_dyn([13])_rr1_(\d{3})\.wav"),
}
# Track gain, pan, low cut, room send.
MIX = {
    "piano": (-2.3, -.16, 95, .21), "violin": (-1, .10, 190, .23),
    "section": (-8.3, .32, 180, .25), "cello": (-6.9, -.31, 91, .20),
    "horn": (-9.4, .13, 115, .21), "pad": (-7.8, 0, 83, .16), "arp": (-6.5, 0, 230, .15),
    "bass": (-4.5, 0, 28, .015), "kick": (-3.6, 0, 27, .02),
    "snare": (-6.5, .04, 126, .21), "hat": (-13, .23, 4500, .08),
    "impact": (-7, 0, 28, .19), "riser": (-10.5, 0, 180, .20),
}


def level(db):
    return 10 ** (db / 20)


def fade(x, duration):
    return np.minimum(1, np.maximum(0, x / duration))


def colored_noise(rng, length, cutoff, kind):
    return signal.sosfilt(signal.butter(2, cutoff, kind, fs=RATE, output="sos"), rng.standard_normal(length))


def midi_number(name, correction):
    return 12 * (int(name[-1]) + 1) + OCTAVE[name[0]] + ("#" in name) + correction


def read_recording(path, pitched):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", wavfile.WavFileWarning)
        sample_rate, raw = wavfile.read(path)
    sound = raw.astype(np.float32) / (-float(np.iinfo(raw.dtype).min)) if np.issubdtype(raw.dtype, np.integer) else raw.astype(np.float32)
    if sound.ndim == 1:
        sound = np.column_stack((sound, sound))
    sound = sound[:, :2]
    hop = max(1, sample_rate // 150)
    blocks = sound[:len(sound) // hop * hop].reshape(-1, hop, 2)
    volume = np.sqrt(np.mean(blocks ** 2, axis=(1, 2)))
    onset = int(np.argmax(volume > np.max(volume) * (.045 if pitched else .022))) * hop
    data = sound[max(0, onset - hop):]
    reference = np.sqrt(np.mean(data[:int(.85 * sample_rate)] ** 2))
    return sample_rate, data * min(14, .16 / max(.001, reference))


def sample_bank(directory):
    bank = {}
    for part, (subdirectory, offset, pattern) in RECORDINGS.items():
        records = {}
        for path in sorted((directory / subdirectory).glob("*.wav")):
            match = re.search(pattern, path.name)
            if not match:
                continue
            if part == "piano":
                layer, number = match.groups()
                index = int(number)
                midi, hard = 21 + index * 2, layer == "3"
                if not 10 <= index <= 32 or index % 2:
                    continue
            else:
                name, layer = match.groups()
                midi, hard = midi_number(name, offset), layer not in ("p", "1")
                if not 47 <= midi <= 85:
                    continue
            records[(midi, hard)] = read_recording(path, part != "piano")
        if len(records) < 2 or len({layer for _, layer in records}) != 2:
            raise ValueError("Missing sampled soft/strong takes in " + str(directory / subdirectory))
        bank[part] = records
    return bank


def sustain_audio(audio, sr, frames, pitch):
    # Keep the original attack. Extend the stable bow/tone before its recorded release.
    end = min(int(sr * 2.15), int(len(audio) * .72))
    if frames <= end:
        return audio
    start = min(int(sr * .48), end // 3)
    overlap = min(int(sr * .11), end // 8)
    period = min(round(sr / (440 * 2 ** ((pitch - 69) / 12))), start // 3)
    left = start - period
    candidates = audio[left:start + period + overlap].mean(axis=1)
    previous = audio[end - overlap:end].mean(axis=1)
    correlation = signal.correlate(candidates, previous, mode="valid", method="fft")
    energy = np.convolve(candidates * candidates, np.ones(overlap, dtype=np.float32), mode="valid")
    start = left + int(np.argmax(correlation / np.sqrt(np.maximum(energy, 1e-9))))
    loop = audio[start:end]
    blend = (.5 - .5 * np.cos(np.linspace(0, np.pi, overlap, dtype=np.float32)))[:, None]

    sustained = np.empty((frames, audio.shape[1]), dtype=np.float32)
    sustained[:end] = audio[:end]
    filled = end
    while filled < frames:
        begin = filled - overlap
        count = min(len(loop), frames - begin)
        sustained[begin:filled] = sustained[begin:filled] * (1 - blend) + loop[:overlap] * blend
        sustained[filled:begin + count] = loop[overlap:count]
        filled = begin + count
    return sustained


def sampled_note(part, bank, midi, velocity, length, rng):
    records = bank[part]
    pitch, hard = min(records, key=lambda key: abs(key[0] - midi) + 2.5 * (key[1] != (velocity >= .64)))
    sr, audio = records[(pitch, hard)]
    shift = 2 ** ((midi - pitch + rng.uniform(-.024, .024)) / 12)
    release = .18 if part in ("violin", "piano") else .35
    count = round((length + release) * RATE)
    source_step = sr * shift / RATE
    if part == "piano":
        count = min(count, int((len(audio) - 1) / source_step))
    else:
        audio = sustain_audio(audio, sr, int((count - 1) * source_step) + 2, pitch)
    time = np.arange(count) / RATE
    at = time * sr * shift
    left = at.astype(np.intp)
    fraction = (at - left).astype(np.float32)[:, None]
    out = audio[left] * (1 - fraction) + audio[left + 1] * fraction
    attack = .008 if part == "piano" else .046 if part == "violin" else .07
    envelope = fade(time, attack) * fade(length + release - time, release) * fade(count / RATE - time, .06)
    if part != "piano":
        envelope *= .86 + .14 * np.sin(np.pi * np.minimum(1, time / max(.16, length)))
        if length > 1.6:
            envelope *= .94 + .06 * np.sin(2 * np.pi * (.23 * time + rng.uniform(0, 1)))
    return out * (velocity ** 1.22 * envelope[:, None] * (.9 if hard else .78))


def synth_note(part, midi, velocity, length, rng):
    release = .64 if part == "pad" else .20
    t = np.arange(round((length + release) * RATE)) / RATE
    f = 440 * 2 ** ((midi - 69) / 12)
    w = 2 * np.pi * t
    phase = rng.uniform(0, 2 * np.pi)
    sine = np.sin
    white = lambda cutoff, kind="bandpass": colored_noise(rng, len(t), cutoff, kind)
    a = fade(t, .008) * fade(length + release - t, release)
    if part == "kick":
        fall = t * 48 + 59 * .029 * (1 - np.exp(-t / .029))
        x = .73 * np.tanh(1.55 * sine(2 * np.pi * fall)) * np.exp(-t * 12)
        x += .075 * white((1200, 6000)) * np.exp(-t * 95)
    elif part == "snare":
        x = .31 * white((950, 9600)) * np.exp(-t * 17)
        x += (.17 * sine(w * 174) + .115 * sine(w * 239)) * np.exp(-t * 27)
        a = fade(t, .003) * fade(length + .2 - t, .14)
    elif part == "hat":
        x = .22 * white((6200, 16000)) * np.exp(-t * (18 if length > .10 else 32))
    elif part == "impact":
        x = .43 * sine(w * 36 + 3.7 * (1 - np.exp(-t * 10))) * np.exp(-t * 3.1)
        x += .19 * white((100, 1400)) * np.exp(-t * 3.5)
    elif part == "riser":
        travel = np.minimum(1, t / length)
        x = .21 * white((650, 6500)) * travel ** 2.8 * fade(length - t, .03)
        x += .058 * sine(w * 98 * (1 + travel * .58)) * travel ** 1.7 * fade(length - t, .035)
    elif part == "bass":
        ph = w * f + phase
        harmonics = sum(sine(h * ph + h * .11) * np.exp(-h * t * .47) / h ** 1.13 for h in range(1, 9))
        x = .28 * np.tanh(1.28 * harmonics) + .19 * sine(ph)
        x *= .7 + .30 * np.exp(-t * 6.5)
        a *= fade(length + .075 - t, .075)
    elif part == "arp":
        ph = w * f + phase
        x = .21 * sine(ph + 1.3 * np.exp(-t * 11) * sine(ph * 2.009))
        x += .095 * sine(ph * 1.004 + .77) + .043 * sine(ph * 3.0)
        x *= np.exp(-t * (5.3 if length > .10 else 7.4))
    else:
        spread = (.9971, 1.0019)
        v = .018 * sine(w * .68) + .03 * sine(w * .21)
        carriers = [sum(sine(h * (w * f * tune + v) + phase * h) / h ** 1.64
                        for h in range(1, 11)) for tune in spread]
        a *= fade(t, .45) * (.88 + .12 * sine(w * .16 + phase))
        x = np.column_stack(carriers) * .18
    return x * (a[:, None] if x.ndim == 2 else a) * velocity


def render_track(score, part, count, bank):
    final = np.zeros((count, 2), np.float32)
    rng = np.random.default_rng(score.seed + sum(map(ord, part)) * 41)
    beat_seconds = 60 / score.bpm
    gain, pan, highpass, _ = MIX[part]
    for i, (beat, length, midi, velocity) in enumerate(score.parts[part]):
        start = max(0, round((beat * beat_seconds + rng.uniform(-.008, .008) * (part in bank)) * RATE))
        seconds = length * beat_seconds
        take = sampled_note(part, bank, midi, velocity, seconds, rng) if part in bank else synth_note(part, midi, velocity, seconds, rng)
        if take.ndim == 1:
            take = take[:, None]
        placement = (.26 * (1 if i % 2 else -1)) if part == "arp" else pan
        balance = np.sqrt((1 + np.array([-placement, placement]))) * level(gain)
        take = take[:count-start] * balance
        final[start:start+len(take)] += take
    return signal.sosfilt(signal.butter(2, highpass, "highpass", fs=RATE, output="sos"), final, axis=0).astype(np.float32)


def room_bus(wet, seed):
    rng = np.random.default_rng(seed)
    size = int(1.28 * RATE)
    envelope = np.exp(-np.arange(size) / (RATE * .245))
    fields = []
    for c in range(2):
        side = wet[:, c] * .68 + wet[:, 1-c] * .32
        tail = colored_noise(rng, size, (320, 5700), "bandpass") * envelope
        tail = tail * (.52 / np.linalg.norm(tail))
        delay = int((.018 + c * .012) * RATE)
        impulse = np.pad(tail, (delay, 0))
        for when, amount in ((.024, .27), (.048, .18), (.079, .09)):
            impulse[round((when + c * .008) * RATE)] += amount
        fields.append(signal.oaconvolve(side, impulse.astype(np.float32))[:len(wet)])
    return np.column_stack(fields)


def ffmpeg(*args):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-y", *map(str, args)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2500:])
    return result.stderr


def master(premaster, path, target):
    base = f"loudnorm=I={target}:TP=-1.3:LRA=10"
    report = ffmpeg("-i", premaster, "-af", base + ":print_format=json", "-f", "null", "-")
    stats, _ = json.JSONDecoder().raw_decode(report[report.rindex("{"):])
    measured = ":".join(f"measured_{key}={stats[source]}" for key, source in (
        ("I", "input_i"), ("TP", "input_tp"), ("LRA", "input_lra"), ("thresh", "input_thresh")))
    filters = f"{base}:{measured}:offset={stats['target_offset']}:linear=true"
    ffmpeg("-i", premaster, "-af", filters, "-ar", RATE, "-sample_fmt", "s16", "-compression_level", 6, path)


def render(score, bank, destination, stems, target):
    from tempfile import TemporaryDirectory

    count = round((score.bars * 240 / score.bpm + TAIL) * RATE)
    mix = np.zeros((count, 2), np.float32)
    send = np.zeros_like(mix)
    stop = np.linspace(1, 0, int(.38 * RATE))[:, None]
    folder = stems / score.title.lower() if stems else None
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "score.json").write_text(json.dumps(asdict(score), ensure_ascii=False, indent=2), encoding="utf8")
    for part in score.parts:
        take = render_track(score, part, count, bank)
        take[-len(stop):] *= stop
        take[:192] *= np.linspace(0, 1, 192)[:, None]
        mix += take
        send += take * MIX[part][3]
        if folder:
            wavfile.write(folder / (part + ".wav"), RATE, take)
    room = room_bus(send, score.seed)
    room[-len(stop):] *= stop
    mix += room
    if folder:
        wavfile.write(folder / "room.wav", RATE, room)
    with TemporaryDirectory() as tmp:
        premaster = Path(tmp) / "mix.wav"
        wavfile.write(premaster, RATE, mix)
        master(premaster, destination, target)
    print(f"{score.title}: {count / RATE:.3f} s, {len(score.parts)} tracks → {destination}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", required=True, type=Path, help="Path to the VSCO 2 CE checkout")
    parser.add_argument("--out", default=Path(__file__).parent, type=Path)
    parser.add_argument("--stems", type=Path, help="Optional per-part stereo WAV and score exports")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    sounds = sample_bank(args.samples)
    for make_score, target in ((faith, -15), (agi, -14)):
        piece = make_score()
        render(piece, sounds, args.out / (piece.title.lower() + ".flac"), args.stems, target)

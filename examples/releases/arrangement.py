"""Original scores with sustained harmony. Notes use beat, length, MIDI pitch and velocity."""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Chord:
    first: int
    bars: int
    name: str
    bass: int
    voicing: tuple[int, ...]
    intensity: float


@dataclass
class Score:
    title: str
    bpm: float
    bars: int
    seed: int
    harmony: tuple[Chord, ...]
    parts: dict = field(default_factory=dict)

    def play(self, part, bar, notes, *, gain=1):
        self.parts.setdefault(part, []).extend(
            (bar * 4 + beat, length, midi, min(1, velocity * gain))
            for beat, length, midi, velocity in notes
        )


FAITH_HARMONY = (
    Chord(0, 4, "Dm(add9)", 38, (53, 57, 62, 64), .40),
    Chord(4, 4, "Bbmaj7", 34, (53, 57, 62, 65), .49),
    Chord(8, 4, "F(add9)/A", 33, (53, 57, 60, 67), .62),
    Chord(12, 4, "Gm(add9)", 31, (55, 58, 62, 69), .65),
    Chord(16, 4, "Bbmaj7/D", 38, (53, 57, 62, 70), .40),
    Chord(20, 4, "Dm(add9)", 38, (53, 57, 62, 64), .72),
    Chord(24, 2, "Bbmaj7", 34, (53, 57, 62, 65), .70),
    Chord(26, 1, "A7", 33, (55, 57, 61, 64), .62),
    Chord(27, 1, "Dm(add9)", 38, (53, 57, 62, 64), .52),
)

# A returning D–A–F theme, with held answers and room to hear the harmony change.
FAITH_MELODY = {
    0: [(1, 1.38, 74, .66), (2.51, .83, 69, .55)],
    1: [(0, 2.85, 77, .70), (3, .77, 76, .55)],
    2: [(0, 5.6, 74, .62)],
    4: [(0, 2.3, 74, .65), (2.5, 1.2, 77, .59)],
    5: [(0, 3.65, 81, .74)],
    6: [(0, 4.9, 77, .63)],
    8: [(0, 1.38, 77, .72), (1.5, .62, 72, .57), (2.2, 1.55, 79, .70)],
    9: [(0, 5.4, 81, .77)],
    11: [(0, 2.45, 79, .66), (2.55, 1.3, 77, .61)],
    12: [(0, 3.55, 82, .74)],
    13: [(0, 1.35, 81, .68), (1.5, 4.5, 79, .72)],
    15: [(0, 2.8, 74, .61)],
    16: [(1, 2.5, 74, .53)],
    17: [(0, 2.3, 69, .48), (2.5, 3.1, 77, .54)],
    20: [(0, 1.35, 74, .73), (1.5, .75, 69, .55), (2.4, 1.4, 77, .74)],
    21: [(0, 2.25, 81, .80), (2.5, 1.35, 76, .67)],
    22: [(0, 5.75, 86, .79)],
    24: [(0, 3.0, 84, .77)],
    25: [(0, 3.65, 81, .70)],
    26: [(0, 1.35, 79, .70), (1.5, 2.25, 73, .68)],
    27: [(0, 3.86, 74, .74)],
}

AGI_HARMONY = (
    Chord(0, 4, "F#m(add9)", 30, (54, 57, 61, 68), .46),
    Chord(4, 4, "Dmaj7/F#", 30, (54, 57, 61, 62), .55),
    Chord(8, 4, "A(add9)/E", 40, (57, 61, 64, 71), .63),
    Chord(12, 4, "E(add9)/G#", 32, (56, 59, 64, 66), .65),
    Chord(16, 4, "F#m(add9)", 30, (54, 57, 61, 68), .68),
    Chord(20, 4, "Dmaj7/F#", 30, (54, 57, 61, 62), .43),
    Chord(24, 4, "A(add9)/E", 40, (57, 61, 64, 71), .76),
    Chord(28, 2, "Dmaj7", 38, (54, 57, 61, 62), .70),
    Chord(30, 1, "C#7", 37, (53, 56, 59, 61), .61),
    Chord(31, 1, "F#m(add9)", 30, (54, 57, 61, 68), .58),
)

AGI_MELODY = {
    8: [(0, 1.35, 76, .70), (1.5, .75, 73, .63), (2.5, 1.3, 76, .72)],
    9: [(0, 4.4, 81, .77)],
    10: [(1.5, 2.1, 83, .72)],
    11: [(0, 3.4, 81, .72)],
    12: [(0, 2.7, 80, .74)],
    13: [(0, 3.65, 76, .64)],
    14: [(0, 5.8, 78, .73)],
    16: [(0, 1.4, 78, .75), (1.5, .65, 73, .58), (2.25, 1.5, 76, .70)],
    17: [(0, 3.75, 80, .74)],
    18: [(0, 5.7, 81, .77)],
    24: [(0, 1.4, 76, .76), (1.5, .60, 73, .65), (2.3, 1.5, 81, .80)],
    25: [(0, 5.7, 85, .85)],
    26: [(2.2, 1.6, 83, .75)],
    27: [(0, 3.7, 81, .77)],
    28: [(0, 4.9, 78, .78)],
    29: [(1.5, 2.3, 81, .77)],
    30: [(0, 3.6, 77, .70)],
    31: [(0, 3.83, 78, .77)],
}


def sustain(score, part, passages):
    """Tie common tones into a single note across consecutive chord changes."""
    notes = []
    held = {}
    for chord, pitches, velocity in passages:
        start = 4 * chord.first
        end = start + 4 * chord.bars
        for pitch in list(held):
            first, previous_end, attack = held[pitch]
            if previous_end != start or pitch not in pitches:
                notes.append((first, previous_end - first, pitch, attack))
                del held[pitch]
        for pitch in pitches:
            first, _, attack = held.get(pitch, (start, start, velocity))
            held[pitch] = first, end, attack
    for pitch, (start, end, attack) in held.items():
        notes.append((start, end - start, pitch, attack))
    score.play(part, 0, sorted(notes))


def harmonic_bed(score, *, cinematic):
    harmony = score.harmony
    sustain(score, "pad", (
        (chord, (chord.bass + 12, *chord.voicing), chord.intensity)
        for chord in harmony
    ))
    sustain(score, "cello", (
        (chord, (chord.bass + (24 if chord.bass < 34 else 12),), .55 + .28 * (chord.intensity - .40))
        for chord in harmony if cinematic or chord.first >= 4
    ))
    sustain(score, "section", (
        (chord, (chord.voicing[0] + 12, chord.voicing[1] + 12, chord.voicing[2] + 12),
         .56 + .25 * (chord.intensity - .40))
        for chord in harmony if chord.first >= 4
    ))
    sustain(score, "horn", (
        (chord, chord.voicing[:2], .54 + .40 * (chord.intensity - .40))
        for chord in harmony if 8 <= chord.first < (20 if cinematic else 16)
        or chord.first >= (24 if cinematic else 20)
    ))


def faith():
    score = Score("Faith", 98, 28, 1781, FAITH_HARMONY)
    harmonic_bed(score, cinematic=False)
    for chord in score.harmony:
        lo, mid, top, color = chord.voicing
        for bar in range(chord.first, chord.first + chord.bars):
            first = bar == chord.first
            active = 8 <= bar < 16 or 20 <= bar < 27
            if first:
                score.play("piano", bar, [(0, 3.60, chord.bass + 12, .54), (.10, 3.42, lo, .42),
                                           (.22, 3.3, mid, .43), (.48, 2.9, color, .40)])
            elif bar % 2 == 0:
                score.play("piano", bar, [(1.5, 1.75, top, .43), (2.22, 1.58, color, .35)])
            phrase = FAITH_MELODY.get(bar, ())
            if phrase:
                score.play("piano", bar, phrase, gain=.75 if active else .95)
                if active or bar == 27:
                    score.play("violin", bar, phrase, gain=.90)
            if active:
                rhythm = [(0, 1.54), (1.75, .20), (2, 1.65)] if bar % 2 == 0 else [(0, 1.83), (2.5, 1.12)]
                score.play("bass", bar, [(beat, length, chord.bass, .64 if beat == 0 else .50)
                                          for beat, length in rhythm])
                drums(score, bar, drive=False, full=bar >= 20)
            if 20 <= bar < 26:
                score.play("arp", bar, [(i * .5, .31, (mid, top, color, top)[i % 4] + 12, .28 + .05 * (i % 4 == 0))
                                         for i in range(8)])
            if bar in (8, 20, 27):
                score.play("impact", bar, [(0, 1.4, chord.bass, .57 if bar == 20 else .43)])
            if bar in (7, 19):
                score.play("riser", bar, [(1, 2.94, 74, .50)])
    return score


def agi():
    score = Score("AGI", 124, 32, 6803, AGI_HARMONY)
    harmonic_bed(score, cinematic=True)
    for chord in score.harmony:
        lo, mid, top, color = chord.voicing
        for bar in range(chord.first, chord.first + chord.bars):
            quiet = bar < 2 or 20 <= bar < 24
            peak = 24 <= bar < 31
            if bar < 31:
                contour = (lo, top, mid, color, lo, top, mid, top)
                speed = 8 if quiet or bar < 8 else 12 if peak else 8
                score.play("arp", bar, [(i * 4 / speed + (i % 2) * .009, 2.35 / speed, contour[i % 8] + 12,
                                         (.46 if i % 4 == 0 else .32) * (.67 if quiet else 1)) for i in range(speed)])
                if not quiet:
                    rhythm = [(i / 2, .34 + .075 * (i % 4 == 0)) for i in range(8)]
                    score.play("bass", bar, [(beat, length, chord.bass, .73 if i % 4 == 0 else .54)
                                             for i, (beat, length) in enumerate(rhythm)])
                    drums(score, bar, drive=True, full=bar >= 8)
            else:
                score.play("bass", bar, [(0, 3.85, chord.bass, .76)])
            if bar in AGI_MELODY:
                score.play("violin", bar, AGI_MELODY[bar], gain=.99 if peak else .88)
            if bar in (0, 4, 20, 22):
                score.play("piano", bar, [(0, 2.15, lo, .53), (1.5, 1.95, mid + 12, .49),
                                          (2.24, 1.60, color + 12, .39)])
            if bar in (8, 16, 24, 31):
                score.play("impact", bar, [(0, 1.62, chord.bass, .66 if bar == 24 else .46)])
            if bar in (7, 23, 30):
                score.play("riser", bar, [(1, 2.94, 80, .55)])
    return score


def drums(score, bar, *, drive, full):
    kicks = [0, 1, 2, 3] if drive else [0, 1.5, 2]
    score.play("kick", bar, [(beat, .39, 36, .70 if i == 0 else .54) for i, beat in enumerate(kicks)])
    score.play("snare", bar, [(1, .30, 38, .52), (3, .35, 38, .68)])
    if bar % 8 == 7:
        score.play("snare", bar, [(3.5, .16, 38, .34), (3.75, .16, 38, .43)])
    hats = [i * .5 + (i % 2) * .019 for i in range(8)] if full else [.5, 1.5, 2.5, 3.5]
    score.play("hat", bar, [(beat, .16, 42, .44 if i % 2 == 0 else .30) for i, beat in enumerate(hats)])

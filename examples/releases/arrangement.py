"""Original scores for Faith and AGI. Notes are (beat, length, MIDI pitch, velocity)."""
from dataclasses import dataclass, field


@dataclass
class Score:
    title: str
    bpm: float
    bars: int
    seed: int
    parts: dict = field(default_factory=dict)

    def play(self, part, bar, notes, *, octave=0, gain=1):
        self.parts.setdefault(part, []).extend(
            (bar * 4 + beat, length, midi + octave, min(1, velocity * gain))
            for beat, length, midi, velocity in notes
        )


# Bass pitch followed by an open voicing.
FAITH = {
    "Dm": (38, 53, 57, 64), "Bb": (34, 53, 57, 62),
    "F": (41, 53, 57, 67), "C/E": (40, 52, 55, 62),
    "Gm": (43, 53, 58, 62), "Dm/A": (33, 53, 57, 62),
    "A7": (33, 55, 57, 61), "Bb/D": (38, 53, 58, 65),
}

FAITH_THEME = [
    [(0, 1.37, 74, .68), (1.48, .44, 69, .52), (2, 1.8, 77, .75)],
    [(0, .95, 76, .62), (1, 1.36, 74, .68), (2.5, 1.36, 69, .52)],
    [(0, 1.76, 72, .58), (2, .49, 74, .62), (2.51, 1.34, 77, .77)],
    [(0, 1.45, 79, .72), (1.5, .54, 77, .63), (2.08, 1.71, 76, .62)],
    [(0, 1.43, 74, .68), (1.5, .45, 69, .52), (2, 1.9, 81, .80)],
    [(0, 1.5, 79, .62), (1.55, .42, 77, .54), (2, 1.8, 74, .66)],
    [(0, 1.4, 70, .58), (1.5, .39, 74, .62), (2, 1.55, 77, .70)],
    [(0, 1.01, 76, .70), (1.12, .78, 73, .65), (2, 1.68, 69, .51)],
]

AGI = {
    "F#m": (30, 54, 57, 64), "D": (38, 54, 57, 64),
    "A": (33, 52, 59, 61), "E": (40, 54, 56, 59),
    "Bm": (35, 54, 59, 62), "C#7": (37, 53, 59, 61),
    "E/G#": (32, 52, 56, 59), "D/A": (33, 54, 57, 62),
}

AGI_THEME = [
    [(0, .68, 78, .8), (.76, .42, 73, .65), (1.25, 1.13, 76, .78), (2.5, 1.06, 80, .84)],
    [(0, 1.54, 81, .82), (1.75, .57, 76, .65), (2.5, 1.08, 78, .81)],
    [(0, .68, 85, .84), (.76, .61, 83, .72), (1.5, 1.76, 81, .81)],
    [(0, .89, 80, .78), (1, .64, 76, .65), (1.75, 1.9, 71, .71)],
    [(0, .73, 78, .82), (.83, .32, 76, .61), (1.25, 1.0, 85, .86), (2.5, 1.23, 88, .90)],
    [(0, .90, 86, .84), (1, 1.12, 85, .80), (2.25, 1.42, 81, .71)],
    [(0, 1.44, 83, .80), (1.5, .45, 81, .71), (2, 1.73, 78, .81)],
    [(0, 1.18, 77, .80), (1.25, .61, 80, .70), (2, 1.08, 85, .88)],
]


def faith():
    score = Score("Faith", 98, 28, 1781)
    harmony = ("Dm Bb F C/E Dm Bb Gm A7 " "Dm Bb F C/E Dm/A Bb Gm A7 "
               "Bb/D Gm F C/E Dm Bb F C/E Gm Bb A7 Dm").split()
    for bar, name in enumerate(harmony):
        bass, lo, mid, hi = FAITH[name]
        final = bar == 27
        quiet = bar < 4 or 16 <= bar < 20
        full = 8 <= bar < 16 or 20 <= bar < 27
        phrase = FAITH_THEME[bar % 8]
        if bar == 26:
            phrase = [(0, .84, 76, .7), (1, .88, 79, .73), (2, 1.64, 73, .68)]
        if final:
            phrase = [(0, 3.92, 74, .76)]
        score.play("piano", bar, [(0, 3.64, bass + 12, .48), (.51, 2.5, lo, .42),
                                   (1.02, 2.56, mid, .42), (2.02, 1.68, hi, .38)])
        score.play("piano", bar, phrase, gain=.88 if quiet else .66)
        if bar >= 4:
            score.play("cello", bar, [(0, 2.34, bass + 12, .49), (2.42, 1.42, mid - 12, .43)]
                       if quiet else [(0, 3.76, bass + 12, .69 if full else .52)])
        if full or final:
            score.play("violin", bar, phrase, gain=.94 if bar >= 20 else .88)
        if 4 <= bar < 16 or bar >= 20:
            score.play("section", bar, [(.07 + i * .04, 3.77, pitch + 12, (.63 if full else .44) - i * .06)
                                        for i, pitch in enumerate((lo, mid))])
            score.play("pad", bar, [(.12, 3.79, pitch, .52 if bar >= 20 else .43) for pitch in (lo, mid, hi)])
        if full:
            bass_rhythm = [(0, .91), (1, .37), (1.5, .44), (2, 1.18), (3.5, .38)] if bar % 4 == 3 else [(0, 1.32), (1.5, .37), (2, 1.66)]
            score.play("bass", bar, [(beat, length, bass, .77 if beat == 0 else .63) for beat, length in bass_rhythm])
            score.play("arp", bar, [(i / 2 + (i % 2) * .018, .31, (mid + 12, hi + 12, lo + 24, hi + 12)[i % 4], .41 + .09 * (i % 4 == 0)) for i in range(8)])
            drums(score, bar, drive=False, full=bar >= 20, fill=bar % 4 == 3)
        if bar in (8, 11, 12, 15, 20, 23, 24, 25, 26, 27):
            score.play("horn", bar, [(0, 2.34 if not final else 3.9, lo, .68 if bar >= 20 else .53),
                                    (2.49, 1.38, mid, .64)] if not final else [(0, 3.92, 50, .72)])
        if bar in (8, 20, 24, 27):
            score.play("impact", bar, [(0, 1.4, bass, .72 if bar != 27 else .48)])
        if bar in (7, 19, 23):
            score.play("riser", bar, [(0, 3.96, 74, .44 if bar == 7 else .70)])
    return score


def agi():
    score = Score("AGI", 124, 32, 6803)
    harmony = ("F#m D A E F#m D Bm C#7 " "F#m D A E F#m D Bm C#7 "
               "F#m E/G# D/A C#7 D A Bm C#7 " "F#m D A E Bm D C#7 F#m").split()
    for bar, name in enumerate(harmony):
        bass, lo, mid, hi = AGI[name]
        quiet = bar < 2 or 20 <= bar < 24
        finale = bar >= 24
        final = bar == 31
        speeds = 16 if finale else 8
        if not final:
            contour = (lo, hi, mid, hi + 12, lo + 12, mid, hi, mid + 12)
            score.play("arp", bar, [(i * 4 / speeds + (i % 2) * .017, 2.1 / speeds, contour[i % 8] + 12,
                                     (.54 if i % 4 == 0 else .37) * (.64 if quiet else 1)) for i in range(speeds)])
        if not quiet:
            pulses = [(0, .41), (.5, .43), (1, .39), (1.5, .40), (2, .69), (2.75, .2), (3, .36), (3.5, .44)]
            score.play("bass", bar, [(beat, length, bass + (12 if i == 5 else 0), .83 if i in (0, 4) else .63)
                                     for i, (beat, length) in enumerate(pulses)] if not final else [(0, 3.8, bass, .82)])
            if not final:
                drums(score, bar, drive=True, full=8 <= bar <= 19 or finale, fill=bar % 4 == 3)
        if bar >= 4:
            score.play("pad", bar, [(0 if final else .12, 3.8, note, .49 if quiet else .61) for note in (lo, mid, hi)])
        if 8 <= bar < 20 or finale:
            phrase = AGI_THEME[bar % 8] if not final else [(0, 3.95, 78, .83)]
            score.play("violin", bar, phrase, gain=.99 if finale else .9)
            score.play("section", bar, [(0, 1.35, lo + 12, .57), (1.5, .40, mid + 12, .62), (2.01, 1.6, hi + 12, .63)]
                       if not final else [(0, 3.91, hi, .69), (0, 3.91, mid, .71)])
            low = bass + (24 if bass < 33 else 12)
            score.play("cello", bar, [(0, 1.62, low, .67), (2.03, 1.62, low + 7, .68)]
                       if not final else [(0, 3.85, low, .72)])
            score.play("horn", bar, [(0, 1.11, lo, .76), (1.5, .46, mid, .65), (2, 1.69, hi, .72)]
                       if not final else [(0, 3.4, lo, .81), (0, 3.53, mid, .71)])
        if quiet:
            score.play("piano", bar, [(0, .85, mid + 12, .55), (1.5, .62, hi + 12, .40), (2.25, 1.69, lo + 12, .47)])
        if bar in (8, 16, 24, 28, 31):
            score.play("impact", bar, [(0, 1.65, bass, .88 if bar == 24 else .73)])
        if bar in (7, 15, 23, 30):
            score.play("riser", bar, [(0, 3.94, 80, .68)])
    return score


def drums(score, bar, *, drive, full, fill):
    kick = [0, 1, 2, 3] if drive else [0, 1.5, 2, 3.33]
    score.play("kick", bar, [(beat, .41, 36, .91 if i == 0 else .73) for i, beat in enumerate(kick)])
    score.play("snare", bar, [(1, .36, 38, .68), (3, .41, 38, .84)])
    if fill:
        score.play("snare", bar, [(2.46, .16, 38, .36), (3.53, .17, 38, .46), (3.76, .18, 38, .65)])
    ticks = [i * .5 + (i % 2) * .027 for i in range(8)] if full else [.5, 1.5, 2.5, 3.51]
    score.play("hat", bar, [(beat, .15 if i % 4 else .28, 42, .54 if i % 2 == 0 else .37) for i, beat in enumerate(ticks)])

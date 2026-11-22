# OpenMusic

![OpenMusic promotional banner with a glass prism refracting an audio waveform](assets/brand/openmusic-hero.png)

[Open the studio](https://openmusic-five.vercel.app/)

OpenMusic is a programmable music studio for people and agents. An agent can change notes, rebalance tracks, and place visual cues in a revisioned proposal. A person auditions the current score and the proposal at the same position before accepting or rejecting it.

The performance page plays **Faith** and **AGI**, two original scores built from recorded orchestral instruments and programmable synths. **Mist** is the reference master from Retro Hotline. The browser and HyperFrames use the same WebGL prism and beat cues. The studio opens **Glass Meridian**, an eight-bar score with seven individually rendered tracks.

## Run the studio

Use Node.js 24 and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:4173` for the performances, or `/studio/` for the editable score. The studio opens with a pending proposal. Select the gain change to seek to bar 5, switch between A and B at the same position, then accept or reject it. Both variants use the same playback gain. The WAV export preserves the authored mix. The local decision survives reload. Import a new proposal in the review panel to keep iterating.

## Run the music harness

```sh
pnpm music check
pnpm music demo-proposal --out out/proposal.json
pnpm music render --out out/baseline.wav
pnpm music render --proposal out/proposal.json --bars 5:8 --out out/candidate.wav
pnpm music video --proposal out/proposal.json
npx --yes hyperframes@0.9.80 lint out/hyperframes
npx --yes hyperframes@0.9.80 render out/hyperframes --output "$PWD/out/glass-meridian.mp4"
uv run tools/analyze_audio.py out/baseline.wav out/candidate.wav
cargo run --release -p openmusic-pcm -- out/baseline.wav
```

Bar ranges use inclusive, one-based numbers. To author another piece, pass a local TypeScript module exporting a score, or a score JSON file, to `check`, `render`, or `video`. Rendering from TypeScript executes that local module. Only load code from a trusted workspace.

## Original performances

`examples/releases/arrangement.py` contains the notes, voicings and dynamics. `performances.ts` assigns the visual cues. The scored recordings use [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e) at `440300901dfe`, published under CC0. To reproduce the masters, use Python with NumPy and SciPy, FFmpeg, and a checkout of those samples.

```sh
python examples/releases/render.py --samples /path/to/VSCO-2-CE --stems out/release-stems
pnpm music video --performance faith --out out/faith-film
pnpm music video --performance agi --out out/agi-film
npx --yes hyperframes@0.9.80 render out/faith-film --output "$PWD/out/faith.mp4"
```

The stem export contains aligned stereo WAVs, a room return and the note data. `examples/mist/master.wav` is the original stereo master from [Retro Hotline](https://github.com/moonhotline/retro-hotline/blob/445c9c4378a1913f28fd07ef15fc5ecf96c8b7ac/frontend/public/audio/bgm_menu.wav).

## Shared review

Vercel builds the dependency-free static studio using `node tools/build.mjs`. The Cloudflare Worker implements a private shared workspace for the example. Build its three module files with `pnpm build:worker`. Bind `PROJECT` to the exported SQLite Durable Object class `MusicProject` and set `STUDIO_ORIGINS` to the exact studio origin. Configure distinct `AGENT_TOKEN` and `REVIEW_TOKEN` values of at least 24 characters as Worker secrets.

| Method | Path | Authorized role |
| --- | --- | --- |
| GET | `/health` | Public |
| GET | `/v1/project` | Agent or reviewer |
| POST | `/v1/proposals` | Agent |
| POST | `/v1/decision` | Reviewer |
| POST | `/v1/audio/pcm` | Agent or reviewer |

Set `OPENMUSIC_WORKER` and `OPENMUSIC_AGENT_TOKEN` in the agent runner, then run `pnpm music project` and `pnpm music submit out/proposal.json`. Read the current revision before drafting a proposal. A proposal says what to change and declares its base revision. The reviewer connects using their own token in the studio. A stale proposal or conflicting pending edit returns `409`. The reviewer can export a draft WAV for listening before committing a score version.

## Stream audio through Rust

The [OpenMusic API](https://openmusic.moonhotline.workers.dev/health) authenticates the request and forwards the body to the private `openmusic-audio` Worker through the `AUDIO` service binding. The Worker frames the byte stream and passes blocks to a Rust/WASM kernel for gain and PCM16 saturation. It preserves the sample rate, channel count and frame count. In the studio, connect the shared project to process and export the current audition. Agents can process a WAV from the CLI with their existing Worker connection.

```sh
pnpm music process out/baseline.wav --gain-db=-6 --out out/attenuated.wav
```

Send raw little-endian PCM16 to `POST /v1/audio/pcm?gainDb=-6` with `Content-Type: audio/pcm`, `X-Sample-Rate` and `X-Channels`. The endpoint accepts mono and stereo at 8–192 kHz, up to 32 MiB per stream, with gain from −60 to +18 dB. The response uses the same format. A malformed stream discovered after response headers aborts the body. The CLI checks output length before publishing the new WAV.

Install the `wasm32-unknown-unknown` Rust target and run `pnpm build:audio-worker`. Deploy `out/audio-worker/index.js` and `audio.wasm` as a private Cloudflare Worker with the `AUDIO` binding in the public API.

## Repository layout

| Area | Contents |
| --- | --- |
| `apps/performance` | Fullscreen WebGL stage and direct master playback |
| `apps/studio` | Web Audio transport, review UI, background render worker |
| `apps/worker` | Cloudflare API and transactional review state |
| `apps/audio-worker` | Private Rust Worker for streaming PCM processing |
| `packages/score` | Score validation, beat-to-sample compiler, proposal and review state |
| `packages/audio` | Deterministic synthesis, stereo mix, PCM/WAV and metrics |
| `packages/prism` | Time-addressable WebGL prism shared by the performance page and HyperFrames |
| `examples/glass-meridian` | Original score and example proposal |
| `examples/releases` | Faith and AGI scores, sampler, masters and performance cues |
| `crates/openmusic-pcm` | Streaming Rust PCM inspection |
| `tools` | CLI, HyperFrames composition, Python analysis and regression run |

`pnpm check`, `pnpm build` and `pnpm regression` validate the TypeScript, site build, role boundary, revision workflow and reproducible audio. The studio currently renders bounded scores ahead of playback. The PCM tool reads WAV in bounded chunks. Longer browser audio streams, file uploads and multi-project storage are follow-on work.

Compare a new score with Mist at matched loudness. Check the melody, timbre, dynamics and mix balance by ear. Clipping and level metrics are measured separately.

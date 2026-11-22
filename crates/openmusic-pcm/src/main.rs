use std::env;
use std::fs::File;
use std::io::{self, BufReader, Read, Seek, SeekFrom};

fn inspect(path: &str) -> io::Result<()> {
    let file = File::open(path)?;
    let size = file.metadata()?.len();
    let mut input = BufReader::new(file);
    let mut riff = [0; 12];
    input.read_exact(&mut riff)?;
    if &riff[..4] != b"RIFF" || &riff[8..] != b"WAVE" {
        return Err(invalid("File is not RIFF/WAVE"));
    }

    let mut format = None;
    while input.stream_position()? + 8 <= size {
        let mut header = [0; 8];
        input.read_exact(&mut header)?;
        let length = u32::from_le_bytes(header[4..8].try_into().unwrap());
        let start = input.stream_position()?;
        let end = start + u64::from(length);
        if end > size {
            return Err(invalid("Truncated WAV chunk"));
        }

        match &header[..4] {
            b"fmt " if length >= 16 => {
                let mut fmt = [0; 16];
                input.read_exact(&mut fmt)?;
                let code = u16::from_le_bytes(fmt[0..2].try_into().unwrap());
                let channels = u16::from_le_bytes(fmt[2..4].try_into().unwrap());
                let rate = u32::from_le_bytes(fmt[4..8].try_into().unwrap());
                let bits = u16::from_le_bytes(fmt[14..16].try_into().unwrap());
                if code != 1 || channels == 0 || rate == 0 || bits != 16 {
                    return Err(invalid("Expected 16-bit PCM with a valid sample rate and channel count"));
                }
                format = Some((channels, rate));
            }
            b"data" => {
                let (channels, rate) = format.ok_or_else(|| invalid("No format before PCM data"))?;
                let frame_bytes = u32::from(channels) * 2;
                if length % frame_bytes != 0 {
                    return Err(invalid("Audio data ends inside a frame"));
                }
                let mut remaining = length as usize;
                let mut buffer = [0; 16384];
                let mut peak = 0u16;
                let mut clipped = 0u64;
                while remaining > 0 {
                    let count = remaining.min(buffer.len());
                    input.read_exact(&mut buffer[..count])?;
                    for sample in buffer[..count].chunks_exact(2) {
                        let value = i16::from_le_bytes([sample[0], sample[1]]);
                        peak = peak.max(value.unsigned_abs());
                        clipped += u64::from(value == i16::MIN || value == i16::MAX);
                    }
                    remaining -= count;
                }
                let frames = length / frame_bytes;
                println!(
                    "{{\"sampleRate\":{rate},\"channels\":{channels},\"frames\":{frames},\"peakPcm16\":{peak},\"clippedSamples\":{clipped}}}"
                );
                return Ok(());
            }
            _ => {}
        }
        input.seek(SeekFrom::Start(end + u64::from(length % 2)))?;
    }
    Err(invalid("No PCM data found"))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("Usage: openmusic-pcm INPUT.wav");
        std::process::exit(2);
    };
    if let Err(error) = inspect(&path) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

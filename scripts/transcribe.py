#!/usr/bin/env python3
"""
Secure audio transcription script using faster-whisper
Usage: python3 transcribe.py <audio_file_path>
"""
import sys
import os
import re
from pathlib import Path

def validate_audio_path(audio_path: str) -> bool:
    """Validate that the audio file path is safe and exists."""
    try:
        # Convert to Path object and resolve
        path = Path(audio_path).resolve()
        
        # Check if file exists
        if not path.exists():
            print(f"Error: File does not exist: {audio_path}", file=sys.stderr)
            return False
            
        # Ensure it's in /tmp directory (security constraint)
        tmp_dir = Path('/tmp').resolve()
        if not str(path).startswith(str(tmp_dir)):
            print(f"Error: File must be in /tmp directory for security", file=sys.stderr)
            return False
            
        # Check file extension (basic validation)
        allowed_extensions = {'.wav', '.mp3', '.m4a', '.flac', '.ogg'}
        if path.suffix.lower() not in allowed_extensions:
            print(f"Error: Unsupported file extension: {path.suffix}", file=sys.stderr)
            return False
            
        return True
        
    except Exception as e:
        print(f"Error validating path: {e}", file=sys.stderr)
        return False

def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using faster-whisper."""
    try:
        # Import here to fail gracefully if not installed
        from faster_whisper import WhisperModel
        
        # Initialize model
        model = WhisperModel('base', device='cpu', compute_type='int8')
        
        # Transcribe
        segments, info = model.transcribe(audio_path, beam_size=5)
        
        # Combine segments
        transcript = ' '.join([segment.text for segment in segments])
        
        return transcript.strip()
        
    except ImportError:
        print("Error: faster-whisper not installed. Please install with: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error during transcription: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 transcribe.py <audio_file_path>", file=sys.stderr)
        sys.exit(1)
    
    audio_path = sys.argv[1]
    
    # Validate input
    if not validate_audio_path(audio_path):
        sys.exit(1)
    
    # Transcribe
    transcript = transcribe_audio(audio_path)
    
    # Output result (stdout only, no debugging info)
    print(transcript)

if __name__ == "__main__":
    main()
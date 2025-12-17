# YouTube to MP3 Converter

## Overview
A Flask web application that allows users to convert YouTube videos to MP3 audio files for download.

## Current State
Fully functional YouTube to MP3 converter with:
- YouTube URL input with validation
- Audio extraction using yt-dlp
- MP3 conversion at 192kbps quality
- Download functionality for converted files
- Clean, responsive UI with Bootstrap 5

## Project Structure
```
/
├── app.py              # Main Flask application
├── templates/
│   └── index.html      # Main page template
├── static/
│   ├── style.css       # Custom styling
│   └── script.js       # Frontend JavaScript
├── downloads/          # Temporary storage for converted files
└── replit.md           # This file
```

## How to Run
The application runs on port 5000. Start it with:
```bash
python app.py
```

## Dependencies
- Flask - Web framework
- yt-dlp - YouTube video/audio extraction
- FFmpeg - Audio processing and conversion
- gunicorn - Production WSGI server

## Features
1. **URL Validation**: Validates YouTube URLs before processing
2. **Audio Extraction**: Uses yt-dlp to extract best quality audio
3. **MP3 Conversion**: Converts to 192kbps MP3 using FFmpeg
4. **Download**: Provides downloadable MP3 file with video title as filename
5. **Error Handling**: User-friendly error messages for common issues

## Recent Changes
- December 17, 2025: Initial implementation of YouTube to MP3 converter

import os
import re
import time
import uuid
import base64
from flask import Flask, render_template, request, jsonify, send_file, Response
from flask_sqlalchemy import SQLAlchemy
import yt_dlp

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

class Song(db.Model):
    __tablename__ = 'songs'
    id = db.Column(db.String(36), primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    artist = db.Column(db.String(255), default='Unknown Artist')
    duration = db.Column(db.Integer, default=0)
    youtube_url = db.Column(db.String(500))
    thumbnail_url = db.Column(db.String(500))
    file_data = db.Column(db.LargeBinary)
    created_at = db.Column(db.DateTime, default=db.func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'artist': self.artist,
            'duration': self.duration,
            'youtube_url': self.youtube_url,
            'thumbnail_url': self.thumbnail_url,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

with app.app_context():
    db.create_all()

def is_valid_youtube_url(url):
    youtube_regex = re.compile(
        r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/'
        r'(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})'
    )
    return youtube_regex.match(url) is not None

def clean_old_files():
    for filename in os.listdir(DOWNLOAD_FOLDER):
        filepath = os.path.join(DOWNLOAD_FOLDER, filename)
        try:
            if os.path.isfile(filepath):
                file_age = time.time() - os.path.getmtime(filepath)
                if file_age > 3600:
                    os.remove(filepath)
        except:
            pass

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return jsonify({
        "name": "Music Player",
        "short_name": "Music",
        "description": "Android-style offline music player",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#121212",
        "theme_color": "#1DB954",
        "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"}
        ]
    })

@app.route('/api/extract', methods=['POST'])
def extract_info():
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'success': False, 'error': 'Please provide a YouTube URL'})
    
    if not is_valid_youtube_url(url):
        return jsonify({'success': False, 'error': 'Invalid YouTube URL format'})
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                return jsonify({'success': False, 'error': 'Could not extract video information'})
            
            thumbnail = info.get('thumbnail', '')
            if not thumbnail:
                thumbnails = info.get('thumbnails', [])
                if thumbnails:
                    thumbnail = thumbnails[-1].get('url', '')
            
            return jsonify({
                'success': True,
                'title': info.get('title', 'Unknown'),
                'artist': info.get('uploader', 'Unknown Artist'),
                'duration': info.get('duration', 0),
                'thumbnail': thumbnail,
                'url': url
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to extract info: {str(e)}'})

@app.route('/api/download', methods=['POST'])
def download_song():
    clean_old_files()
    
    data = request.get_json()
    url = data.get('url', '').strip()
    title = data.get('title', 'Unknown')
    artist = data.get('artist', 'Unknown Artist')
    duration = data.get('duration', 0)
    thumbnail = data.get('thumbnail', '')
    
    if not url or not is_valid_youtube_url(url):
        return jsonify({'success': False, 'error': 'Invalid YouTube URL'})
    
    try:
        file_id = str(uuid.uuid4())
        output_path = os.path.join(DOWNLOAD_FOLDER, file_id)
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': output_path,
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        mp3_path = output_path + '.mp3'
        
        if not os.path.exists(mp3_path):
            for ext in ['.webm', '.m4a', '.opus', '.ogg']:
                alt_path = output_path + ext
                if os.path.exists(alt_path):
                    os.rename(alt_path, mp3_path)
                    break
        
        if not os.path.exists(mp3_path):
            return jsonify({'success': False, 'error': 'Failed to convert audio'})
        
        with open(mp3_path, 'rb') as f:
            file_data = f.read()
        
        song = Song(
            id=file_id,
            title=title,
            artist=artist,
            duration=duration,
            youtube_url=url,
            thumbnail_url=thumbnail,
            file_data=file_data
        )
        db.session.add(song)
        db.session.commit()
        
        os.remove(mp3_path)
        
        return jsonify({
            'success': True,
            'song': song.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Download failed: {str(e)}'})

@app.route('/api/songs')
def get_songs():
    songs = Song.query.order_by(Song.created_at.desc()).all()
    return jsonify({
        'success': True,
        'songs': [song.to_dict() for song in songs]
    })

@app.route('/api/songs/<song_id>')
def get_song(song_id):
    song = Song.query.get(song_id)
    if not song:
        return jsonify({'success': False, 'error': 'Song not found'}), 404
    return jsonify({'success': True, 'song': song.to_dict()})

@app.route('/api/songs/<song_id>/audio')
def stream_audio(song_id):
    song = Song.query.get(song_id)
    if not song or not song.file_data:
        return jsonify({'error': 'Song not found'}), 404
    
    return Response(
        song.file_data,
        mimetype='audio/mpeg',
        headers={
            'Content-Disposition': f'inline; filename="{song.title}.mp3"',
            'Accept-Ranges': 'bytes',
            'Content-Length': len(song.file_data),
            'Cache-Control': 'public, max-age=31536000'
        }
    )

@app.route('/api/songs/<song_id>/blob')
def get_audio_blob(song_id):
    song = Song.query.get(song_id)
    if not song or not song.file_data:
        return jsonify({'error': 'Song not found'}), 404
    
    audio_base64 = base64.b64encode(song.file_data).decode('utf-8')
    return jsonify({
        'success': True,
        'audio': audio_base64,
        'song': song.to_dict()
    })

@app.route('/api/songs/<song_id>', methods=['DELETE'])
def delete_song(song_id):
    song = Song.query.get(song_id)
    if not song:
        return jsonify({'success': False, 'error': 'Song not found'}), 404
    
    db.session.delete(song)
    db.session.commit()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

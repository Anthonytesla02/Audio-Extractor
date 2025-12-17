import os
import re
import time
import uuid
from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

DOWNLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

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

@app.route('/convert', methods=['POST'])
def convert():
    clean_old_files()
    
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'success': False, 'error': 'Please provide a YouTube URL'})
    
    if not is_valid_youtube_url(url):
        return jsonify({'success': False, 'error': 'Invalid YouTube URL format'})
    
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
            info = ydl.extract_info(url, download=True)
            if info is None:
                return jsonify({'success': False, 'error': 'Could not extract video information'})
            title = info.get('title', 'audio')
            duration = info.get('duration', 0)
        
        mp3_path = output_path + '.mp3'
        
        if not os.path.exists(mp3_path):
            for ext in ['.webm', '.m4a', '.opus', '.ogg']:
                alt_path = output_path + ext
                if os.path.exists(alt_path):
                    os.rename(alt_path, mp3_path)
                    break
        
        if os.path.exists(mp3_path):
            safe_title = re.sub(r'[^\w\s-]', '', title)[:50]
            return jsonify({
                'success': True,
                'file_id': file_id,
                'title': title,
                'safe_title': safe_title,
                'duration': duration
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to convert audio'})
            
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if 'Video unavailable' in error_msg:
            return jsonify({'success': False, 'error': 'Video is unavailable or private'})
        elif 'age-restricted' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Video is age-restricted'})
        else:
            return jsonify({'success': False, 'error': 'Failed to download video. Please check the URL.'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'An error occurred: {str(e)}'})

@app.route('/download/<file_id>')
def download(file_id):
    if not re.match(r'^[a-f0-9\-]+$', file_id):
        return jsonify({'error': 'Invalid file ID'}), 400
    
    mp3_path = os.path.join(DOWNLOAD_FOLDER, file_id + '.mp3')
    
    if not os.path.exists(mp3_path):
        return jsonify({'error': 'File not found or expired'}), 404
    
    title = request.args.get('title', 'audio')
    safe_title = re.sub(r'[^\w\s-]', '', title)[:50] + '.mp3'
    
    return send_file(
        mp3_path,
        as_attachment=True,
        download_name=safe_title,
        mimetype='audio/mpeg'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let db;
let songs = [];
let currentSongIndex = -1;
let isPlaying = false;
let isShuffled = false;
let repeatMode = 0;
let extractedInfo = null;

const audio = document.getElementById('audio-player');

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveToIndexedDB(song, audioBlob) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ ...song, audioBlob });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getFromIndexedDB(songId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(songId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromIndexedDB(songId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(songId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function init() {
    await initDB();
    await loadSongs();
    setupEventListeners();
}

async function loadSongs() {
    try {
        const response = await fetch('/api/songs');
        const data = await response.json();
        
        if (data.success) {
            songs = data.songs;
            renderSongList();
            
            for (const song of songs) {
                const cached = await getFromIndexedDB(song.id);
                if (!cached || !cached.audioBlob) {
                    cacheAudioForOffline(song);
                }
            }
        }
    } catch (error) {
        const cached = await getAllFromIndexedDB();
        if (cached && cached.length > 0) {
            songs = cached;
            renderSongList();
        }
    }
}

async function cacheAudioForOffline(song) {
    try {
        const response = await fetch(`/api/songs/${song.id}/blob`);
        const data = await response.json();
        
        if (data.success && data.audio) {
            const binaryString = atob(data.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            await saveToIndexedDB(song, audioBlob);
        }
    } catch (error) {
        console.log('Failed to cache audio for offline:', error);
    }
}

function renderSongList() {
    const songList = document.getElementById('song-list');
    const emptyState = document.getElementById('empty-state');
    const songCount = document.getElementById('song-count');
    
    songCount.textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
    
    if (songs.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    const songsHTML = songs.map((song, index) => `
        <div class="song-item ${currentSongIndex === index && isPlaying ? 'playing' : ''}" 
             onclick="playSong(${index})" 
             style="animation-delay: ${index * 0.05}s">
            <img src="${song.thumbnail_url || '/static/default-album.svg'}" 
                 alt="" class="song-thumbnail" 
                 onerror="this.src='/static/default-album.svg'">
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.artist)}</div>
            </div>
            <span class="song-duration">${formatDuration(song.duration)}</span>
            <div class="song-actions">
                <button class="btn-icon" onclick="event.stopPropagation(); deleteSong('${song.id}')">
                    <span class="material-icons-round">delete</span>
                </button>
            </div>
        </div>
    `).join('');
    
    songList.innerHTML = songsHTML;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function playSong(index) {
    if (index < 0 || index >= songs.length) return;
    
    currentSongIndex = index;
    const song = songs[index];
    
    updatePlayerUI(song);
    showMiniPlayer();
    renderSongList();
    
    try {
        const cached = await getFromIndexedDB(song.id);
        
        if (cached && cached.audioBlob) {
            const url = URL.createObjectURL(cached.audioBlob);
            audio.src = url;
        } else {
            audio.src = `/api/songs/${song.id}/audio`;
        }
        
        await audio.play();
        isPlaying = true;
        updatePlayButtons();
    } catch (error) {
        console.error('Playback error:', error);
        showAlert('Failed to play song', 'error');
    }
}

function updatePlayerUI(song) {
    document.getElementById('mini-thumbnail').src = song.thumbnail_url || '/static/default-album.svg';
    document.getElementById('mini-title').textContent = song.title;
    document.getElementById('mini-artist').textContent = song.artist;
    
    document.getElementById('full-thumbnail').src = song.thumbnail_url || '/static/default-album.svg';
    document.getElementById('full-title').textContent = song.title;
    document.getElementById('full-artist').textContent = song.artist;
    document.getElementById('total-time').textContent = formatDuration(song.duration);
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            artwork: song.thumbnail_url ? [{ src: song.thumbnail_url }] : []
        });
    }
}

function showMiniPlayer() {
    document.getElementById('mini-player').style.display = 'flex';
}

function togglePlay() {
    if (currentSongIndex === -1 && songs.length > 0) {
        playSong(0);
        return;
    }
    
    if (isPlaying) {
        audio.pause();
    } else {
        audio.play();
    }
}

function updatePlayButtons() {
    const icon = isPlaying ? 'pause' : 'play_arrow';
    document.getElementById('mini-play-icon').textContent = icon;
    document.getElementById('full-play-icon').textContent = icon;
}

function playNext() {
    if (songs.length === 0) return;
    
    let nextIndex;
    if (isShuffled) {
        nextIndex = Math.floor(Math.random() * songs.length);
    } else {
        nextIndex = (currentSongIndex + 1) % songs.length;
    }
    playSong(nextIndex);
}

function playPrevious() {
    if (songs.length === 0) return;
    
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    
    let prevIndex;
    if (isShuffled) {
        prevIndex = Math.floor(Math.random() * songs.length);
    } else {
        prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    }
    playSong(prevIndex);
}

function toggleShuffle() {
    isShuffled = !isShuffled;
    document.getElementById('shuffle-icon').parentElement.classList.toggle('active', isShuffled);
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    const icon = document.getElementById('repeat-icon');
    icon.parentElement.classList.toggle('active', repeatMode > 0);
    icon.textContent = repeatMode === 2 ? 'repeat_one' : 'repeat';
}

function openFullPlayer() {
    document.getElementById('full-player').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeFullPlayer() {
    document.getElementById('full-player').classList.remove('open');
    document.body.style.overflow = '';
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.querySelector(`.nav-item[data-view="${viewName}"]`).classList.add('active');
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('youtube-url').value = text;
    } catch (error) {
        console.log('Clipboard access denied');
    }
}

async function extractInfo() {
    const url = document.getElementById('youtube-url').value.trim();
    if (!url) {
        showAlert('Please enter a YouTube URL', 'error');
        return;
    }
    
    const previewCard = document.getElementById('preview-card');
    const previewLoading = document.getElementById('preview-loading');
    const previewContent = document.getElementById('preview-content');
    const extractBtn = document.getElementById('extract-btn');
    
    previewCard.style.display = 'block';
    previewLoading.style.display = 'block';
    previewContent.style.display = 'none';
    extractBtn.disabled = true;
    
    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (data.success) {
            extractedInfo = data;
            
            document.getElementById('preview-thumbnail').src = data.thumbnail || '/static/default-album.svg';
            document.getElementById('preview-title').textContent = data.title;
            document.getElementById('preview-artist').textContent = data.artist;
            document.getElementById('preview-duration').textContent = `Duration: ${formatDuration(data.duration)}`;
            
            previewLoading.style.display = 'none';
            previewContent.style.display = 'block';
        } else {
            previewCard.style.display = 'none';
            showAlert(data.error, 'error');
        }
    } catch (error) {
        previewCard.style.display = 'none';
        showAlert('Failed to extract info. Please try again.', 'error');
    }
    
    extractBtn.disabled = false;
}

async function downloadSong() {
    if (!extractedInfo) return;
    
    const downloadBtn = document.getElementById('download-btn');
    const downloadProgress = document.getElementById('download-progress');
    
    downloadBtn.style.display = 'none';
    downloadProgress.style.display = 'block';
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: extractedInfo.url,
                title: extractedInfo.title,
                artist: extractedInfo.artist,
                duration: extractedInfo.duration,
                thumbnail: extractedInfo.thumbnail
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            songs.unshift(data.song);
            renderSongList();
            cacheAudioForOffline(data.song);
            
            document.getElementById('youtube-url').value = '';
            document.getElementById('preview-card').style.display = 'none';
            extractedInfo = null;
            
            showAlert('Song added to your library!', 'success');
            switchView('library');
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Download failed. Please try again.', 'error');
    }
    
    downloadBtn.style.display = 'flex';
    downloadProgress.style.display = 'none';
}

async function deleteSong(songId) {
    if (!confirm('Remove this song from your library?')) return;
    
    try {
        await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
        await deleteFromIndexedDB(songId);
        
        songs = songs.filter(s => s.id !== songId);
        
        if (currentSongIndex >= 0 && songs[currentSongIndex]?.id === songId) {
            audio.pause();
            currentSongIndex = -1;
            document.getElementById('mini-player').style.display = 'none';
        }
        
        renderSongList();
        showAlert('Song removed', 'success');
    } catch (error) {
        showAlert('Failed to delete song', 'error');
    }
}

function showAlert(message, type) {
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    document.querySelector('.main-content .view.active').appendChild(alert);
    
    setTimeout(() => alert.remove(), 3000);
}

function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });
    
    audio.addEventListener('play', () => {
        isPlaying = true;
        updatePlayButtons();
    });
    
    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButtons();
    });
    
    audio.addEventListener('ended', () => {
        if (repeatMode === 2) {
            audio.currentTime = 0;
            audio.play();
        } else if (repeatMode === 1 || currentSongIndex < songs.length - 1) {
            playNext();
        } else {
            isPlaying = false;
            updatePlayButtons();
        }
    });
    
    audio.addEventListener('timeupdate', () => {
        const progress = (audio.currentTime / audio.duration) * 100 || 0;
        document.getElementById('mini-progress-bar').style.width = `${progress}%`;
        document.getElementById('progress-slider').value = progress;
        document.getElementById('current-time').textContent = formatDuration(audio.currentTime);
    });
    
    document.getElementById('progress-slider').addEventListener('input', (e) => {
        const time = (e.target.value / 100) * audio.duration;
        audio.currentTime = time;
    });
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
        navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
    
    document.getElementById('youtube-url').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') extractInfo();
    });
}

init();

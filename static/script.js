function convertVideo() {
    const urlInput = document.getElementById('youtube-url');
    const convertBtn = document.getElementById('convert-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const statusSection = document.getElementById('status-section');
    const progressContainer = document.getElementById('progress-container');
    const errorContainer = document.getElementById('error-container');
    const successContainer = document.getElementById('success-container');
    const statusText = document.getElementById('status-text');
    const errorMessage = document.getElementById('error-message');
    
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }
    
    convertBtn.disabled = true;
    btnText.textContent = 'Converting...';
    btnSpinner.classList.remove('d-none');
    
    statusSection.classList.remove('d-none');
    progressContainer.classList.remove('d-none');
    errorContainer.classList.add('d-none');
    successContainer.classList.add('d-none');
    statusText.textContent = 'Connecting to YouTube...';
    
    setTimeout(() => {
        statusText.textContent = 'Extracting audio...';
    }, 2000);
    
    setTimeout(() => {
        statusText.textContent = 'Converting to MP3...';
    }, 5000);
    
    fetch('/convert', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url })
    })
    .then(response => response.json())
    .then(data => {
        convertBtn.disabled = false;
        btnText.textContent = 'Convert';
        btnSpinner.classList.add('d-none');
        progressContainer.classList.add('d-none');
        
        if (data.success) {
            showSuccess(data);
        } else {
            showError(data.error);
        }
    })
    .catch(error => {
        convertBtn.disabled = false;
        btnText.textContent = 'Convert';
        btnSpinner.classList.add('d-none');
        progressContainer.classList.add('d-none');
        showError('Network error. Please try again.');
    });
}

function showError(message) {
    const statusSection = document.getElementById('status-section');
    const errorContainer = document.getElementById('error-container');
    const successContainer = document.getElementById('success-container');
    const errorMessage = document.getElementById('error-message');
    
    statusSection.classList.remove('d-none');
    errorContainer.classList.remove('d-none');
    successContainer.classList.add('d-none');
    errorMessage.textContent = message;
}

function showSuccess(data) {
    const successContainer = document.getElementById('success-container');
    const videoTitle = document.getElementById('video-title');
    const videoDuration = document.getElementById('video-duration');
    const downloadLink = document.getElementById('download-link');
    
    successContainer.classList.remove('d-none');
    videoTitle.textContent = data.title;
    
    if (data.duration) {
        const minutes = Math.floor(data.duration / 60);
        const seconds = data.duration % 60;
        videoDuration.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        videoDuration.textContent = '';
    }
    
    downloadLink.href = `/download/${data.file_id}?title=${encodeURIComponent(data.safe_title)}`;
}

document.getElementById('youtube-url').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        convertVideo();
    }
});

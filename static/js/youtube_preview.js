// static/js/youtube_preview.js
document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.querySelector('#id_youtube_url'); // youtube_url 입력창
    const previewIframe = document.querySelector('.field-preview iframe'); // 미리보기 iframe
    
    if (urlInput && previewIframe) {
        urlInput.addEventListener('input', function() {
            const url = this.value.trim();
            let videoId = '';

            // 유튜브 ID 추출 로직 (JS 버전)
            if (url.includes('youtu.be/')) {
                videoId = url.split('youtu.be/')[1].split(/[?#]/)[0];
            } else if (url.includes('v=')) {
                videoId = url.split('v=')[1].split('&')[0];
            } else if (url.includes('embed/')) {
                videoId = url.split('embed/')[1].split(/[?#]/)[0];
            } else if (url.includes('shorts/')) {
                videoId = url.split('shorts/')[1].split(/[?#]/)[0];
            }

            if (videoId) {
                previewIframe.src = `https://www.youtube.com/embed/${videoId}`;
                previewIframe.style.display = 'block';
            } else {
                previewIframe.style.display = 'none';
            }
        });
    }
});
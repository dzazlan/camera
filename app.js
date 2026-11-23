(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const canvas = $('canvas');
  const shutter = $('shutter');
  const switchBtn = $('switch');
  const flash = $('flash');
  const message = $('message');
  const lastThumb = $('last-thumb');
  const recIndicator = $('rec-indicator');
  const recTime = $('rec-time');
  const gallery = $('gallery');
  const galleryGrid = $('gallery-grid');
  const galleryEmpty = $('gallery-empty');
  const viewer = $('viewer');
  const viewerMedia = $('viewer-media');
  const viewerDownload = $('viewer-download');

  let stream = null;
  let facingMode = 'user';
  let mode = 'photo';
  let recorder = null;
  let chunks = [];
  let recStart = 0;
  let recTimer = null;
  let currentItem = null;

  /** @type {{id:number, type:'photo'|'video', blob:Blob, url:string, name:string}[]} */
  const items = [];
  let nextId = 1;

  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showMessage('Camera access is not supported in this browser. Open the app over HTTPS or on localhost.');
      shutter.disabled = true;
      return;
    }
    stopStream();
    showMessage('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video',
      });
    } catch (err) {
      // Retry without audio if the microphone was refused.
      if (mode === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        } catch (_) { /* fall through */ }
      }
      if (!stream) {
        showMessage(err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and reload.'
          : `Could not start the camera (${err.name}).`);
        shutter.disabled = true;
        return;
      }
    }
    video.srcObject = stream;
    video.classList.toggle('mirrored', facingMode === 'user');
    shutter.disabled = false;
    updateSwitchButton();
  }

  async function updateSwitchButton() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      switchBtn.disabled = cams.length < 2;
    } catch (_) {
      switchBtn.disabled = false;
    }
  }

  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function addItem(type, blob, ext) {
    const item = {
      id: nextId++,
      type,
      blob,
      url: URL.createObjectURL(blob),
      name: `${type === 'photo' ? 'IMG' : 'VID'}_${timestamp()}.${ext}`,
    };
    items.unshift(item);
    refreshThumb();
  }

  function refreshThumb() {
    const latest = items[0];
    if (!latest) {
      lastThumb.hidden = true;
      lastThumb.removeAttribute('src');
      return;
    }
    if (latest.type === 'photo') {
      lastThumb.src = latest.url;
      lastThumb.hidden = false;
    } else {
      // Grab a frame from the video for the thumbnail.
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.src = latest.url;
      v.addEventListener('loadeddata', () => {
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        lastThumb.src = c.toDataURL('image/jpeg', 0.7);
        lastThumb.hidden = false;
      }, { once: true });
    }
  }

  function takePhoto() {
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    flash.classList.remove('on');
    void flash.offsetWidth; // restart animation
    flash.classList.add('on');

    canvas.toBlob((blob) => blob && addItem('photo', blob, 'jpg'), 'image/jpeg', 0.92);
  }

  function pickMimeType() {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  }

  function startRecording() {
    if (!window.MediaRecorder) {
      showMessage('Video recording is not supported in this browser.');
      return;
    }
    const mimeType = pickMimeType();
    chunks = [];
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      addItem('video', blob, type.includes('mp4') ? 'mp4' : 'webm');
      recorder = null;
    };
    recorder.start();
    recStart = Date.now();
    recTime.textContent = '00:00';
    recIndicator.hidden = false;
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      recTime.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
    shutter.classList.add('recording');
    shutter.setAttribute('aria-label', 'Stop recording');
    setControlsLocked(true);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    clearInterval(recTimer);
    recIndicator.hidden = true;
    shutter.classList.remove('recording');
    shutter.setAttribute('aria-label', 'Start recording');
    setControlsLocked(false);
  }

  function setControlsLocked(locked) {
    switchBtn.disabled = locked;
    document.querySelectorAll('.mode').forEach((b) => (b.disabled = locked));
    if (!locked) updateSwitchButton();
  }

  function setMode(newMode) {
    if (newMode === mode) return;
    mode = newMode;
    document.querySelectorAll('.mode').forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    shutter.classList.toggle('video', mode === 'video');
    shutter.setAttribute('aria-label', mode === 'video' ? 'Start recording' : 'Take photo');
    startCamera(); // re-request so audio is included for video
  }

  // ---------- Gallery ----------
  function renderGallery() {
    galleryGrid.innerHTML = '';
    galleryEmpty.hidden = items.length > 0;
    for (const item of items) {
      const btn = document.createElement('button');
      btn.setAttribute('aria-label', item.name);
      if (item.type === 'photo') {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.name;
        btn.append(img);
      } else {
        const v = document.createElement('video');
        v.src = item.url;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'metadata';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Video';
        btn.append(v, badge);
      }
      btn.addEventListener('click', () => openViewer(item));
      galleryGrid.append(btn);
    }
  }

  function openViewer(item) {
    currentItem = item;
    viewerMedia.innerHTML = '';
    let el;
    if (item.type === 'photo') {
      el = document.createElement('img');
      el.alt = item.name;
    } else {
      el = document.createElement('video');
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
    }
    el.src = item.url;
    viewerMedia.append(el);
    viewerDownload.href = item.url;
    viewerDownload.download = item.name;
    viewer.showModal();
  }

  function closeViewer() {
    viewerMedia.innerHTML = '';
    currentItem = null;
    viewer.close();
  }

  function deleteCurrent() {
    if (!currentItem) return;
    const idx = items.indexOf(currentItem);
    if (idx >= 0) {
      URL.revokeObjectURL(currentItem.url);
      items.splice(idx, 1);
    }
    closeViewer();
    renderGallery();
    refreshThumb();
  }

  // ---------- Events ----------
  shutter.addEventListener('click', () => {
    if (mode === 'photo') takePhoto();
    else if (recorder) stopRecording();
    else startRecording();
  });

  switchBtn.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  document.querySelectorAll('.mode').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  $('gallery-btn').addEventListener('click', () => {
    renderGallery();
    gallery.showModal();
  });
  $('close-gallery').addEventListener('click', () => gallery.close());
  $('viewer-close').addEventListener('click', closeViewer);
  $('viewer-delete').addEventListener('click', deleteCurrent);

  document.addEventListener('keydown', (e) => {
    if (gallery.open || viewer.open) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      shutter.click();
    }
  });

  // Release the camera when the tab is hidden, resume when visible.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (recorder) stopRecording();
      stopStream();
    } else {
      startCamera();
    }
  });

  startCamera();
})();

# camera

A lightweight camera app that runs in the browser. No build step and no dependencies.

## Features

- Live camera preview (front camera is mirrored)
- **Photo mode**: capture full-resolution JPEG photos with a shutter flash
- **Video mode**: record video with audio (WebM, or MP4 where supported) with a recording timer
- Switch between front and back cameras
- In-session gallery: view, download, or delete photos and videos
- Keyboard shortcut: press <kbd>Space</kbd> or <kbd>Enter</kbd> to trigger the shutter
- Releases the camera automatically when the tab is hidden

## Running

Browsers only allow camera access on secure origins (`https://` or `localhost`).
Serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

To use it on a phone, host it over HTTPS (for example with GitHub Pages: Settings → Pages → deploy from branch).

## Files

| File         | Purpose                               |
| ------------ | ------------------------------------- |
| `index.html` | Page structure                        |
| `style.css`  | Layout and styling                    |
| `app.js`     | Camera, capture, recording, gallery   |

Captured media lives only in memory for the current session; download anything you want to keep.

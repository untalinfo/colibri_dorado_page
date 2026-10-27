# Web Media Optimization Guide (Quality vs. Performance)

AI generation models output raw master files designed for visual fidelity, not for web delivery. Directly loading an unoptimized AI render on a web page results in poor Core Web Vitals (high LCP), slow Time-to-Interactive, and high data consumption.

This reference explains how the pipeline transforms raw outputs into production-grade web assets.

---

## 1. Video Optimization Architecture

### The Problem with Raw AI Videos:
- **`moov` Atom Position**: Raw MP4s place the index table (`moov` atom) at the end of the file. Browsers cannot begin playback until 100% of the video is downloaded.
- **Uncontrolled Bitrate**: Raw models often output 15–25 Mbps bitrates. For a 10-second clip, this means 25–35 MB, which burns mobile data and causes stuttering.
- **Missing Poster Image**: Without an explicit poster image, `<video>` tags remain blank during network buffering, inflating LCP (Largest Contentful Paint).

### The Web Solution:
1. **Fast-Start Streaming (`moov` atom at front)**:
   - Rearranges the MP4 container structure so the browser begins streaming immediately from the very first kilobyte.
   - Handled via `avconvert` (macOS native) or `ffmpeg -movflags +faststart`.
2. **Web Bitrate Compression**:
   - Caps bitrate to 2.5–4.5 Mbps using H.264 / HEVC.
   - Preserves 98% of visual quality while reducing file size by 25% to 60%.
3. **Automated Poster Frame Generation (`poster.webp`)**:
   - Extracts frame 0 (`00:00:00.500`) and converts it to high-efficiency WebP.
   - The browser displays the poster in <100ms, satisfying Google Core Web Vitals.

---

## 2. Image Optimization Architecture

### The Problem with Raw AI Images:
- **Bulky Formats (PNG / Uncompressed JPG)**: Raw stills range between 4 MB and 12 MB.
- **Excessive Resolution**: Generated 2K/4K images waste bandwidth when rendered in a 1200px container.
- **Bloated Metadata**: Color profiles and EXIF tags add unnecessary overhead.

### The Web Solution:
1. **WebP Encoding (`quality: 82`)**:
   - WebP provides 60%–80% size reduction over PNG with virtually no perceptual loss.
   - `quality: 82` is the psychovisual sweet spot for diffusion textures.
2. **Metadata Stripping (`-metadata none`)**:
   - Strips non-rendering EXIF and chunk headers.
3. **Retina Responsive Sizing**:
   - Capped at standard responsive breakpoints (1920px max for hero banners).

---

## 3. Toolchain & Automated Fallbacks

The pipeline dynamically detects available system tools:

| Media Type | Preferred Tool | Fallback Tool | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Image** | `cwebp` (Google WebP v1.5) | Python `Pillow` (PIL) | Lossy/lossless WebP, metadata stripping, quality scaling |
| **Video** | `ffmpeg` | macOS `avconvert` | Fast-Start (`moov` atom), H.264 web compression, poster extraction |

---

## 4. Frontend Integration Snippets

### Optimized Video Background:
```html
<video
  autoplay
  loop
  muted
  playsinline
  preload="auto"
  poster="/generated/hero-forest-poster.webp"
  class="w-full h-full object-cover"
>
  <source src="/generated/hero-forest-web.mp4" type="video/mp4" />
</video>
```

### Optimized Responsive Image:
```html
<picture>
  <source srcset="/generated/artisanal-honey.webp" type="image/webp" />
  <img
    src="/generated/artisanal-honey.png"
    alt="Artisanal Honey Jar"
    loading="lazy"
    decoding="async"
    class="w-full h-auto rounded-xl shadow-lg"
  />
</picture>
```

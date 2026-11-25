import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import {
  Upload, Image as ImageIcon, Sparkles, Download, Camera, Package, Video, Hand, Smartphone, ChevronLeft,
  ChevronRight, Layout, Layers, CheckCircle2, Monitor, Loader2, Aperture, X, ChevronDown, ChevronUp, Eye, Copy,
  FileText, Volume2, Wand2, PlayCircle, Mic, ExternalLink, Archive, RotateCcw, Sun, Lightbulb, FileBox, Files
} from 'lucide-react';

// =====================================================================================
// AI UGC STUDIO — STORYBOARD TALK SHOW
// UI / flow layar / design system  : AI UGC Studio v.2 & v.3
// Logic / prompt / engine generate : 100% verbatim dari Aksara Tools (Affiliate Studio v2.7)
// Perubahan logic hanya di titik yang ditandai "// FIX" (bug flow, tidak mengubah teks prompt)
// =====================================================================================

const APP_NAME = "AI UGC Studio · Storyboard Talk Show";
// MUSIK: default toggle musik latar (BGM) untuk app ini
const MUSIC_DEFAULT = false;
// CARA REKAM: tampilkan pilihan Cara Rekam di app ini (Talk Show: disembunyikan, kamera sudah diatur gaya panggung)
const SHOW_CARA_REKAM = false;
// LIGHTING: Recommended untuk app ini
const REC_LIGHTING = ['Warm Studio Setup', 'Bright Broadcast', 'Dramatic Spotlight'];
const APP_SHORT = "Storyboard Talk Show";
const APP_VARIANT = 'talkshow';
// AUDIO DELIVERY (struktur GPT Commercial): menentukan jenis audio default tiap shot
// Talk Show: deskripsi tanpa kata "kamera" (gaya panggung dilarang menatap lensa), default Lipsync
const AUDIO_DELIVERY_OPTIONS = [
    { id: 'lipsync', label: 'Lipsync Natural', desc: 'Talent bicara langsung' },
    { id: 'vo', label: 'Voice Over', desc: 'Narasi, tanpa lipsync' },
    { id: 'mix', label: 'Mix Talking + Montage', desc: 'Shot pertama & terakhir bicara, tengah VO' },
    { id: 'ambient', label: 'Ambient Only', desc: 'Tanpa dialog atau narasi' }
];
const AUDIO_DELIVERY_DEFAULT = 'lipsync';
const AUDIO_TYPES = ['talking', 'vo', 'none'];

const apiKey = ""; // Dibiarkan kosong: diisi otomatis oleh Gemini Canvas. Jangan isi manual.
const GENERATIVE_MODEL = "gemini-3.1-flash-image";
const FALLBACK_IMAGE_MODEL = "gemini-2.5-flash-image-preview";
const TEXT_MODEL = "gemini-2.5-flash-preview-09-2025";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

// FIX: apiKey kosong hanya valid di dalam Gemini Canvas (Canvas yang mengisi key-nya).
// Di luar Canvas semua panggilan Gemini pasti gagal 400, jadi gagal cepat dengan pesan
// yang jelas, bukan setelah 6x retry selama 31 detik.
const IN_CANVAS = (() => { try { return typeof window !== 'undefined' && window.self !== window.top; } catch (e) { return true; } })();

// FIX: retry hanya untuk 429 / 5xx / network error. 400/401/403 langsung berhenti
// (retry tidak akan menyembuhkannya). 404 model langsung fallback ke model cadangan
// sekali, tanpa menunggu percobaan terakhir.
const fetchWithRetry = async (url, options) => {
  if (!IN_CANVAS && String(url).includes('generativelanguage.googleapis.com')) {
    throw new Error('Fitur AI ini hanya berjalan di dalam Gemini Canvas. Buka file ini lewat Gemini Canvas, bukan di browser biasa.');
  }
  const delays = [1000, 2000, 4000, 8000, 16000];
  let currentUrl = url;
  let triedFallback = false;
  for (let i = 0; i <= delays.length; i++) {
    try {
      const response = await fetch(currentUrl, options);
      if (response.ok) return response;
      if (response.status === 404 && !triedFallback && String(currentUrl).includes(`/models/${GENERATIVE_MODEL}:`)) {
        triedFallback = true;
        currentUrl = String(currentUrl).replace(`/models/${GENERATIVE_MODEL}:`, `/models/${FALLBACK_IMAGE_MODEL}:`);
        continue;
      }
      if (response.status !== 429 && response.status < 500) return response;
      if (i === delays.length) return response;
    } catch (error) {
      if (i === delays.length) throw error;
    }
    if (i < delays.length) {
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
  throw new Error('Permintaan ke Gemini gagal setelah semua percobaan.');
};

let sharedAudioCtx = null;

const playClick = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioContext();
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (err) {
    console.warn("Audio click skipped", err);
  }
};

// FIX: navigator.clipboard dulu (execCommand sudah deprecated dan sering gagal
// diam-diam di iframe/browser modern); textarea + execCommand hanya fallback.
const safeCopyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (err) {
    console.warn('Clipboard API gagal, pakai fallback', err);
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try { document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed', err); }
  document.body.removeChild(textArea);
};

// FIX: pengganti alert() — alert memblokir UI dan sering diblokir di iframe Canvas.
// Toast non-blocking ini tampil 5 detik lalu hilang sendiri.
const showToastError = (message) => {
  try {
    const el = document.createElement('div');
    el.textContent = String(message);
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:90vw;background:#7f1d1d;color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.5);';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  } catch (e) { console.error('Toast error gagal tampil', e); }
};

const processImageForDownload = (base64, ratioStr) => {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk download (data gambar rusak).'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let targetRatio;
      if (ratioStr === '16:9') targetRatio = 16/9;
      else if (ratioStr === '9:16') targetRatio = 9/16;
      else targetRatio = 1;

      const srcRatio = img.width / img.height;
      let renderWidth, renderHeight, offsetX, offsetY;

      if (srcRatio > targetRatio) {
        renderHeight = img.height;
        renderWidth = img.height * targetRatio;
        offsetX = (img.width - renderWidth) / 2;
        offsetY = 0;
      } else {
        renderWidth = img.width;
        renderHeight = img.width / targetRatio;
        offsetX = 0;
        if (targetRatio > 1) { offsetY = (img.height - renderHeight) / 2; }
        else { offsetY = (img.height - renderHeight) * 0.1; }
      }

      canvas.width = Math.floor(renderWidth);
      canvas.height = Math.floor(renderHeight);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = base64;
  });
};

const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const base64ToWavUrl = (base64PCM) => {
  const binaryString = window.atob(base64PCM);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = bytes.length;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const pcmData = new Uint8Array(buffer, 44);
  pcmData.set(bytes);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

// FIX (bug Aksara #8): timing fallback "m:ss-m:ss" yang benar.
// Aksara memakai `0:0${i*2}-0:0${i*2+2}` yang rusak mulai shot 6 ("0:010-0:012") dan `%10` yang muter balik ke 0.
const formatShotTiming = (shotIndex, pace) => {
  const secPerShot = 10 / (pace || 6);
  const fmt = (t) => {
    const s = Math.round(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  return `${fmt(shotIndex * secPerShot)}-${fmt((shotIndex + 1) * secPerShot)}`;
};

// DIALOG FIT (K5 pacing + hard cut): shot lipsync harus cukup panjang untuk dialognya
const DIALOG_WPS = 2.5;          // K5: ±2,5 kata per detik bicara
const DIALOG_CUT_BUFFER = 0.5;   // jeda sebelum hard cut
const MIN_SHOT_SEC = 1.5;
const countSpokenWords = (text) => String(text || '')
  .replace(/^[^:"\n]{1,20}:\s*/, '') // label pembicara (cth "Talent A:")
  .split(/\s+/)
  .filter(w => /[A-Za-z0-9À-ɏ]/.test(w))
  .reduce((n, w) => n + ((/^[^a-z]*[A-Z]{2,5}[^a-z]*$/.test(w) || /\d/.test(w)) ? 2 : 1), 0); // singkatan/angka (GBK, SK-II, 100) dihitung 2 kata
const dialogNeedSec = (text) => { const w = countSpokenWords(text); return w ? w / DIALOG_WPS + DIALOG_CUT_BUFFER : 0; };
const parseTimingRange = (timing) => {
  const toSec = (s) => { const p = String(s || '').trim().split(':').map(Number); return p.length === 2 ? (p[0] * 60 + p[1]) : (Number(p[0]) || 0); };
  const [a, b] = String(timing || '').split(/[-–]/);
  return { start: toSec(a), end: toSec(b) };
};
const fmtTimingClock = (n) => { const r = Math.round(n * 2) / 2; const m = Math.floor(r / 60); const s = r - m * 60; return `${m}:${Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0')}`; };
// Atur ulang timing per lembar (10 detik) HANYA jika ada shot lipsync yang lebih pendek dari kebutuhan dialognya
const fitDialogTiming = (shots, pace, isTalking) => {
  for (let k = 0; k * pace < shots.length; k++) {
    const chunk = shots.slice(k * pace, (k + 1) * pace);
    const total = 10 * chunk.length / pace;
    const mins = chunk.map(s => Math.max(MIN_SHOT_SEC, isTalking(s) ? Math.ceil(dialogNeedSec(s.desc) * 2) / 2 : 0));
    let durs = chunk.map(s => { const t = parseTimingRange(s.timing); return t.end - t.start; });
    const sum = durs.reduce((a, b) => a + b, 0);
    const validDurs = durs.every(d => d > 0);
    if (validDurs && Math.abs(sum - total) < 0.05 && durs.every((d, i) => d >= mins[i] - 0.01)) continue; // timing Script AI sudah cukup: tidak diubah
    durs = validDurs && sum > 0 ? durs.map(d => d * total / sum) : chunk.map(() => total / chunk.length);
    const minSum = mins.reduce((a, b) => a + b, 0);
    const fits = minSum <= total;
    if (!fits) {
      durs = mins.map(m => m * total / minSum); // dialog terlalu panjang untuk 10 detik: dibagi proporsional (ditandai di UI)
    } else {
      const fixed = durs.map((d, i) => Math.max(d, mins[i]));
      const over = fixed.reduce((a, b) => a + b, 0) - total;
      const slack = fixed.map((d, i) => d - mins[i]);
      const slackSum = slack.reduce((a, b) => a + b, 0);
      durs = fixed.map((d, i) => d - (slackSum > 0 ? over * slack[i] / slackSum : 0));
    }
    // bulatkan ke 0,5 detik, total tetap 10 detik, shot lipsync tidak di bawah kebutuhannya
    const minUnits = fits ? mins.map(m => Math.round(m * 2)) : chunk.map(() => 1);
    const units = durs.map((d, i) => Math.max(minUnits[i], Math.floor(d * 2 + 1e-6)));
    let diff = Math.round(total * 2) - units.reduce((a, b) => a + b, 0);
    const frac = (i) => durs[i] * 2 - Math.floor(durs[i] * 2 + 1e-6);
    const order = durs.map((_, i) => i).sort((a, b) => frac(b) - frac(a));
    for (let j = 0; diff > 0; j = (j + 1) % order.length) { units[order[j]]++; diff--; }
    for (let g = 0; diff < 0 && g < 200; g++) {
      const i = units.map((_, idx) => idx).filter(idx => units[idx] > minUnits[idx]).sort((a, b) => (units[b] - minUnits[b]) - (units[a] - minUnits[a]))[0];
      if (i === undefined) break;
      units[i]--; diff++;
    }
    let t = k * 10;
    chunk.forEach((s, i) => { const end = t + units[i] / 2; s.timing = `${fmtTimingClock(t)}-${fmtTimingClock(end)}`; t = end; });
  }
  return shots;
};

// =====================================================================================
// PROMPT ENGINE — VERBATIM AKSARA
// =====================================================================================

const IDENTITY_LOCK = "CRITICAL 100% IDENTITY CLONE LOCK [STRICT ENFORCEMENT]: The character in this image MUST be an exact clone of the person in the first reference image (IMAGE 1). You MUST replicate their exact face, facial structure, eye shape, nose, mouth, hair style, gender, skin tone, and body proportions perfectly. DO NOT invent a new face. DO NOT change their identity, gender, ethnicity, or body type. Maintain extremely clear, natural skin. ABSOLUTELY DO NOT add excessive acne, blemishes, or unrealistic skin textures.";
const PRODUCT_LOCK = "CRITICAL PRODUCT LOCK [STRICT ENFORCEMENT]: The product shown MUST perfectly match the EXACT design, shape, form, color, branding, and details of the product in the reference image. Do not hallucinate new features, text, or alter its appearance in any way.";
const OUTFIT_LOCK = "CRITICAL OUTFIT LOCK [STRICT ENFORCEMENT]: The character MUST wear the EXACT SAME CLOTHING, OUTFIT, and ACCESSORIES (same color, style, fabric) as the base model in the reference image. DO NOT change their clothes in any scene.";
const STORYBOARD_CONSISTENCY_LOCK = "CRITICAL 100% CONSISTENCY LOCK [STRICT ENFORCEMENT]: The character's face, identity, gender, age, hair style, skin tone, and body proportions MUST remain EXACTLY identical to IMAGE 1 across all generated panels. Do NOT morph the face. Do NOT change the gender. OUTFIT AND ENVIRONMENT LOCK: Ensure the character's clothing and the environment perfectly match the text prompt's description consistently across all shots to maintain a seamless storyline.";

const CHARACTER_POSES = [
    { role: '01 - Close Up Front', action: 'Ultra close-up portrait, straight face looking directly at camera.' },
    { role: '02 - Medium Smile', action: 'Medium close-up, smiling slightly, natural expression, engaging.' },
    { role: '03 - Side Profile', action: 'Side profile shot, looking away thoughtfully, showing jawline.' },
    { role: '04 - Over Shoulder', action: 'Looking back over the shoulder at the camera, dynamic angle.' },
    { role: '05 - Full Body', action: 'Full body shot, standing confidently, showing full outfit.' },
    { role: '06 - Casual Sit', action: 'Sitting casually, relaxed posture, natural body language.' },
    { role: '07 - Walking', action: 'Candid walking, dynamic movement, street photography style.' },
    { role: '08 - Selfie Angle', action: 'Selfie angle, reaching hand towards camera, smartphone perspective.' },
    { role: '09 - Candid Laugh', action: 'Candid laughing out loud, eyes squeezed slightly, joyful.' },
    { role: '10 - Looking Down', action: 'Looking down thoughtfully, hands near face or chin.' },
    { role: '11 - Hair Adjust', action: 'Hands adjusting hair naturally, mid-action candid.' },
    { role: '12 - Leaning', action: 'Leaning against a wall casually, crossed arms.' },
    { role: '13 - High Angle', action: 'High angle shot looking up at camera, cute perspective.' },
    { role: '14 - Low Angle', action: 'Low angle shot looking down slightly, powerful perspective.' },
    { role: '15 - Holding Prop', action: 'Holding a coffee cup or small object, lifestyle shot.' },
    { role: '16 - Distracted', action: 'Looking away distracted, candid observation.' },
    { role: '17 - Turning Action', action: 'Mid-action turning around, hair and clothes in slight motion.' },
    { role: '18 - Macro Eyes', action: 'Extreme macro close up of eyes and upper face only.' },
    { role: '19 - Hand on Face', action: 'Resting chin on hands, deep intense eye contact.' },
    { role: '20 - Golden Hour', action: 'Basking in warm golden hour sunlight, dramatic shadows.' },
    { role: '21 - Night Light', action: 'Illuminated by neon city lights at night, moody cinematic.' },
    { role: '22 - Flash Photo', action: 'Direct harsh flash photography style, edgy look.' },
    { role: '23 - Walking Away', action: 'Walking away from camera but glancing back over shoulder.' },
    { role: '24 - Wide Smile', action: 'Expressive wide engaging smile, highly approachable.' }
];

const MOOD_OPTIONS = [
    'Ramah & Elegan',
    'Misterius & Dingin',
    'Ceria & Energetik',
    'Profesional & Tegas',
    'Santai & Kasual',
    'Edgy & Streetwear',
    'Anggun & Kalem',
    'Seksi & Menggoda',
    'Innocent & Cute',
    'Sporty & Aktif',
    'Custom...'
];

const getModeLogic = (modeId, index, productName, productDesc, background, ugcStyle = 'Handheld', povGender = 'Wanita', lightingDesc = '', scriptHint = '', sbCamera = 'iPhone 15 Pro Max') => {
    let subjectPrompt = "";
    let negPrompt = "";
    let cameraLogic = "";
    let motionCamera = "";
    let lipSyncLogic = "AMBIENT: Mouth closed or natural breathing, no talking.";

    switch (modeId) {
        case 'storyboard_builder':
            let cameraQuality = "";
            let cameraNeg = "";
            if (sbCamera === 'iPhone 15 Pro Max') {
                cameraQuality = "Shot on iPhone 15 Pro Max. Raw, crisp smartphone photography aesthetics. No cinematic filters.";
                cameraNeg = "DSLR, professional, 35mm lens, movie still, 8k resolution, overly professional cinematic grading.";
            } else if (sbCamera === 'Android Flagship (Samsung S24 Ultra)') {
                cameraQuality = "Shot on Samsung S24 Ultra. Sharp details, vivid colors, slightly saturated flagship smartphone look. No cinematic filters.";
                cameraNeg = "DSLR, professional, movie still, matte, flat colors.";
            } else if (sbCamera === 'Android Low End (Kamera Buram)') {
                cameraQuality = "Shot on a cheap low-end budget Android phone. Low resolution, slightly grainy, noisy, authentic amateur budget smartphone camera aesthetic.";
                cameraNeg = "DSLR, professional, 4k, 8k, sharp focus, high quality, crisp details, flagship phone, beautiful lighting.";
            } else if (sbCamera === 'Kamera Profesional (DSLR / Mirrorless)') {
                cameraQuality = "Shot on professional Mirrorless Camera with 50mm lens. Cinematic depth of field, sharp focus, high-end commercial quality.";
                cameraNeg = "smartphone, amateur, low quality, grainy, webcam, phone camera.";
            } else {
                cameraQuality = "Authentic raw photography. Shot on smartphone or standard camera. No cinematic filters.";
                cameraNeg = "";
            }

            cameraLogic = `${cameraQuality} LIGHTING: ${lightingDesc}`;
            subjectPrompt = `CRITICAL SCENE INSTRUCTION: [${scriptHint}]. You MUST strictly follow the camera angle, character outfit, action, and exact location/environment described here. Do NOT change the location randomly. BACKGROUND: ${background}. LIGHTING: ${lightingDesc}. Extremely realistic human skin texture, natural lived-in environment, true-to-life colors, candid and unedited look. ${cameraQuality}`;
            negPrompt = `AI generated look, synthetic, midjourney style, highly detailed digital painting, cinematic, studio lighting, over-polished, 3d render, illustration, cartoon, sketch, artificial, plastic skin, excessive acne, bad skin, altered face, changing gender, changing outfit, professional color grading, softbox, highly edited, movie still, ${cameraNeg}`;
            motionCamera = "Smooth natural action matching the scene.";
            lipSyncLogic = "AMBIENT: Adapting storyboard dialogue if any.";
            break;

        case 'ugc':
            if (ugcStyle === 'Vlog') {
                cameraLogic = `Shot on iPhone 15 Pro Max front camera. Raw unedited vlog style. Wide angle lens. Zero post-processing. LIGHTING: ${lightingDesc}`;
                motionCamera = "Smooth handheld tracking shot, natural forward movement. Model walking and talking.";
            } else if (ugcStyle === 'Tripod') {
                cameraLogic = `Shot on iPhone 15 Pro Max mounted on a simple tripod. Raw unedited smartphone photo, authentic everyday creator setup. LIGHTING: ${lightingDesc}`;
                motionCamera = "Perfectly static camera on a tripod, no movement.";
            } else {
                cameraLogic = `HANDHELD SELFIE STYLE. Shot on iPhone 15 Pro Max front camera. Candid framing, authentic raw social media snapshot. LIGHTING: ${lightingDesc}`;
                motionCamera = "Slight natural handheld camera shake.";
            }

            subjectPrompt = `RAW AUTHENTIC UGC PHOTO (${cameraLogic.split('.')[0]}). Model facing camera naturally. Candid mid-sentence expression. Model casually interacting with ${productName} (${productDesc}) in an everyday setting. CRITICAL: Extremely realistic human skin texture, clear natural skin, unedited natural look. ABSOLUTELY NO acne or excessive blemishes. LIGHTING: ${lightingDesc} Real-world lived-in background, no studio setup.`;
            negPrompt = "studio lighting, softbox, flat lighting, professional photography, DSLR, perfect smooth plastic skin, beauty filter, airbrushed, over-polished, cinematic lighting, 3d render, illustration, excessive acne, bad skin, blemishes, scars, spots, altered face, unrecognizable identity, different face, changing clothes, different outfit.";
            lipSyncLogic = "LIP-SYNC: Model is speaking, mouth moving precisely to dialogue: '[SCRIPT_SCENE_TERSEBUT]'.";
            break;

        case 'commercial':
            cameraLogic = `Professional high-end commercial product photography. Shot on Hasselblad medium format. Crisp sharp details, highly polished catalog aesthetic, 8k resolution. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `AWARD-WINNING COMMERCIAL SHOT. Masterpiece photography. Model looking pristine and perfectly styled, elegantly presenting ${productName} (${productDesc}). The product is heroically displayed, high contrast, and hyper-realistic textures. Clean, aesthetic background. LIGHTING: ${lightingDesc}`;
            negPrompt = "Amateur, smartphone photo, messy background, low quality, flat lighting, softbox, grainy, blurry, casual everyday lighting, distorted, bad anatomy, ugly, candid, snapshot, text, watermark, bad skin, blemishes, different face, changing clothes, different outfit.";
            motionCamera = "Smooth cinematic slider movement, slow motion, showcasing the product elegantly.";
            lipSyncLogic = "LIP-SYNC: Professional commercial delivery, smiling while speaking dialogue: '[SCRIPT_SCENE_TERSEBUT]'.";
            break;

        case 'mirror':
            cameraLogic = `Authentic mirror selfie. Shot on iPhone 15 Pro. Photorealistic. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `RAW MIRROR SELFIE PHOTO. Model standing in front of a mirror taking a mirror selfie with a smartphone. Model is stylishly showcasing ${productName} (${productDesc}). Trendy OOTD aesthetic. Real skin texture, unedited look. Mirror reflection visible. ABSOLUTELY NO acne. LIGHTING: ${lightingDesc}`;
            negPrompt = "Flat lighting, soft ambient light, TV commercial look, amateur, basic white background, 3d render, illustration, not a mirror selfie, missing phone, bad skin, blemishes, scars, altered face, different face, changing clothes, different outfit.";
            motionCamera = "Slight natural handheld camera shake, mimicking a mirror selfie recording.";
            lipSyncLogic = "AMBIENT: Casual posing in the mirror, natural breathing, no talking.";
            break;

        case 'pov':
            const handType = povGender === 'Pria' ? "masculine male hands" : "feminine female hands";
            cameraLogic = `Authentic everyday first-person POV, shot on an iPhone 15, looking down, photorealistic. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `RAW FIRST-PERSON POV SHOT. Authentic everyday lifestyle. Only ${handType} visible naturally holding or unboxing ${productName} (${productDesc}). Shot from user's eye-level looking down at hands. NO FACES, NO BODIES. Real skin texture, highly detailed macro focus on product. ABSOLUTELY NO TEXT OR UI. LIGHTING: ${lightingDesc}`;
            negPrompt = "Face, head, hair, eyes, mouth, neck, torso, legs, feet, full body, flat lighting, over-rendered, artificial studio lighting, highly polished professional shot, 3D render, illustration, painting, text, typography, watermark, UI.";
            motionCamera = "Authentic first-person POV, slight natural smartphone camera shake, looking down. Pair of hands naturally interacting with the product.";
            break;

        case 'product_shoot':
            cameraLogic = `Authentic everyday first-person POV perspective, shot on an iPhone 15, looking down at the product, photorealistic. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `RAW PRODUCT POV SHOT. Authentic everyday lifestyle aesthetic. The product ${productName} (${productDesc}) is resting naturally. Shot from user's eye-level looking down at the product. ZERO HUMAN PRESENCE. NO HANDS, NO ARMS, NO FACES. Highly detailed macro focus on product. ABSOLUTELY NO TEXT OR UI. Background: ${background}. LIGHTING: ${lightingDesc}`;
            negPrompt = "Hand, fingers, arm, face, head, person, human, full body, flat lighting, over-rendered, artificial studio lighting, highly polished professional shot, 3D render, illustration, painting, text, typography, watermark, UI.";
            motionCamera = "Authentic first-person POV perspective, slight natural smartphone camera shake, looking down at the product resting on a surface.";
            lipSyncLogic = "AMBIENT: No talking.";
            break;

        case 'podcast':
            const isHost = index % 2 === 0;
            const activeRole = isHost ? "Podcast Host" : "Podcast Guest";
            const lookDirection = isHost ? "facing and looking to the right side (talking to the guest)" : "facing and looking to the left side (talking to the host)";
            const framePosition = isHost ? "sitting on the left side of the frame" : "sitting on the right side of the frame";

            cameraLogic = `RAW unedited podcast video recording. Shot on Sony A7S III, 50mm lens, locked static camera on tripod. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `RAW AUTHENTIC PODCAST RECORDING. Unedited video still. Solo shot of the ${activeRole} ${framePosition}, ${lookDirection}, actively engaging in a face-to-face conversation. Speaking into a broadcast microphone (like Shure SM7B). The product ${productName} (${productDesc}) is on the shared desk. Background: ${background}. CRITICAL REALISM: Extremely realistic human skin texture, clear natural skin, unedited natural look. ZERO AI VIBE. ABSOLUTELY NO excessive acne. LIGHTING: ${lightingDesc}`;
            negPrompt = "Amateur, smartphone camera, outdoors, standing up, flat lighting, multiple people, two people in frame, changing clothes, changing background, changing camera angle, varying lighting, looking directly at the camera lens, perfect smooth plastic skin, beauty filter, airbrushed, over-polished, 3d render, illustration, artificial AI look, excessive acne, bad skin, blemishes, scars, spots, altered face, different face, changing clothes, different outfit.";
            motionCamera = "Static locked camera on a tripod with no movement.";
            lipSyncLogic = "LIP-SYNC: Model is speaking energetically into the microphone, mouth moving to dialogue: '[SCRIPT_SCENE_TERSEBUT]'.";
            break;

        default:
            cameraLogic = `Standard high quality camera setup. LIGHTING: ${lightingDesc}`;
            subjectPrompt = `High quality photorealistic shot of model with ${productName} (${productDesc}). LIGHTING: ${lightingDesc}`;
            negPrompt = "Distorted, blurry, illustration, 3d, excessive acne, blemishes, altered face, different face, changing clothes, different outfit.";
            motionCamera = "Static.";
            break;
    }

    return { subjectPrompt, negPrompt, cameraLogic, motionCamera, lipSyncLogic };
};

const MODE_BACKGROUNDS = {
    storyboard_builder: [
        'Kamar Tidur Pagi Hari',
        'Jalanan Komplek Sore Hari',
        'Meja Kerja Kantor',
        'Taman Kota Terang',
        'Dapur Estetik Minimalis'
    ],
    ugc: [
        'Kamar Kosan Aesthetic (Lampu Warm White)',
        'Warkop Kekinian (Lampu Kuning Hangat)',
        'Teras Depan Rumah Cluster',
        'Kafe Aesthetic (Sore Hari)',
        'Lorong Minimarket',
        'Kabin Mobil Siang Hari'
    ],
    commercial: [
        'Studio Setup Polos (Latar Putih Bersih)',
        'Meja Marmer Elegan (Lampu Studio Cerah)',
        'Latar Pastel Estetik Minimalis',
        'Podium Display Produk Mewah',
        'Set Ruang Tamu Skandinavia Modern'
    ],
    mirror: [
        'Kamar Estetik (Cermin Full Body)',
        'Kamar Mandi Mewah (Cermin Wastafel)',
        'Fitting Room Mall (Cahaya Terang)',
        'Lift Aesthetic (Cermin Full)',
        'Studio Minimalis (Cermin Bulat Besar)'
    ],
    pov: [
        'Meja Kerja Kayu Jati (Suasana Kantor)',
        'Kasur Sprei Motif Lokal (Unboxing Paket)',
        'Di Atas Jok Motor Matic (Jalanan Komplek)',
        'Di Balik Setir Mobil (Background Jalanan)',
        'Meja Kafe Estetik (Dekat Jendela)'
    ],
    product_shoot: [
        'Studio Putih Polos',
        'Meja Kayu Estetik',
        'Latar Abstrak Pastel',
        'Set Dapur Modern Minimalis',
        'Podium Display Akrilik'
    ],
    podcast: [
        'Studio Podcast Mewah',
        'Ruang Kedap Suara',
        'Set Meja Siaran Profesional',
        'Studio Gelap dengan Neon Aesthetic',
        'Latar Rak Buku Estetik'
    ],
    character_builder: [
        'Studio Putih Polos',
        'Latar Hitam Elegan (Premium Studio)',
        'Jalanan Kota Aesthetic',
        'Kafe Estetik'
    ]
};

const VOICES = [
    { id: 'Puck', name: 'Budi (Upbeat Pria)' },
    { id: 'Kore', name: 'Ayu (Tegas Wanita)' },
    { id: 'Charon', name: 'Rio (Informatif Pria)' },
    { id: 'Zephyr', name: 'Indra (Cerah Pria)' },
    { id: 'Fenrir', name: 'Dedi (Antusias Pria)' },
    { id: 'Leda', name: 'Siti (Muda Wanita)' },
    { id: 'Aoede', name: 'Rina (Santai Wanita)' },
    { id: 'Orus', name: 'Bowo (Tegas Pria)' },
    { id: 'Callirrhoe', name: 'Dina (Ramah Wanita)' },
    { id: 'Enceladus', name: 'Raka (Berbisik Pria)' },
    { id: 'Gacrux', name: 'Tono (Dewasa Pria)' }
];

const TONES = [
    'Profesional', 'Antusias', 'Meyakinkan', 'Santai', 'Edukatif',
    'Humor', 'Inspiratif', 'Serius', 'Dramatis', 'Sedih', 'Berbisik', 'Marah'
];

const DEFAULT_LIGHTING_OPTIONS = [
    { id: 'Natural Window Light', label: '1. Natural Window Light', desc: 'Soft daylight from window' },
    { id: 'Harsh Window Light', label: '2. Harsh Window Light', desc: 'Strong midday sunlight' },
    { id: 'Phone Camera Flash', label: '3. Phone Camera Flash', desc: 'Direct flash at night' },
    { id: 'Cafe Window Light', label: '4. Cafe Window Light', desc: 'Side light from cafe window' },
    { id: 'Overcast Daylight', label: '5. Overcast Daylight', desc: 'Cloudy day soft light' },
    { id: 'Convenience Store Light', label: '6. Convenience Store Light', desc: 'Fluorescent convenience store' },
    { id: 'Night Street Lighting', label: '7. Night Street Lighting', desc: 'Mixed street lights at night' }
];

const COMMERCIAL_LIGHTING_OPTIONS = [
    { id: 'High-Key Studio', label: '1. High-Key Studio', desc: 'Bright, even lighting, minimal shadows' },
    { id: 'Dramatic Spotlight', label: '2. Dramatic Spotlight', desc: 'Harsh directional spotlight' },
    { id: 'Softbox Lighting', label: '3. Softbox Lighting', desc: 'Soft, diffused professional lighting' },
    { id: 'Cinematic Rim Light', label: '4. Cinematic Rim Light', desc: 'Edge lighting for separation' },
    { id: 'Product Macro Light', label: '5. Product Macro Light', desc: 'Crisp, detailed close-up lighting' }
];

const PODCAST_LIGHTING_OPTIONS = [
    { id: 'Warm Studio Setup', label: '1. Warm Studio Setup', desc: 'Cozy, warm practical lights' },
    { id: 'RGB Neon Accent', label: '2. RGB Neon Accent', desc: 'Modern podcast with RGB background' },
    { id: 'Moody Cinematic', label: '3. Moody Cinematic', desc: 'Darker room with focused key light' },
    { id: 'Bright Broadcast', label: '4. Bright Broadcast', desc: 'Even, bright TV-style lighting' }
];

const STORYBOARD_LIGHTING_OPTIONS = [
    { id: 'Match Storyboard', label: '✨ Sesuai Storyboard (AI pilih 1 untuk semua shot)', desc: 'Match the lighting implied in the storyboard panel precisely.' },
    ...DEFAULT_LIGHTING_OPTIONS,
    // LIGHTING v2: teks baru (belum ada di Part 1 / Part 2 / Aksara)
    { id: 'Golden Hour', label: 'Golden Hour', desc: 'Warm low golden sunlight near sunset' },
    { id: 'Warm Room Lamp', label: 'Warm Room Lamp', desc: 'Warm indoor lamp light at night' },
    { id: 'Ring Light', label: 'Ring Light', desc: 'Even frontal ring light on the face' },
    // LIGHTING v2: daftar Commercial & Podcast yang sudah ada (verbatim)
    ...COMMERCIAL_LIGHTING_OPTIONS,
    ...PODCAST_LIGHTING_OPTIONS
];

const getLightingOptions = (modeId) => {
    if (modeId === 'commercial') return COMMERCIAL_LIGHTING_OPTIONS;
    if (modeId === 'podcast') return PODCAST_LIGHTING_OPTIONS;
    if (modeId === 'storyboard_builder') return STORYBOARD_LIGHTING_OPTIONS;
    return DEFAULT_LIGHTING_OPTIONS;
};

// Mode storyboard: gaya dibagi per mode. Kamera & lighting SEMUA opsi tetap tampil di semua mode,
// mode hanya menentukan mana yang diberi badge Recommended + jadi default saat masuk mode.
const STORYBOARD_SUBMODES = {
    ugc: {
        styles: ['UGC TikTok', 'Vlogging / Casual', 'POV Review', 'Talking Head', 'Storytelling', 'Behind the Scene', 'Custom'],
        recCameras: ['iPhone 15 Pro Max', 'Android Flagship (Samsung S24 Ultra)'],
        recLighting: ['Match Storyboard', 'Natural Window Light', 'Cafe Window Light', 'Ring Light']
    },
    commercial: {
        styles: ['Komersil / Premium', 'Storytelling', 'Behind the Scene', 'Custom'],
        recCameras: ['Kamera Profesional (DSLR / Mirrorless)'],
        recLighting: ['High-Key Studio', 'Softbox Lighting']
    },
    talkshow: {
        styles: ['Podcast Style', 'Pengisi Seminar', 'MC Event', 'Stand Up Comedy', 'Custom'],
        recCameras: ['Kamera Profesional (DSLR / Mirrorless)'],
        recLighting: ['Warm Studio Setup', 'Bright Broadcast', 'Dramatic Spotlight']
    }
};
// FIX: pemanggil mengirim getSubmode(mode) / getSubmode(selectedMode), tapi app ini
// memang selalu talkshow (APP_VARIANT). Terima argumennya supaya tsc lolos, dan
// abaikan dengan sengaja — bukan bug, gaya talkshow yang dipakai.
const getSubmode = (_mode?: any) => STORYBOARD_SUBMODES[APP_VARIANT];

// Tampilan kartu gaya konten di layar Pilih Gaya (UI saja, tidak masuk ke prompt).
const STYLE_META = {
    'UGC TikTok': { icon: Smartphone, desc: 'Konten TikTok/Reels natural, ngomong langsung ke kamera kayak creator asli.' },
    'Vlogging / Casual': { icon: Video, desc: 'Vlog santai sehari-hari, kamera ikut aktivitas dengan gerak handheld yang natural.' },
    'POV Review': { icon: Hand, desc: 'Sudut pandang orang pertama, review produk atau pengalaman dari mata kreator.' },
    'Talking Head': { icon: Camera, desc: 'Satu orang bicara ke kamera, fokus ke ekspresi dan penyampaian pesan.' },
    'Storytelling': { icon: FileText, desc: 'Cerita mengalir dari awal sampai akhir, membangun emosi lewat alur.' },
    'Behind the Scene': { icon: Aperture, desc: 'Tunjukkan proses di balik layar: persiapan, pembuatan, dan suasana asli.' },
    'Komersil / Premium': { icon: Package, desc: 'Tampilan iklan premium yang bersih dan rapi, produk jadi bintang utama.' },
    'Podcast Style': { icon: Mic, desc: 'Ngobrol santai di studio podcast, lokasi tetap dengan 1–3 angle kamera.' },
    'Pengisi Seminar': { icon: Lightbulb, desc: 'Pembicara di atas panggung seminar, memegang mic dan menghadap audiens.' },
    'MC Event': { icon: Volume2, desc: 'MC memandu acara di panggung, energik dan menghadap audiens.' },
    'Stand Up Comedy': { icon: Sparkles, desc: 'Komika di panggung dengan mic, interaksi dengan penonton.' },
    'Custom': { icon: Wand2, title: 'Custom (Gaya Bebas)', desc: 'Ketik gaya konten Anda sendiri di halaman konfigurasi.' }
};


const STORYBOARD_PACES = [
    { value: 3, label: 'Slow', desc: '3 Shot / 10s' },
    { value: 4, label: 'Normal', desc: '4 Shot / 10s' },
    { value: 6, label: 'Fast', desc: '6 Shot / 10s' }
];

const STORYBOARD_CAMERAS = [
    { id: 'iPhone 15 Pro Max', label: '📱 iPhone Flagship', desc: 'Tajam, natural, jernih' },
    { id: 'Android Flagship (Samsung S24 Ultra)', label: '📱 Android Flagship', desc: 'Vivid, kontras, tajam' },
    { id: 'Android Low End (Kamera Buram)', label: '📱 Low End (Buram)', desc: 'Kusam, bertekstur, amatir' },
    { id: 'Kamera Profesional (DSLR / Mirrorless)', label: '📸 Pro (DSLR)', desc: 'Sinematik, bokeh, premium' }
];



// =====================================================================================
// CARA REKAM — dikunci per storyboard (semua shot)
// Teks kamera & gerak: VERBATIM dari AI UGC Studio Part 1 (mode UGC: Handheld / Tripod / Vlog).
// B-roll: VERBATIM dari Part 1 (B-roll UGC + hand lock). Aturan skrip AI & batas B-roll: teks baru.
// =====================================================================================
const CARA_REKAM_OPTIONS = [
    { id: 'Handheld', label: '📱 Handheld Selfie', desc: 'Rekam sendiri, kamera depan', hint: 'Semua shot dikunci: direkam sendiri pakai kamera depan HP, sedikit goyang natural.' },
    { id: 'Static', label: '📸 Static / Tripod', desc: 'Kamera diam, bicara ke lensa', hint: 'Semua shot dikunci: kamera diam setinggi mata, karakter bicara ke lensa. Variasi hanya medium ↔ close-up.' },
    { id: 'Vlog', label: '🚶 Vlog Wide', desc: 'Lengan terentang, sambil jalan', hint: 'Semua shot dikunci: kamera depan wide, lengan terentang, background luas.' },
    { id: 'Variatif', label: '🎬 Variatif', desc: 'Angle bebas dari AI', hint: 'Tanpa penguncian: AI bebas menentukan angle tiap shot (perilaku lama).' }
];
const CARA_REKAM_DEFAULT = { 'UGC TikTok': 'Handheld', 'Talking Head': 'Static', 'Vlogging / Casual': 'Vlog' };
const CARA_REKAM_PROMPTS = {
    Handheld: {
        camera: "HANDHELD SELFIE STYLE. Shot on iPhone 15 Pro Max front camera. Candid framing, authentic raw social media snapshot.",
        motion: "Slight natural handheld camera shake.",
        neg: "third-person shot, over-the-shoulder shot, photographed by another person"
    },
    Static: {
        camera: "STATIC LOCKED-OFF SHOT. Shot by an iPhone 15 Pro Max lens that stays perfectly still, not handheld. The phone itself is the viewpoint and is never visible in the frame. The model looks directly into the lens, making steady eye contact with the viewer. Raw unedited smartphone photo, authentic everyday creator setup.",
        motion: "Perfectly static locked-off camera, no movement.",
        neg: "phone in hand, selfie arm, handheld shot, tilted angle, visible tripod"
    },
    Vlog: {
        camera: "Shot on iPhone 15 Pro Max front camera. Raw unedited vlog style. Wide angle lens. Zero post-processing.",
        motion: "Smooth handheld tracking shot, natural forward movement. Model walking and talking.",
        neg: "third-person shot, over-the-shoulder shot, extreme close-up"
    }
};
const CARA_REKAM_HOLD_LINE = " Camera handling stays the same for the whole clip, no cut to another angle.";
// Part 1 (verbatim)
const SB_HAND_LOCK = "CRITICAL 100% IDENTITY CLONE LOCK [STRICT ENFORCEMENT]: If ANY body parts (like hands, arms, or torso) appear in this B-Roll, they MUST EXACTLY match the GENDER, skin tone, age, and proportions of the person in IMAGE 1. If IMAGE 1 is a woman, you MUST generate feminine hands/arms. If IMAGE 1 is a man, you MUST generate masculine hands/arms. ABSOLUTELY DO NOT generate male hands for a female model or vice versa. DO NOT show the face. ";
const SB_BROLL_NEG = "Human face, eyes, mouth, floating product, overly stylized studio lighting, flat lighting, artificial look, 3d render, DSLR, softbox, professional macro, smooth plastic skin";
const SB_BROLL_VIDEO_MOTION = "Slight natural handheld camera shake, showcasing the product.";
const SB_BROLL_VIDEO_CAMERA = "Smartphone camera, close up.";

// B-roll: hanya jika Produk aktif & Cara Rekam bukan Variatif. Maks 1 per lembar, bukan shot pertama/terakhir.
const getSbBrollIndices = (totalShots, pace, enabled) => {
    if (!enabled) return [];
    const p = pace || 6;
    const out = [];
    for (let start = 0; start < totalShots; start += p) {
        const idx = start + Math.floor(p / 2);
        if (idx > 0 && idx < totalShots - 1) out.push(idx);
    }
    return out;
};

// =====================================================================================
// KONSISTENSI STORYBOARD v2 (poin 1, 4, 5, 6, 8, 9)
// - Lock tidak lagi merujuk "panel lain / overall sequence" (model tidak pernah melihat shot lain)
// - Identitas, rambut, makeup, kulit dikunci ke foto model (Image 1)
// - Urutan acuan tetap: Model -> Lokasi (jika di-upload) -> Produk (jika aktif)
// - visualNote dari AI skrip ikut ke prompt gambar; istilah "cinematic" di negative dibuang kalau visualNote memintanya
// - Prompt gambar tanpa duplikasi (scene, kamera, lighting masing-masing 1x)
// =====================================================================================
const SB_CINEMATIC_RE = /cinemat|sinemat|bokeh|film look|movie/i;
const SB_CINEMATIC_NEG_TERMS = ['cinematic', 'movie still', 'professional color grading', 'overly professional cinematic grading', 'cinematic movie shot', 'cinematic lighting'];
const SB_HAIR_MAKEUP_NEG = 'changed hairstyle, different hair length, different hair color, hair loosened or tied differently from the reference, heavier makeup, different makeup, acne, pimples, blemishes, freckles, skin spots';
const SB_HAND_NEG = 'bad hands, extra fingers, missing fingers, fused fingers'; // bentuk jari
const SB_BRAND_NEG_REMOVE = ['logo', 'brand name']; // jangan bertabrakan dengan PRODUCT LOCK (logo/kemasan produk harus tetap utuh)
const SB_REALISM_REAL = "AUTHENTIC REALISM: Must look like a real, unedited photograph or raw video frame. ZERO AI VIBE. Natural, realistic skin with subtle real texture that stays clear and even like the base model reference — not airbrushed or plastic, and not exaggerated pores, acne, freckles, or blemishes. True-to-life colors. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.";

// RAMBUT: rapikan hasil analisis foto (cth "Long, straight, black" -> "long straight black hair")
const normHair = (h) => { let x = String(h || '').trim().replace(/[.,;\s]+$/, ''); if (!x) return ''; if (!/\bhair\b/i.test(x)) x = `${x.replace(/\s*,\s*/g, ' ')} hair`; return x.charAt(0).toLowerCase() + x.slice(1); };
const cleanNegList = (neg, removeTerms = []) => {
  const seen = new Set();
  const out = [];
  String(neg || '').split(',').map(t => t.trim().replace(/\.+$/, '').trim()).filter(Boolean).forEach(t => {
    const key = t.toLowerCase();
    if (removeTerms.includes(key) || seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out.join(', ');
};

// LOOK TALENT: kunci wajah dari foto upload + baju dari foto look.
// Teks dari Part 1 / Aksara mode Motion Control (characterLock & outfitLock), nomor gambar disesuaikan.
const LOOK_REF_LOCK = (faceIdx, clothIdx) => `Use IMAGE ${faceIdx} as the character reference. The following must be taken entirely from IMAGE ${faceIdx} and preserved without alteration: face, facial features, hair, and skin tone; all physical characteristics of the person. `
  + `Use IMAGE ${clothIdx} as the outfit reference. The following must be taken entirely from IMAGE ${clothIdx} and preserved without alteration: clothing and outfit — color, style, and fit. `
  + `Do NOT use the background or lighting from IMAGE ${clothIdx}. `
  + `If the SCENE INSTRUCTION describes different clothing, ignore it: the clothing comes only from IMAGE ${clothIdx}. `; // OUTFIT FIX: foto look menang atas teks baju lama

const buildStoryboardRefs = ({ modelB64, locationB64, productB64, broll = false, outfitB64 = null }) => {
  const parts = [];
  const labels = [];
  let n = 0, modelIdx = 0, locIdx = 0, prodIdx = 0, outfitIdx = 0;
  if (modelB64) { n++; modelIdx = n; parts.push({ inlineData: { mimeType: "image/png", data: modelB64 } }); labels.push(`Image ${n} = BASE MODEL (identity, hair, and makeup reference)`); }
  if (modelB64 && outfitB64) { n++; outfitIdx = n; parts.push({ inlineData: { mimeType: "image/png", data: outfitB64 } }); labels.push(`Image ${n} = OUTFIT REFERENCE (clothing only)`); } // LOOK TALENT
  if (locationB64) { n++; locIdx = n; parts.push({ inlineData: { mimeType: "image/png", data: locationB64 } }); labels.push(`Image ${n} = LOCATION REFERENCE (the exact place where this shot happens)`); }
  if (productB64) { n++; prodIdx = n; parts.push({ inlineData: { mimeType: "image/png", data: productB64 } }); labels.push(`Image ${n} = PRODUCT REFERENCE`); }

  const refInfo = labels.length ? `[CRITICAL] REFERENCE IMAGES: ${labels.join('. ')}. ` : '';
  // LOOK TALENT: baju dari foto look; tanpa look kembali ke baris OUTFIT asli Aksara (baju dari SCENE INSTRUCTION)
  const outfitLine = outfitIdx ? LOOK_REF_LOCK(modelIdx, outfitIdx) : `OUTFIT: The character wears exactly the clothing described in the SCENE INSTRUCTION. `;
  let lock = '';
  if (modelIdx && broll) {
    lock += SB_HAND_LOCK + outfitLine; // CARA REKAM: shot B-roll (Part 1)
  } else if (modelIdx) {
    lock += `IDENTITY LOCK [STRICT ENFORCEMENT]: The person in this shot MUST be the exact same person as Image ${modelIdx}: same face, facial structure, eye shape, nose, mouth, gender, age, ethnicity, skin tone, and body proportions. DO NOT invent a new face. `
      + `HAIR & MAKEUP LOCK: Keep exactly the same hairstyle, hair length, hair color, and makeup level as Image ${modelIdx}. Do not untie, loosen, recolor, or restyle the hair, and do not add heavier makeup. `
      + `SKIN: Maintain extremely clear, natural skin as in Image ${modelIdx}. ABSOLUTELY DO NOT add acne, blemishes, freckles, or unrealistic skin textures. `
      + outfitLine;
  }
  if (locIdx) {
    lock += `LOCATION LOCK: Place the character in the exact same location shown in Image ${locIdx} — same walls, floor, furniture, windows, and props. Only the camera angle and framing may change. `;
  }
  if (prodIdx) {
    lock += `PRODUCT LOCK (Image ${prodIdx}): ` + PRODUCT_LOCK + ' ';
  }
  return { parts, refInfo, lock };
};


// =====================================================================================
// LIGHTING PER STORYBOARD — 1 lighting identik untuk semua shot
// - User pilih preset, ATAU "Sesuai Storyboard": skrip AI memilih 1 preset dari daftar
// - Skrip AI dilarang menulis cahaya/waktu & props bercahaya di prompt per shot / visualNote
// - Lighting disimpan per shot (dipakai saat revisi)
// - Kata negative yang bentrok dengan preset studio/sinematik dibuang
// =====================================================================================
// LIGHTING per app: hanya lighting yang relevan dengan jenis app ini
const SB_LIGHTING_GROUPS = [
    { label: '✨ Otomatis', ids: ['Match Storyboard'] },
    { label: 'Podcast & Panggung', ids: ['Warm Studio Setup', 'Bright Broadcast', 'Dramatic Spotlight', 'Moody Cinematic', 'RGB Neon Accent'] }
];
const APP_LIGHTING_IDS = SB_LIGHTING_GROUPS.flatMap(g => g.ids);
const LIGHTING_DEFAULT_BY_STYLE = {
    'Cyberpunk': 'RGB Neon Accent',
    'Pengisi Seminar': 'Dramatic Spotlight',
    'MC Event': 'Dramatic Spotlight',
    'Stand Up Comedy': 'Dramatic Spotlight',
    'Podcast Style': 'Warm Studio Setup'
};
const SB_LIGHTING_NEG_CONFLICT = {
    'Overcast Daylight': ['soft ambient light', 'flat lighting', 'lack of shadows'],
    'High-Key Studio': ['studio lighting', 'flat lighting', 'lack of shadows', 'soft ambient light', 'flawless perfect lighting', 'professional photography', 'softbox'],
    'Softbox Lighting': ['softbox', 'studio lighting', 'professional photography', 'soft ambient light', 'flawless perfect lighting'],
    'Dramatic Spotlight': ['studio lighting', 'cinematic', 'cinematic lighting'],
    'Cinematic Rim Light': ['cinematic', 'cinematic lighting', 'studio lighting', 'professional color grading'],
    'Product Macro Light': ['studio lighting', 'professional photography', 'professional macro'],
    'Moody Cinematic': ['cinematic', 'cinematic lighting', 'professional color grading'],
    'Warm Studio Setup': ['studio lighting'],
    'Bright Broadcast': ['studio lighting', 'flat lighting', 'professional photography'],
    'RGB Neon Accent': ['cinematic lighting'],
    'Ring Light': ['studio lighting', 'flat lighting', 'soft ambient light']
};
const sbLightingLabel = (id) => {
    const opt = STORYBOARD_LIGHTING_OPTIONS.find(o => o.id === id);
    return opt ? opt.label.replace(/^\d+\.\s*/, '').replace(/^✨\s*/, '').replace(/\s*\(.*\)$/, '') : (id || '-');
};
const resolveLightingPreset = (name) => {
    if (!name) return null;
    const key = String(name).trim().toLowerCase();
    const opt = STORYBOARD_LIGHTING_OPTIONS.find(o => o.id !== 'Match Storyboard' && APP_LIGHTING_IDS.includes(o.id) && (o.id.toLowerCase() === key || sbLightingLabel(o.id).toLowerCase() === key));
    return opt ? opt.id : null;
};

// =====================================================================================
// UI COMPONENTS — DESIGN SYSTEM AI UGC STUDIO
// =====================================================================================

const GeneratingState = ({ index, lightMode = false }) => (
  <div className={`absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm z-20 transition-all duration-500 ${lightMode ? 'bg-black/10' : 'bg-zinc-950/80'}`}>
      <div className={`absolute w-64 h-64 rounded-full blur-3xl animate-pulse pointer-events-none ${lightMode ? 'bg-black/5' : 'bg-white/5'}`} />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative w-12 h-12">
           <div className={`absolute inset-0 rounded-full border-[1px] ${lightMode ? 'border-black/10' : 'border-white/10'}`} />
           <div className="absolute inset-0 rounded-full animate-[spin_1.5s_linear_infinite]"
                style={{ background: 'conic-gradient(from 0deg, transparent 40%, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7)', maskImage: 'radial-gradient(transparent 55%, black 60%)', WebkitMaskImage: 'radial-gradient(transparent 55%, black 60%)' }} />
           <div className="absolute inset-0 flex items-center justify-center"><div className={`w-1 h-1 rounded-full animate-ping ${lightMode ? 'bg-black' : 'bg-white'}`} /></div>
        </div>
        <div className="text-center space-y-3">
          <p className={`font-inter text-[10px] font-bold tracking-[0.4em] uppercase animate-pulse ${lightMode ? 'text-black' : 'text-white'}`}>Rendering</p>
          <div className="flex items-center justify-center gap-3 opacity-70">
             <div className="w-10 h-1 rounded-full bg-[linear-gradient(to_right,#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#6366f1,#a855f7)] animate-[rainbow-bg_2s_linear_infinite] bg-[length:200%_auto]" />
             <p className={`font-inter text-[9px] font-medium tracking-widest uppercase font-mono ${lightMode ? 'text-black' : 'text-zinc-300'}`}>Shot {String(index + 1).padStart(2, '0')}</p>
             <div className="w-10 h-1 rounded-full bg-[linear-gradient(to_left,#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#6366f1,#a855f7)] animate-[rainbow-bg_2s_linear_infinite] bg-[length:200%_auto]" />
          </div>
        </div>
      </div>
  </div>
);

const LayoutWrapper = ({ children, className = "" }) => (
  <div className={`font-inter min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-white overflow-x-hidden ${className}`}>
    <style dangerouslySetInnerHTML={{__html: `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
      .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif !important; }
      .font-inter { font-family: 'Inter', sans-serif !important; }
      @keyframes rainbow-bg { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes rainbow-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .text-rainbow { background: linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7, #ef4444); background-size: 200% auto; color: transparent; -webkit-background-clip: text; background-clip: text; animation: rainbow-bg 4s linear infinite; }
      .btn-rainbow-hover { position: relative; z-index: 1; }
      .btn-rainbow-hover::before { content: ''; position: absolute; inset: -3px; border-radius: inherit; background: conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7, #ef4444); z-index: -2; opacity: 0; transition: opacity 0.3s ease; animation: rainbow-spin 4s linear infinite; }
      .btn-rainbow-hover:hover::before { opacity: 0.85; }
      .btn-rainbow-hover::after { content: ''; position: absolute; inset: 0px; background-color: #ffffff; border-radius: inherit; z-index: -1; }
      .card-rainbow { position: relative; z-index: 1; }
      .card-rainbow::before { content: ''; position: absolute; inset: 0px; border-radius: inherit; padding: 2px; background: linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: 0.45; transition: opacity 0.3s ease; pointer-events: none; z-index: 10; }
      .card-rainbow:hover::before { opacity: 0.70; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
      ::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7); border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #6366f1, #a855f7); border-radius: 10px; }
    `}} />
    <div className="fixed top-[-10%] left-[-10%] w-[70%] h-[40%] rounded-full bg-white/5 blur-[120px] md:blur-[150px] pointer-events-none transform translate-z-0"></div>
    <div className="fixed bottom-[-10%] right-[-10%] w-[70%] h-[40%] rounded-full bg-white/5 blur-[120px] md:blur-[150px] pointer-events-none transform translate-z-0"></div>
    <div className="fixed inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
    <div className="relative z-10 w-full h-full flex flex-col min-h-screen">
      {children}
    </div>
  </div>
);

const Navbar = ({ onBack, onViewResult, onReset }: { onBack?: any; onViewResult?: any; onReset?: any }) => (
  <div className="absolute top-0 left-0 right-0 z-50 px-4 md:px-8 py-4 md:py-6 flex items-center justify-between pointer-events-none bg-gradient-to-b from-zinc-950/90 to-transparent">
    <div className="flex items-center gap-3 pointer-events-auto">
      <img src="https://cdn.scalev.id/uploads/1779184445/Ua7NpamhCu3Zxm2LVOHaDw/1779184445172-Desain-tanpa-judul-(3).webp" alt="Logo" className="w-8 h-8 md:w-10 md:h-10 object-contain drop-shadow-lg rounded-full mix-blend-screen" />
      <div className="hidden md:flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-jakarta font-bold tracking-tight text-lg leading-none text-white">{APP_NAME}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <span className="font-jakarta font-bold tracking-tight text-sm text-white">{APP_SHORT}</span>
      </div>
    </div>
    <div className="flex items-center gap-3 pointer-events-auto">
      {onViewResult && (
        <button type="button" onClick={() => { playClick(); onViewResult(); }} className="font-inter backdrop-blur-md bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.1)]"><Eye className="w-3 h-3" /> Result</button>
      )}
      {onReset && (
        <button type="button" onClick={() => { playClick(); onReset(); }} className="font-inter backdrop-blur-md bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-medium uppercase tracking-widest hover:bg-white/10 hover:text-white hover:border-white/30 transition-all duration-300 group active:scale-95"><RotateCcw className="w-3 h-3 group-hover:-rotate-180 transition-transform duration-500" /> Reset</button>
      )}
      {onBack && (
        <button type="button" onClick={() => { playClick(); onBack(); }} className="font-inter backdrop-blur-md bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-medium uppercase tracking-widest hover:bg-white hover:text-black transition-all duration-300 group active:scale-95"><ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Back</button>
      )}
    </div>
  </div>
);

const SectionTitle = ({ title, subtitle }) => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
    <h2 className="font-jakarta text-3xl md:text-5xl font-semibold tracking-tight text-white mb-2 text-rainbow">{title}</h2>
    {subtitle && <p className="font-inter text-zinc-500 text-sm md:text-lg font-light leading-relaxed max-w-xl">{subtitle}</p>}
  </div>
);

const UploadZone = ({ image, onClick, label, icon: Icon, aspect = "square", disabled = false }) => (
  <div className={`space-y-3 group font-inter ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
    <div className="flex justify-between items-baseline px-1">
      <span className="text-[10px] md:text-xs font-bold tracking-widest text-zinc-500 uppercase">{label}</span>
      {image && <span className="text-[10px] text-white font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Ready</span>}
    </div>
    <div onClick={() => { if (!disabled) { playClick(); onClick(); } }} className={`relative w-full ${aspect === '9:16' ? 'aspect-[9/16]' : 'aspect-square'} rounded-2xl overflow-hidden transition-all duration-500 border border-white/5 bg-zinc-900/20 ${!disabled ? 'cursor-pointer group-hover:border-white/30 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] group-hover:bg-white/5' : ''}`}>
      {image ? (
        <>
          <img src={image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700 scale-100 group-hover:scale-105" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px]">
            <span className="px-4 py-2 rounded-full border border-white/30 bg-black/80 text-xs font-medium text-white backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.3)]">Change</span>
          </div>
          <div className="absolute bottom-2 right-2 md:hidden">
            <div className="bg-white rounded-full p-1"><CheckCircle2 className="w-3 h-3 text-black" /></div>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 md:gap-6 p-4 text-center">
          <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/5 flex items-center justify-center bg-white/5 text-zinc-500 transition-all duration-500 shadow-2xl ${!disabled ? 'group-hover:text-white group-hover:border-white/30 group-hover:scale-110' : ''}`}>
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <p className={`text-[10px] md:text-xs text-zinc-600 font-medium tracking-wide transition-colors ${!disabled ? 'group-hover:text-white' : ''}`}>{disabled ? 'NONAKTIF' : 'TAP TO UPLOAD'}</p>
        </div>
      )}
    </div>
  </div>
);

const ButtonCTA = ({ onClick, children, disabled = false }: { onClick: any; children: any; disabled?: boolean }) => (
  <button type="button" onClick={() => { playClick(); onClick(); }} disabled={disabled} className={`font-inter relative w-full py-4 md:py-5 px-8 bg-white text-black font-bold text-xs md:text-sm tracking-widest uppercase rounded-full hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] border border-transparent card-rainbow`}>
    {children}
  </button>
);

const OptionButton = ({ active, onClick, title, sub, recommended = false, dimmed = false, note = '' }) => (
  <button
    type="button"
    onClick={() => { playClick(); onClick(); }}
    className={`relative w-full h-full min-h-[64px] flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border transition-all duration-300 text-center ${active ? 'card-rainbow bg-white/10 border-white/50 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)]' : 'bg-black/20 border-white/10 text-zinc-400 hover:border-white/30 hover:text-zinc-300'} ${dimmed && !active ? 'opacity-40 hover:opacity-70' : ''}`}
  >
    {recommended && (
      <span className={`absolute -top-2 left-2 z-20 text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${active ? 'bg-amber-500 text-black' : 'bg-zinc-900 border border-amber-500/40 text-amber-500'}`}>⭐ Recommended</span>
    )}
    <span className="text-[11px] font-bold leading-tight">{title}</span>
    {sub && <span className="text-[9px] opacity-70 mt-1 leading-tight">{sub}</span>}
    {note && <span className="text-[8px] mt-1 leading-tight text-amber-500/80">{note}</span>}
  </button>
);

const selectClass = "w-full appearance-none bg-zinc-900/30 border border-white/10 rounded-2xl px-6 py-5 text-sm text-white focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all cursor-pointer font-medium hover:bg-zinc-900/50";
const labelClass = "text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2";

// BRIEF AI (fitur baru): label app, angle acak (variasi), contoh format brief
const BRIEF_APP_LABEL = 'konten talk show (podcast / panggung)';
const BRIEF_ANGLES = ['opini ringan yang memancing diskusi', 'cerita pengalaman pribadi', 'tips praktis', 'menjawab pertanyaan audiens', 'fakta yang mengejutkan', 'salah kaprah yang diluruskan', 'momen lucu', 'ajakan langsung ke audiens', 'perbandingan dulu dan sekarang', 'pelajaran dari kegagalan'];
// BRIEF AI: pola cerita per gaya (pola pertama = alur yang sudah ada di K5 / Part 1 / Aksara)
const BRIEF_STYLE_LIB = {
    'Podcast Style': { purpose: 'Tone: Sangat natural, ngobrol santai dua arah seperti podcast sungguhan. Seluruh shot di 1 lokasi/studio yang sama, karakter tidak pindah tempat.', patterns: [
        { name: 'Tanya–cerita', arc: 'pertanyaan pembuka → cerita pengalaman → insight → kesimpulan' },
        { name: 'Hot take', arc: 'opini berani → alasan → contoh → ajakan diskusi' },
        { name: 'Tips', arc: 'masalah umum → tip 1 → tip 2 → penutup' },
        { name: 'Pengakuan', arc: '"jujur aja…" → kejadian → pelajaran → pesan' },
        { name: 'Rekomendasi', arc: 'masalah pendengar → produk sebagai solusi → alasannya → ajakan', product: true }
    ] },
    'Pengisi Seminar': { purpose: 'Pembicara seminar di atas panggung: memegang mikrofon, tatapan ke audiens, tidak pindah tempat.', patterns: [
        { name: 'Fakta mengejutkan', arc: 'fakta mengejutkan → masalah → solusi → ajakan' },
        { name: 'Cerita pribadi', arc: 'cerita pribadi → pelajaran → poin utama → penutup' },
        { name: 'Tanya audiens', arc: 'pertanyaan ke audiens → jawaban → contoh → kesimpulan' },
        { name: 'Tiga poin', arc: 'janji tiga poin → poin 1 → poin 2 → poin 3 / ajakan' }
    ] },
    'MC Event': { purpose: 'MC memandu acara di atas panggung: memegang mikrofon, tatapan ke audiens, tidak pindah tempat.', patterns: [
        { name: 'Bangun energi', arc: 'sapa audiens → bangun energi → umumkan segmen → ajak tepuk tangan' },
        { name: 'Icebreaker', arc: 'candaan pembuka → perkenalan acara → momen interaksi → transisi' },
        { name: 'Pengumuman sponsor', arc: 'umumkan sponsor/produk → manfaatnya → ajakan', product: true }
    ] },
    'Stand Up Comedy': { purpose: 'Komika membawakan materi lucu di atas panggung: memegang mikrofon, tatapan ke audiens, tidak pindah tempat.', patterns: [
        { name: 'Premis–punchline', arc: 'premis → setup → punchline → callback' },
        { name: 'Observasi', arc: 'observasi sehari-hari → eskalasi → punchline → tag' },
        { name: 'Cerita memalukan', arc: 'cerita memalukan → detail → twist → punchline' }
    ] },
    '__custom': { purpose: 'Gaya custom: susun alur dari nama gaya ini; jangan meniru gaya lain secara mekanis.', patterns: [
        { name: 'Masalah–solusi', arc: 'masalah yang relatable → mencari jalan keluar → mencoba → hasil → penutup' },
        { name: 'Penemuan', arc: 'situasi biasa → menemukan sesuatu → mencoba → kesan → penutup' },
        { name: 'Sebelum–sesudah', arc: 'kondisi sebelum → perubahan dimulai → proses → hasil → reaksi' },
        { name: 'Cerita singkat', arc: 'pembuka cerita → kejadian → titik balik → pelajaran' },
        { name: 'Tips', arc: 'janji manfaat → tip 1 → tip 2 → tip penutup / ajakan' }
    ] },
};
const BRIEF_PLACEHOLDER = `Contoh:
Hook: Host podcast membuka dengan pertanyaan yang bikin penasaran.
Alur: cerita pengalaman singkat → tunjukkan produk di meja → jelaskan satu manfaatnya → kasih pendapat jujur.
Emosi: santai → antusias.
Penutup: ajak penonton mencoba.

Bingung? Klik "Buatin AI".`;

// =====================================================================================
// APP
// =====================================================================================

export default function App() {
  const [view, setView] = useState('welcome');
  const [selectedMode, setSelectedMode] = useState(null);

  // Data State (Aksara)
  const [modelImage, setModelImage] = useState(null);
  const [guestModelImage, setGuestModelImage] = useState(null);
  const [productImage, setProductImage] = useState(null);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  // TALENT ANALYSIS: gender, rambut, pakaian untuk prompt video
  const [talentInfo, setTalentInfo] = useState({ gender: '', hair: '', outfit: '' });
  const [isAnalyzingTalent, setIsAnalyzingTalent] = useState(false);
  // LOOK TALENT: foto talent memakai baju pilihan Script AI (dibuat setelah skrip jadi). Foto upload asli tidak diubah.
  // src = foto look, outfit = teks baju (bisa diedit), scriptOutfit = teks baju asli dari Script AI
  const [looks, setLooks] = useState({ A: { src: null, outfit: '', scriptOutfit: '', approved: false, loading: false } });
  const [lookPhase, setLookPhase] = useState('idle'); // 'script' = menyusun skrip, 'ready' = look siap direview
  const pendingShotsRef = useRef(null); // skrip yang menunggu look disetujui
  const [dynamicBackgrounds, setDynamicBackgrounds] = useState(MODE_BACKGROUNDS.ugc);
  const [povGender, setPovGender] = useState('Wanita');

  // Features State (Aksara)
  const [isProductEnabled, setIsProductEnabled] = useState(false);
  const [builderMetadata, setBuilderMetadata] = useState<Record<string, any> | null>(null);

  // Character Builder State (Aksara — dibawa agar fungsi generate tetap verbatim, tidak ada UI-nya di app ini)
  const [characterConfig, setCharacterConfig] = useState({
      gender: 'Wanita',
      age: 22,
      height: 'Sedang',
      weight: 'Proporsional',
      skinTone: 'Kuning Langsat',
      hair: 'Rambut hitam lurus sebahu',
      ethnicity: 'Jawa',
      mood: MOOD_OPTIONS[0]
  });
  const [customMood, setCustomMood] = useState("");
  const [outfitImages, setOutfitImages] = useState({
      top: null,
      outer: null,
      bottom: null,
      footwear: null,
      accessory: null
  });

  // Custom Background State (Aksara)
  const [bgType, setBgType] = useState('preset');
  const [customBg, setCustomBg] = useState("");
  const [customBgImage, setCustomBgImage] = useState(null);

  // Flow State (Aksara)
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const [isProductConfirmed, setIsProductConfirmed] = useState(false);

  const [config, setConfig] = useState({
    background: MODE_BACKGROUNDS.ugc[0],
    ratio: '9:16',
    scenes: 4,
    ugcStyle: 'Handheld',
    lighting: DEFAULT_LIGHTING_OPTIONS[0].id,
    sbBuilderCamera: 'iPhone 15 Pro Max',
    sbBuilderStyle: 'Vlogging / Casual',
    customSbStyle: '',
    sbBuilderDuration: 10,
    sbBuilderPace: 4,
    sbBuilderBrief: '',
    musicOn: MUSIC_DEFAULT,
    caraRekam: 'Variatif',
    audioDelivery: AUDIO_DELIVERY_DEFAULT
  });

  // Generation State (Aksara)
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBriefGenerating, setIsBriefGenerating] = useState(false); // BRIEF AI
  const [briefError, setBriefError] = useState(''); // BRIEF AI
  const briefHistoryRef = useRef([]); // BRIEF AI: brief sebelumnya supaya tidak berulang
  const briefPatternRef = useRef([]); // BRIEF AI: pola yang terakhir dipakai
  const [generatedImages, setGeneratedImages] = useState([]);
  const [sceneLoadings, setSceneLoadings] = useState({});
  const [scenePrompts, setScenePrompts] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [copiedStates, setCopiedStates] = useState({});

  // Audio Studio State (Aksara) + popup state (UI AI UGC Studio)
  const [isAudioStudioOpen, setIsAudioStudioOpen] = useState(false);
  const [isAudioStudioMinimized, setIsAudioStudioMinimized] = useState(false);
  const [voScript, setVoScript] = useState("");
  const [voDuration, setVoDuration] = useState("15s");
  const [voVoice, setVoVoice] = useState(VOICES[0].id);
  const [voTone, setVoTone] = useState(TONES[1]);
  const [voAudioUrl, setVoAudioUrl] = useState(null);
  const [isGeneratingVOScript, setIsGeneratingVOScript] = useState(false);
  const [isGeneratingVOAudio, setIsGeneratingVOAudio] = useState(false);

  const [isVideoGeneratorsOpen, setIsVideoGeneratorsOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingSheet, setIsDownloadingSheet] = useState(false);
  const [sheetPreview, setSheetPreview] = useState(null);

  const modelInputRef = useRef(null);
  const productInputRef = useRef(null);
  const bgImageInputRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  // Verbatim Aksara
  useEffect(() => {
    if (view === 'mode-selection' || view === 'upload-setup') {
      if (selectedMode?.id === 'storyboard_builder') {
        setBgType('match_storyboard');
      } else {
        const expensiveBg = 'Latar Hitam Elegan (Premium Studio)';
        setBgType('custom');
        setCustomBg(expensiveBg);
      }
    }
  }, [view, selectedMode]);

  const handleResetAndNew = () => {
    playClick();
    setSelectedMode(null);
    setModelImage(null);
    setGuestModelImage(null);
    setProductImage(null);
    setProductName("");
    setProductDesc("");
    setTalentInfo({ gender: '', hair: '', outfit: '' });
    setLooks({ A: { src: null, outfit: '', scriptOutfit: '', approved: false, loading: false } });
    setLookPhase('idle');
    pendingShotsRef.current = null;
    setIsProductConfirmed(false);
    setBgType('preset');
    setCustomBg("");
    setCustomBgImage(null);
    setPovGender('Wanita');
    setIsProductEnabled(false);
    setBuilderMetadata(null);
    setCharacterConfig({
        gender: 'Wanita',
        age: 22,
        height: 'Sedang',
        weight: 'Proporsional',
        skinTone: 'Kuning Langsat',
        hair: 'Rambut hitam lurus sebahu',
        ethnicity: 'Jawa',
        mood: MOOD_OPTIONS[0]
    });
    setCustomMood("");
    setOutfitImages({ top: null, outer: null, bottom: null, footwear: null, accessory: null });
    setConfig({
      background: MODE_BACKGROUNDS.ugc[0],
      ratio: '9:16',
      scenes: 4,
      ugcStyle: 'Handheld',
      lighting: DEFAULT_LIGHTING_OPTIONS[0].id,
      sbBuilderCamera: 'iPhone 15 Pro Max',
      sbBuilderStyle: 'Vlogging / Casual',
      customSbStyle: '',
      sbBuilderDuration: 10,
      sbBuilderPace: 4,
      sbBuilderBrief: '',
    musicOn: MUSIC_DEFAULT,
    caraRekam: 'Variatif',
    audioDelivery: AUDIO_DELIVERY_DEFAULT
    });
    setGeneratedImages([]);
    setSceneLoadings({});
    setScenePrompts({});
    setPreviewImage(null);
    setCopiedStates({});
    setVoScript("");
    setVoAudioUrl(null);
    setIsVideoGeneratorsOpen(false);
    setIsAudioStudioOpen(false);
    setIsAudioStudioMinimized(false);
    setView('mode-selection');
  };

  const updateSceneData = (index, updates) => {
    setGeneratedImages(prev => {
        const newArr = [...prev];
        if (newArr[index]) {
            newArr[index] = { ...newArr[index], ...updates };
        }
        return newArr;
    });
  };

  const handleStart = () => {
    playClick();
    setView('mode-selection');
  };

  // ---------------- VIDEO PROMPT — VERBATIM AKSARA ----------------
  const getPromptForScene = (sceneData) => {
    if (!sceneData) return "";
    let contextLogic = "";
    if (sceneData.voActive) {
        if (sceneData.isBRoll) {
            contextLogic = `NARRATIVE VOICE-OVER: '${sceneData.voText}'. Product remains the main focus.`;
        } else {
            contextLogic = `LIP-SYNC AUDIO: Model is actively speaking. Mouth must move precisely to match this dialogue: "[${sceneData.voText}]".`;
        }
    } else {
        contextLogic = sceneData.isBRoll ? "AMBIENT: No human visible, purely product focused." : "AMBIENT: Mouth closed or natural breathing, no talking.";
    }

    let realismLock = "CRITICAL REALISM LOCK: The generated video MUST be ultra-realistic, highly detailed live-action footage. ZERO AI VIBE. Include natural lived-in imperfections, highly detailed human skin texture, and realistic lighting. STRICTLY NO 3D renders, no plastic skin, no cartoon or illustration styles.";
    let baseNeg = "3d render, animation, ai look, plastic smooth skin, different face, changing identity, changing clothes, morphing, text overlays, watermarks, bad anatomy";

    if (sceneData.sbStyle) {
        const lowerStyle = sceneData.sbStyle.toLowerCase();
        if (lowerStyle.includes('3d')) {
            realismLock = "CRITICAL STYLE LOCK: The generated video MUST be a high-end 3D animation (Pixar/Disney quality). Smooth 3D rendering, beautiful CGI lighting.";
            baseNeg = "live action, real photo, 2d, flat cartoon, text overlays, watermarks, bad anatomy";
        } else if (lowerStyle.includes('2d') || lowerStyle.includes('anime')) {
            realismLock = "CRITICAL STYLE LOCK: The generated video MUST be a high-end 2D anime or hand-drawn animation style.";
            baseNeg = "live action, real photo, 3d render, CGI, text overlays, watermarks, bad anatomy";
        } else if (lowerStyle.includes('drama cina')) {
            realismLock = "CRITICAL STYLE LOCK: The generated video MUST have a cinematic Chinese Drama aesthetic (high production value, beautiful lighting, cinematic grading).";
        } else if (lowerStyle.includes('cyberpunk')) {
            realismLock = "CRITICAL STYLE LOCK: The generated video MUST have a cinematic Cyberpunk aesthetic (neon lights, futuristic, high contrast).";
        }
    }

    let identityLock = "";
    if (selectedMode?.id === 'character_builder') {
        identityLock = "CRITICAL IDENTITY LOCK: The character generated MUST perfectly match the detailed facial and physical description provided. Maintain absolute 100% identity consistency. DO NOT morph the face.";
    } else {
        identityLock = sceneData.isBRoll ? "" : "CRITICAL FACE & IDENTITY LOCK: You MUST use the provided reference image to lock the character's face. The character in the video MUST be an EXACT CLONE of the reference face, including gender, skin tone, hair, and facial structure. DO NOT invent a new face. DO NOT change the clothing.";
    }

    let extraCamera = "";
    let extraAudio = "";
    const dynamicStyles = ['Vlogging / Casual', 'Cinematic Short', 'UGC TikTok', 'POV Review', 'Behind the Scene', 'Storytelling', 'Talking Head'];

    if (sceneData.sbStyle && dynamicStyles.includes(sceneData.sbStyle)) {
        extraCamera = " CAMERA MOVEMENT: Add a natural, slight handheld camera shake/sway to make it feel authentic and organic.";
        extraAudio = ` AUDIO: Include realistic ambient environment sound matching the location (${sceneData.activeBackground}).`;
    } else if (['Pengisi Seminar', 'MC Event', 'Stand Up Comedy'].includes(sceneData.sbStyle)) {
        extraCamera = " CAMERA MOVEMENT: Static locked camera or slight pan from the audience's perspective facing the stage. Max 4 camera angles. ACTION: Character MUST be standing on a stage, holding a microphone in hand, looking out at the audience. CRITICAL: The character MUST NOT look at the camera lens. Maintain exact same location, background, and lighting environment consistently.";
    } else if (sceneData.sbStyle === 'Podcast Style') {
        extraCamera = " CAMERA MOVEMENT: Static locked camera on tripod. CRITICAL: Maintain exact same location, background, and lighting environment consistently. MAX 2 CAMERA ANGLES ONLY.";
    }

    if (sceneData.caraRekam && sceneData.caraRekam !== 'Variatif') extraCamera = ""; // CARA REKAM: gerak kamera sudah diatur di SCENE ACTION

    const timingHint = sceneData.builderData?.timing ? ` INTENDED DURATION: ${sceneData.builderData.timing}.` : "";

    // MUSIK: instruksi musik latar untuk video generator
    const sceneMusicOn = sceneData.musicOn ?? config.musicOn;
    const musicLine = sceneMusicOn
        ? ` BACKGROUND MUSIC: Add fitting background music at low volume, mixed under any dialogue or voice-over${builderMetadata?.audioNote ? ` (mood: ${builderMetadata.audioNote})` : ''}.`
        : " NO BACKGROUND MUSIC: Do not add any music or soundtrack. Only natural ambient sound and dialogue.";

    return `[VIDEO PROMPT]\nSCENE ACTION: ${sceneData.videoMotion}${extraCamera}${timingHint}\nCAMERA: ${sceneData.videoCamera}\nVISUAL CONTEXT: ${sceneData.action}\n\n${identityLock}\n${realismLock}\n\n${contextLogic}${extraAudio}${musicLine}\nENVIRONMENT: ${sceneData.activeBackground}\n\nNEGATIVE PROMPT: ${baseNeg}.`;
  };

  const handleCopyPrompt = (index) => {
    playClick();
    const sceneData = generatedImages[index];
    if (!sceneData) return;

    const dynamicPrompt = getPromptForScene(sceneData);

    safeCopyToClipboard(dynamicPrompt);
    setCopiedStates(prev => ({ ...prev, [index]: true }));
    setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [index]: false }));
    }, 2000);
  };

  const handleCopyAllPrompts = (sheetIdx) => {
    playClick();
    const pace = config.sbBuilderPace || 6;
    let allPrompts = `STORYBOARD VIDEO PROMPTS - SHEET ${sheetIdx + 1}\n\n`;
    for (let i = 0; i < pace; i++) {
        const shotIndex = sheetIdx * pace + i;
        const sceneData = generatedImages[shotIndex];
        if (sceneData) {
            allPrompts += `SHOT ${shotIndex + 1}:\n${getPromptForScene(sceneData)}\n\n`;
        }
    }
    safeCopyToClipboard(allPrompts);
    setCopiedStates(prev => ({ ...prev, [`sheet_${sheetIdx}`]: true }));
    setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [`sheet_${sheetIdx}`]: false }));
    }, 2000);
  };

  // ---------------- PROMPT VIDEO GPT (struktur dari Storyboard Commercial GPT, template tanpa panggilan AI) ----------------
  // Struktur dari output Custom GPT Commercial (Seedance/Leonardo & Gemini Omni). 1 prompt per lembar.
  const parseTimingSec = (timing) => {
    const toSec = (s) => { const p = String(s || '').trim().split(':').map(Number); return p.length === 2 ? (p[0] * 60 + p[1]) : (Number(p[0]) || 0); };
    const [a, b] = String(timing || '').split('-');
    return { start: toSec(a), end: toSec(b) };
  };
  const fmtSec = (n) => { const r = Math.round(n * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
  const fmtClock = (n) => { const m = Math.floor(n / 60); const s = Math.round((n - m * 60) * 10) / 10; const sStr = Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0'); return `${m}:${sStr}`; };

  const getSheetShots = (sheetIdx) => {
    const pace = config.sbBuilderPace || 4;
    const out = [];
    for (let i = 0; i < pace; i++) {
      const shotIndex = sheetIdx * pace + i;
      const s = generatedImages[shotIndex];
      if (!s) continue;
      const t = parseTimingSec(s.builderData?.timing || formatShotTiming(shotIndex, pace));
      out.push({ shotIndex, n: out.length + 1, data: s, start: t.start, end: t.end, audioType: (() => { const at = s.audioType || (s.voActive ? 'talking' : 'none'); const txt = (typeof s.voText === 'string' ? s.voText : (s.builderData?.desc || '')).trim(); return (at !== 'none' && !txt) ? 'none' : at; })() }); // SKRIP KOSONG = tanpa ucapan
    }
    return out;
  };

  const buildGptVideoPrompt = (sheetIdx, target) => {
    const shots = getSheetShots(sheetIdx);
    if (!shots.length) return '';
    const N = shots.length;
    const lipCutTxt = shots.some(s => s.audioType === 'talking') ? ' Each lipsync line is completed inside its own scene; the hard cut happens only after the line ends, never mid-sentence.' : ''; // HARD CUT: kalimat lipsync selesai sebelum cut
    const t0 = shots[0].start;
    const D = Math.max(1, (shots[N - 1].end - t0) || 10);
    const ratio = config.ratio;
    const orient = ratio === '9:16' ? 'vertical' : (ratio === '16:9' ? 'horizontal' : 'square');
    const hasProduct = isProductEnabled && !!productImage;
    const prodName = (productName || 'the product').trim();
    const forProduct = hasProduct ? ` for ${prodName}` : '';
    const hair = normHair(talentInfo.hair); // RAMBUT: dirapikan
    const outfit = (talentInfo.outfit || '').trim();
    const voGender = talentInfo.gender === 'Pria' ? 'male' : (talentInfo.gender === 'Wanita' ? 'female' : '');
    // OUTFIT FOTO: foto look jadi acuan baju terpisah di prompt video (wajah tetap dari foto upload)
    const hasOutfit = !!looks.A.src;
    // TALK SHOW (C1): nama gaya konten menggantikan "premium commercial"
    const styleName = String(config.sbBuilderStyle === 'Custom' ? (config.customSbStyle || 'Custom') : config.sbBuilderStyle).trim();
    // TALK SHOW (C6): gaya 3D/2D (deteksi sama dengan image engine) -> tanpa kata realisme
    const isStylizedVideo = styleName.includes('3D') || styleName.toLowerCase().includes('3d') || styleName.includes('2D') || styleName.toLowerCase().includes('anime') || styleName.toLowerCase().includes('kartun');
    // TALK SHOW (C2): kamera per gaya, teks dari prompt video Talk Show yang sudah ada (getPromptForScene)
    const isStage = ['Pengisi Seminar', 'MC Event', 'Stand Up Comedy'].includes(config.sbBuilderStyle);
    const isPodcast = config.sbBuilderStyle === 'Podcast Style';
    const cameraTxt = isStage ? "static locked camera or slight pan from the audience's perspective facing the stage, max 4 camera angles"
        : (isPodcast ? 'static locked camera on tripod, max 2 camera angles only' : 'natural, slight handheld camera shake/sway');
    const cameraLine = isStage ? "Static locked camera or slight pan from the audience's perspective facing the stage. Max 4 camera angles."
        : (isPodcast ? 'Static locked camera on tripod. MAX 2 CAMERA ANGLES ONLY.' : 'Natural, slight handheld camera shake/sway to make it feel authentic and organic.');
    const stageAction = 'Character MUST be standing on a stage, holding a microphone in hand, looking out at the audience.';
    const stageNoLens = 'CRITICAL: The character MUST NOT look at the camera lens.';
    const loc = ((builderMetadata?.locationNote || '').trim() || (bgType === 'custom' ? (customBg || '').trim() : (bgType === 'preset' ? config.background : '')) || 'The location shown in the storyboard').replace(/\.+$/, '');
    const lightOpt = STORYBOARD_LIGHTING_OPTIONS.find(o => o.id === builderMetadata?.lightingId);
    const light = (lightOpt ? lightOpt.desc : 'Consistent lighting').replace(/\.+$/, '');
    const lightTxt = light.charAt(0).toLowerCase() + light.slice(1);
    const musicOn = generatedImages.find(Boolean)?.musicOn ?? config.musicOn;
    const pad2 = (n) => String(n).padStart(2, '0');
    const range = (s) => `${fmtSec(s.start - t0)}–${fmtSec(s.end - t0)}s`;
    const clock = (s) => `${fmtClock(s.start - t0)}–${fmtClock(s.end - t0)}`;
    const lineOf = (s) => (typeof s.data.voText === 'string' ? s.data.voText : (s.data.builderData?.desc || '')).trim().replace(/"/g, "'"); // SKRIP KOSONG: tidak kembali ke naskah lama
    const actionOf = (s) => (s.data.builderData?.action || s.data.builderData?.title || '').trim().replace(/\.+$/, '');
    const talk = shots.filter(s => s.audioType === 'talking');
    const vo = shots.filter(s => s.audioType === 'vo');
    const delivery = (talk.length && vo.length) ? 'mix' : (talk.length ? 'lipsync' : (vo.length ? 'vo' : 'ambient'));

    // ---------- SEEDANCE ----------
    if (target === 'seedance') {
        // Urutan file = urutan ZIP: storyboard, shot, Talent, Outfit, Produk
        let rn = N + 2;
        const talentRef = rn++;
        const outfitRef = hasOutfit ? rn++ : 0;
        const prodRef = rn;
        const shotRef = N === 1 ? `@Image2 = reference image of the shot.` : `@Image2–@Image${N + 1} = reference image of each shot, in order.`;
        const head = `@Image1 = approved storyboard: follow it for action and visual direction. ${shotRef} @Image${talentRef} = character reference.${outfitRef ? ` @Image${outfitRef} = outfit reference.` : ''}${hasProduct ? ` @Image${prodRef} = product reference.` : ''}`;
        const identityTxt = outfitRef
            ? ` Preserve the exact facial identity, ${hair || 'hairstyle'} and natural skin texture of the character in @Image${talentRef}, wearing the exact outfit from @Image${outfitRef} (${outfit || 'outfit'}).`
            : ` Preserve the exact facial identity, ${hair || 'hairstyle'}, natural skin texture and ${outfit || 'outfit'} of the character in @Image${talentRef}.`;
        const body = `Create a ${fmtSec(D)}-second, ${ratio} ${isStylizedVideo ? '' : 'ultra-realistic '}${styleName} video${forProduct}, exactly following the supplied ${N}-panel storyboard and reference images. ${loc}, ${lightTxt}, ${cameraTxt}.${identityTxt}${isStage ? ` ${stageAction} ${stageNoLens}` : ''}${hasProduct ? ` Preserve ${prodName}'s exact design, proportions and label from @Image${prodRef}.` : ''}`;
        const timeline = shots.map(s => {
            const l = lineOf(s);
            const audio = s.audioType === 'talking' ? ` Natural Indonesian lipsync: "${l}"` : (s.audioType === 'vo' ? ` Indonesian VO: "${l}"` : '');
            return `${range(s)} (@Image${s.n + 1}): ${s.n > 1 ? 'Hard cut. ' : ''}${actionOf(s)}.${audio}`; // HARD CUT antar shot
        }).join('\n');
        const closing = {
            lipsync: 'Natural Indonesian speech, subtle studio ambience.',
            mix: 'Natural Indonesian speech, subtle studio ambience.',
            vo: 'No lipsync. Natural studio ambience.',
            ambient: 'Audio: realistic studio ambience and subtle handling sounds only. No speech or voice-over.'
        }[delivery];
        const tail = `Stable face, natural hands${hasProduct ? ', product contact, packaging' : ''} and lighting. Preserve architecture/layout, subject-background relationship, anchors/props, practical-light sources, time/weather/crowd state, mood, and ambience. Every scene change is an instant hard cut: no transition, dissolve, or morphing between scenes. Objects or products appear only in the scenes where the storyboard shows them and never materialize mid-shot.${lipCutTxt} ${musicOn ? 'Soft fitting background music at low volume. ' : ''}No ${musicOn ? '' : 'music, '}subtitles, text overlays, watermark, ${isStylizedVideo ? '' : 'CGI, '}redesign or morphing.`;
        return [head, body, timeline, closing, tail].join('\n');
    }

    // ---------- GEMINI OMNI ----------
    let k = 1;
    const refs = [];
    const talentImg = `@Image${k++}`;
    refs.push(hasOutfit ? `${talentImg} = character reference: lock face and hair.` : `${talentImg} = character reference: lock face, hair and outfit.`);
    let outfitImg = '';
    if (hasOutfit) { outfitImg = `@Image${k++}`; refs.push(`${outfitImg} = outfit reference: lock clothing and accessories.`); }
    let prodImg = '';
    if (hasProduct) { prodImg = `@Image${k++}`; refs.push(`${prodImg} = product reference.`); }
    const sbImg = `@Image${k++}`;
    refs.push(`${sbImg} = approved storyboard: follow it shot by shot for framing, action and order.`);

    const voVoice = voGender ? `${voGender} ` : '';
    const shotBlocks = shots.map(s => {
        const l = lineOf(s);
        const audio = s.audioType === 'talking' ? `\nAudio: natural Indonesian lipsync — "${l}"` : (s.audioType === 'vo' ? `\nAudio: elegant ${voVoice}Indonesian voice-over — "${l}"` : '');
        return `SHOT ${pad2(s.n)} — ${clock(s)} | ${(s.data.builderData?.title || `SHOT ${s.n}`).toUpperCase()}\n${s.n > 1 ? 'Hard cut. ' : ''}${actionOf(s)}.${audio}`; // HARD CUT antar shot
    }).join('\n\n');
    const voCap = voGender ? `${voGender.charAt(0).toUpperCase()}${voGender.slice(1)} voice-over` : 'Voice-over';
    const audioDir = {
        lipsync: 'Natural Indonesian lipsync in every talking shot, clear pronunciation, lips synchronized to the dialogue. Subtle room ambience.',
        vo: 'Indonesian voice-over, soft, confident, refined delivery. No on-camera speech or visible lipsync. Subtle natural ambience underneath.',
        mix: `Mix talking and visual montage. Natural Indonesian pronunciation, synchronized lips only in shots ${talk.map(s => pad2(s.n)).join(', ')}. ${voCap} in shots ${vo.map(s => pad2(s.n)).join(', ')}. Subtle room ambience.`,
        ambient: 'Ambient only. No dialogue, no lipsync, no voice-over. Very subtle room tone and natural handling sounds.'
    }[delivery];

    const sections = [
        `REFERENCES\n${refs.join(' ')}`,
        `VIDEO FORMAT\n${isStylizedVideo ? styleName : `Ultra-realistic ${styleName}`} video${forProduct}, exactly matching the approved ${N}-panel storyboard. No redesign or creative reinterpretation.`,
        `DURATION & RATIO\n${fmtSec(D)} seconds, ${orient} ${ratio}, ${N} consecutive shots following the storyboard timestamps.`,
        `SUBJECT CONTINUITY\nUse the uploaded character reference (${talentImg}). Preserve the exact facial proportions, eyes, nose, lips, natural skin texture, skin tone, ${hair || 'hairstyle'}, ${outfitImg ? `the exact outfit from ${outfitImg} (${outfit || 'outfit'})` : (outfit || 'outfit')}, and makeup level. ${isStage ? 'Natural expressions, gentle gestures' : 'Natural expressions, believable eye contact, gentle gestures'}, no artificial skin smoothing.`,
        hasProduct ? `PRODUCT CONTINUITY\nUse the uploaded ${prodName} reference (${prodImg}). Preserve its exact shape, proportions, colors, material finish, cap or lid, logo, typography and label layout. Never alter packaging geometry or invent label details.` : '',
        `ENVIRONMENT\n${loc}. ${light}. Consistent lighting and color temperature across all shots. Preserve architecture/layout, subject-background relationship, anchors/props, practical-light sources, time/weather/crowd state, mood, and ambience. No changes in location or visual style.`,
        `SHOT-BY-SHOT DIRECTION\n${shotBlocks}`,
        `AUDIO DIRECTION\n${audioDir}`,
        `CAMERA & REALISM\n${cameraLine}${isStage ? ` ${stageAction}` : ''} ${isStylizedVideo ? 'Natural motion, clean cuts.' : 'Natural motion, real photographic depth of field, realistic reflections, clean cuts.'}`,
        `CONSTRAINTS\nFollow exactly ${N} storyboard shots and timestamps. Stable facial identity, anatomically correct fingers, no extra limbs, no floating objects${hasProduct ? ', no packaging morphing, no altered branding, no product redesign' : ''}, ${isStylizedVideo ? '' : 'no skin plasticity, '}no lighting shifts, no background jumps, no cinematic reinterpretation.${isStage ? ` ${stageNoLens}` : ''} Every scene change is an instant hard cut: no transition, dissolve, or morphing between scenes. Objects or products appear only in the scenes where the storyboard shows them and never materialize mid-shot.${lipCutTxt} No subtitles, no added text overlays, no watermark. ${musicOn ? 'Soft fitting background music at low volume under the dialogue.' : 'No background music.'}`
    ];
    return sections.filter(Boolean).join('\n\n');
  };

  const handleCopyGptPrompt = (sheetIdx, target) => {
    playClick();
    const text = buildGptVideoPrompt(sheetIdx, target);
    if (!text) return;
    safeCopyToClipboard(text);
    const key = `${target}_${sheetIdx}`;
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
  };

  // ---------------- PRODUCT ANALYSIS — VERBATIM AKSARA ----------------
  const analyzeProductImage = async (base64Image) => {
    setIsAnalyzingProduct(true);
    setProductName("Sedang menganalisis...");
    setProductDesc("AI sedang mengidentifikasi detail produk...");
    try {
        const imageBase64 = base64Image.split(',')[1];
        const modeTitle = selectedMode?.promptTitle || selectedMode?.title || 'Komersial';
        const systemPrompt = `
        Tugas Anda adalah menganalisis gambar produk dan mengembalikan HANYA format JSON valid.
        1. "productName": Identifikasi produk, maksimal 3 kata (Bahasa Indonesia).
        2. "productDesc": Deskripsi SANGAT RINGKAS (kategori, merek, warna/ciri menonjol).
        3. "backgrounds": Array berisi 7 rekomendasi latar/background yang eksklusif & estetik untuk sesi ${modeTitle} produk tersebut di Indonesia.
        
        Contoh output:
        {
          "productName": "Sepatu Lari Nike",
          "productDesc": "Sepatu lari Nike Air Max warna putih dan biru.",
          "backgrounds": ["Trek Lari Senayan", "Jalanan Sudirman", "Studio Putih", "Teras Cafe", "Ruang Tamu Estetik", "Track Urban", "Taman Kota"]
        }
        `;

        const payload = {
            contents: [{
                parts: [
                    { text: systemPrompt },
                    { inlineData: { mimeType: "image/png", data: imageBase64 } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const data = JSON.parse(text);
                setProductName(data.productName || "Produk Terdeteksi");
                setProductDesc(data.productDesc || "Detail produk.");
                const baseBgs = selectedMode ? MODE_BACKGROUNDS[selectedMode.id] : MODE_BACKGROUNDS.ugc;
                if (data.backgrounds && Array.isArray(data.backgrounds) && data.backgrounds.length > 0) {
                    const mergedBackgrounds = Array.from(new Set([...data.backgrounds, ...baseBgs]));
                    setDynamicBackgrounds(mergedBackgrounds);
                    if (bgType !== 'match_storyboard') {
                        setConfig(prev => ({...prev, background: data.backgrounds[0] || mergedBackgrounds[0]}));
                        setBgType('preset');
                    }
                } else {
                    setDynamicBackgrounds(baseBgs);
                    if (bgType !== 'match_storyboard') {
                        setConfig(prev => ({...prev, background: baseBgs[0]}));
                    }
                }
            } else {
                setProductName("Produk Manual"); setProductDesc("Isi manual");
            }
        } else {
            setProductName("Produk Manual"); setProductDesc("Isi manual");
        }
    } catch (error) {
        console.error("Product analysis error:", error);
        setProductName("Produk Manual"); setProductDesc("Gagal memuat AI. Silakan isi manual.");
        const baseBgs = selectedMode ? MODE_BACKGROUNDS[selectedMode.id] : MODE_BACKGROUNDS.ugc;
        setDynamicBackgrounds(baseBgs);
        if (bgType !== 'match_storyboard') {
            setConfig(prev => ({...prev, background: baseBgs[0]}));
        }
    } finally {
        setIsAnalyzingProduct(false);
    }
  };

  // TALENT ANALYSIS — teks dasar verbatim Part 2 (detectModelGenderForVoice), diperluas dengan hair & outfit (disetujui)
  const analyzeTalentImage = async (base64Image) => {
    const setInfo = setTalentInfo;
    const setAnalyzing = setIsAnalyzingTalent;
    setAnalyzing(true);
    try {
        const imageBase64 = base64Image.split(',')[1];
        const systemPrompt = `Lihat foto model pada gambar ini. Tugas Anda HANYA mengembalikan JSON valid dengan format: {"gender": "Pria" atau "Wanita", "hair": "...", "outfit": "..."}. Tentukan gender berdasarkan penampilan fisik yang terlihat di foto. "hair": deskripsi rambut sangat ringkas dalam Bahasa Inggris (panjang, model, warna). "outfit": deskripsi pakaian dan aksesori yang terlihat, sangat ringkas dalam Bahasa Inggris. Jangan tambahkan penjelasan apapun di luar JSON.`;
        const payload = { contents: [{ parts: [{ text: systemPrompt }, { inlineData: { mimeType: "image/png", data: imageBase64 } }] }], generationConfig: { responseMimeType: "application/json" } };
        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response && response.ok) {
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const data = JSON.parse(text);
                setInfo({
                    gender: data.gender === 'Pria' ? 'Pria' : (data.gender === 'Wanita' ? 'Wanita' : ''),
                    hair: data.hair || '',
                    outfit: data.outfit || ''
                });
            }
        }
    } catch (error) {
        console.error("Talent analysis error:", error);
    } finally {
        setAnalyzing(false);
    }
  };

  // LOOK TALENT: buat foto talent memakai baju pilihan Script AI.
  // Teks prompt dari Part 1 / Aksara mode AI Influencer Builder (Character Builder) — verbatim, kecuali baris OUTFIT (isi dari Script AI).
  const generateLookImage = async (slot, outfitText) => {
    const faceSrc = modelImage; // wajah selalu dari foto upload asli
    if (!faceSrc) return;
    setLooks(prev => ({ ...prev, [slot]: { ...prev[slot], loading: true, approved: false } }));
    try {
        const lookPrompt = [
            `RAW SMARTPHONE PHOTOGRAPHY (SHOT ON IPHONE 17 PRO MAX):`,
            `[CRITICAL FACE LOCK]: Image 1 is the MASTER REFERENCE for the character's face. You MUST strictly clone the exact facial features, identity, skin tone, and bone structure from Image 1. This is the exact same person. DO NOT invent a new face.`,
            `CURRENT POSE & ACTION: Full body shot, standing confidently, showing full outfit.`,
            `OUTFIT: ${(outfitText || '').trim().replace(/\.+$/, '')}.`,
            `ENVIRONMENT: Studio Putih Polos.`,
            `MANDATORY REALISM: Must look EXACTLY like an authentic, raw, unedited photo taken on an iPhone 17 Pro Max by a real person. ZERO AI VIBE. Extremely realistic lifelike human skin texture, visible pores, peach fuzz, natural asymmetric imperfections. True-to-life natural colors, authentic everyday lighting, no cinematic color grading, no artificial studio lights unless specified. Avoid over-polished, plastic, or studio-perfect looks. STRICTLY NO TEXT, NO WATERMARKS.`,
            `CRITICAL CONSISTENCY: Ensure the face, facial structure, skin tone, hairstyle, and body proportions perfectly match the description and references.`,
            `NEGATIVE: changing identity, changing gender, distortion, morphing, bad hands, text overlays.`,
            `Technical: 9:16 format.`
        ].join(' ');
        const payload = {
            contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: faceSrc.split(',')[1] } }, { text: lookPrompt }] }],
            generationConfig: { responseModalities: ["IMAGE"], aspectRatio: '9:16' }
        };
        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GENERATIVE_MODEL}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response || !response.ok) throw new Error(response ? await response.text() : 'No response');
        const result = await response.json();
        const out = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!out) throw new Error('Tidak ada gambar dari AI');
        setLooks(prev => ({ ...prev, [slot]: { ...prev[slot], src: `data:image/png;base64,${out}`, srcOutfit: outfitText, loading: false, approved: false } }));
    } catch (err) {
        console.error("Look generation error:", err);
        setLooks(prev => ({ ...prev, [slot]: { ...prev[slot], loading: false } }));
        showToastError(`Gagal membuat foto look: ${err?.message || err}`);
    }
  };

  const approveLook = (slot) => {
    playClick();
    setLooks(prev => ({ ...prev, [slot]: { ...prev[slot], approved: true } }));
  };

  // LOOK TALENT: semua look disetujui -> teks baju dipakai di prompt shot & prompt video, lalu shot dibuat
  const startShotsFromLooks = () => {
    const pending = pendingShotsRef.current;
    if (!pending) return;
    // OUTFIT FIX: penggantian teks baju tidak lagi harus sama persis (huruf besar/kecil, awalan a/an/the, titik di akhir)
    const outfitCore = (t) => String(t || '').trim().replace(/^(a|an|the)\s+/i, '').replace(/[.\s]+$/, '');
    const swapOutfit = (text, from, to) => { const f = outfitCore(from), t2 = outfitCore(to); if (!f || !t2 || typeof text !== 'string' || f.toLowerCase() === t2.toLowerCase()) return text; const toTxt = String(to).trim().replace(/[.\s]+$/, ''); return text.replace(new RegExp('\\b(?:(?:a|an|the)\\s+)?' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => toTxt.charAt(0).toLowerCase() + toTxt.slice(1)); };
    const slots = ['A'];
    const updated = pending.scriptsArray.map(shot => {
        if (!shot || typeof shot !== 'object') return shot;
        let prompt = shot.prompt;
        slots.forEach(slot => { prompt = swapOutfit(prompt, looks[slot].scriptOutfit, looks[slot].outfit.trim()); });
        return { ...shot, prompt };
    });
    updated.sbMeta = pending.scriptsArray.sbMeta; // KONSISTENSI v2: sbMeta ikut dibawa
    setTalentInfo(prev => ({ ...prev, outfit: looks.A.outfit.trim() || prev.outfit }));
    pendingShotsRef.current = null;
    setLookPhase('idle');
    generateVisual({ scriptsArray: updated });
  };

  const handleProductUpload = (e) => {
    playClick();
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setProductImage(base64);
        setIsProductConfirmed(false);
        analyzeProductImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleModelUpload = (e) => {
    playClick();
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setModelImage(reader.result); analyzeTalentImage(reader.result); };
      reader.readAsDataURL(file);
    }
  };

  // Layar Pilih Gaya: tiap gaya konten app ini jadi satu pilihan.
  // id tetap 'storyboard_builder' (engine Aksara), promptTitle menjaga teks prompt identik Aksara.
  const modes = getSubmode().styles.map(style => ({
    id: 'storyboard_builder',
    key: style,
    style,
    title: STYLE_META[style]?.title || style,
    promptTitle: 'Storyboard Builder',
    icon: STYLE_META[style]?.icon || FileBox,
    desc: STYLE_META[style]?.desc || '',
    // FIX: field ini sebelumnya tidak ada, jadi badge Premium tidak pernah muncul.
    // Di varian talkshow tidak ada gaya Premium; true hanya untuk gaya komersil.
    isPremium: style === 'Komersil / Premium'
  }));

  const ratios = [
    { label: 'Portrait', sub: '9:16', value: '9:16' },
    { label: 'Square', sub: '1:1', value: '1:1' },
    { label: 'Landscape', sub: '16:9', value: '16:9' }
  ];

  const sceneCounts = [4, 8, 12];

  // ---------------- SCRIPT ENGINE — VERBATIM AKSARA ----------------
  const generateScripts = async () => {
      if (selectedMode?.id === 'character_builder') {
          return CHARACTER_POSES;
      }

      if (selectedMode?.id === 'storyboard_builder') {
          const pace = config.sbBuilderPace || 6;
          const totalShots = (config.sbBuilderDuration / 10) * pace;

          const secPerShot = 10 / pace;
          const wordCountLimit = Math.max(2, Math.floor(secPerShot * 2.5));

          const activeStyle = config.sbBuilderStyle === 'Custom' ? (config.customSbStyle || 'Gaya Bebas') : config.sbBuilderStyle;

          let styleSpecificRules = "";
          if (['Pengisi Seminar', 'MC Event', 'Stand Up Comedy'].includes(activeStyle)) {
              styleSpecificRules = `CRITICAL RULE UNTUK GAYA ${activeStyle.toUpperCase()}: Seluruh shot HARUS menggunakan 1 lokasi panggung (stage) yang SAMA PERSIS. Batasi pengambilan gambar MAKSIMAL 4 angle kamera saja dari arah penonton menghadap ke atas panggung. Karakter utama WAJIB memegang mikrofon di tangannya, dan tatapan matanya WAJIB mengarah ke audiens/kerumunan, JANGAN MENATAP LENSA KAMERA SEDIKITPUN. Karakter tidak boleh pindah tempat. Lingkungan, lighting, dan background harus statis dan sama persis dari shot awal hingga akhir.`;
          } else if (activeStyle === 'Podcast Style') {
              styleSpecificRules = "CRITICAL RULE UNTUK PODCAST STYLE: Seluruh shot HARUS menggunakan 1 lokasi/studio yang SAMA PERSIS. Batasi pengambilan gambar hanya pada 1 sampai 3 angle kamera saja (contoh: Wide Shot, Medium Close-up, Frontal Close-up) yang dirotasi secara konsisten. Karakter tidak boleh pindah tempat. Variasikan hanya pada ekspresi wajah, gesture tubuh, dan objek yang dipegang. Lighting, background, dan environment harus tetap statis dan persis sama dari shot awal hingga akhir.";
          }

          // MUSIK: aturan musik latar sesuai toggle user
          const musicRule = config.musicOn
              ? "MUSIC RULE: Video ini MENGGUNAKAN musik latar (BGM). Tuliskan mood/genre BGM yang cocok di \"audioNote\" (cth: BGM Upbeat Pop, BGM Chill Lo-fi, BGM Emosional Piano). Susun alur shot yang dinamis dan enak dipotong mengikuti ketukan musik."
              : "MUSIC RULE: Video ini TANPA musik latar sama sekali. \"audioNote\" WAJIB diawali 'Tanpa Musik' dan hanya berisi suara natural/ambient lingkungan serta dialog/VO.";

          // AUDIO DELIVERY (GPT Commercial, teks baru — disetujui): jenis audio tiap shot
          const AUDIO_RULES = {
              lipsync: `AUDIO RULE — LIPSYNC: Setiap shot yang menampilkan wajah talent adalah "talking" (talent bicara langsung). Shot tanpa wajah (close-up produk/tekstur) adalah "none".`,
              vo: `AUDIO RULE — VOICE OVER: Semua shot adalah "vo" (narasi, talent tidak bicara, tanpa lipsync).`,
              mix: `AUDIO RULE — MIX TALKING + MONTAGE: Shot PERTAMA dan shot TERAKHIR adalah "talking" — wajah talent WAJIB terlihat jelas. Semua shot di antaranya adalah "vo". Jika storyboard lebih dari 1 lembar, aturan ini berlaku di setiap lembar (shot pertama & terakhir dari tiap ${pace} shot).`,
              ambient: `AUDIO RULE — AMBIENT ONLY: Semua shot adalah "none". Tanpa dialog dan tanpa VO. Isi "desc" dengan deskripsi singkat adegan (Bahasa Indonesia), bukan naskah.`
          };
          const audioRule = AUDIO_RULES[config.audioDelivery] || AUDIO_RULES.mix;

          // LOOK TALENT: baju pilihan Script AI dikembalikan terpisah untuk membuat foto look
          const outfitJsonLine = `"outfit": "Deskripsi 1 set pakaian karakter utama dalam Bahasa Inggris, SAMA PERSIS dengan yang ditulis di setiap prompt",`;
          // PROPS FIX: produk hanya muncul satu kali per shot (hanya saat produk aktif)
          const productOnceRule = (isProductEnabled && productImage) ? `PRODUK: Produk hanya muncul SATU kali di setiap shot. Jika produk dipegang talent, JANGAN tulis produk yang sama di meja, rak, atau background.` : '';

          // CARA REKAM: aturan kamera untuk skrip AI (teks baru) — Variatif = aturan #3 asli
          const sbBrollShots = getSbBrollIndices(totalShots, pace, isProductEnabled && !!productImage && config.caraRekam !== 'Variatif');
          const brollExcept = sbBrollShots.length ? ' (kecuali shot B-ROLL di bawah)' : '';
          const CAMERA_RULES = {
              Handheld: `3. CARA REKAM — HANDHELD SELFIE: Semua shot direkam karakter sendiri pakai kamera depan HP, dipegang sepanjang lengan, wajah menghadap lensa. Variasi antar shot HANYA: jarak (close-up wajah ↔ medium dada ke atas), miring kepala, ekspresi, gesture tangan bebas. DILARANG: wide shot orang ketiga, over-the-shoulder, high/low angle dari orang lain, shot tanpa wajah${brollExcept}. Awali setiap "prompt" dengan "Handheld selfie, front camera, arm's length".`,
              Static: `3. CARA REKAM — STATIC / TRIPOD: Kamera diam di satu posisi tetap di depan karakter setinggi mata; karakter bicara ke lensa dan tidak pindah tempat. Posisi, tinggi, dan arah kamera SAMA di semua shot. Variasi antar shot HANYA: framing medium shot ATAU close-up (seperti jump-cut), ekspresi, gesture. DILARANG: kamera bergerak, angle samping/atas/bawah, over-the-shoulder, shot tanpa wajah${brollExcept}. Awali setiap "prompt" dengan "Static locked-off camera, eye level, facing the lens" lalu framing-nya (medium shot / close-up).`,
              Vlog: `3. CARA REKAM — VLOG WIDE: Semua shot direkam karakter sendiri pakai kamera depan lensa wide dengan lengan terentang; background luas terlihat; boleh jalan sambil bicara. Variasi: posisi di lokasi, arah jalan, ekspresi. DILARANG: shot orang ketiga, close-up ekstrem, over-the-shoulder, shot tanpa wajah${brollExcept}. Awali setiap "prompt" dengan "Vlog wide-angle front camera, arm extended".`
          };
          let cameraRule = CAMERA_RULES[config.caraRekam] || `3. ANGLE KAMERA: Tuliskan variasi angle kamera secara eksplisit di awal "prompt" (contoh: Wide Shot, Medium Shot, Extreme Close Up, Over the Shoulder, High Angle) agar dinamis namun tetap menjaga kontinuitas aksi.`;
          if (sbBrollShots.length) {
              cameraRule += `\n          SHOT B-ROLL: Shot nomor ${sbBrollShots.map(i => i + 1).join(', ')} adalah B-ROLL — close-up ${productName || 'produk'} di tangan karakter, TANPA wajah, di lokasi yang sama. "prompt" shot B-roll diawali "B-roll close-up of the product in hand". "desc" shot B-roll tetap lanjutan naskah VO.`;
          }

          // LIGHTING v2: 1 lighting untuk seluruh storyboard
          const sbLightingList = STORYBOARD_LIGHTING_OPTIONS.filter(o => o.id !== 'Match Storyboard' && APP_LIGHTING_IDS.includes(o.id)).map(o => `${o.id} (${o.desc})`).join('; ');
          const sbChosenLighting = STORYBOARD_LIGHTING_OPTIONS.find(o => o.id === config.lighting);
          const lightingRule = (config.lighting === 'Match Storyboard'
              ? `LIGHTING RULE: Pilih SATU preset lighting yang paling cocok dengan konteks cerita (lokasi dan waktu kejadian) dari daftar berikut, lalu tulis NAMA preset-nya persis di key "lightingPreset": ${sbLightingList}. Preset ini dipakai sama persis untuk SEMUA shot.`
              : `LIGHTING RULE: Lighting seluruh storyboard sudah ditetapkan: ${config.lighting} (${sbChosenLighting?.desc || ''}). Susun cerita yang cocok dengan lighting ini.`)
              + ` DILARANG menulis kata cahaya, pencahayaan, atau waktu (contoh: golden hour, sunset, pagi, siang, malam, redup, terang, gelap, backlit, neon) di dalam "prompt" setiap shot maupun di "visualNote", karena cahaya sudah diatur sistem. JANGAN menambahkan benda yang memancarkan cahaya sebagai props (fairy lights, lampu hias, lilin, papan neon) kecuali sesuai preset lighting. "visualNote" hanya berisi tone warna dan mood.`;
          const lightingJsonLine = config.lighting === 'Match Storyboard' ? `"lightingPreset": "NAMA PRESET dari daftar LIGHTING RULE",` : '';

          const prompt = `Anda adalah Sutradara & Storyboard Artist profesional. Buat rancangan storyboard lengkap berdasarkan detail ini:
          ${isProductEnabled ? `Produk/Subjek: ${productName} (${productDesc})` : ''}
          Gaya: ${activeStyle}
          Durasi: ${config.sbBuilderDuration} detik.
          Brief Cerita: ${config.sbBuilderBrief}
          Latar Belakang / Lokasi Awal: ${bgType === 'match_storyboard' ? 'Bebas sesuai brief cerita' : (bgType === 'custom' ? customBg : 'Sesuai konteks referensi')}

          Anda HARUS membagi cerita ini menjadi TEPAT ${totalShots} shot berurutan. Setiap lembar adalah ${pace} shot (10 detik). Alur HARUS sangat nyambung dan logis dari shot ke shot.
          ${styleSpecificRules}
          ${musicRule}
          ${lightingRule}
          ${audioRule}

          CRITICAL CONTINUITY RULES (KONTINUITAS VISUAL PENTING):
          1. KOSTUM/PAKAIAN: Tentukan 1 set pakaian spesifik untuk karakter utama di shot 1, dan WAJIB tuliskan deskripsi pakaian yang SAMA PERSIS di setiap nilai "prompt" pada shot berikutnya. Jangan sampai pakaian berubah-ubah di tengah adegan.
          2. LATAR BELAKANG: Jaga konsistensi lokasi. Pindah lokasi HANYA jika Brief Cerita secara eksplisit menyebut lokasi yang berbeda. Sebutkan detail lokasi secara konsisten di setiap "prompt".
          ${cameraRule}
          4. RAMBUT & MAKEUP: Gaya rambut, warna rambut, dan makeup karakter WAJIB sama di semua shot (diambil dari foto referensi karakter). JANGAN menulis rambut tergerai, diikat, diubah, atau makeup yang berbeda di shot mana pun. Cukup tulis "same hairstyle and makeup as the reference photo" di setiap "prompt".
          5. PROPS: Props HANYA boleh ada jika punya fungsi di aksi shot (cth: meja/podium tempat menaruh produk, benda yang dipakai talent). Maksimal 1–2 props untuk seluruh storyboard. Jika dipakai, tulis deskripsi props yang SAMA PERSIS setiap kali props itu muncul di "prompt". Shot yang tidak memakai props JANGAN menyebut props apa pun. Jangan mengganti jenis meja atau props di lokasi yang sama.
          ${productOnceRule}

          CRITICAL VOICE OVER RULE (K5): Treat dialogue length as natural performance pacing, not a quota. Whenever the character is visibly speaking/lipsyncing, write approximately 2.5 spoken words per second of that actual speaking beat. Count only Dialogue/Lipsync words and only the seconds assigned to visible speaking. Do not measure against the full shot, prompt, part, or video duration, and do not fill pauses, reactions, actions, cutaways, or silent shots with dialogue. Talking/Lipsync applies this only to its speaking beats. Mixed applies it only to visible Dialogue/Lipsync; its VO remains separate. Voice Over and Ambient Only are not governed by this character-speaking rate. Let the mode and storyboard decide naturally when the character speaks, acts, reacts, or pauses.
          TIMING (K5): Timing must equal exactly 10 seconds per lembar (adaptive examples: 0–2 / 2–4 / 4–7 / 7–9 / 9–10 or 0–3 / 3–6 / 6–8 / 8–10). Speech/action must fit: shot yang ada dialognya diberi durasi yang cukup untuk dialog itu.
          HARD CUT: Antar shot ada hard cut. Setiap "desc" WAJIB kalimat/frasa utuh yang selesai di shot itu, sisakan jeda ±0,5 detik sebelum cut. JANGAN memotong kalimat dan menyambungnya ke shot berikutnya.

          Return HANYA JSON valid dengan format ini (tanpa markdown, hanya string JSON murni):
          {
            "sheetTitle": "STORYBOARD - [Judul Singkat] ([Gaya])",
            "audioNote": "Catatan audio keseluruhan (cth: Natural, Voice Over, BGM Upbeat)",
            "visualNote": "Catatan tone warna dan mood keseluruhan, TANPA cahaya/waktu (cth: Gaya vlog, warna hangat natural, shot smartphone)",
            ${lightingJsonLine}
            "locationNote": "Lokasi utama dalam Bahasa Inggris, 1 frasa singkat (cth: Podcast studio with dark acoustic panels)",
            ${outfitJsonLine}
            "shots": [
               {
                 "title": "JUDUL SHOT SINGKAT",
                 "timing": "0:00-0:02",
                 "desc": "Naskah dialog/VO shot ini: kalimat/frasa utuh yang selesai di shot ini, panjangnya mengikuti CRITICAL VOICE OVER RULE, natural.",
                 "audioType": "talking | vo | none (ikuti AUDIO RULE)",
                 "action": "1 kalimat aksi singkat bahasa Inggris untuk video, tanpa deskripsi pakaian/rambut (cth: Medium shot, she speaks into the microphone and gestures with one hand.)",
                 "prompt": "Prompt bahasa inggris super detail untuk AI Image Generator. WAJIB MENGANDUNG: [1. Angle Kamera spesifik], [2. Deskripsi PAKAIAN spesifik & konsisten], [3. Aksi mendetail], [4. Detail background/lokasi konsisten], [5. Props HANYA jika dipakai di aksi shot ini + 'same hairstyle and makeup as the reference photo']. Cth: Medium close up shot, a woman wearing a yellow jacket and white cap, holding product X, running and looking back, city park background."
               }
            ]
          }`;

          const payload = {
              contents: [{ parts: [{ text: prompt }] }]
          };

          try {
              const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
              });
              if (response.ok) {
                  const result = await response.json();
                  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                  const match = text.match(/\{[\s\S]*\}/);
                  const data = JSON.parse(match ? match[0] : text);

                  if (data && data.shots) {
                      setBuilderMetadata({
                          sheetTitle: data.sheetTitle || 'STORYBOARD PROYEK',
                          audioNote: data.audioNote || 'Audio Natural',
                          visualNote: data.visualNote || 'Gaya natural dan realistis.',
                          locationNote: data.locationNote || ''
                      });

                      let finalShots = data.shots;
                      if (finalShots.length < totalShots) {
                          const missing = totalShots - finalShots.length;
                          for (let i = 0; i < missing; i++) {
                              finalShots.push({
                                  title: `SHOT ${finalShots.length + 1}`,
                                  // FIX (bug Aksara #8): timing padding pakai formatShotTiming
                                  timing: formatShotTiming(finalShots.length, pace),
                                  desc: `Adegan berlanjut.`,
                                  prompt: `The scene continues naturally from the previous shot.`
                              });
                          }
                      }
                      const outShots = finalShots.slice(0, totalShots);
                      // DIALOG FIT: shot lipsync diberi durasi cukup untuk dialognya (total per lembar tetap 10 detik)
                      const isTalkShot = (s) => { const a = String(s.audioType || '').toLowerCase().trim(); return a === 'talking' || (!['vo', 'none'].includes(a) && (config.audioDelivery === 'lipsync' || config.audioDelivery === 'mix')); };
                      fitDialogTiming(outShots, pace, isTalkShot);
                      outShots.sbMeta = { visualNote: data.visualNote || '', lightingPreset: data.lightingPreset || '', outfit: data.outfit || '' }; // LOOK TALENT: baju dari Script AI // KONSISTENSI v2: visualNote ke prompt gambar
                      return outShots;
                  }
              }
          } catch (err) {
              console.error("Builder script gen error", err);
          }
          return Array.from({ length: totalShots }).map((_, i) => ({
              // FIX (bug Aksara #8): timing fallback pakai formatShotTiming
              title: `SHOT ${i+1}`, timing: formatShotTiming(i, pace), desc: `Adegan ${i+1} untuk ${productName}.`, prompt: `Action scene ${i+1} with product.`
          }));
      }

      let toneInstruction = "Tone: Profesional, jernih, persuasif.";
      let narrativeArc = "Follow a logical narrative arc: hook/context -> problem -> discovery -> interaction -> transformation -> resolution. IMPORTANT: The output must be a single, continuous, and highly engaging storyline. The transition between scenes must flow flawlessly like one connected monologue.";

      if (selectedMode?.id === 'ugc') {
          toneInstruction = "Tone: Sangat natural, ngobrol santai seperti UGC TikTok/Reels sungguhan, gunakan bahasa sehari-hari yang sangat membumi.";
          narrativeArc = "Follow a highly organic, natural TikTok/Reels style narrative: casual hook -> relatable problem -> introducing product as an everyday find -> showing real usage -> genuine reaction -> soft recommendation. MUST be a continuous storyline.";
      } else if (selectedMode?.id === 'commercial') {
          toneInstruction = "Tone: Elegan, profesional, sangat meyakinkan seperti iklan TV premium.";
      } else if (selectedMode?.id === 'mirror') {
          toneInstruction = "Tone: Stylish, trendy, fokus pada penampilan (OOTD) dan kepercayaan diri.";
      } else if (selectedMode?.id === 'pov') {
          toneInstruction = "Tone: Review langsung, fokus pada detail produk, praktis, dan interaktif.";
      } else if (selectedMode?.id === 'product_shoot') {
          toneInstruction = "Tone: Informatif, menonjolkan detail dan kualitas fitur estetika produk.";
      } else if (selectedMode?.id === 'podcast') {
          toneInstruction = "Tone: Sangat natural, ngobrol santai dua arah seperti podcast sungguhan.";
      }

      const prompt = `Generate a JSON object with a single key 'scripts' containing an array of precisely ${config.scenes} strings for a storyboard about ${productName} (${productDesc}). ${narrativeArc} IMPORTANT: Use Bahasa Indonesia. ${toneInstruction} EXACT DURATION: Each script string MUST take exactly 6 to 8 seconds to speak. Write STRICTLY between 15 and 25 words per string.`;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      };

      try {
          const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (response.ok) {
              const result = await response.json();
              const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
              const data = JSON.parse(text);
              if (data.scripts && data.scripts.length > 0) {
                  return data.scripts;
              }
          }
      } catch (err) {
          console.error("Script gen error", err);
      }

      return Array.from({ length: config.scenes }).map((_, i) => `Scene ${i+1}: Narasi default untuk ${productName}.`);
  };

  // ---------------- IMAGE ENGINE — VERBATIM AKSARA ----------------
  // LOOK TALENT: tahap 1 (tanpa resumeCtx) = skrip + foto look; tahap 2 (resumeCtx berisi skrip) = buat shot

  const briefAppInputs = () => talentInfo.gender ? [`Talent: ${talentInfo.gender} (pakai sebagai persona dan kata ganti)`] : [];

  // BRIEF AI (fitur baru): hanya mengisi kolom Brief — Script AI, prompt gambar, dan prompt video TIDAK diubah
  // VARIASI: pola cerita per gaya (2 kandidat acak, tanpa mengulang pola terakhir) + angle acak + larangan mirip brief sebelumnya
  const handleGenerateBrief = async () => {
    if (isBriefGenerating) return;
    playClick();
    setIsBriefGenerating(true);
    setBriefError('');
    try {
      const pace = config.sbBuilderPace || 4;
      const sheets = Math.max(1, Math.round(config.sbBuilderDuration / 10));
      const totalShots = sheets * pace;
      const styleName = String(config.sbBuilderStyle === 'Custom' ? (config.customSbStyle || 'Custom') : config.sbBuilderStyle).trim();
      const entry = BRIEF_STYLE_LIB[config.sbBuilderStyle] || BRIEF_STYLE_LIB.__custom;
      const purpose = BRIEF_STYLE_LIB[config.sbBuilderStyle] ? entry.purpose : `Gaya custom "${styleName}": susun alur dari nama gaya ini; jangan meniru gaya lain secara mekanis.`;
      const current = (config.sbBuilderBrief || '').trim();
      const history = briefHistoryRef.current;
      const userIdea = current && current !== history[history.length - 1] ? current : ''; // teks ketikan user = ide; hasil AI sebelumnya bukan ide
      const hasProduct = isProductEnabled && !!productImage && !!(productName || '').trim();
      // POLA: buang yang butuh produk saat produk mati, hindari 2 pola terakhir, ambil 2 kandidat acak
      const usable = entry.patterns.filter(p => hasProduct || !p.product);
      const recent = briefPatternRef.current.slice(-2);
      const fresh = usable.filter(p => !recent.includes(p.name));
      const pool = (fresh.length >= 2 ? fresh : usable).slice().sort(() => Math.random() - 0.5);
      const candidates = pool.slice(0, Math.min(2, pool.length));
      const angle = BRIEF_ANGLES[Math.floor(Math.random() * BRIEF_ANGLES.length)];
      const avoid = history.slice(-3);
      const audioOpt = AUDIO_DELIVERY_OPTIONS.find(o => o.id === config.audioDelivery);
      const lightOpt = STORYBOARD_LIGHTING_OPTIONS.find(o => o.id === config.lighting);
      const locTxt = bgType === 'custom' ? (customBg || '').trim()
          : bgType === 'custom_image' ? 'sesuai foto lokasi yang di-upload user (jangan mengarang detail lokasi)'
          : bgType === 'match_storyboard' ? 'bebas: pilih SATU lokasi nyata yang paling cocok dengan gaya dan produk, sebutkan di Hook'
          : (config.background || '');
      const inputs = [
          `Lokasi: ${locTxt || 'bebas, pilih satu lokasi yang cocok'}`,
          `Lighting: ${lightOpt && lightOpt.id !== 'Match Storyboard' ? `${lightOpt.id} (${lightOpt.desc})` : 'dipilih sistem sesuai cerita'}`,
          `Audio: ${audioOpt ? `${audioOpt.label} (${audioOpt.desc})` : 'bebas'}`,
          `Musik latar: ${config.musicOn ? 'ada' : 'tidak ada'}`,
          ...briefAppInputs(),
          hasProduct ? `Produk: ${productName.trim()}${(productDesc || '').trim() ? ` (${productDesc.trim()})` : ''}` : 'Produk: tidak ada. Cerita fokus pada talent/aktivitas; jangan menambahkan produk atau merek.'
      ].filter(Boolean);
      const multi = sheets > 1;
      const structureRules = multi
          ? `- Video ini ${sheets} lembar x ${pace} shot. Sebarkan beat pola ke SEMUA lembar; jika beat pola lebih sedikit dari jumlah shot, pecah beat bagian tengah (proses) menjadi langkah-langkah konkret yang berbeda.
- Setiap "Lembar N" berisi tepat ${pace} beat dipisah " → ". Setiap lembar wajib membawa hal baru (aksi, info, atau emosi) dan TIDAK mengulang aksi atau hook lembar sebelumnya.
- Setiap lembar kecuali lembar terakhir berakhir dengan alasan untuk terus menonton (rasa penasaran yang natural); lembar terakhir menjawab Benang merah.
- Emosi bergerak naik; detail dan hasil produk dibuka bertahap, jangan dihabiskan di lembar pertama.`
          : `- Alur berisi tepat ${totalShots} beat berurutan dipisah " → ", satu beat = satu shot. Jika pola punya lebih banyak beat, gabungkan beat yang berdekatan.`;
      const formatLines = multi
          ? ['Pola: [nama pola yang dipilih]', 'Benang merah: [satu pertanyaan/tujuan yang baru terjawab di lembar terakhir]', 'Hook: [situasi awal di 2 detik pertama]', ...Array.from({ length: sheets }, (_, i) => `Lembar ${i + 1}: [beat → beat → ...]`), 'Emosi: [awal] → [tengah] → [akhir]', 'Penutup: [verdict / reaksi / ajakan]']
          : ['Pola: [nama pola yang dipilih]', 'Hook: [situasi awal di 2 detik pertama]', 'Alur: [beat 1] → [beat 2] → ...', 'Emosi: [awal] → [akhir]', 'Penutup: [verdict / reaksi / ajakan]'];
      const prompt = `Buat SATU brief storyboard dalam Bahasa Indonesia sehari-hari untuk ${BRIEF_APP_LABEL}.
TUJUAN MODE (wajib diikuti): ${purpose}
Gaya konten: ${styleName}. Durasi ${config.sbBuilderDuration} detik = ${totalShots} shot.
${userIdea ? `IDE USER (wajib dipertahankan dan dikembangkan): ${userIdea}` : ''}
POLA CERITA (pilih SATU yang paling cocok dengan produk, talent, lokasi, dan pilihan user; isi dengan cerita baru yang spesifik, jangan menyalin kata-kata pola):
${candidates.map((p, i) => `${String.fromCharCode(65 + i)}. ${p.name}: ${p.arc}`).join('\n')}
ANGLE CERITA: ${angle}. Jika angle ini tidak cocok dengan tujuan mode atau produk, pakai angle lain yang tetap relevan.
${avoid.length ? `JANGAN mirip brief sebelumnya (hook, alur, dan penutup harus berbeda):\n${avoid.map((b, i) => `${i + 1}. ${b.replace(/\n/g, ' ')}`).join('\n')}` : ''}

PILIHAN USER:
${inputs.map(x => `- ${x}`).join('\n')}

ATURAN:
- The brief must contain a starting situation, natural action progression, mood/emotional movement, and closing beat.
- Gunakan setiap pilihan user hanya jika membantu cerita, tapi jangan pernah bertentangan dengan pilihan mana pun.
${structureRules}
- Tetap di satu lokasi.
- DILARANG menulis kata cahaya, pencahayaan, atau waktu (contoh: golden hour, sunset, pagi, siang, malam, redup, terang, gelap, backlit, neon).
- Jangan mendeskripsikan wajah, rambut, atau pakaian talent. Jangan menulis istilah kamera, angle, atau sinematik.
- Brief bukan naskah: jangan menulis dialog lengkap.

FORMAT (persis ${formatLines.length} baris, tanpa markdown, tanpa teks lain):
${formatLines.join('\n')}`;
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1.1 } })
      });
      if (!response || !response.ok) throw new Error('Brief AI request failed');
      const result = await response.json();
      const raw = String(result.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```[a-z]*/gi, '').replace(/\*\*/g, '').trim();
      const allLines = raw.split('\n').map(l => l.trim()).filter(l => /^(Pola|Benang merah|Hook|Alur|Lembar\s*\d+|Emosi|Penutup)\s*:/i.test(l));
      const polaLine = allLines.find(l => /^Pola\s*:/i.test(l));
      const lines = allLines.filter(l => !/^Pola\s*:/i.test(l)); // nama pola hanya untuk rotasi, tidak masuk ke brief
      const brief = lines.length >= 3 ? lines.join('\n') : raw.replace(/^Pola\s*:.*$/im, '').trim();
      if (!brief) throw new Error('Brief AI empty');
      const chosenName = polaLine ? polaLine.replace(/^Pola\s*:\s*/i, '').trim().toLowerCase() : '';
      const chosen = candidates.find(p => chosenName && (chosenName.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(chosenName))) || candidates[0];
      if (chosen) briefPatternRef.current = [...briefPatternRef.current, chosen.name].slice(-4);
      briefHistoryRef.current = [...history, brief].slice(-5);
      setConfig(prev => ({ ...prev, sbBuilderBrief: brief }));
    } catch (err) {
      console.error('Brief AI error', err);
      setBriefError('Gagal membuat brief. Coba klik lagi.');
    } finally {
      setIsBriefGenerating(false);
    }
  };

  const generateVisual = async (resumeCtx = null) => {
    playClick();
    const sbNeedsLook = !resumeCtx && selectedMode?.id === 'storyboard_builder';
    setIsGenerating(true);
    setGeneratedImages(new Array(config.scenes).fill(null));
    setSceneLoadings({});
    setScenePrompts({});
    setCopiedStates({});
    if (sbNeedsLook) {
        setLooks({ A: { src: null, outfit: '', scriptOutfit: '', approved: false, loading: false } });
        setLookPhase('script');
        pendingShotsRef.current = null;
    }
    setView(sbNeedsLook ? 'look-setup' : 'result');

    // IMPORTANT: Reseting anchorFace to purely null every time we run a new batch
    let anchorFaceBase64 = null;

    try {
      let activeBackground = config.background;
      let bgBase64 = null;
      if (bgType === 'custom') {
          activeBackground = customBg || 'Studio Foto Polos';
      } else if (bgType === 'match_storyboard' && selectedMode?.id === 'storyboard_builder') {
          activeBackground = "Follow the exact environment, location, and background described strictly in the scene instruction";
      } else if (bgType === 'custom_image' && customBgImage) {
          activeBackground = "The exact environment and location shown in the provided background reference image";
          bgBase64 = customBgImage.split(',')[1];
      }

      const activeLightingOptions = getLightingOptions(selectedMode?.id);
      let lightingDesc = activeLightingOptions.find(l => l.id === config.lighting)?.desc || activeLightingOptions[0].desc;

      const scriptsArray = resumeCtx?.scriptsArray || await generateScripts(); // LOOK TALENT: tahap 2 memakai skrip yang sudah disetujui

      // LIGHTING v2: 1 lighting final untuk seluruh storyboard
      let sbLightingId = config.lighting;
      let sbLightingBy = 'user';
      if (selectedMode?.id === 'storyboard_builder') {
          if (config.lighting === 'Match Storyboard') {
              sbLightingBy = 'ai';
              sbLightingId = resolveLightingPreset(scriptsArray.sbMeta?.lightingPreset) || REC_LIGHTING.find(id => id !== 'Match Storyboard') || 'Natural Window Light';
          }
          lightingDesc = activeLightingOptions.find(l => l.id === sbLightingId)?.desc || lightingDesc;
          setBuilderMetadata(prev => ({ ...(prev || {}), lightingId: sbLightingId, lightingBy: sbLightingBy }));
      }
      const sbBrollIdx = getSbBrollIndices(config.scenes, config.sbBuilderPace, isProductEnabled && !!productImage && config.caraRekam !== 'Variatif'); // CARA REKAM

      // LOOK TALENT: berhenti setelah skrip, buat foto look dari baju pilihan Script AI, tunggu disetujui
      if (sbNeedsLook) {
          const meta = scriptsArray.sbMeta || {};
          const slots = ['A'];
          const outfitOf = (_slot?: any) => String(meta.outfit || talentInfo.outfit || '').trim();
          const nextLooks = { A: { src: null, outfit: '', scriptOutfit: '', approved: false, loading: false } };
          slots.forEach(slot => { const o = outfitOf(slot); nextLooks[slot] = { src: null, outfit: o, scriptOutfit: o, approved: false, loading: true }; });
          setLooks(nextLooks);
          pendingShotsRef.current = { scriptsArray };
          setLookPhase('ready');
          for (const slot of slots) {
              await generateLookImage(slot, nextLooks[slot].outfit);
          }
          return;
      }

      const generateSingleScene = async (index, anchorImage = null) => {
        try {
          // LOOK TALENT: wajah selalu dari foto upload asli, baju dari foto look yang disetujui
          const base64Model = modelImage ? modelImage.split(',')[1] : null;
          const base64ModelOutfit = looks.A.src ? looks.A.src.split(',')[1] : null;
          const base64Guest = guestModelImage ? guestModelImage.split(',')[1] : null;
          const base64ProductRaw = productImage ? productImage.split(',')[1] : null;

          let scriptText = "";
          let builderShotData = null;

          let role = `ACT ${index + 1}`;
          let isBRoll = false;
          let finalSubjectPrompt = "";
          let finalNegPrompt = "";
          let diffusionPrompt = "";
          let videoMotion = "Static.";
          let videoCamera = "High quality setup.";
          let currentIdentityLock = "";
          let payloadParts = [];
          let refInfo = "";
          let realismLaws = "";
          let rolePrefix = "";

          if (selectedMode?.id === 'character_builder') {
              const { gender, age, height, weight, skinTone, hair, mood, ethnicity } = characterConfig;
              const activeMood = mood === 'Custom...' ? customMood : mood;
              const baseChar = `A ${age} year old ${ethnicity} ${gender} influencer from Indonesia. Height: ${height}. Build: ${weight}. Skin tone: ${skinTone}. Hair: ${hair}. Vibe/Mood: ${activeMood}.`;

              role = CHARACTER_POSES[index].role;
              scriptText = CHARACTER_POSES[index].action;
              isBRoll = false;

              let localPayloadParts = [];
              let refLock = "";
              let imageCounter = 1;
              let outfitDescriptions = [];

              if (anchorImage) {
                  localPayloadParts.push({ inlineData: { mimeType: "image/png", data: anchorImage } });
                  refLock += `[CRITICAL FACE LOCK]: Image 1 is the MASTER REFERENCE for the character's face. You MUST strictly clone the exact facial features, identity, skin tone, and bone structure from Image 1. This is the exact same person. DO NOT invent a new face. `;
                  outfitDescriptions.push(`Image 1 = Master Face Reference`);
                  imageCounter++;
              }

              if (outfitImages.top || outfitImages.outer || outfitImages.bottom || outfitImages.footwear || outfitImages.accessory) {
                  refLock += "OUTFIT LOCK: The character MUST wear the exact clothing pieces shown in the reference images. ";
                  if (outfitImages.top) {
                      localPayloadParts.push({ inlineData: { mimeType: "image/png", data: outfitImages.top.split(',')[1] } });
                      outfitDescriptions.push(`Image ${imageCounter} = Top/Shirt`);
                      imageCounter++;
                  }
                  if (outfitImages.outer) {
                      localPayloadParts.push({ inlineData: { mimeType: "image/png", data: outfitImages.outer.split(',')[1] } });
                      outfitDescriptions.push(`Image ${imageCounter} = Outer/Jacket`);
                      imageCounter++;
                  }
                  if (outfitImages.bottom) {
                      localPayloadParts.push({ inlineData: { mimeType: "image/png", data: outfitImages.bottom.split(',')[1] } });
                      outfitDescriptions.push(`Image ${imageCounter} = Bottom/Pants/Skirt`);
                      imageCounter++;
                  }
                  if (outfitImages.footwear) {
                      localPayloadParts.push({ inlineData: { mimeType: "image/png", data: outfitImages.footwear.split(',')[1] } });
                      outfitDescriptions.push(`Image ${imageCounter} = Footwear/Shoes`);
                      imageCounter++;
                  }
                  if (outfitImages.accessory) {
                      localPayloadParts.push({ inlineData: { mimeType: "image/png", data: outfitImages.accessory.split(',')[1] } });
                      outfitDescriptions.push(`Image ${imageCounter} = Accessories`);
                      imageCounter++;
                  }
              }

              if (outfitDescriptions.length > 0) {
                  refLock += "Reference Mapping: " + outfitDescriptions.join(", ") + ". DO NOT hallucinate different clothes or faces.";
              }

              rolePrefix = "RAW SMARTPHONE PHOTOGRAPHY (SHOT ON IPHONE 17 PRO MAX):";
              realismLaws = `MANDATORY REALISM: Must look EXACTLY like an authentic, raw, unedited photo taken on an iPhone 17 Pro Max by a real person. ZERO AI VIBE. Extremely realistic lifelike human skin texture, visible pores, peach fuzz, natural asymmetric imperfections. True-to-life natural colors, authentic everyday lighting, no cinematic color grading, no artificial studio lights unless specified. Avoid over-polished, plastic, or studio-perfect looks. STRICTLY NO TEXT, NO WATERMARKS. LIGHTING: ${lightingDesc}`;

              finalSubjectPrompt = `${baseChar} CURRENT POSE & ACTION: ${scriptText} ENVIRONMENT: ${activeBackground}.`;
              finalNegPrompt = "3d render, animation, cartoon, illustration, bad anatomy, distorted face, blurry, text, watermark, changing identity, ugly, bad proportions, unnatural skin, plastic skin, AI generated look, changing gender, studio lighting, highly edited, beauty filter, smooth skin, professional color grading, softbox, overly saturated, artificial colors.";

              currentIdentityLock = `CRITICAL CONSISTENCY: Ensure the face, facial structure, skin tone, hairstyle, and body proportions perfectly match the description and references. ${refLock}`;

              const consistencyLock = `SCENE CONSISTENCY: The visual mood, color grading, lighting (${lightingDesc}) MUST remain perfectly consistent. DO NOT deviate from this established aesthetic.`;

              diffusionPrompt = `${rolePrefix} Scene ${index + 1}. ${realismLaws} ${finalSubjectPrompt} ${currentIdentityLock} ${consistencyLock} NATURAL COLOR TONE. NEGATIVE: ${finalNegPrompt} Technical: ${config.ratio} format.`;

              payloadParts.push(...localPayloadParts);
              payloadParts.push({ text: diffusionPrompt });

          } else {
              // Standar Flow
              if (selectedMode?.id === 'storyboard_builder') {
                  builderShotData = scriptsArray[index];
                  scriptText = builderShotData?.prompt || `Scene ${index+1}`;

                  if (['Pengisi Seminar', 'MC Event', 'Stand Up Comedy'].includes(config.sbBuilderStyle)) {
                      scriptText += " MANDATORY: The character MUST be standing on a stage holding a microphone. The camera angle MUST be from the audience's perspective looking up at the stage. The character MUST look out at the audience and ABSOLUTELY DO NOT look at the camera lens.";
                  }
              } else {
                  scriptText = scriptsArray[index] || `Scene ${index+1}`;
              }

              isBRoll = (index % 3 === 2) && (index !== config.scenes - 1);
              if (selectedMode?.id === 'podcast' || selectedMode?.id === 'storyboard_builder') {
                  isBRoll = false;
              }
              if (selectedMode?.id === 'storyboard_builder') isBRoll = sbBrollIdx.includes(index); // CARA REKAM: B-roll produk

              role = isBRoll ? "B-ROLL DETAIL" : `ACT ${index + 1}`;
              if (index === 0) role = "HOOK";
              if (index === config.scenes - 1) role = "CTA";
              if (selectedMode?.id === 'storyboard_builder') role = `SHOT ${index + 1}`;

              const modeParams = getModeLogic(selectedMode?.id, index, productName, productDesc, activeBackground, config.ugcStyle, povGender, lightingDesc, scriptText, config.sbBuilderCamera);

              finalSubjectPrompt = modeParams.subjectPrompt;
              finalNegPrompt = modeParams.negPrompt;
              videoMotion = modeParams.motionCamera;
              videoCamera = modeParams.cameraLogic;

              const activeSbStyle = config.sbBuilderStyle === 'Custom' ? (config.customSbStyle || 'Custom') : config.sbBuilderStyle;

              if (isBRoll) {
                  if (selectedMode?.id === 'ugc') {
                      finalSubjectPrompt = `RAW LIFESTYLE B-ROLL PHOTO. Casual close-up of ${productName} (${productDesc}) held casually by hands or resting on a surface. Shot on iPhone 15 Pro Max. Background: ${activeBackground}. LIGHTING: ${lightingDesc} CRITICAL: Real human skin texture on hands, visible pores. NO FACES. Unedited, raw, candid.`;
                      finalNegPrompt = "Human face, eyes, mouth, floating product, overly stylized studio lighting, flat lighting, artificial look, 3d render, DSLR, softbox, professional macro, smooth plastic skin.";
                      videoMotion = "Slight natural handheld camera shake, showcasing the product.";
                      videoCamera = "Smartphone camera, close up.";
                  } else if (selectedMode?.id === 'commercial') {
                      finalSubjectPrompt = `PREMIUM STUDIO B-ROLL. Masterpiece macro close-up of ${productName} (${productDesc}). Focus on premium texture and material details. Background: ${activeBackground}. LIGHTING: ${lightingDesc} NO HUMAN FACES.`;
                      finalNegPrompt = "Human face, eyes, mouth, messy background, low quality, flat lighting, grainy, amateur, everyday lighting, blurry.";
                      videoMotion = "Smooth macro pan/slide over the product surface.";
                      videoCamera = "Macro Lens, sharp focus, high-end commercial style.";
                  } else if (selectedMode?.id === 'mirror') {
                      finalSubjectPrompt = `RAW MIRROR SELFIE B-ROLL. Close-up of ${productName} (${productDesc}) reflected in a mirror. Held casually. Background: ${activeBackground}. LIGHTING: ${lightingDesc} Highly detailed textures. NO FACES.`;
                      finalNegPrompt = "Human face, flat lighting, lack of shadows, overexposed, clean commercial look, 3d render.";
                      videoMotion = "Slight handheld shake, focusing on the product in the mirror.";
                      videoCamera = "Smartphone camera, mirror reflection close up.";
                  } else if (selectedMode?.id === 'product_shoot') {
                      finalSubjectPrompt = `RAW PRODUCT POV B-ROLL. Close-up of ${productName} (${productDesc}) resting on a surface. Shot from above looking down. Background: ${activeBackground}. LIGHTING: ${lightingDesc} NO HUMAN BODY PARTS.`;
                      finalNegPrompt = "Hands, fingers, human, messy background, low quality, flat lighting, blurry.";
                      videoMotion = "Slight natural camera shake, looking down at the product.";
                      videoCamera = "Smartphone camera, POV angle.";
                  }
              }

              let globalNeg = ", text, words, letters, typography, watermark, signature, logo, brand name, subtitles, captions, text overlays, UI elements, deformed, bad anatomy, distorted, different face, morphed body, washed out";

              const is3D = selectedMode?.id === 'storyboard_builder' && (activeSbStyle.includes('3D') || activeSbStyle.toLowerCase().includes('3d'));
              const is2D = selectedMode?.id === 'storyboard_builder' && (activeSbStyle.includes('2D') || activeSbStyle.toLowerCase().includes('anime') || activeSbStyle.toLowerCase().includes('kartun'));
              const isStylized = is3D || is2D;

              if (!isStylized) {
                  globalNeg += ", illustration, painting, cartoon, anime, 3d render, CGI, unreal engine, flat lighting, soft ambient light, lack of shadows, AI generated look, synthetic, plastic, generic AI face, overly smooth, midjourney style";
              } else if (is3D) {
                  globalNeg += ", illustration, painting, 2d, flat cartoon, anime, live action, realistic photo";
              } else if (is2D) {
                  globalNeg += ", 3d render, CGI, realistic photo, live action, 3d character";
              }

              if (['ugc', 'pov', 'mirror', 'product_shoot'].includes(selectedMode?.id)) {
                  globalNeg += ", flawless perfect lighting, professional photography, softbox, studio flash, plastic skin";
              } else if (selectedMode?.id === 'storyboard_builder' && !isStylized) {
                  globalNeg += ", flawless perfect lighting, professional photography, softbox, studio flash, plastic skin";
              } else if (selectedMode?.id === 'podcast') {
                  globalNeg += ", perfect smooth plastic skin, overly polished, beauty filter, cinematic artificial movie lighting, flawless CGI look";
              }

              if (selectedMode?.id === 'storyboard_builder' && ['Pengisi Seminar', 'MC Event', 'Stand Up Comedy'].includes(config.sbBuilderStyle)) {
                  globalNeg += ", looking at camera, eye contact, looking into lens";
              }

              finalNegPrompt += globalNeg;

              rolePrefix = "PHOTOGRAPHY MASTERCLASS TASK:";
              let styling = `Hyper-realistic color processing. ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
              realismLaws = "MANDATORY: Must look like a real, actual photograph. Ultra-detailed, lifelike. NOT AI GENERATED. Include natural photographic imperfections and high-contrast depth. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.";

              if (['ugc', 'pov', 'mirror', 'product_shoot'].includes(selectedMode?.id)) {
                  rolePrefix = "RAW SMARTPHONE PHOTO TASK:";
                  styling = `Authentic raw aesthetic. Shot on iPhone. ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
                  realismLaws = "AUTHENTIC UGC REALISM: Must look EXACTLY like an unedited iPhone photo posted directly to social media. ZERO AI VIBE. CRITICAL: Highly detailed product texture, natural imperfections. NO soft studio lights, NO beauty filters. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.";
              } else if (selectedMode?.id === 'storyboard_builder') {
                  rolePrefix = "STORYBOARD ADAPTATION TASK:";
                  if (is3D) {
                      styling = `High-end 3D animation aesthetic (Pixar/Disney quality). ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
                      realismLaws = "STYLE MANDATE: Must look EXACTLY like a high-budget 3D animated movie frame. ZERO live-action elements. Beautiful 3D lighting, highly detailed 3D textures. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED.";
                  } else if (is2D) {
                      styling = `High-end 2D anime/animation aesthetic (Studio Ghibli/Makoto Shinkai quality). ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
                      realismLaws = "STYLE MANDATE: Must look EXACTLY like a beautiful 2D anime frame or hand-drawn animation. ZERO live-action or 3D elements. Rich 2D colors and linework. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED.";
                  } else {
                      styling = `Ultra-realistic, raw, and candid aesthetic. ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
                      realismLaws = SB_REALISM_REAL; // KONSISTENSI v2 (poin 5)
                  }
              } else if (selectedMode?.id === 'commercial') {
                  rolePrefix = "HIGH-END COMMERCIAL PHOTOGRAPHY TASK:";
                  styling = `Premium catalog aesthetic, razor-sharp details. ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
              } else if (selectedMode?.id === 'podcast') {
                  rolePrefix = "RAW UNCUT PODCAST VIDEO STILL TASK:";
                  styling = `Authentic raw unedited video aesthetic. ABSOLUTELY NO TEXT OR WATERMARKS. LIGHTING: ${lightingDesc}`;
                  realismLaws = "AUTHENTIC REALISM: Must look EXACTLY like a real, unedited raw video frame. ZERO AI VIBE. CRITICAL: Highly detailed real human skin texture, visible pores, natural blemishes. NO beauty filters, NO plastic skin, NO over-rendering. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.";
              }

              const isPodcastMode = selectedMode?.id === 'podcast';
              const isHostScene = index % 2 === 0;
              let activeModelBase64 = base64Model;

              if (isPodcastMode) {
                  activeModelBase64 = isHostScene ? base64Model : (base64Guest || base64Model);
              }

              const hasModelActive = activeModelBase64 && selectedMode?.id !== 'pov' && selectedMode?.id !== 'product_shoot';

              if (selectedMode?.id === 'storyboard_builder') {
                  // KONSISTENSI v2 (poin 1, 6, 9): urutan tetap Model -> Lokasi (opsional) -> Produk (opsional)
                  const sbRefs = buildStoryboardRefs({
                      modelB64: activeModelBase64,
                      broll: isBRoll,
                      locationB64: (bgType === 'custom_image' && bgBase64) ? bgBase64 : null,
                      productB64: (isProductEnabled && base64ProductRaw) ? base64ProductRaw : null,
                      outfitB64: base64ModelOutfit // LOOK TALENT
                  });
                  payloadParts.push(...sbRefs.parts);
                  refInfo = sbRefs.refInfo;
                  currentIdentityLock = sbRefs.lock;
              } else {
                  if (hasModelActive) {
                      refInfo = "[CRITICAL] REFERENCE IMAGES: Image 1 = Base Model (Clone this exact face, hair, and body shape). Image 2 = Product Reference. ";
                      payloadParts.push({ inlineData: { mimeType: "image/png", data: activeModelBase64 } });
                      if (base64ProductRaw) payloadParts.push({ inlineData: { mimeType: "image/png", data: base64ProductRaw } });
                  } else if (base64ProductRaw) {
                      refInfo = "[CRITICAL] REFERENCE IMAGE: Image 1 = The EXACT Product. ";
                      payloadParts.push({ inlineData: { mimeType: "image/png", data: base64ProductRaw } });
                  }

                  if (hasModelActive) {
                      if (isBRoll) {
                          currentIdentityLock = "CRITICAL 100% IDENTITY CLONE LOCK [STRICT ENFORCEMENT]: If ANY body parts (like hands, arms, or torso) appear in this B-Roll, they MUST EXACTLY match the GENDER, skin tone, age, and proportions of the person in IMAGE 1. If IMAGE 1 is a woman, you MUST generate feminine hands/arms. If IMAGE 1 is a man, you MUST generate masculine hands/arms. ABSOLUTELY DO NOT generate male hands for a female model or vice versa. DO NOT show the face. " + OUTFIT_LOCK + " " + PRODUCT_LOCK;
                      } else {
                          currentIdentityLock = IDENTITY_LOCK + " " + OUTFIT_LOCK + " " + PRODUCT_LOCK;
                      }
                  } else {
                      currentIdentityLock = PRODUCT_LOCK;
                  }
              }

              const consistencyLock = `SCENE CONSISTENCY LOCK: This is Scene ${index + 1} of ${config.scenes}. The visual mood, color grading, lighting (${lightingDesc}), and background (${activeBackground}) MUST remain perfectly consistent with the overall sequence. DO NOT deviate from this established aesthetic.`;

              finalNegPrompt += ", different face, altered identity, unrecognizable person, random face, changing clothes, different outfit, new clothing, different shirt, changing gender";

              if (selectedMode?.id === 'storyboard_builder') {
                  // KONSISTENSI v2 (poin 1, 4, 6, 8): tiap bagian 1x, tanpa klaim lintas-panel
                  const sbVisualNote = (scriptsArray.sbMeta?.visualNote || '').trim();
                  const sbWantsCinematic = SB_CINEMATIC_RE.test(sbVisualNote);
                  let sbCameraLine = (modeParams.cameraLogic || '').split(' LIGHTING: ')[0];
                  if (sbWantsCinematic) sbCameraLine = sbCameraLine.replace(' No cinematic filters.', '');
                  const sbHandling = CARA_REKAM_PROMPTS[config.caraRekam] || null; // CARA REKAM
                  const sbExtraNeg = [isBRoll ? SB_BROLL_NEG : (sbHandling ? sbHandling.neg : ''), 'extra props', (isProductEnabled && base64ProductRaw) ? 'duplicate product' : ''].filter(Boolean).join(', '); // PROPS FIX
                  const sbNeg = cleanNegList(`${finalNegPrompt}, ${SB_HAIR_MAKEUP_NEG}, ${SB_HAND_NEG}${sbExtraNeg ? `, ${sbExtraNeg}` : ''}`, [...SB_BRAND_NEG_REMOVE, ...(sbWantsCinematic ? SB_CINEMATIC_NEG_TERMS : []), ...(SB_LIGHTING_NEG_CONFLICT[sbLightingId] || [])]);
                  const sbStyleLine = isStylized ? styling.split(' LIGHTING:')[0] : '';
                  diffusionPrompt = [
                      refInfo.trim(),
                      `${rolePrefix} Shot ${index + 1} of ${config.scenes}.`,
                      `SCENE INSTRUCTION: ${scriptText}. ${base64ModelOutfit ? 'Follow the camera angle, action, props, and location written in this instruction exactly; the clothing comes only from the look reference image.' : 'Follow the camera angle, action, outfit, props, and location written in this instruction exactly.'}`, // OUTFIT FIX
                      isBRoll ? `RAW LIFESTYLE B-ROLL PHOTO. Casual close-up of ${productName} (${productDesc}) held casually by hands or resting on a surface. Shot on iPhone 15 Pro Max. Background: ${activeBackground}. LIGHTING: ${lightingDesc} CRITICAL: Real human skin texture on hands, visible pores. NO FACES. Unedited, raw, candid.` : '',
                      currentIdentityLock.trim(),
                      `CAMERA: ${sbCameraLine}`,
                      (sbHandling && !isBRoll) ? `CAMERA HANDLING: ${sbHandling.camera}` : '',
                      `ENVIRONMENT: ${activeBackground}.`,
                      `LIGHTING: ${lightingDesc}`,
                      sbVisualNote ? `VISUAL STYLE: ${sbVisualNote}` : '',
                      sbStyleLine,
                      realismLaws,
                      `NEGATIVE: ${sbNeg}.`,
                      `Technical: ${config.ratio} format.`
                  ].filter(Boolean).map(x => /[.!?]$/.test(x) ? x : `${x}.`).join(' ');

                  // CARA REKAM: gerak kamera video (Part 1 verbatim) + tahan cara rekam sepanjang klip
                  if (isBRoll) {
                      videoMotion = SB_BROLL_VIDEO_MOTION;
                      videoCamera = SB_BROLL_VIDEO_CAMERA;
                  } else if (sbHandling) {
                      videoMotion = `${sbHandling.motion}${CARA_REKAM_HOLD_LINE}`;
                      videoCamera = `${sbCameraLine} ${sbHandling.camera}`;
                  }
              } else {
                  diffusionPrompt = `${refInfo}${rolePrefix} Scene ${index + 1}. ${scriptText}. ${styling} ${modeParams.cameraLogic}. ${finalSubjectPrompt} ENVIRONMENT: ${activeBackground}. ${realismLaws} ${currentIdentityLock} ${consistencyLock} NEGATIVE: ${finalNegPrompt} Technical: ${config.ratio} format.`;
              }

              payloadParts.push({ text: diffusionPrompt });
          }

          const payload = {
            contents: [{ parts: payloadParts }],
            generationConfig: { responseModalities: ["IMAGE"], aspectRatio: config.ratio }
          };

          const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GENERATIVE_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response || !response.ok) {
              const errorText = response ? await response.text() : 'No response';
              throw new Error(`Generation failed: ${errorText}`);
          }

          const result = await response.json();
          const base64Output = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

          if (base64Output) {
            const imgSrc = `data:image/png;base64,${base64Output}`;
            const defaultVoActive = !isBRoll && (selectedMode?.id !== 'pov' && selectedMode?.id !== 'product_shoot' && selectedMode?.id !== 'character_builder');
            const activeSbStyle = config.sbBuilderStyle === 'Custom' ? (config.customSbStyle || 'Custom') : config.sbBuilderStyle;

            // AUDIO DELIVERY: jenis audio shot dari Script AI, fallback dari pilihan Audio Delivery
            const sbAudioRaw = String(builderShotData?.audioType || '').toLowerCase().trim();
            const sbPace = config.sbBuilderPace || 4;
            const sbPos = index % sbPace;
            const sbAudioBase = AUDIO_TYPES.includes(sbAudioRaw)
                ? ((isBRoll && sbAudioRaw === 'talking') ? 'vo' : sbAudioRaw)
                : (config.audioDelivery === 'ambient' ? 'none'
                    : (config.audioDelivery === 'vo' || isBRoll) ? 'vo'
                    : (config.audioDelivery === 'mix' && sbPos !== 0 && sbPos !== sbPace - 1) ? 'vo'
                    : 'talking');
            const sbAudioType = sbAudioBase;
            const scenarioData = {
                src: imgSrc,
                role,
                action: finalSubjectPrompt,
                scriptHint: scriptText,
                videoMotion,
                videoCamera,
                activeBackground,
                isBRoll,
                audioType: sbAudioType, // AUDIO DELIVERY
                voActive: sbAudioType !== 'none', // AUDIO DELIVERY
                voText: builderShotData ? builderShotData.desc : scriptText,
                builderData: builderShotData,
                sbStyle: selectedMode?.id === 'storyboard_builder' ? activeSbStyle : null,
                musicOn: config.musicOn, // MUSIK
                caraRekam: config.caraRekam, // CARA REKAM
                lightingId: sbLightingId // LIGHTING v2
            };

            setGeneratedImages(prev => {
               const newArr = [...prev];
               const updated = new Array(config.scenes).fill(null).map((_, i) => {
                  if (prev[i]) return prev[i];
                  if (i === index) return scenarioData;
                  return null;
               });
               return updated.map((item, i) => item || prev[i]);
            });

            return base64Output;
          }
        } catch (err) {
          console.error(`Scene ${index} failed:`, err);
        }
        return null;
      };

      for (let i = 0; i < config.scenes; i++) {
        const generatedBase64 = await generateSingleScene(i, anchorFaceBase64);
        if (i === 0 && generatedBase64 && selectedMode?.id === 'character_builder') {
            anchorFaceBase64 = generatedBase64;
        }
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---------------- REVISI — VERBATIM AKSARA ----------------
  // REVISI → PROMPT: jika revisi gambar mengubah isi adegan, teks aksi/arahan/caption shot ikut ditulis ulang (dialog & timing tidak disentuh)
  const syncShotTextAfterRevision = async (index, scenario, instruction) => {
    try {
      const bd = scenario.builderData || {};
      const fields: { action: any; caption: any; direction?: any } = { action: bd.action || '', caption: bd.caption || '' };
      if (bd.direction) fields.direction = bd.direction;
      const prompt = `Anda mengedit 1 shot storyboard. Teks shot sekarang (JSON): ${JSON.stringify(fields)}
Instruksi revisi gambar dari user: "${instruction.trim()}"
Jika instruksi revisi MENGUBAH isi adegan (aksi, pose, ekspresi, framing/jarak kamera, posisi, atau benda yang dipegang/ditampilkan), tulis ulang setiap field agar sesuai dengan revisi, dengan gaya dan panjang yang sama: "action" = 1 kalimat bahasa Inggris (framing + aksi + ekspresi, tanpa deskripsi pakaian/rambut)${fields.direction ? '; "direction" = 2-3 kalimat bahasa Inggris (framing, aksi, ekspresi, gerak kamera)' : ''}; "caption" = 1 kalimat Bahasa Indonesia tanpa dialog. Jika revisi hanya memperbaiki kualitas (cahaya, kemiripan wajah, jari, kulit, label produk, pakaian, ketajaman, warna), jangan ubah apa pun dan isi "changed": false. Jangan menulis kata cahaya atau waktu.
Kembalikan HANYA JSON: {"changed": true atau false, "action": "...", "caption": "..."${fields.direction ? ', "direction": "..."' : ''}}`;
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
      });
      if (!response || !response.ok) return;
      const result = await response.json();
      const raw = String(result.candidates?.[0]?.content?.parts?.[0]?.text || '');
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return;
      const data = JSON.parse(m[0]);
      if (data.changed !== true) return;
      const pick = (v, old) => (typeof v === 'string' && v.trim()) ? v.trim() : old;
      setGeneratedImages(prev => {
        const arr = [...prev];
        const cur = arr[index];
        if (!cur) return prev;
        const cbd = cur.builderData || {};
        const nbd = { ...cbd, action: pick(data.action, cbd.action), caption: pick(data.caption, cbd.caption) };
        if (cbd.direction) nbd.direction = pick(data.direction, cbd.direction);
        const baseAction = String(cur.action || '').replace(/ UPDATED SCENE: [\s\S]*$/, '');
        arr[index] = { ...cur, builderData: nbd, action: `${baseAction} UPDATED SCENE: ${nbd.action}`.trim(), actionUpdated: true };
        return arr;
      });
    } catch (e) {
      console.error('Sync revisi error', e);
    }
  };

  const regenerateSingleScene = async (index) => {
    playClick();
    const revisionInstruction = scenePrompts[index] || "";
    const originalScenario = generatedImages[index];

    let activeBackground = config.background;
    let bgBase64 = null;
    if (bgType === 'custom') {
        activeBackground = customBg || 'Studio Foto Polos';
    } else if (bgType === 'match_storyboard' && selectedMode?.id === 'storyboard_builder') {
        activeBackground = "Follow the exact environment, location, and background described strictly in the scene instruction";
    } else if (bgType === 'custom_image' && customBgImage) {
        activeBackground = "The exact environment and location shown in the provided background reference image";
        bgBase64 = customBgImage.split(',')[1];
    }

    const activeLightingOptions = getLightingOptions(selectedMode?.id);
    const lightingDesc = activeLightingOptions.find(l => l.id === (originalScenario?.lightingId || config.lighting))?.desc || activeLightingOptions[0].desc; // LIGHTING v2: pakai lighting saat generate

    setSceneLoadings(prev => ({ ...prev, [index]: true }));

    try {
      // LOOK TALENT: wajah selalu dari foto upload asli, baju dari foto look yang disetujui
      const base64Model = modelImage ? modelImage.split(',')[1] : null;
      const base64ModelOutfit = looks.A.src ? looks.A.src.split(',')[1] : null;
      const base64Guest = guestModelImage ? guestModelImage.split(',')[1] : null;
      const base64ProductRaw = productImage ? productImage.split(',')[1] : null;

      const activeSbStyle = originalScenario.sbStyle || config.sbBuilderStyle;
      const is3D = selectedMode?.id === 'storyboard_builder' && (activeSbStyle.includes('3D') || activeSbStyle.toLowerCase().includes('3d'));
      const is2D = selectedMode?.id === 'storyboard_builder' && (activeSbStyle.includes('2D') || activeSbStyle.toLowerCase().includes('anime') || activeSbStyle.toLowerCase().includes('kartun'));
      const isStylized = is3D || is2D;

      let payloadParts = [];
      let refInfo = "";
      let currentIdentityLock = "";
      let rolePrefix = "PHOTOGRAPHY MASTERCLASS TASK:";
      let realismLaws = `MANDATORY: Must look like a real, actual photograph. Ultra-detailed, lifelike. NOT AI GENERATED. Include natural photographic imperfections and high-contrast depth. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.`;

      let revisionNegPrompt = "excessive acne, bad skin, blemishes, scars, spots, different face, altered identity, unrecognized person, random face, morphed body, changing clothes, different outfit, new clothing, different shirt, changing gender, text, words, letters, typography, watermark, signature, logo, brand name, subtitles, captions, text overlays, UI elements, deformed, distorted";

      if (!isStylized) {
          revisionNegPrompt += ", illustration, painting, cartoon, 3d render, CGI, unreal engine, flat lighting, soft ambient light, lack of shadows, AI generated look, synthetic, plastic, generic AI face, overly smooth, midjourney style";
      } else if (is3D) {
          revisionNegPrompt += ", illustration, painting, 2d, flat cartoon, anime, live action, realistic photo";
      } else if (is2D) {
          revisionNegPrompt += ", 3d render, CGI, realistic photo, live action, 3d character";
      }

      const isPodcastMode = selectedMode?.id === 'podcast';
      const isHostScene = (index + 1) % 2 === 0;
      let activeModelBase64 = base64Model;

      if (isPodcastMode) {
          activeModelBase64 = isHostScene ? base64Model : (base64Guest || base64Model);
      }

      const hasModelActive = activeModelBase64 && selectedMode?.id !== 'pov' && selectedMode?.id !== 'product_shoot';

      if (selectedMode?.id === 'storyboard_builder') {
          // KONSISTENSI v2 (poin 1, 6, 9): sama dengan saat generate
          const sbRefs = buildStoryboardRefs({
              modelB64: activeModelBase64,
              broll: !!originalScenario.isBRoll,
              locationB64: (bgType === 'custom_image' && bgBase64) ? bgBase64 : null,
              productB64: (isProductEnabled && base64ProductRaw) ? base64ProductRaw : null,
              outfitB64: base64ModelOutfit // LOOK TALENT
          });
          payloadParts.push(...sbRefs.parts);
          refInfo = sbRefs.refInfo;
          currentIdentityLock = sbRefs.lock;
      } else {
          if (hasModelActive) {
              if (originalScenario.isBRoll) {
                  currentIdentityLock = "CRITICAL 100% IDENTITY CLONE LOCK [STRICT ENFORCEMENT]: If ANY body parts (like hands, arms, or torso) appear in this B-Roll, they MUST EXACTLY match the GENDER, skin tone, age, and proportions of the person in IMAGE 1. If IMAGE 1 is a woman, you MUST generate feminine hands/arms. If IMAGE 1 is a man, you MUST generate masculine hands/arms. ABSOLUTELY DO NOT generate male hands for a female model or vice versa. DO NOT show the face. " + OUTFIT_LOCK + " " + PRODUCT_LOCK;
              } else {
                  currentIdentityLock = IDENTITY_LOCK + " " + OUTFIT_LOCK + " " + PRODUCT_LOCK;
              }
          } else {
              currentIdentityLock = PRODUCT_LOCK;
          }

          if (hasModelActive) {
              refInfo = "[CRITICAL] REFERENCE IMAGES: Image 1 = Base Model (Clone this exact face, hair, and body shape). Image 2 = Product Reference. ";
              payloadParts.push({ inlineData: { mimeType: "image/png", data: activeModelBase64 } });
              if (base64ProductRaw) payloadParts.push({ inlineData: { mimeType: "image/png", data: base64ProductRaw } });
          } else if (base64ProductRaw) {
              refInfo = "[CRITICAL] REFERENCE IMAGE: Image 1 = The EXACT Product. ";
              payloadParts.push({ inlineData: { mimeType: "image/png", data: base64ProductRaw } });
          }
      }

      if (['ugc', 'pov', 'mirror', 'product_shoot'].includes(selectedMode?.id)) {
          revisionNegPrompt += ", flawless perfect lighting, cinematic movie shot, professional photography, DSLR, 8k, high res, softbox, studio flash, plastic skin, beauty filter";
      } else if (selectedMode?.id === 'storyboard_builder' && !isStylized) {
          revisionNegPrompt += ", flawless perfect lighting, cinematic movie shot, professional photography, DSLR, 8k, high res, softbox, studio flash, plastic skin, beauty filter";
      } else if (selectedMode?.id === 'podcast') {
          revisionNegPrompt += ", perfect smooth plastic skin, overly polished, beauty filter, cinematic artificial movie lighting, flawless CGI look";
      }

      if (['ugc', 'pov', 'mirror', 'product_shoot'].includes(selectedMode?.id)) {
          rolePrefix = "RAW SMARTPHONE PHOTO TASK:";
          realismLaws = `AUTHENTIC UGC REALISM: Must look EXACTLY like an unedited iPhone photo. ZERO AI VIBE. CRITICAL: Highly detailed real texture. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.`;
      } else if (selectedMode?.id === 'storyboard_builder') {
          rolePrefix = "STORYBOARD ADAPTATION TASK:";
          if (is3D) {
              realismLaws = `STYLE MANDATE: Must look EXACTLY like a high-budget 3D animated movie frame. ZERO live-action elements. Beautiful 3D lighting, highly detailed 3D textures. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED.`;
          } else if (is2D) {
              realismLaws = `STYLE MANDATE: Must look EXACTLY like a beautiful 2D anime frame or hand-drawn animation. ZERO live-action or 3D elements. Rich 2D colors and linework. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED.`;
          } else {
              realismLaws = `${SB_REALISM_REAL} LIGHTING: ${lightingDesc}.`; // KONSISTENSI v2 (poin 5)
          }
      } else if (selectedMode?.id === 'commercial') {
          rolePrefix = "HIGH-END COMMERCIAL PHOTOGRAPHY TASK:";
          realismLaws = `MANDATORY: Premium catalog aesthetic. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.`;
      } else if (selectedMode?.id === 'podcast') {
          rolePrefix = "RAW UNCUT PODCAST VIDEO STILL TASK:";
          realismLaws = `AUTHENTIC REALISM: Must look EXACTLY like a real, unedited raw video frame. ZERO AI VIBE. CRITICAL: Highly detailed real human skin texture, visible pores, natural blemishes. NO beauty filters, NO plastic skin. LIGHTING: ${lightingDesc}. STRICTLY NO TEXT, NO UI, NO WATERMARKS ALLOWED IN THE IMAGE.`;
      }

      let consistencyLock = `SCENE CONSISTENCY LOCK: This is Scene ${index + 1} of ${config.scenes}. The visual mood, color grading, lighting (${lightingDesc}), and background (${activeBackground}) MUST remain perfectly consistent with the overall sequence. DO NOT deviate from this established aesthetic.`;

      if (selectedMode?.id === 'storyboard_builder') {
          // KONSISTENSI v2 (poin 1, 4, 6): ganti klaim lintas-panel dengan VISUAL STYLE dari AI skrip
          const sbVisualNote = (builderMetadata?.visualNote || '').trim();
          const sbWantsCinematic = SB_CINEMATIC_RE.test(sbVisualNote);
          consistencyLock = sbVisualNote ? `VISUAL STYLE: ${sbVisualNote.replace(/[.!?]+$/, '')}.` : '';
          const sbHandlingRev = CARA_REKAM_PROMPTS[originalScenario.caraRekam] || null; // CARA REKAM
          if (originalScenario.isBRoll) consistencyLock += ` NO FACES. Close-up of the product in hand.`;
          else if (sbHandlingRev) consistencyLock += ` CAMERA HANDLING: ${sbHandlingRev.camera}`;
          const sbExtraNegRev = [originalScenario.isBRoll ? SB_BROLL_NEG : (sbHandlingRev ? sbHandlingRev.neg : ''), 'extra props', (isProductEnabled && base64ProductRaw) ? 'duplicate product' : ''].filter(Boolean).join(', '); // PROPS FIX
          revisionNegPrompt = cleanNegList(`${revisionNegPrompt}, ${SB_HAIR_MAKEUP_NEG}, ${SB_HAND_NEG}${sbExtraNegRev ? `, ${sbExtraNegRev}` : ''}`, [...SB_BRAND_NEG_REMOVE, ...(sbWantsCinematic ? SB_CINEMATIC_NEG_TERMS : []), ...(SB_LIGHTING_NEG_CONFLICT[originalScenario?.lightingId] || [])]);
      }

      const systemPrompt = `
      ${refInfo}
      ${rolePrefix} - REVISION MODE.
      Target: Regenerate Scene ${index + 1} (${originalScenario.role}).
      User Instruction: ${revisionInstruction || "Improve lighting and composition."}
      Keep original action and EXACT location from this instruction: ${originalScenario.action}. Background context: ${activeBackground}.
      ${realismLaws}
      ${currentIdentityLock}
      ${consistencyLock}
      CRITICAL NEGATIVE: ${revisionNegPrompt}.
      `;

      payloadParts.push({ text: systemPrompt });

      const payload = {
        contents: [{ parts: payloadParts }],
        generationConfig: { responseModalities: ["IMAGE"], aspectRatio: config.ratio }
      };

      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GENERATIVE_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response || !response.ok) {
          const errorText = response ? await response.text() : 'No response';
          throw new Error(`Generation failed: ${errorText}`);
      }

      const result = await response.json();
      const base64Output = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (base64Output) {
        const imgSrc = `data:image/png;base64,${base64Output}`;
        setGeneratedImages(prev => {
          const newArr = [...prev];
          newArr[index] = { ...newArr[index], src: imgSrc };
          return newArr;
        });
        setScenePrompts(prev => ({ ...prev, [index]: "" }));
        if (selectedMode?.id === 'storyboard_builder' && revisionInstruction.trim() && originalScenario?.builderData) syncShotTextAfterRevision(index, originalScenario, revisionInstruction); // REVISI → PROMPT
      }
    } catch (err) {
      console.error("Scene regeneration error:", err);
    } finally {
      setSceneLoadings(prev => ({ ...prev, [index]: false }));
    }
  };

  // ---------------- DOWNLOAD — VERBATIM AKSARA (nama file pakai brand AI UGC Studio) ----------------
  // FIX (Download Full Sheet error): html2canvas 1.4.1 (warisan Aksara) gagal mem-parse warna modern Tailwind
  // (oklch / color-mix) sehingga download selalu error. Lembar sekarang digambar langsung ke <canvas>
  // dari data yang sama dengan tampilan lembar (judul, info, gambar, timing, judul shot, naskah, catatan visual).
  // Tidak memakai library eksternal. Tidak menyentuh prompt / engine generate.
  const loadImageEl = (src) => new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const wrapCanvasText = (ctx, text, maxWidth) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  };

  const fillRoundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  };

  const drawImageCover = (ctx, img, x, y, w, h, alignTop) => {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = alignTop ? 0 : (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  };

  const handleDownloadSheet = async (sheetIdx, returnBlob = false) => {
    playClick();
    setIsDownloadingSheet(true);
    try {
        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (e) { /* lanjut dengan font fallback */ }
        }

        const pace = config.sbBuilderPace || 6;
        const cols = pace === 4 ? 2 : 3;
        const ratioWH = config.ratio === '9:16' ? 9 / 16 : config.ratio === '16:9' ? 16 / 9 : 1;
        const alignTop = config.ratio !== '16:9';
        const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

        const W = 1800;
        const PAD = 80;
        const GAP_X = 48;
        const GAP_Y = 72;
        const colW = (W - PAD * 2 - GAP_X * (cols - 1)) / cols;
        const imgH = colW / ratioWH;

        const title = `${builderMetadata?.sheetTitle || 'STORYBOARD'}${config.sbBuilderDuration > 10 ? ` (PART ${sheetIdx + 1})` : ''}`.toUpperCase();
        const meta = `DURASI ESTIMASI: ${config.sbBuilderDuration} DETIK | RASIO: ${config.ratio} | PACE: ${pace} SHOT/10s | AUDIO: ${builderMetadata?.audioNote || '-'} | MUSIK: ${(generatedImages.find(Boolean)?.musicOn ?? config.musicOn) ? 'ON' : 'OFF'}${SHOW_CARA_REKAM ? ` | CARA REKAM: ${(CARA_REKAM_OPTIONS.find(o => o.id === (generatedImages.find(Boolean)?.caraRekam ?? config.caraRekam))?.label || '').replace(/^\S+\s/, '')}` : ''}${builderMetadata?.lightingId ? ` | LIGHTING: ${sbLightingLabel(builderMetadata.lightingId)} (DIPILIH ${builderMetadata.lightingBy === 'ai' ? 'AI' : 'USER'})` : ''}`.toUpperCase();
        const noteBody = (builderMetadata?.visualNote || '-').toUpperCase();

        const shots = await Promise.all(Array.from({ length: pace }).map(async (_, offset) => {
            const shotIndex = sheetIdx * pace + offset;
            const sceneData = generatedImages[shotIndex];
            const bData = sceneData?.builderData;
            return {
                shotIndex,
                img: await loadImageEl(sceneData?.src),
                timing: bData?.timing || formatShotTiming(shotIndex, pace),
                title: (bData?.title || `TITLE SHOT ${shotIndex + 1}`).toUpperCase(),
                desc: bData?.desc || ''
            };
        }));

        // Canvas kerja dibuat tinggi, lalu dipotong ke tinggi akhir konten.
        const rows = Math.ceil(pace / cols);
        const work = document.createElement('canvas');
        work.width = W;
        work.height = Math.ceil(PAD * 2 + 900 + rows * (imgH + 900) + 600);
        const ctx = work.getContext('2d');
        ctx.fillStyle = '#F4F4F5';
        ctx.fillRect(0, 0, work.width, work.height);
        ctx.textBaseline = 'top';

        let y = PAD;

        // Header
        ctx.fillStyle = '#000000';
        ctx.font = `900 64px ${FONT}`;
        wrapCanvasText(ctx, title, W - PAD * 2).forEach((line) => { ctx.fillText(line, PAD, y); y += 74; });
        y += 12;
        ctx.fillStyle = '#52525B';
        ctx.font = `500 24px ${FONT}`;
        wrapCanvasText(ctx, meta, W - PAD * 2).forEach((line) => { ctx.fillText(line, PAD, y); y += 34; });
        y += 24;
        ctx.fillStyle = '#D4D4D8';
        ctx.fillRect(PAD, y, W - PAD * 2, 4);
        y += 4 + 48;

        // Grid shot
        for (let r = 0; r < rows; r++) {
            const rowShots = shots.slice(r * cols, r * cols + cols);
            let rowBottom = y;

            rowShots.forEach((shot, c) => {
                const x = PAD + c * (colW + GAP_X);
                let sy = y;

                // Badge SHOT + timing
                ctx.font = `700 20px ${FONT}`;
                const badgeText = `SHOT ${shot.shotIndex + 1}`;
                const badgeW = ctx.measureText(badgeText).width + 36;
                ctx.fillStyle = '#000000';
                fillRoundRect(ctx, x, sy, badgeW, 38, 19);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(badgeText, x + 18, sy + 9);
                ctx.fillStyle = '#52525B';
                ctx.font = `600 20px ${FONT}`;
                ctx.fillText(shot.timing, x + badgeW + 16, sy + 9);
                sy += 38 + 20;

                // Gambar
                ctx.fillStyle = '#D4D4D8';
                ctx.fillRect(x, sy, colW, imgH);
                if (shot.img) {
                    drawImageCover(ctx, shot.img, x, sy, colW, imgH, alignTop);
                } else {
                    ctx.fillStyle = '#71717A';
                    ctx.font = `700 22px ${FONT}`;
                    const empty = 'GAMBAR BELUM ADA';
                    ctx.fillText(empty, x + (colW - ctx.measureText(empty).width) / 2, sy + imgH / 2 - 11);
                }
                ctx.strokeStyle = '#A1A1AA';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, sy, colW, imgH);
                sy += imgH + 24;

                // Judul shot (maks 2 baris)
                ctx.fillStyle = '#000000';
                ctx.font = `900 30px ${FONT}`;
                wrapCanvasText(ctx, shot.title, colW).slice(0, 2).forEach((line) => { ctx.fillText(line, x, sy); sy += 38; });
                sy += 8;

                // Naskah / desc
                ctx.fillStyle = '#3F3F46';
                ctx.font = `400 24px ${FONT}`;
                wrapCanvasText(ctx, shot.desc, colW).forEach((line) => { ctx.fillText(line, x, sy); sy += 32; });

                rowBottom = Math.max(rowBottom, sy);
            });

            y = rowBottom + (r < rows - 1 ? GAP_Y : 0);
        }

        // Footer catatan visual
        y += 48;
        ctx.fillStyle = '#D4D4D8';
        ctx.fillRect(PAD, y, W - PAD * 2, 4);
        y += 4 + 28;
        ctx.fillStyle = '#000000';
        ctx.font = `900 24px ${FONT}`;
        const noteLabel = 'CATATAN VISUAL: ';
        const labelW = ctx.measureText(noteLabel).width;
        ctx.fillText(noteLabel, PAD, y);
        ctx.fillStyle = '#3F3F46';
        ctx.font = `600 24px ${FONT}`;
        const noteLines = wrapCanvasText(ctx, noteBody, W - PAD * 2 - labelW);
        noteLines.forEach((line, i) => { ctx.fillText(line, PAD + labelW, y + i * 34); });
        y += Math.max(1, noteLines.length) * 34;

        const finalH = Math.ceil(y + PAD);
        const out = document.createElement('canvas');
        out.width = W;
        out.height = finalH;
        const outCtx = out.getContext('2d');
        outCtx.drawImage(work, 0, 0, W, finalH, 0, 0, W, finalH);

        // FIX (refresh saat download): link data:URL yang besar membuat iframe sandbox ber-navigasi (app ke-reload).
        // Sekarang pakai Blob + objectURL (mekanisme yang sama dengan Download ZIP), dan hasilnya juga
        // ditampilkan di popup preview sebagai cadangan kalau browser memblokir download otomatis.
        const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Gagal membuat file gambar dari canvas.');
        if (returnBlob) return blob; // ZIP GPT: lembar yang sama dipakai di ZIP (tanpa download & popup)
        const fileName = `Storyboard_Sheet_${sheetIdx + 1}_${Date.now()}.png`;
        const objectUrl = window.URL.createObjectURL(blob);
        setSheetPreview(prev => {
            if (prev?.url) window.URL.revokeObjectURL(prev.url);
            return { url: objectUrl, name: fileName, sheet: sheetIdx + 1 };
        });
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Failed to download sheet", err);
        showToastError(`Gagal download sheet: ${err?.message || err}`);
    } finally {
        setIsDownloadingSheet(false);
    }
  };

  const downloadImage = async (imgSrc, index, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    playClick();
    if (!imgSrc) return;

    const croppedSrc = await processImageForDownload(imgSrc, config.ratio);

    try {
      const res = await fetch(croppedSrc);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `ai-ugc-studio-storyboard-shot-${index + 1}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error("Download failed, using fallback:", err);
      const link = document.createElement('a');
      link.href = croppedSrc;
      link.download = `ai-ugc-studio-storyboard-shot-${index + 1}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadAllZip = async () => {
      playClick();
      setIsDownloadingZip(true);
      try {
          // FIX: JSZip di-import dari npm di atas (import JSZip from 'jszip'),
          // bukan lagi dimuat dari CDN — CDN yang diblokir/CSP dulu bikin
          // `new JSZip()` crash dan Download ZIP gagal total.
          const zip = new JSZip();
          // ZIP GPT: folder Seedance & Gemini_Omni (subfolder Part_n jika lebih dari 1 lembar)
          const pad2 = (n) => String(n).padStart(2, '0');
          const rawB64 = (dataUrl) => (dataUrl || '').split(',')[1];
          const extOf = (dataUrl) => ((String(dataUrl || '').match(/^data:image\/(\w+)/) || [])[1] || 'png').replace('jpeg', 'jpg');
          const hasProductZip = isProductEnabled && !!productImage;
          const sheetCount = config.sbBuilderDuration / 10;
          // OUTFIT FOTO: Talent = foto upload (wajah), Outfit = foto look (baju); urutan sama dengan peta @Image
          const zipTalents = [{ name: 'Talent', src: modelImage }, { name: 'Outfit', src: looks.A.src }].filter(t => !!t.src);

          for (let sheetIdx = 0; sheetIdx < sheetCount; sheetIdx++) {
              const shots = getSheetShots(sheetIdx);
              if (!shots.length) continue;
              const sub = sheetCount > 1 ? `/Part_${sheetIdx + 1}` : '';
              const sheetBlob = await handleDownloadSheet(sheetIdx, true);
              const seed = zip.folder(`Seedance${sub}`);
              const omni = zip.folder(`Gemini_Omni${sub}`);

              // SEEDANCE: 00 prompt, 01 storyboard, foto tiap shot, talent, produk
              seed.file('00_Prompt_Seedance.txt', buildGptVideoPrompt(sheetIdx, 'seedance'));
              if (sheetBlob) seed.file('01_Storyboard.png', sheetBlob);
              let n = 2;
              for (const s of shots) {
                  const cropped = await processImageForDownload(s.data.src, config.ratio);
                  seed.file(`${pad2(n)}_Shot_${pad2(s.n)}.png`, rawB64(cropped), { base64: true });
                  n++;
              }
              for (const t of zipTalents) { seed.file(`${pad2(n)}_${t.name}.${extOf(t.src)}`, rawB64(t.src), { base64: true }); n++; }
              if (hasProductZip) { seed.file(`${pad2(n)}_Produk.${extOf(productImage)}`, rawB64(productImage), { base64: true }); n++; }

              // GEMINI OMNI: 00 prompt, talent, produk, storyboard (tanpa foto per shot)
              omni.file('00_Prompt_Omni.txt', buildGptVideoPrompt(sheetIdx, 'omni'));
              let m = 1;
              for (const t of zipTalents) { omni.file(`${pad2(m)}_${t.name}.${extOf(t.src)}`, rawB64(t.src), { base64: true }); m++; }
              if (hasProductZip) { omni.file(`${pad2(m)}_Produk.${extOf(productImage)}`, rawB64(productImage), { base64: true }); m++; }
              if (sheetBlob) omni.file(`${pad2(m)}_Storyboard.png`, sheetBlob);
          }

          const content = await zip.generateAsync({ type: 'blob' });
          const blobUrl = window.URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `AI_UGC_Studio_Storyboard_${Date.now()}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
      } catch (err) {
          console.error("Failed to generate ZIP", err);
      } finally {
          setIsDownloadingZip(false);
      }
  };

  // ---------------- AUDIO STUDIO — VERBATIM AKSARA ----------------
  const handleGenerateVOScript = async () => {
      playClick();
      setIsGeneratingVOScript(true);

      const prompt = `Buatkan naskah master voiceover gaya ${selectedMode?.promptTitle || selectedMode?.title || 'Komersial'} untuk ${(isProductEnabled ? productName : builderMetadata?.sheetTitle) || 'Produk'}. Durasi: ${voDuration}. Bahasa Indonesia. Tuliskan naskahnya saja langsung tanpa tambahan judul, markdown, atau penjelasan.`;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      try {
          const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (response && response.ok) {
              const result = await response.json();
              const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) setVoScript(text.trim());
          }
      } catch (err) {
          console.error("Master VO Script gen error", err);
      } finally {
          setIsGeneratingVOScript(false);
      }
  };

  const handleGenerateVOAudio = async () => {
      if (!voScript) return;
      playClick();
      setIsGeneratingVOAudio(true);
      setVoAudioUrl(null);

      const payload = {
        contents: [{
            parts: [{ text: `Bacakan dengan nada ${voTone}: ${voScript}` }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voVoice
                    }
                }
            }
        }
      };

      try {
          const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if (response && response.ok) {
              const result = await response.json();
              const base64PCM = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
              if (base64PCM) {
                  const url = base64ToWavUrl(base64PCM);
                  setVoAudioUrl(url);
              }
          }
      } catch (err) {
          console.error("Audio generation failed:", err);
      } finally {
          setIsGeneratingVOAudio(false);
      }
  };

  // =====================================================================================
  // RENDER — UI AI UGC STUDIO
  // =====================================================================================
  const renderContent = () => {
    switch (view) {
      case 'welcome':
        return (
          <LayoutWrapper>
            <div className="flex-grow flex flex-col items-center justify-center text-center relative w-full h-full min-h-screen px-6 overflow-hidden">
              <div className="absolute inset-0 z-0 pointer-events-none bg-zinc-950 overflow-hidden">
                <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-80"><source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_155101_f2540600-6fe9-433e-8e48-b3f4b72f0727.mp4" type="video/mp4" /></video>
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-zinc-950/30 to-transparent"></div>
                <div className="absolute inset-0 opacity-[0.05] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-12 mt-20">
                <h1 className="font-jakarta text-8xl md:text-9xl font-semibold tracking-tighter text-transparent select-none drop-shadow-2xl animate-in fade-in slide-in-from-bottom-4 zoom-in-[0.98] duration-[2000ms] ease-out fill-mode-both pb-2 text-rainbow">Welcome!</h1>
                <button type="button" onClick={handleStart} className="font-inter px-10 py-4 bg-white text-black rounded-full font-bold text-sm tracking-widest uppercase hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] border border-transparent animate-in fade-in slide-in-from-bottom-4 duration-[2000ms] delay-[500ms] ease-out fill-mode-both btn-rainbow-hover">Mulai Studio</button>
              </div>
              <div className="absolute bottom-10 flex items-center gap-2 opacity-50 z-10 animate-in fade-in duration-[2000ms] delay-[1000ms] fill-mode-both"><span className="font-inter text-[10px] text-zinc-500 uppercase tracking-widest">{APP_NAME}</span></div>
            </div>
          </LayoutWrapper>
        );

      case 'mode-selection': {
        const displayMode = selectedMode || modes[0];
        const DisplayIcon = displayMode.icon;
        return (
          <LayoutWrapper>
            <Navbar onBack={() => setView('welcome')} onReset={handleResetAndNew} />
            <div className="flex-grow flex flex-col justify-center px-4 pt-32 pb-12 md:px-12 md:pt-40 lg:px-24">
              <div className="max-w-7xl mx-auto w-full">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 md:mb-16 gap-6 border-b border-white/5 pb-8">
                  <SectionTitle title="Pilih Gaya Konten" subtitle={`Tentukan gaya konten untuk ${APP_SHORT} Anda.`} />
                  <div className="hidden md:flex items-center gap-3 text-zinc-500 font-inter">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-white">01</span><div className="w-16 h-px bg-zinc-800"></div><span className="text-[10px] font-bold tracking-widest uppercase opacity-50">03</span>
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-6 lg:gap-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 ease-out fill-mode-backwards h-auto md:h-[60vh] min-h-[500px]">
                  <div className="w-full md:w-[35%] lg:w-[30%] flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2 pb-4 md:pb-0 font-inter">
                     {modes.map((mode) => {
                        const isActive = displayMode.key === mode.key; const CurrentIcon = mode.icon;
                        return (
                          <button key={mode.key} type="button" onClick={() => { playClick(); setSelectedMode(mode); }} className={`flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left group ${isActive ? 'card-rainbow bg-white text-black border-transparent shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-zinc-900/50 border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                            <div className="flex items-center gap-4 flex-1 pr-2">
                                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors ${isActive ? 'bg-black/10' : 'bg-black/40 border border-white/10 text-zinc-400 group-hover:text-white'}`}><CurrentIcon className="w-5 h-5" /></div>
                                <div className="flex flex-col flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-jakarta font-bold text-xs md:text-sm tracking-wide leading-snug whitespace-normal text-balance ${isActive ? 'text-black' : 'text-zinc-200 group-hover:text-white'}`}>{mode.title}</span>
                                    {mode.isPremium && (
                                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${isActive ? 'bg-amber-500 text-black' : 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20'}`}>Premium</span>
                                    )}
                                  </div>
                                </div>
                            </div>
                            {isActive && <ChevronRight className="w-5 h-5 text-black shrink-0" />}
                          </button>
                        );
                     })}
                  </div>
                  <div className="hidden md:block w-px bg-gradient-to-b from-[#ef4444] via-[#22c55e] to-[#a855f7] opacity-15"></div>
                  <div className="w-full md:flex-1 lg:w-[70%] bg-zinc-900/40 rounded-3xl border border-white/10 p-8 md:p-12 relative overflow-hidden flex flex-col shadow-2xl h-full card-rainbow">
                     <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-white/5 blur-[120px] rounded-full pointer-events-none transform translate-z-0 transition-all duration-700"></div>
                     <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                           <div className="flex items-start justify-between mb-8">
                              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-white/20 bg-black/40 backdrop-blur-md flex items-center justify-center text-white shadow-xl animate-in zoom-in-50 duration-500" key={displayMode.key + 'icon'}><DisplayIcon className="w-8 h-8 md:w-10 md:h-10" /></div>
                              <span className="font-inter text-5xl md:text-7xl font-mono text-white/5 font-bold animate-in fade-in duration-500" key={displayMode.key + 'num'}>0{modes.findIndex(m => m.key === displayMode.key) + 1}</span>
                           </div>
                           <div className="space-y-4 animate-in slide-in-from-right-8 fade-in duration-500" key={displayMode.key + 'text'}>
                              <h2 className="font-jakarta text-3xl md:text-4xl lg:text-5xl font-semibold text-white tracking-tight leading-tight text-balance flex flex-wrap items-center gap-3">
                                {displayMode.title}
                                {displayMode.isPremium && (<span className="text-[10px] md:text-xs font-bold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-widest align-middle">Premium</span>)}
                              </h2>
                              <p className="font-inter text-sm md:text-base lg:text-lg text-zinc-400 font-light leading-relaxed max-w-xl text-balance whitespace-normal">{displayMode.desc}</p>
                           </div>
                        </div>
                        <div className="mt-8 pt-8 border-t border-white/10">
                           <ButtonCTA onClick={() => {
                              // Logic pemilihan mode — verbatim Aksara
                              const mode = displayMode;
                              setSelectedMode(mode);

                              if (mode.id === 'character_builder') {
                                  setConfig(prev => ({...prev, scenes: 24}));
                              }

                              // FIX (bug Aksara #1): sinkronkan jumlah gambar dengan jumlah shot storyboard sejak awal.
                              // Di Aksara config.scenes tetap 4 (atau 24) sampai user klik Pace/Durasi -> shot 5-6 tidak pernah digenerate.
                              if (mode.id === 'storyboard_builder') {
                                  setConfig(prev => ({...prev, scenes: (prev.sbBuilderDuration / 10) * (prev.sbBuilderPace || 6)}));
                              }

                              const modeBgs = MODE_BACKGROUNDS[mode.id] || MODE_BACKGROUNDS.ugc;
                              setDynamicBackgrounds(modeBgs);

                              const modeLightingOpts = getLightingOptions(mode.id);

                              setConfig(prev => ({
                                  ...prev,
                                  background: modeBgs[0],
                                  lighting: modeLightingOpts[0].id
                              }));

                              // Default per mode storyboard = opsi Recommended (semua opsi tetap bisa dipilih)
                              const submode = getSubmode(mode);
                              setConfig(prev => ({
                                  ...prev,
                                  sbBuilderStyle: mode.style,
                                  caraRekam: SHOW_CARA_REKAM ? (CARA_REKAM_DEFAULT[mode.style] || 'Variatif') : 'Variatif',
                                  customSbStyle: '',
                                  sbBuilderCamera: submode.recCameras[0],
                                  lighting: LIGHTING_DEFAULT_BY_STYLE[mode.style] || REC_LIGHTING[0],
                                  audioDelivery: AUDIO_DELIVERY_DEFAULT // AUDIO DELIVERY: default app
                              }));
                              setView('upload-setup');
                           }}>Pilih Mode Ini & Lanjutkan</ButtonCTA>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </LayoutWrapper>
        );
      }

      case 'upload-setup': {
        // Verbatim Aksara
        const isUploadComplete = (() => {
            if (selectedMode?.id === 'character_builder') return true;
            if (selectedMode?.id === 'storyboard_builder') {
                if (isProductEnabled) return modelImage !== null && productImage !== null;
                return modelImage !== null;
            }
            if (selectedMode?.id === 'pov' || selectedMode?.id === 'product_shoot') return productImage !== null;
            if (selectedMode?.id === 'podcast') return modelImage !== null && guestModelImage !== null && productImage !== null;
            return modelImage !== null && productImage !== null;
        })();
        const isSubjectMode = selectedMode?.id === 'storyboard_builder' && !isProductEnabled;
        // DETAIL TALENT: gender & rambut dari foto upload (baju ditentukan Script AI, lalu dibuat foto look setelah Generate)
        const talentSlots = ['A'];
        const renderTalentCard = (slot) => {
            const info = talentInfo;
            const setInfo = setTalentInfo;
            const analyzing = isAnalyzingTalent;
            const original = modelImage;
            if (!original) return null;
            const title = 'Detail Talent';
            return (
              <div key={slot} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><Camera className="w-4 h-4" /> {title}</label>
                      {analyzing && (<span className="text-[10px] text-white flex items-center gap-2 animate-pulse"><Sparkles className="w-3 h-3" /> AI Analyzing...</span>)}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <select value={info.gender} onChange={(e) => setInfo(prev => ({ ...prev, gender: e.target.value }))} className="w-full bg-zinc-900/60 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/50 transition-all font-medium">
                          <option value="" className="bg-zinc-900">Gender</option>
                          <option value="Wanita" className="bg-zinc-900">Wanita</option>
                          <option value="Pria" className="bg-zinc-900">Pria</option>
                      </select>
                      <input type="text" value={info.hair} onChange={(e) => setInfo(prev => ({ ...prev, hair: e.target.value }))} placeholder="Rambut (Cth: long straight black hair)" className="w-full bg-zinc-900/60 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/50 transition-all font-medium" />
                  </div>
              </div>
            );
        };

        return (
          <LayoutWrapper>
            <Navbar onBack={() => setView('mode-selection')} onReset={handleResetAndNew} />
            <div className="flex-grow flex flex-col px-4 pt-32 pb-12 md:px-12 md:pt-40 lg:px-24 font-inter">
               <div className="max-w-4xl mx-auto w-full flex flex-col gap-10">
                  <SectionTitle title="Aset Visual" subtitle={`Siapkan aset gambar untuk gaya ${selectedMode?.title}.`} />

                  {selectedMode?.id === 'storyboard_builder' && (
                    <label className="flex items-center justify-between w-full p-5 md:p-6 bg-zinc-900/50 border border-white/5 rounded-2xl cursor-pointer hover:bg-zinc-900/70 transition-all animate-in fade-in slide-in-from-bottom-4">
                      <div className="flex flex-col gap-1 pr-4">
                        <span className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2"><Package className="w-4 h-4"/> Sertakan Produk (Opsional)</span>
                        <span className="text-xs text-zinc-500">Nyalakan jika storyboard ini melibatkan interaksi dengan produk khusus.</span>
                      </div>
                      <div className="relative inline-flex items-center shrink-0">
                        <input type="checkbox" className="sr-only peer" checked={isProductEnabled} onChange={() => { playClick(); setIsProductEnabled(!isProductEnabled); }} />
                        <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-400"></div>
                      </div>
                    </label>
                  )}

                  <div className="grid gap-4 md:gap-8 grid-cols-2">
                    <UploadZone label="01. Karakter (Wajib)" image={modelImage} onClick={() => modelInputRef.current?.click()} icon={Camera} />
                    {isProductEnabled ? (
                      <UploadZone label="02. Product (Opsional)" image={productImage} onClick={() => productInputRef.current?.click()} icon={Package} />
                    ) : (
                      <UploadZone label="02. Produk Dimatikan" image={null} onClick={() => {}} icon={Package} disabled={true} />
                    )}
                  </div>

                  <input type="file" ref={modelInputRef} onChange={handleModelUpload} className="hidden" accept="image/*" />
                  <input type="file" ref={productInputRef} onChange={handleProductUpload} className="hidden" accept="image/*" />

                  {/* DETAIL TALENT (foto upload tidak diubah) */}
                  {talentSlots.map(slot => renderTalentCard(slot))}

                  {/* PRODUK MATI: kartu detail gelap & tidak bisa diedit (cerita cukup ditulis di Brief) */}
                  <div aria-disabled={isSubjectMode} className={`bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 ${isSubjectMode ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                      <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4" /> Detail {isSubjectMode ? "Subjek / Konteks" : "Produk / Konteks"}</label>
                          {isAnalyzingProduct && (<span className="text-[10px] text-white flex items-center gap-2 animate-pulse"><Sparkles className="w-3 h-3" /> AI Analyzing...</span>)}
                      </div>
                      <div className="space-y-3">
                          <input type="text" disabled={isSubjectMode} value={isSubjectMode ? '' : productName} onChange={(e) => setProductName(e.target.value)} placeholder={isSubjectMode ? "Produk dimatikan — tulis cerita di Brief" : "Nama Produk (Cth: Sepatu Lari X)"} className="w-full bg-zinc-900/60 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all font-medium" />
                          <textarea disabled={isSubjectMode} value={isSubjectMode ? '' : productDesc} onChange={(e) => setProductDesc(e.target.value)} placeholder={isSubjectMode ? "Tidak dipakai saat produk dimatikan" : "Deskripsi detail produk agar tetap konsisten..."} className="w-full h-20 bg-zinc-900/60 border border-white/10 rounded-xl p-3 text-sm text-zinc-400 focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all resize-none" />
                      </div>
                      <div className="flex justify-end pt-2">
                          <button type="button" onClick={() => { playClick(); setIsProductConfirmed(true); }} disabled={(!productName && selectedMode?.id !== 'storyboard_builder') || isProductConfirmed || isAnalyzingProduct} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${isProductConfirmed ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default' : 'bg-white text-black hover:bg-zinc-200 border border-transparent shadow-[0_0_15px_rgba(255,255,255,0.2)]'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                              {isAnalyzingProduct ? (<><Loader2 className="w-4 h-4 animate-spin" /> Analyzing</>) : isProductConfirmed ? (<><CheckCircle2 className="w-4 h-4" /> Confirmed</>) : ("Confirm Info")}
                          </button>
                      </div>
                  </div>

                  <div className="pt-4 pb-10">
                     <ButtonCTA disabled={!isUploadComplete || (!isProductConfirmed && selectedMode?.id !== 'character_builder' && !isSubjectMode) || isAnalyzingProduct} onClick={() => setView('config')}>
                        Lanjutkan
                     </ButtonCTA>
                     {!isProductConfirmed && isUploadComplete && !isAnalyzingProduct && selectedMode?.id !== 'character_builder' && !isSubjectMode && (
                         <p className="text-center text-[10px] text-zinc-600 mt-3 animate-pulse">Mohon konfirmasi info untuk lanjut</p>
                     )}
                  </div>
               </div>
            </div>
          </LayoutWrapper>
        );
      }

      case 'look-setup': {
        // LOOK TALENT: foto talent memakai baju pilihan Script AI. Disetujui -> jadi acuan baju semua shot & regenerate.
        const lookSlotsView = ['A'];
        const allLooksApproved = lookSlotsView.every(slot => looks[slot].approved && !!looks[slot].src);
        const anyLookLoading = lookSlotsView.some(slot => looks[slot].loading);
        return (
          <LayoutWrapper>
            <Navbar onBack={() => setView('config')} onReset={handleResetAndNew} />
            <div className="flex-grow flex flex-col px-4 pt-32 pb-12 md:px-12 md:pt-40 lg:px-24 font-inter">
              <div className="max-w-4xl mx-auto w-full flex flex-col gap-10">
                <SectionTitle title="Look Talent" subtitle="Baju dipilih Script AI sesuai gaya konten, brief, dan background. Setujui look ini sebagai acuan baju untuk semua shot dan regenerate." />

                {lookPhase === 'script' ? (
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-10 flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                    <p className="text-sm text-zinc-400">Menyusun skrip & memilih baju...</p>
                  </div>
                ) : (
                  <div className={`grid gap-6 ${lookSlotsView.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md mx-auto w-full'}`}>
                    {lookSlotsView.map(slot => {
                      const look = looks[slot];
                      return (
                        <div key={slot} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 space-y-4">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><Camera className="w-4 h-4" /> {lookSlotsView.length > 1 ? `Character ${slot}` : 'Talent'}</label>
                          <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border border-white/10 bg-black/30">
                            {look.src && <img src={look.src} className={`w-full h-full object-cover ${look.loading ? 'opacity-40' : ''}`} />}
                            {look.loading && (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><Loader2 className="w-6 h-6 animate-spin text-white" /><span className="text-[10px] text-zinc-300 uppercase tracking-widest">Membuat look...</span></div>)}
                            {look.approved && (<span className="absolute top-2 left-2 text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-green-500/20 text-green-400">Disetujui</span>)}
                          </div>
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Baju (bisa diedit)</span>
                            <textarea value={look.outfit} disabled={look.loading} onChange={(e) => { const v = e.target.value; setLooks(prev => ({ ...prev, [slot]: { ...prev[slot], outfit: v, approved: false } })); }} className="w-full h-20 bg-zinc-900/60 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-white/50 transition-all resize-none disabled:opacity-50" />
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button type="button" onClick={() => { playClick(); generateLookImage(slot, look.outfit); }} disabled={look.loading || !look.outfit.trim()} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white border border-white/20 bg-white/10 hover:bg-white/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><RotateCcw className="w-3 h-3" /> Generate Ulang</button>
                            <button type="button" onClick={() => approveLook(slot)} disabled={look.loading || look.approved || !look.src || (look.outfit || '').trim() !== (look.srcOutfit || '').trim()} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${look.approved ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default' : 'bg-white text-black hover:bg-zinc-200 border border-transparent'} disabled:cursor-not-allowed`}>
                              {look.approved ? (<><CheckCircle2 className="w-4 h-4" /> Disetujui</>) : 'Setujui Look'}
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-500">Ubah teks baju lalu klik Generate Ulang untuk revisi. Setujui Look aktif lagi setelah foto look dibuat ulang; baju di semua shot mengikuti foto look yang disetujui.</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-4 pb-10">
                  <ButtonCTA disabled={lookPhase !== 'ready' || !allLooksApproved || anyLookLoading} onClick={startShotsFromLooks}>
                    Buat Shot Storyboard
                  </ButtonCTA>
                  {lookPhase === 'ready' && !allLooksApproved && !anyLookLoading && (
                    <p className="text-center text-[10px] text-zinc-600 mt-3 animate-pulse">{lookSlotsView.length > 1 ? 'Setujui look kedua talent untuk lanjut' : 'Setujui look talent untuk lanjut'}</p>
                  )}
                </div>
              </div>
            </div>
          </LayoutWrapper>
        );
      }

      case 'config': {
        const activeLightingOptions = getLightingOptions(selectedMode?.id);
        // Verbatim Aksara
        const isConfigReady = (selectedMode?.id === 'storyboard_builder' ? !!config.sbBuilderBrief.trim() : true) && (bgType === 'custom_image' ? !!customBgImage : true);
        const totalShotsPreview = (config.sbBuilderDuration / 10) * (config.sbBuilderPace || 6);

        return (
          <LayoutWrapper>
            <Navbar onBack={() => setView('upload-setup')} onViewResult={generatedImages.some(img => img !== null) ? () => setView('result') : null} onReset={handleResetAndNew} />
            <div className="flex-grow flex flex-col px-4 pt-32 pb-12 md:px-12 md:pt-40 lg:px-24 font-inter">
              <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
                <div className="lg:col-span-7 space-y-8 md:space-y-12">
                  <SectionTitle title="Konfigurasi Studio" subtitle="Sesuaikan pengaturan latar dan detail output visual." />
                  <div className="space-y-4 md:space-y-6">
                    <label className={labelClass}><Monitor className="w-3 h-3" /> Latar / Background</label>
                    <div className="relative group">
                      <select
                        value={bgType === 'custom' ? 'CUSTOM' : (bgType === 'match_storyboard' ? 'MATCH_STORYBOARD' : (bgType === 'custom_image' ? 'CUSTOM_IMAGE' : config.background))}
                        onChange={(e) => {
                          playClick();
                          if (e.target.value === 'CUSTOM') {
                            setBgType('custom');
                          } else if (e.target.value === 'MATCH_STORYBOARD') {
                            setBgType('match_storyboard');
                          } else if (e.target.value === 'CUSTOM_IMAGE') {
                            setBgType('custom_image');
                          } else {
                            setBgType('preset');
                            setConfig({...config, background: e.target.value});
                          }
                        }}
                        className={selectClass}
                      >
                        {selectedMode?.id === 'storyboard_builder' && (
                          <>
                            <option value="MATCH_STORYBOARD" className="bg-zinc-800 text-white font-bold">🎯 Bebas Sesuai Skrip/Storyboard</option>
                            <option value="CUSTOM_IMAGE" className="bg-zinc-800 text-white font-bold">📸 Upload Gambar Lokasi Sendiri...</option>
                          </>
                        )}
                        <optgroup label="Rekomendasi AI">
                          {dynamicBackgrounds.map(bg => (<option key={bg} value={bg} className="bg-zinc-900 text-white py-2">{bg}</option>))}
                        </optgroup>
                        <option value="CUSTOM" className="bg-zinc-800 text-white font-bold">✨ Custom (Ketik Sendiri)...</option>
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"><ChevronDown className="w-5 h-5" /></div>
                    </div>

                    {bgType === 'custom' && (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                        <input type="text" placeholder="Contoh: 'Garasi rumah dengan lampu neon RGB' atau 'Kantin kampus siang hari'" value={customBg} onChange={(e) => setCustomBg(e.target.value)} className="w-full bg-zinc-900/60 border border-white/20 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all font-medium" autoFocus />
                      </div>
                    )}

                    {bgType === 'custom_image' && (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-2 max-w-sm">
                        <UploadZone label="Upload Referensi Gambar Latar Lokasi" image={customBgImage} onClick={() => bgImageInputRef.current?.click()} icon={ImageIcon} />
                        <input type="file" ref={bgImageInputRef} onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setCustomBgImage(reader.result);
                            reader.readAsDataURL(file);
                          }
                        }} className="hidden" accept="image/*" />
                      </div>
                    )}

                    <div className="space-y-4 md:space-y-6 pt-6 mt-4 border-t border-white/5 animate-in fade-in">
                      <label className={labelClass}><Sun className="w-3 h-3" /> Pencahayaan (Lighting)</label>
                      <p className="text-xs text-zinc-400">Pilih gaya pencahayaan yang realistis untuk scene Anda.</p>
                      <div className="relative group">
                        <select value={config.lighting} onChange={(e) => { playClick(); setConfig({...config, lighting: e.target.value}); }} className={selectClass}>
                          {SB_LIGHTING_GROUPS.map(g => (
                            <optgroup key={g.label} label={g.label}>
                              {g.ids.map(id => activeLightingOptions.find(o => o.id === id)).filter(Boolean).map(opt => (
                                <option key={opt.id} value={opt.id} className="bg-zinc-900 text-white py-2">{opt.label.replace(/^\d+\.\s*/, '')}{REC_LIGHTING.includes(opt.id) ? '  ⭐ Recommended' : ''}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"><ChevronDown className="w-5 h-5" /></div>
                      </div>
                      {config.lighting === 'Match Storyboard' && (
                        <p className="text-[10px] text-zinc-500">AI membaca cerita lalu memilih 1 lighting dari daftar. Lighting itu dipakai sama persis di semua shot.</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-amber-500/10 text-amber-500">⭐ Recommended untuk {APP_SHORT}</span>
                        {activeLightingOptions.filter(opt => REC_LIGHTING.includes(opt.id)).map(opt => (
                          <button key={opt.id} type="button" onClick={() => { playClick(); setConfig({...config, lighting: opt.id}); }} className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${config.lighting === opt.id ? 'bg-white/10 border-white/50 text-white' : 'border-white/10 text-zinc-400 hover:border-white/30 hover:text-white'}`}>{sbLightingLabel(opt.id)}</button>
                        ))}
                      </div>
                    </div>

                    {selectedMode?.id === 'storyboard_builder' && (
                      <div className="pt-6 mt-4 border-t border-white/5 space-y-6 animate-in fade-in">
                        <div>
                          <h3 className="font-jakarta text-xl md:text-2xl font-semibold tracking-tight text-rainbow">Detail Builder</h3>
                          <p className="text-xs md:text-sm text-zinc-500 font-light mt-1">Wajib diisi agar AI dapat menyusun adegan dengan akurat.</p>
                        </div>

                        <div className="space-y-3">
                          <label className={labelClass}><FileBox className="w-3 h-3" /> Gaya Konten</label>
                          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
                            <div className="flex items-center gap-3 min-w-0">
                              {selectedMode?.icon && React.createElement(selectedMode.icon, { className: 'w-4 h-4 text-white shrink-0' })}
                              <span className="text-sm font-bold text-white truncate">{selectedMode?.title}</span>
                            </div>
                            <button type="button" onClick={() => { playClick(); setView('mode-selection'); }} className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Ganti Gaya</button>
                          </div>
                          {config.sbBuilderStyle === 'Custom' && (
                            <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                              <input type="text" placeholder="Ketik gaya custom Anda (Cth: Anime Style, 90s Retro VHS...)" value={config.customSbStyle || ''} onChange={(e) => setConfig({...config, customSbStyle: e.target.value})} className="w-full bg-zinc-900/60 border border-white/20 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all font-medium" autoFocus />
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 pt-3">
                          <label className={labelClass}><PlayCircle className="w-3 h-3" /> Pace Konten (Kecepatan)</label>
                          <div className="grid grid-cols-3 gap-3">
                            {STORYBOARD_PACES.map(paceOption => (
                              <OptionButton
                                key={paceOption.value}
                                active={config.sbBuilderPace === paceOption.value}
                                onClick={() => {
                                  // Verbatim Aksara
                                  setConfig({
                                      ...config,
                                      sbBuilderPace: paceOption.value,
                                      scenes: (config.sbBuilderDuration / 10) * paceOption.value
                                  });
                                }}
                                title={paceOption.label}
                                sub={paceOption.desc}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3 pt-3">
                          <label className={labelClass}><Mic className="w-3 h-3" /> Audio Delivery</label>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {AUDIO_DELIVERY_OPTIONS.map(opt => (
                              <OptionButton key={opt.id} active={config.audioDelivery === opt.id} onClick={() => setConfig({...config, audioDelivery: opt.id})} title={opt.label} sub={opt.desc} recommended={opt.id === AUDIO_DELIVERY_DEFAULT} />
                            ))}
                          </div>
                          <p className="text-[10px] text-zinc-500">Jenis audio tiap shot bisa diubah lagi di kartu revisi (Talking / VO / Off).</p>
                        </div>

                        <div className="space-y-3 pt-3">
                          <label className={labelClass}><Volume2 className="w-3 h-3" /> Musik Latar (BGM)</label>
                          <label className="flex items-center justify-between w-full p-4 bg-black/20 border border-white/10 rounded-xl cursor-pointer hover:border-white/30 transition-all">
                            <div className="flex flex-col gap-1 pr-4">
                              <span className={`text-sm font-bold ${config.musicOn ? 'text-white' : 'text-zinc-400'}`}>Musik {config.musicOn ? 'ON' : 'OFF'}</span>
                              <span className="text-[10px] text-zinc-500">{config.musicOn ? 'AI menyusun shot mengikuti musik & video prompt meminta BGM.' : 'Tanpa musik — hanya suara natural & dialog. Video prompt melarang BGM.'}</span>
                            </div>
                            <div className="relative inline-flex items-center shrink-0">
                              <input type="checkbox" className="sr-only peer" checked={config.musicOn} onChange={() => { playClick(); setConfig({...config, musicOn: !config.musicOn}); }} />
                              <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-400"></div>
                            </div>
                          </label>
                        </div>

                        {SHOW_CARA_REKAM && (
                          <div className="space-y-3 pt-3">
                            <label className={labelClass}><Video className="w-3 h-3" /> Cara Rekam</label>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                              {CARA_REKAM_OPTIONS.map(opt => (
                                <OptionButton key={opt.id} active={config.caraRekam === opt.id} onClick={() => setConfig({...config, caraRekam: opt.id})} title={opt.label} sub={opt.desc} recommended={(CARA_REKAM_DEFAULT[config.sbBuilderStyle] || 'Variatif') === opt.id} />
                              ))}
                            </div>
                            <p className="text-[10px] text-zinc-500">{CARA_REKAM_OPTIONS.find(o => o.id === config.caraRekam)?.hint}</p>
                            {config.caraRekam !== 'Variatif' && isProductEnabled && productImage && (
                              <p className="text-[10px] text-zinc-500">B-roll produk aktif: maksimal 1 shot close-up produk per lembar (bukan shot pertama/terakhir).</p>
                            )}
                          </div>
                        )}

                        <div className="space-y-3 pt-3">
                          <label className={labelClass}><Camera className="w-3 h-3" /> Pilihan Kamera Visual</label>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {STORYBOARD_CAMERAS.map(cam => (
                              <OptionButton key={cam.id} active={config.sbBuilderCamera === cam.id} onClick={() => setConfig({...config, sbBuilderCamera: cam.id})} title={cam.label} sub={cam.desc} recommended={getSubmode(selectedMode).recCameras.includes(cam.id)} dimmed={['Handheld', 'Vlog'].includes(config.caraRekam) && cam.id === 'Kamera Profesional (DSLR / Mirrorless)'} note={['Handheld', 'Vlog'].includes(config.caraRekam) && cam.id === 'Kamera Profesional (DSLR / Mirrorless)' ? 'Kurang cocok untuk selfie' : ''} />
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3 pt-3">
                          <div className="flex items-center justify-between gap-3">
                            <label className={labelClass}><FileText className="w-3 h-3" /> Brief / Alur Cerita (Wajib)</label>
                            <button type="button" onClick={handleGenerateBrief} disabled={isBriefGenerating || isGenerating} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                              {isBriefGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Membuat...</> : <><Sparkles className="w-3 h-3" /> Buatin AI</>}
                            </button>
                          </div>
                          <p className="text-xs text-zinc-400 mb-2">Tuliskan plot cerita yang ingin ditampilkan. AI akan memecahnya menjadi gambar per shot. Bingung? Klik Buatin AI. Kalau kolom sudah berisi ide singkat, AI akan mengembangkannya.</p>
                          <textarea
                            value={config.sbBuilderBrief}
                            onChange={(e) => setConfig({...config, sbBuilderBrief: e.target.value})}
                            placeholder={BRIEF_PLACEHOLDER}
                            className="w-full h-32 bg-zinc-900/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all resize-none custom-scrollbar"
                            required
                          />
                          {briefError && <p className="text-[10px] text-red-400">{briefError}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6 md:space-y-10 lg:pt-24">
                  <div className="p-6 md:p-8 rounded-3xl border border-white/5 bg-zinc-900/20 backdrop-blur-md space-y-6 md:space-y-10 card-rainbow">
                    <div className="space-y-4">
                      <label className={labelClass}><Layout className="w-3 h-3" /> Format Output</label>
                      <div className="relative group">
                        <select value={config.ratio} onChange={(e) => { playClick(); setConfig({...config, ratio: e.target.value}); }} className={selectClass}>
                          {ratios.map(r => (<option key={r.value} value={r.value} className="bg-zinc-900 text-white py-2">{r.label} ({r.sub})</option>))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"><ChevronDown className="w-5 h-5" /></div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className={labelClass}><Layers className="w-3 h-3" /> Durasi Video (Storyboard)</label>
                      <div className="relative group">
                        <select
                          value={config.sbBuilderDuration}
                          onChange={(e) => {
                              // Verbatim Aksara
                              playClick();
                              const dur = parseInt(e.target.value);
                              setConfig({...config, sbBuilderDuration: dur, scenes: (dur/10)*(config.sbBuilderPace || 6)});
                          }}
                          className={selectClass}
                        >
                          <option value={10} className="bg-zinc-900">10 Detik (1 Lembar / {config.sbBuilderPace || 6} Shot)</option>
                          <option value={20} className="bg-zinc-900">20 Detik (2 Lembar / {(config.sbBuilderPace || 6) * 2} Shot)</option>
                          <option value={30} className="bg-zinc-900">30 Detik (3 Lembar / {(config.sbBuilderPace || 6) * 3} Shot)</option>
                          <option value={40} className="bg-zinc-900">40 Detik (4 Lembar / {(config.sbBuilderPace || 6) * 4} Shot)</option>
                          <option value={50} className="bg-zinc-900">50 Detik (5 Lembar / {(config.sbBuilderPace || 6) * 5} Shot)</option>
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500"><ChevronDown className="w-5 h-5" /></div>
                      </div>
                      <p className="text-[10px] text-zinc-500 text-center">AI akan men-generate total {totalShotsPreview} gambar secara otomatis berdasarkan brief.</p>
                    </div>

                    <div className="pt-2 md:pt-4">
                      <ButtonCTA disabled={!isConfigReady || !IN_CANVAS} onClick={() => generateVisual()}>{!IN_CANVAS ? 'Generate Visuals — Hanya di Gemini Canvas' : 'Generate Visuals'}</ButtonCTA>
                      {!isConfigReady && (
                        <p className="text-center text-[10px] text-zinc-600 mt-3 animate-pulse">{!config.sbBuilderBrief.trim() ? 'Isi Brief / Alur Cerita untuk lanjut' : 'Upload gambar lokasi untuk lanjut'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </LayoutWrapper>
        );
      }

      case 'result': {
        const bgChip = bgType === 'custom' ? (customBg || 'Custom') : (bgType === 'match_storyboard' ? 'Latar Otomatis' : (bgType === 'custom_image' ? 'Lokasi Upload' : config.background));
        return (
          <LayoutWrapper className="font-inter h-screen flex flex-col overflow-hidden bg-zinc-950">
            <div className="h-16 md:h-20 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-zinc-950/70 backdrop-blur-md z-30 shrink-0">
              <div className="flex items-center gap-4 md:gap-6 overflow-hidden">
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest truncate">Project</span>
                  <span className="font-jakarta text-xs md:text-sm font-medium text-white truncate text-rainbow">{selectedMode?.title}{(isProductEnabled ? productName : builderMetadata?.sheetTitle) ? ` / ${isProductEnabled ? productName : builderMetadata?.sheetTitle}` : ''}</span>
                </div>
                <div className="hidden md:block h-8 w-px bg-white/10"></div>
                <div className="hidden md:flex items-center gap-4 text-xs text-zinc-400">
                  <span className="px-3 py-1 rounded-full border border-white/5 bg-white/5 max-w-[200px] truncate">{bgChip}</span>
                  <span className="px-3 py-1 rounded-full border border-white/5 bg-white/5">{config.ratio}</span>
                  <span className="px-3 py-1 rounded-full border border-white/5 bg-white/5">{config.sbBuilderDuration}s · {config.sbBuilderPace || 6} shot/10s</span>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                {!isGenerating && (
                   <>
                    <button onClick={() => { playClick(); setIsAudioStudioOpen(true); setIsAudioStudioMinimized(false); }} className="relative flex items-center gap-2 px-4 py-2 bg-white text-black border border-transparent rounded-full text-[10px] md:text-xs font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] group btn-rainbow-hover">
                      <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none"><div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 skew-x-12"></div></div>
                      <Volume2 className="w-3 h-3 md:w-4 md:h-4 relative z-10 group-hover:scale-110 transition-transform" />
                      <span className="relative z-10 drop-shadow-md">Audio Studio</span>
                    </button>
                    <button onClick={() => { playClick(); setView('config'); }} className="flex items-center gap-1 p-2 md:p-0 text-[10px] md:text-xs font-bold tracking-widest uppercase text-zinc-500 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4 md:w-3 md:h-3" /><span className="hidden md:inline">Kembali</span></button>
                    <button onClick={handleResetAndNew} className="px-4 py-2 bg-zinc-800 text-white text-[10px] md:text-xs font-bold tracking-widest uppercase rounded-full hover:bg-zinc-700 hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/20">Buat Baru</button>
                   </>
                )}
              </div>
            </div>

            <div className="flex-grow relative overflow-y-auto custom-scrollbar">
              <div className="max-w-[1920px] mx-auto p-4 md:p-8 lg:p-12 pb-32">

                {/* ================= LEMBAR STORYBOARD (struktur verbatim Aksara) ================= */}
                <div className="flex flex-col gap-12 w-full max-w-5xl mx-auto mb-20">
                    <div className="text-center space-y-2 mb-4">
                        <h2 className="font-jakarta text-2xl md:text-3xl font-semibold tracking-tight text-rainbow inline-flex items-center gap-2"><Sparkles className="w-5 h-5 text-white" /> Lembaran Storyboard Final</h2>
                        <p className="text-sm text-zinc-400">Klik Download All untuk mengunduh storyboard, foto tiap shot, foto talent, dan prompt video dalam 1 ZIP.</p>
                    </div>

                    {Array.from({ length: config.sbBuilderDuration / 10 }).map((_, sheetIdx) => (
                        <div key={sheetIdx} className="mb-10">
                            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mb-4">
                                <button onClick={() => handleCopyGptPrompt(sheetIdx, 'omni')} className={`w-full sm:w-auto px-4 py-2.5 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${copiedStates[`omni_${sheetIdx}`] ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-zinc-900/50 border-white/20 text-white hover:bg-white hover:text-black'}`}>
                                    {copiedStates[`omni_${sheetIdx}`] ? <><CheckCircle2 className="w-3 h-3" /> Tersalin!</> : <><Copy className="w-3 h-3" /> Copy Prompt Gemini Omni</>}
                                </button>
                                <button onClick={() => handleCopyGptPrompt(sheetIdx, 'seedance')} className={`w-full sm:w-auto px-4 py-2.5 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${copiedStates[`seedance_${sheetIdx}`] ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-zinc-900/50 border-white/20 text-white hover:bg-white hover:text-black'}`}>
                                    {copiedStates[`seedance_${sheetIdx}`] ? <><CheckCircle2 className="w-3 h-3" /> Tersalin!</> : <><Files className="w-3 h-3" /> Copy Prompt Seedance</>}
                                </button>
                                {/* DOWNLOAD ALL: 1 tombol ZIP di kanan atas (menggantikan Download Full Sheet), hanya di lembar pertama */}
                                {sheetIdx === 0 && (
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownloadAllZip(); }} disabled={isDownloadingZip || isGenerating} className="w-full sm:w-auto px-5 py-2.5 bg-white text-black hover:bg-zinc-200 border border-transparent rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50">
                                    {isDownloadingZip ? <><Loader2 className="w-3 h-3 animate-spin" /> Memproses ZIP...</> : <><Archive className="w-3 h-3" /> Download All (.ZIP)</>}
                                </button>
                                )}
                            </div>

                            <div id={`storyboard-sheet-${sheetIdx}`} className="bg-[#F4F4F5] p-6 md:p-10 rounded-sm text-zinc-900 shadow-2xl relative">
                                <div className="border-b-2 border-zinc-300 pb-4 mb-6">
                                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-black mb-2">{builderMetadata?.sheetTitle || 'STORYBOARD'} {config.sbBuilderDuration > 10 ? `(PART ${sheetIdx + 1})` : ''}</h1>
                                    <p className="text-sm md:text-base font-medium text-zinc-600 uppercase tracking-widest">DURASI ESTIMASI: {config.sbBuilderDuration} DETIK | RASIO: {config.ratio} | PACE: {config.sbBuilderPace || 6} SHOT/10s | AUDIO: {builderMetadata?.audioNote} | MUSIK: {(generatedImages.find(Boolean)?.musicOn ?? config.musicOn) ? 'ON' : 'OFF'}{SHOW_CARA_REKAM ? ` | CARA REKAM: ${(CARA_REKAM_OPTIONS.find(o => o.id === (generatedImages.find(Boolean)?.caraRekam ?? config.caraRekam))?.label || '').replace(/^\S+\s/, '')}` : ''}{builderMetadata?.lightingId ? ` | LIGHTING: ${sbLightingLabel(builderMetadata.lightingId)} (dipilih ${builderMetadata.lightingBy === 'ai' ? 'AI' : 'user'})` : ''}</p>
                                </div>

                                <div className={`grid grid-cols-2 ${config.sbBuilderPace === 3 ? 'md:grid-cols-3' : config.sbBuilderPace === 4 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-x-6 gap-y-10`}>
                                    {Array.from({ length: config.sbBuilderPace || 6 }).map((_, shotOffset) => {
                                        const shotIndex = sheetIdx * (config.sbBuilderPace || 6) + shotOffset;
                                        const sceneData = generatedImages[shotIndex];
                                        const bData = sceneData?.builderData;
                                        const isLoadingThis = sceneLoadings[shotIndex] || (isGenerating && !sceneData?.src);

                                        return (
                                            <div key={shotIndex} className="flex flex-col relative group">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <span className="bg-black text-white text-[10px] md:text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">SHOT {shotIndex + 1}</span>
                                                    <input
                                                        type="text"
                                                        // FIX (bug Aksara #8): default timing pakai formatShotTiming
                                                        value={bData?.timing || formatShotTiming(shotIndex, config.sbBuilderPace)}
                                                        onChange={(e) => {
                                                            if (sceneData && sceneData.builderData) {
                                                                updateSceneData(shotIndex, {
                                                                    builderData: { ...sceneData.builderData, timing: e.target.value }
                                                                });
                                                            }
                                                        }}
                                                        disabled={isLoadingThis}
                                                        className="text-xs font-semibold text-zinc-600 bg-transparent border-b border-dashed border-zinc-400 hover:border-zinc-600 focus:border-black focus:outline-none focus:text-black transition-colors w-24 px-1 pb-0.5"
                                                        title="Edit durasi shot"
                                                    />
                                                    {sceneData?.audioType === 'talking' && (() => { const t = parseTimingSec(bData?.timing || formatShotTiming(shotIndex, config.sbBuilderPace)); return (t.end - t.start) + 0.05 < dialogNeedSec(sceneData.voText ?? bData?.desc); })() && (
                                                        <span className="text-[10px] font-semibold text-amber-600 whitespace-nowrap" title="Dialog lipsync lebih panjang dari durasi shot: persingkat dialog atau tambah durasi">Dialog kepanjangan</span>
                                                    )}
                                                </div>
                                                <div
                                                    className={`relative bg-zinc-300 rounded-sm overflow-hidden mb-4 border border-zinc-400 cursor-pointer ${config.ratio === '9:16' ? 'aspect-[9/16]' : config.ratio === '16:9' ? 'aspect-video' : 'aspect-square'}`}
                                                    onClick={() => sceneData?.src && setPreviewImage(sceneData.src)}
                                                >
                                                    {sceneData?.src ? (
                                                        <>
                                                          <img src={sceneData.src} className={`w-full h-full object-cover ${config.ratio === '16:9' ? 'object-center' : 'object-top'}`} alt={`Shot ${shotIndex + 1}`} />
                                                          {isLoadingThis && <GeneratingState lightMode index={shotIndex} />}
                                                        </>
                                                    ) : isLoadingThis ? (
                                                        <GeneratingState lightMode index={shotIndex} />
                                                    ) : (
                                                        // FIX (UI): Aksara menampilkan spinner selamanya untuk shot yang gagal. Di sini diberi status gagal.
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-3">
                                                            <X className="w-5 h-5 text-zinc-500" />
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Gagal generate</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <h3 className="text-sm md:text-base font-black uppercase text-black mb-1 leading-tight line-clamp-2">{bData?.title || `TITLE SHOT ${shotIndex+1}`}</h3>
                                                <p className="text-xs md:text-sm text-zinc-700 leading-snug">{bData?.desc || 'AI sedang menganalisis adegan untuk menyusun deskripsi...'}</p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-10 pt-4 border-t-2 border-zinc-300 flex items-start gap-3 text-zinc-700">
                                    <Lightbulb className="w-5 h-5 flex-shrink-0" />
                                    <p className="text-xs md:text-sm font-semibold uppercase"><span className="font-black">CATATAN VISUAL:</span> {builderMetadata?.visualNote}</p>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="text-center pt-8 border-t border-white/10 mt-10">
                        <h3 className="font-jakarta text-xl md:text-2xl font-semibold tracking-tight text-rainbow">Detail & Revisi per Shot</h3>
                        <p className="text-sm text-zinc-500 mb-8 mt-1">Gunakan alat di bawah ini untuk merevisi gambar yang tidak sesuai atau menambahkan audio voice over.</p>
                    </div>
                </div>

                {/* ================= KARTU REVISI PER SHOT ================= */}
                <div className={`grid gap-6 md:gap-8 ${config.scenes === 4 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                  {Array.from({ length: config.scenes }).map((_, index) => {
                    const sceneData = generatedImages[index];
                    const image = sceneData?.src;
                    const isLoadingThis = sceneLoadings[index] || (isGenerating && !image);
                    if (!(image && !isGenerating)) return null;

                    return (
                      <div key={index} className="flex flex-col gap-4 group">
                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 space-y-4">
                           <div className="flex items-center justify-between pb-3 border-b border-white/5">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Revisi Panel Shot {index + 1}</span>
                              <button type="button" onClick={(e) => downloadImage(image, index, e)} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wide hover:bg-white hover:text-black hover:border-transparent transition-all shadow-[0_0_10px_rgba(255,255,255,0)] hover:shadow-[0_0_15px_rgba(255,255,255,0.4)]"><Download className="w-3 h-3" /> Unduh</button>
                           </div>

                           <div className="space-y-4 pt-1">
                               <div className="bg-zinc-900/60 border border-white/20 rounded-xl p-3.5 space-y-3 relative shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                                  <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-white" /><span className="text-[11px] font-bold uppercase tracking-widest text-white">Revisi Visual AI</span>{sceneData.actionUpdated && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-green-500/20 text-green-400">Aksi diperbarui</span>}</div>
                                  <div className="relative group/input flex gap-2">
                                    <input type="text" disabled={isLoadingThis} placeholder="Cth: Buat pencahayaan lebih terang..." className="flex-grow bg-black/60 border border-white/20 rounded-lg pl-3 pr-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/50 focus:shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all disabled:opacity-50" value={scenePrompts[index] || ""} onChange={(e) => setScenePrompts(prev => ({...prev, [index]: e.target.value}))} onKeyDown={(e) => e.key === 'Enter' && regenerateSingleScene(index)} />
                                    <button type="button" onClick={() => regenerateSingleScene(index)} disabled={isLoadingThis || !scenePrompts[index]} className="px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.2)]">{isLoadingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : "Revisi"}</button>
                                  </div>
                               </div>

                               <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-2 transition-all">
                                   <div className="flex items-center justify-between">
                                       <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 transition-colors ${sceneData.voActive ? 'text-white' : 'text-zinc-600'}`}><Mic className="w-3 h-3"/> Audio Shot</span>
                                       <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                         {[{ id: 'talking', label: 'Talking' }, { id: 'vo', label: 'VO' }, { id: 'none', label: 'Off' }].filter(opt => !(opt.id === 'talking' && sceneData.isBRoll)).map(opt => ( /* TANPA WAJAH: tanpa Talking */
                                           <button key={opt.id} type="button" disabled={isLoadingThis} onClick={() => { playClick(); updateSceneData(index, { audioType: opt.id, voActive: opt.id !== 'none' }); }} className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all ${(sceneData.audioType || (sceneData.voActive ? 'talking' : 'none')) === opt.id ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}>{opt.label}</button>
                                         ))}
                                       </div>
                                   </div>
                                   {sceneData.voActive ? (
                                       <div className="flex flex-col gap-2">
                                           <textarea value={sceneData.voText || ""} onChange={(e) => updateSceneData(index, { voText: e.target.value })} disabled={isLoadingThis} className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-xs text-zinc-300 focus:outline-none focus:border-white/50 transition-all resize-none h-16 custom-scrollbar" placeholder="Ketik naskah Voice Over di sini..." />
                                           <div className="flex justify-end">
                                               <button
                                                   type="button"
                                                   onClick={() => {
                                                       // Verbatim Aksara (voText sudah ter-update saat onChange; tombol ini hanya konfirmasi visual)
                                                       playClick();
                                                       setCopiedStates(prev => ({ ...prev, [`vo_${index}`]: true }));
                                                       setTimeout(() => setCopiedStates(prev => ({ ...prev, [`vo_${index}`]: false })), 2000);
                                                   }}
                                                   className="text-[9px] px-3 py-1.5 bg-white/10 hover:bg-white text-zinc-300 hover:text-black rounded-md font-bold uppercase tracking-widest transition-all shadow-sm"
                                               >
                                                   {copiedStates[`vo_${index}`] ? 'Tersimpan & Terupdate!' : 'Update Naskah VO'}
                                               </button>
                                           </div>
                                       </div>
                                   ) : (
                                       <div className="flex items-center justify-center py-2 bg-black/20 rounded-md border border-white/5 border-dashed"><p className="text-[10px] text-zinc-600 font-medium italic">Tanpa Voice Over (Hanya Ambience/BGM)</p></div>
                                   )}
                               </div>
                           </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isGenerating && generatedImages.some(img => img !== null) && (
                   <div className="mt-20 pt-10 border-t border-white/5 flex flex-col items-center gap-6 animate-in fade-in duration-700">
                       <button onClick={() => { playClick(); setIsVideoGeneratorsOpen(!isVideoGeneratorsOpen); }} className="px-8 py-4 bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/10 rounded-full text-xs font-bold tracking-widest uppercase text-white transition-all flex items-center gap-3 shadow-lg hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] hover:border-white/30">
                           <Video className="w-5 h-5 text-white" /> Akses Video Generator {isVideoGeneratorsOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                       </button>
                       {isVideoGeneratorsOpen && (
                           <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center animate-in zoom-in-95 duration-300 flex-wrap">
                               {[{name: 'Meta AI', url: 'https://www.meta.ai/'}, {name: 'Grok AI', url: 'https://grok.com/'}, {name: 'Flow AI', url: 'https://labs.google/fx/tools/flow'}, {name: 'Leonardo AI', url: 'https://leonardo.ai/'}].map(link => (
                                 <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" onClick={playClick} className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 bg-zinc-900/60 border border-white/20 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-widest text-zinc-300 hover:bg-white hover:text-black transition-all shadow-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                                   <ExternalLink className="w-4 h-4" /> {link.name}
                                 </a>
                               ))}
                           </div>
                       )}
                   </div>
                )}
              </div>
            </div>

            {sheetPreview && (
              <div className="fixed inset-0 z-[110] bg-zinc-950/95 flex flex-col items-center p-4 md:p-10 animate-in fade-in duration-200" onClick={() => setSheetPreview(null)}>
                <div className="w-full max-w-4xl flex flex-col gap-4 h-full" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between gap-3 shrink-0">
                    <div className="flex flex-col min-w-0">
                      <span className="font-jakarta text-sm md:text-base font-semibold text-rainbow">Lembar {sheetPreview.sheet} siap</span>
                      <span className="text-[10px] md:text-xs text-zinc-400">Kalau file tidak otomatis terunduh: klik kanan / tahan gambar → Simpan gambar.</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={sheetPreview.url} download={sheetPreview.name} rel="noopener" onClick={(e) => e.stopPropagation()} className="px-4 py-2 bg-white text-black rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 btn-rainbow-hover"><Download className="w-3 h-3" /> Unduh Lagi</a>
                      <button type="button" onClick={() => setSheetPreview(null)} className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors border border-white/10"><X className="w-5 h-5" /></button>
                    </div>
                  </div>
                  <div className="flex-grow overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-zinc-900">
                    <img src={sheetPreview.url} alt={`Storyboard Sheet ${sheetPreview.sheet}`} className="w-full h-auto block" />
                  </div>
                </div>
              </div>
            )}

            {previewImage && (
              <div className="fixed inset-0 z-[100] bg-zinc-950/95 flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                <div className={`relative overflow-hidden rounded-lg shadow-2xl transition-all flex items-center justify-center bg-zinc-900 ${config.ratio === '9:16' ? 'aspect-[9/16] h-full max-h-[90vh] w-auto' : ''} ${config.ratio === '16:9' ? 'aspect-[16/9] w-full max-w-[90vw] h-auto' : ''} ${config.ratio === '1:1' ? 'aspect-square h-full max-h-[90vh] w-auto' : ''}`} onClick={(e) => e.stopPropagation()}>
                   <img src={previewImage} alt="Full Preview" className={`w-full h-full object-cover ${config.ratio === '16:9' ? 'object-center' : 'object-top'}`} />
                  <button type="button" onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-md border border-white/10 z-20"><X className="w-5 h-5" /></button>
                </div>
              </div>
            )}
          </LayoutWrapper>
        );
      }

      default:
        return null;
    }
  };

  return (
    <React.Fragment>
      {renderContent()}

      {/* ================= AUDIO STUDIO POPUP (UI AI UGC Studio, logic Aksara) ================= */}
      {isAudioStudioOpen && (
        <div className={`font-inter fixed z-[100] right-4 bottom-4 md:right-8 md:bottom-8 bg-zinc-950/95 backdrop-blur-xl border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)] transition-all duration-300 flex flex-col overflow-hidden origin-bottom-right ${isAudioStudioMinimized ? 'w-[200px] h-[48px] rounded-2xl opacity-80 hover:opacity-100' : 'w-[calc(100vw-32px)] md:w-[700px] h-[calc(100vh-100px)] md:h-[520px] rounded-3xl opacity-100 scale-100'}`}>
           <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.02] border-b border-white/5 cursor-pointer hover:bg-white/[0.04] transition-colors shrink-0" onClick={() => setIsAudioStudioMinimized(!isAudioStudioMinimized)}>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]"><Volume2 className="w-3.5 h-3.5 text-white" /></div>
                <span className="font-jakarta text-[11px] font-bold tracking-widest uppercase text-zinc-100">Audio Studio</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); setIsAudioStudioMinimized(!isAudioStudioMinimized); }} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">{isAudioStudioMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setIsAudioStudioOpen(false); setIsAudioStudioMinimized(false); }} className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"><X className="w-4 h-4" /></button>
              </div>
           </div>
           {!isAudioStudioMinimized && (
              <div className="flex-grow overflow-y-auto custom-scrollbar p-5 md:p-6 flex flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                     <div><h2 className="font-jakarta text-sm font-bold text-white tracking-wide mb-1">Naskah & Suara AI</h2><p className="text-[10px] md:text-xs text-zinc-400 font-light">Generasi naskah cerdas & sulih suara karakter AI.</p></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-5 flex-grow">
                      <div className="md:col-span-3 flex flex-col gap-3 h-full">
                          <div className="flex items-center justify-between">
                              <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5"><FileText className="w-3 h-3"/> Teks Naskah VO Utama</h3>
                              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                 {['15s', '30s', '45s'].map(dur => (<button key={dur} onClick={() => { playClick(); setVoDuration(dur); }} className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all ${voDuration === dur ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}>{dur}</button>))}
                              </div>
                          </div>
                          <textarea value={voScript} onChange={(e) => setVoScript(e.target.value)} placeholder="Ketik naskah Voice Over Anda di sini, atau tekan tombol AI Auto-Script di bawah..." className="w-full flex-grow min-h-[120px] bg-zinc-900/60 border border-white/10 rounded-xl p-3.5 text-xs text-zinc-200 focus:outline-none focus:border-white/50 focus:bg-zinc-900/80 transition-all resize-none custom-scrollbar leading-relaxed" />
                          <button onClick={handleGenerateVOScript} disabled={isGeneratingVOScript} className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-zinc-200">
                             {isGeneratingVOScript ? <><Loader2 className="w-3 h-3 animate-spin"/> Menyusun Naskah...</> : <><Wand2 className="w-3 h-3 text-white"/> AI Auto-Script ({voDuration})</>}
                          </button>
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-5">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5"><Mic className="w-3 h-3"/> Pengaturan Suara</h3>
                          <div className="space-y-4">
                              <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Pilih Karakter Suara</label>
                                  <div className="relative">
                                      <select value={voVoice} onChange={(e) => { playClick(); setVoVoice(e.target.value); }} className="w-full appearance-none bg-black/40 border border-white/10 rounded-xl px-3.5 py-3 text-[11px] text-white focus:outline-none focus:border-white/50 cursor-pointer">
                                         {VOICES.map(v => <option key={v.id} value={v.id} className="bg-zinc-900">{v.name}</option>)}
                                      </select>
                                      <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                  </div>
                              </div>
                              <div>
                                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5 ml-1">Emosi / Nada Bicara</label>
                                  <div className="relative">
                                      <select value={voTone} onChange={(e) => { playClick(); setVoTone(e.target.value); }} className="w-full appearance-none bg-black/40 border border-white/10 rounded-xl px-3.5 py-3 text-[11px] text-white focus:outline-none focus:border-white/50 cursor-pointer">
                                         {TONES.map(t => <option key={t} value={t} className="bg-zinc-900">{t}</option>)}
                                      </select>
                                      <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                  </div>
                              </div>
                          </div>
                          <div className="flex-grow flex flex-col justify-end gap-3 mt-4">
                               {voAudioUrl && (
                                   <div className="bg-zinc-900/60 border border-white/20 rounded-xl p-3 flex flex-col gap-2.5 animate-in zoom-in-95">
                                       <audio controls src={voAudioUrl} className="w-full h-8 opacity-90 hover:opacity-100 transition-opacity" />
                                       <a href={voAudioUrl} download={`VO_${productName || 'Audio'}_${voTone}.wav`} className="w-full py-2 bg-white/10 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-white hover:text-black transition-colors"><Download className="w-3 h-3" /> Unduh Audio (WAV)</a>
                                   </div>
                               )}
                               <button onClick={handleGenerateVOAudio} disabled={isGeneratingVOAudio || !voScript.trim()} className="w-full py-3.5 bg-white text-black font-bold text-[11px] tracking-widest uppercase rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] border border-transparent hover:bg-zinc-200 btn-rainbow-hover">
                                  {isGeneratingVOAudio ? (<><Loader2 className="w-3.5 h-3.5 animate-spin"/> Memproses...</>) : (<><PlayCircle className="w-3.5 h-3.5"/> Generate Audio VO</>)}
                               </button>
                          </div>
                      </div>
                  </div>
              </div>
           )}
        </div>
      )}
    </React.Fragment>
  );
}
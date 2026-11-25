# Smart Tools by Jaleee

Kumpulan tools AI UGC Studio & Character Sheet Studio.

## Isi repository

- `canvas/` — file yang dipakai di dalam Gemini Canvas (API key terisi otomatis oleh Canvas):
  - `Stotyboard_talkshow.tsx` — Storyboard Talk Show (semua gaya dalam satu file)
- `luar-canvas/` — file yang bisa jalan di luar Canvas (browser biasa / hosting sendiri), sudah ada kolom API Key Gemini:
  - `character_sheet_studio.html` — Character Sheet Studio
  - `Smart_Tools_by_Jaleee.html` — Smart Tools by Jaleee
  - `Stotyboard_Podcast_Style.tsx`
  - `Stotyboard_Pengisi_Seminar.tsx`
  - `Stotyboard_MC_Event.tsx`
  - `Stotyboard_Stand_Up_Comedy.tsx`
  - `Stotyboard_Custom.tsx`

## Cara pakai di Gemini Canvas

Buka file `.tsx` atau `.html` di atas, salin isinya, tempel di Gemini Canvas sebagai web baru. API key terisi otomatis.

## Cara pakai di luar Canvas

Buka file di `luar-canvas/` di browser / hosting sendiri, isi API Key Gemini di kolom "API Key Gemini" di atas halaman (gratis dari Google AI Studio: https://aistudio.google.com/apikey). Key hanya tersimpan di browser kamu (localStorage), tidak dikirim ke mana pun selain Google saat Generate.

Smart Tools di artifact Claude memakai Claude untuk Kunci Karakter dan Prompt Video; di Canvas dan di luar Canvas memakai Gemini.

## Catatan

Tidak ada API key yang tersimpan di dalam file-file ini.

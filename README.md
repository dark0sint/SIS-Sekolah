# SIS Sekolah (Academic Information System)
## Jalankan di server (Docker)
1. Install Docker di VPS, salin folder ini.
2. Ubah `JWT_SECRET` di docker-compose.yml, lalu: `docker compose up -d --build`
3. Buka http://IP-SERVER . Login awal: admin/admin123 (guru1/guru123, ortu1/ortu123) - ganti segera.
4. HTTPS (wajib agar bisa di-install sebagai app HP): pasang Caddy/Nginx + Let's Encrypt, proxy ke port 3000 dan ubah port compose ke "3000:3000".
Tanpa Docker: `npm install && JWT_SECRET=xxx node server.js` (Node 18+).
## Akses
Buka URL di HP -> "Tambahkan ke layar utama" (PWA). Data tersimpan di ./data/sis.db (backup berkala).
## Integrasi lanjutan
- Payment gateway: tambahkan Midtrans/Xendit di endpoint /api/invoices/:id/pay, set 'lunas' lewat webhook.
- WhatsApp/Telegram: isi env WA_WEBHOOK, pengumuman baru otomatis dikirim.
- Dapodik: tombol "Ekspor Dapodik" (CSV).

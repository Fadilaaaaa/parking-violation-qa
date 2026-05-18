# QA Release Readiness — Parking Violation Portal

Submission untuk QA Engineer technical assignment.

---

## Verdict: 🔴 NOT READY TO SHIP

Ditemukan **5 critical defect** yang harus diselesaikan sebelum release, termasuk kesalahan kalkulasi denda, kebocoran data antar member, dan payment idempotency failure.

---

## Isi Repo

| File | Deskripsi |
|---|---|
| `QA_RELEASE_READINESS_REPORT.md` | Laporan lengkap: risk assessment, semua findings, authorization matrix, fine calculation test matrix, dan rekomendasi release |
| `test_api.sh` | Automated regression test (bash + curl + jq) — ~25 test cases |
| `parking_violation_portal.postman_collection.json` | Postman collection dengan test assertions siap import |

---

## Cara Jalankan Test

### Prasyarat
- Aplikasi berjalan di `http://localhost:8090` (`docker compose up` dari repo aplikasi)
- `curl` dan `jq` terinstall

### Option 1 — Shell script
```bash
chmod +x test_api.sh
./test_api.sh
```

Output contoh:
```
━━━ 1. Authentication ━━━
  ✓ GET /health returns 200 (public)
  ✓ Login with wrong password returns 401
  ✓ GET /violations without token returns 401

━━━ 3. Fine Calculation: Time Multiplier ━━━
  ✓ expired_meter at 10:00 Jakarta (day): fine = 50000
  ✗ expired_meter at 23:00 Jakarta (night): fine = 75000
    expected: 75000  got: 50000

━━━ Results ━━━
19 passed, 6 failed
```

Exit code `1` jika ada test yang gagal — siap dipakai di CI pipeline.

### Option 2 — Postman
1. Buka Postman → klik **Import**
2. Upload file `parking_violation_portal.postman_collection.json`
3. Buat environment baru, tambahkan variable:
   - `BASE_URL` → `http://localhost:8090`
4. Klik kanan collection → **Run collection**
5. Jalankan dari atas (urutan penting — login harus duluan)

---

## Ringkasan Findings

### 🔴 Critical (5)

| ID | Defect | Dampak |
|---|---|---|
| C-01 | Night time multiplier (1.5×) tidak pernah diaplikasikan | Semua pelanggaran malam salah hitung |
| C-02 | Repeat multiplier menghitung paid violations sebagai unpaid | Member yang bayar tepat waktu kena penalti lebih besar |
| C-03 | Member bisa akses invoice & violation milik member lain | Privacy violation, potensi pelanggaran UU PDP |
| C-04 | Bayar invoice yang sudah `paid` tidak return 409 | Double charge di integrasi payment nyata |
| C-05 | Publish rule version baru merubah `final_amount` violations lama | Integritas data keuangan rusak |

### 🟡 Major (4)
- Spec gap: perilaku boundary `06:00` dan `22:00` tidak terdokumentasi
- Definisi "unpaid" ambigu — `failed` diperlakukan sebagai paid
- `GET /transactions` menghitung ulang dari rule aktif, bukan dari snapshot
- `payment.failed` audit event tidak tercatat

### 🟢 Minor (3)
- Tidak ada validasi pada field `photo_base64`
- `occurred_at` menerima timestamp masa depan tanpa warning
- Member bisa query `GET /rule-versions` via API meski UI menyembunyikannya

---

## Pendekatan Testing

**Exploratory dulu** — semua lima flow dijalankan manual sebagai officer dan member untuk membangun mental model sebelum menulis test case apapun.

**Spec-driven boundary testing** — setiap formula, rule, dan edge case di SPEC.md diekstrak menjadi input konkret dan expected output yang bisa diverifikasi secara matematis.

**Authorization matrix** — setiap endpoint diuji dengan kombinasi wrong-role dan wrong-owner token.

**Automasi dipilih untuk:**
- Fine calculation — deterministik, banyak kombinasi (4 types × 2 time windows × 3 repeat levels), dan regresi-prone
- Authorization — mudah rusak tanpa disadari, tidak terlihat dari UI
- Payment idempotency — silent failure yang hanya ketahuan saat integrasi payment nyata

**Tidak diautomasi:**
- Exploratory testing dan spec gap analysis — butuh judgment manusia, bukan eksekusi script
- UI testing — di luar scope untuk fase ini

**Tooling dipilih `curl` + `jq`** karena zero setup, transparan, dan CI-friendly tanpa install framework tambahan.

---

## Spec Gaps (Butuh Keputusan Product Owner)

Lima item di SPEC.md Section 9 sengaja tidak dispesifikasikan. Ini harus diputuskan dan didokumentasikan sebelum ship:

| Gap | Rekomendasi |
|---|---|
| Time multiplier di tepat `06:00` dan `22:00` | Day multiplier (inclusive start) |
| Pengukuran "90 hari terakhir" | 90 × 24 jam sebelum `occurred_at`, eksklusif |
| Definisi "unpaid" | `pending` DAN `failed` dihitung sebagai unpaid |
| Pembulatan amount non-integer | Round ke 500 IDR terdekat |
| Validasi foto | Non-empty, valid base64, maks 10MB |

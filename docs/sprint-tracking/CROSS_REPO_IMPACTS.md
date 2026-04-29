# Cross-Repo Impact Log — Browsonic Ecosystem

> **Konum:** `browsonic-sdk/docs/sprint-tracking/CROSS_REPO_IMPACTS.md`
> **Kardeş dosya:** [SPRINT_PLAN.md](./SPRINT_PLAN.md)
> **Amaç:** Sprint planı ilerlerken `browsonic-sdk` dışındaki repo'lara (browsonic-service, browsonic-dashboard, browsonic-ops, browsonic-compose, browsonic-landing-astro, browsonic-designsystem, browsonic-promo, framework adapter repoları) etkileri sıfır kayıpla taşımak.

| Meta           | Değer      |
| -------------- | ---------- |
| Oluşturulma    | 2026-04-29 |
| Son güncelleme | 2026-04-29 |

---

## 1. Protokol

### 1.1. Ne zaman yeni satır eklenir?

Her sprint kapanışında, [SPRINT_PLAN.md](./SPRINT_PLAN.md) Bölüm 1.3 (post-flight) gereği **mecburen**:

1. Sprint sırasında `browsonic-sdk` dışındaki bir repo'ya etki yarattıysa → aşağıdaki **Etki Tablosu**'na bir satır.
2. Etki yoksa → ilgili sprintin kapanış log'una "Bu sprintin cross-repo etkisi yok" yazılır, bu dosyaya satır eklenmez.

### 1.2. Ne zaman bir satır güncellenir?

İşletme aşamalarında (örn. service tarafı PR açıldı, ops tarafı CI'a entegre edildi):

- Status: `pending` → `in-progress` → `done`
- "İşletme Kaydı" kolonuna PR linki / commit hash eklenir
- Status `done` olduğunda satır tabloda kalır (geçmiş kayıt), silinmez.

### 1.3. Repo özetleri (referans)

| Repo                                                                        | Tanım                                                        | Sprint planında ne sıklıkla etkilenir?     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| **browsonic-service**                                                       | Backend ingest API + auth + sourcemap upload + symbolication | S2, S3, S4, S8, S9 (yüksek frekans)        |
| **browsonic-dashboard**                                                     | Operatör konsolu (errors UI, dashboards, alerts)             | S5, S7, S8, S9, S10                        |
| **browsonic-ops**                                                           | Deployment, CI/CD, infra-as-code, CDN dağıtımı               | S3, S4, S9                                 |
| **browsonic-compose**                                                       | Self-hosted docker-compose stack                             | S3 (sourcemap upload pipeline)             |
| **browsonic-landing-astro**                                                 | Marketing landing site                                       | S5-S10 (her yeni feature CTA güncellemesi) |
| **browsonic-designsystem**                                                  | Tokens / primitives                                          | Düşük (genelde dashboard içinde tüketilir) |
| **browsonic-promo**                                                         | Demo / promosyonel asset'ler                                 | S10 (migration guide videoları)            |
| **browsonic-react / -vue / -svelte / -nextjs / -astro / -angular / -remix** | Framework adapter repoları (yeni açılacak)                   | S5-S7, S10 (her biri açılışta)             |

---

## 2. Etki Tablosu

| #   | Sprint | Tarih (eklendi) | Etkilenen Repo    | Yapılması Gereken İş                                                                                                                                                                                                                                                                                                                                                                                                    | Status  | Sorumlu      | İşletme Kaydı |
| --- | ------ | --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------- |
| 1   | S2     | 2026-04-29      | browsonic-service | `BrowsonicEvent`'in yeni opsiyonel field'larını (`errorType`, `stackFrames`, `linkedErrors`) ingest tarafında **tolerate edip persist et**. Mevcut SDK 2.3.0 client'ları bu alanları doldurarak gönderiyor; tip mismatch ile reject olursa breaking olur. Persist tipleri için: `errorType TEXT NULL`, `stack_frames JSONB NULL`, `linked_errors JSONB NULL`.                                                           | pending | service-team | —             |
| 2   | S2     | 2026-04-29      | browsonic-service | Fingerprint algoritması SDK 2.3.0'da değişti (frame-aware: line/col absorption). Backend tarafında `events.fingerprint` indeksini drop+rebuild **gerekmez** — string opaque, sadece grouping anahtarı. Eski olaylar eski fingerprint'i korur, yeni olaylar yeni kümede gruplanır. **Doğrulama yap:** dashboard "Grouped errors" panelinin migration cliff'i göstermediğini gözlemle (ilk 24 saat kademeli geçiş bekle). | pending | service-team | —             |

---

## 3. Tarihsel Notlar

_Sprint kapanışlarında öğrenilen, ileride başka sprint'leri etkileyecek genel bulgular buraya yazılır. Tek-defa-not / lesson-learned formatı._

- **2026-04-29 — S1 kapanışı:** Cross-repo etki yok. SDK iç hijyen sprintiydi (license header + SPDX + ROADMAP + sprint tracking dosyaları). API yüzeyi, `/v1/events` ingest contract, ve build çıktıları değişmedi; service/dashboard/ops tarafında tetikleyici işletme yok. **Lesson-learned:** "saf iç temizlik" sprintleri için bu dosyaya satır eklemeden, SPRINT_PLAN.md'nin sprint kapanış log'una not düşmek protokol-uyumlu. Tablonun amacı sadece **gerçek aksiyon gerektiren** etkileri toplamak.

---

## 4. Şablon (Yeni Satır Eklerken)

Yeni bir etki kaydı eklemek için Bölüm 2'deki tabloya aşağıdaki şablonu kullanarak bir satır ekle:

```
| <sıra> | S<sprint#> | YYYY-MM-DD | <repo-adı> | <iş tek cümle> | pending | <kim/hangi-repo> | <PR linki veya boş> |
```

Örnek (gerçek değil, sadece format):

```
| 1 | S3 | 2026-05-12 | browsonic-service | POST /v1/sourcemaps endpoint'ini implemente et (multipart form, debugId, checksum) | pending | service-team | — |
| 2 | S3 | 2026-05-12 | browsonic-ops | CI release flow'una `browsonic-sourcemaps upload` adımını ekle | pending | ops-team | — |
```

Status değişiminde aynı satırı güncelle, **yeni satır açma**.

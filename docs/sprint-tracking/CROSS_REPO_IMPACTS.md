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

| #   | Sprint | Tarih (eklendi) | Etkilenen Repo          | Yapılması Gereken İş                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status  | Sorumlu           | İşletme Kaydı |
| --- | ------ | --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------- | ------------- |
| 1   | S2     | 2026-04-29      | browsonic-service       | `BrowsonicEvent`'in yeni opsiyonel field'larını (`errorType`, `stackFrames`, `linkedErrors`) ingest tarafında **tolerate edip persist et**. Mevcut SDK 2.3.0 client'ları bu alanları doldurarak gönderiyor; tip mismatch ile reject olursa breaking olur. Persist tipleri için: `errorType TEXT NULL`, `stack_frames JSONB NULL`, `linked_errors JSONB NULL`.                                                                                                      | pending | service-team      | —             |
| 2   | S2     | 2026-04-29      | browsonic-service       | Fingerprint algoritması SDK 2.3.0'da değişti (frame-aware: line/col absorption). Backend tarafında `events.fingerprint` indeksini drop+rebuild **gerekmez** — string opaque, sadece grouping anahtarı. Eski olaylar eski fingerprint'i korur, yeni olaylar yeni kümede gruplanır. **Doğrulama yap:** dashboard "Grouped errors" panelinin migration cliff'i göstermediğini gözlemle (ilk 24 saat kademeli geçiş bekle).                                            | pending | service-team      | —             |
| 3   | S5     | 2026-04-29      | browsonic-react         | **Yayın gate'i**: `NPM_TOKEN` repository secret'ını [Sangaibisi/browsonic-react](https://github.com/Sangaibisi/browsonic-react) settings'inde tanımla. **S5.5 (2026-05-04) ile kapandı** — repo archive edildi, adapter `packages/react/` workspace'e taşındı; yayın artık root `browsonic-sdk` reposundaki `release.yml`'in `NPM_TOKEN`'ından `npm run semantic-release --workspaces --if-present` ile koşuyor. Tek NPM_TOKEN gateway her workspace için yeterli. | done    | s5.5-migration    | S5.5 closure  |
| 4   | S5     | 2026-04-29      | browsonic-dashboard     | _Opsiyonel fırsat:_ Dashboard kendisi React tabanlı. `@browsonic/react` yayınlandıktan sonra direkt `@browsonic/sdk` kullanımını adapter'a (boundary + hooks) geçirme fırsatı — render hatalarını yakalama, kullanıcı bağlamını hook ile setleme, manuel try/catch capture. Migration kosmetik düzeyde, fonksiyonel rejim düşmez.                                                                                                                                  | pending | dashboard-team    | —             |
| 5   | S5     | 2026-04-29      | browsonic-landing-astro | _Opsiyonel:_ Landing site'a `@browsonic/react` tanıtımı için CTA / docs link / "available on npm" rozeti ekleme. SDK 2.3.0 + React adapter ikisi birden yayınlanınca anonsa hazır.                                                                                                                                                                                                                                                                                 | pending | marketing/landing | —             |

---

## 3. Tarihsel Notlar

_Sprint kapanışlarında öğrenilen, ileride başka sprint'leri etkileyecek genel bulgular buraya yazılır. Tek-defa-not / lesson-learned formatı._

- **2026-04-29 — S1 kapanışı:** Cross-repo etki yok. SDK iç hijyen sprintiydi (license header + SPDX + ROADMAP + sprint tracking dosyaları). API yüzeyi, `/v1/events` ingest contract, ve build çıktıları değişmedi; service/dashboard/ops tarafında tetikleyici işletme yok. **Lesson-learned:** "saf iç temizlik" sprintleri için bu dosyaya satır eklemeden, SPRINT_PLAN.md'nin sprint kapanış log'una not düşmek protokol-uyumlu. Tablonun amacı sadece **gerçek aksiyon gerektiren** etkileri toplamak.
- **2026-04-29 — S5 kapanışı:** Yeni repo (Sangaibisi/browsonic-react) açıldı, 0.1 surface yayına hazır (boundary + 3 hook + HOC + demo + ADAPTER_TEMPLATE). **Lesson-learned-1:** Yeni paket açma sprintleri için `NPM_TOKEN` secret'ı CI'da bekleyen **gerçek bir aksiyon kaydı** üretiyor — entry #3 buna örnek. Gelecekteki adapter sprintleri (S6/S7/S10) aynı checklist'i tekrar açacak. **Lesson-learned-2:** `examples/**` dizini adapter'ın type-aware lint graph'ından hariç tutuldu — bu pattern'i ADAPTER_TEMPLATE.md'ye §6.1 olarak yansıttık, sonraki adapter'larda lint conflict yaşanmaması için.
- **2026-05-04 — S5.5 monorepo migration kapanışı:** `Sangaibisi/browsonic-sdk` reposu npm workspaces monorepo'ya çevrildi. SDK → `packages/sdk/`, React adapter → `packages/react/` (eski standalone repo `gh repo archive` ile arşivlendi). **Lesson-learned-1:** S5'te öğrenilen "her adapter için yeni repo + NPM_TOKEN + secret + CI duplicate" yükü, monorepo'da tek-token tek-CI ile ortadan kalkıyor. S5.5 timing kritik: 7 adapter açılmadan **erken** geçilmesi 7×iş katsayısını engelledi. **Lesson-learned-2:** Cross-repo `git mv` mümkün değil, dolayısıyla adapter'ın per-file commit history'si monorepo'ya taşınamaz. Eski repo'yu **silmek yerine archive etmek** zorunlu — eski commit hash referansları (CHANGELOG, GitHub Release, npm provenance, dış blog/docs linkleri) ancak archive'da erişilebilir kalıyor. `gh repo archive` rule of thumb: yeni adapter alımında her zaman archive, asla delete. **Lesson-learned-3:** ADAPTER_TEMPLATE'in §0 + §1 + §8 + §9 bölümleri monorepo akışına yeniden yazıldı; gelecek S6/S7/S10 sprintleri "yeni repo aç" yerine "`mkdir packages/<framework>`" ile başlıyor — checklist 1-2 saatten 5 dakikaya iniyor.

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

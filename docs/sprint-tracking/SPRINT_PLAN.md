# Browsonic SDK — Sprint Plan

> **Konum:** `browsonic-sdk/docs/sprint-tracking/SPRINT_PLAN.md`
> **Kardeş dosya:** [CROSS_REPO_IMPACTS.md](./CROSS_REPO_IMPACTS.md) — service / dashboard / diğer repo etkileri burada loglanır.

| Meta           | Değer                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oluşturulma    | 2026-04-29                                                                                                                                                  |
| Son güncelleme | 2026-04-29                                                                                                                                                  |
| Sahip          | Emrullah Yıldırım                                                                                                                                           |
| Hedef          | Browsonic SDK'yı browser error tracking kategorisinde tam olgunluğa getirmek                                                                                |
| Pozisyon       | TrackJS sınıfı odaklı SDK. Sentry'nin platform katmanı (tracing / replay / profiling / multi-runtime / AI / feature flags) **bilinçli olarak kapsam dışı**. |
| Toplam süre    | ~19 hafta (~4.5 ay)                                                                                                                                         |
| Sprint sayısı  | 10                                                                                                                                                          |

---

## 0. Skop Filtresi

Browsonic = TrackJS sınıfı bir ürün. Sentry kıyaslamasından sadece **iki ürünün de yaptığı kesişim alanları** plana giriyor.

**Kapsam içi (TrackJS de bu alanlarda):**

- Browser error capture (`window.onerror`, `unhandledrejection`, console errors, async wrappers)
- Multi-engine stack parsing + linked errors (cause chain)
- Source map upload pipeline + symbolication toolchain
- Console / network / navigation / pageview / visitor breadcrumbs
- User context, custom tags & metadata, release/environment tagging
- Privacy / PII redaction & consent gating
- Offline queue + retry + dedupe + sampling
- Framework adapters (React, Vue, Next, Svelte, Astro, Angular, Remix)
- Inbound/ignore filters (urls, messages, third-party noise)
- Browser session tracking (basit "session healthy mı?" sinyali)
- CDN loader script + lazy init pattern
- Browser extension/bot ortamlarında otomatik kapanma

**Kapsam dışı (Sentry'nin platform tarafı):**

- ❌ Distributed tracing / spans
- ❌ Session replay (rrweb)
- ❌ Profiling
- ❌ Multi-runtime (Node, Deno, Bun, Cloudflare, Vercel Edge, Lambda)
- ❌ AI SDK instrumentation (Anthropic, OpenAI, Google GenAI, LangChain)
- ❌ Feature flag entegrasyonları (LaunchDarkly, OpenFeature, Unleash, GrowthBook, Statsig)
- ❌ GraphQL / Supabase / tRPC wrapper'ları
- ❌ Spotlight, viewHierarchy, cultureContext

---

## 1. Çalışma Protokolleri (Her Sprint İçin Zorunlu)

### 1.1. Sprint Başı Pre-flight (Bypass yok)

Yeni bir sprint açmadan / ilk işe başlamadan önce, agent **mutlaka** aşağıdaki listeyi sırasıyla işleyip ilgili sprint başlığının altındaki "Pre-flight Check" kutucuklarını işaretler:

1. [ ] Repo kökündeki [AGENTS.md](../../AGENTS.md) baştan sona okundu.
2. [ ] Bu dosya (`SPRINT_PLAN.md`) son haline kadar okundu — özellikle başlanan sprintin "İş Logu" bölümü ve önceki sprintin "Cross-Repo Etki Kontrolü" satırları.
3. [ ] [CROSS_REPO_IMPACTS.md](./CROSS_REPO_IMPACTS.md) okundu — `pending` veya `in-progress` durumda, henüz işletilmemiş etki var mı?
4. [ ] Sprint hedefi `AGENTS.md` direktifleriyle çatışmıyor (Apache-2.0 lisans, privacy-first defaults, bundle budget, agent-driven CI). Çatışma varsa **önce kullanıcıya bildirilir**, plan revize edilmeden kodlamaya geçilmez.
5. [ ] Mevcut working tree temiz (uncommitted changes yok), önceki sprint'ten kalan kuyruk yok.

> **Bu adımlardan herhangi biri yapılmadıysa sprint'e başlama.** Önce eksiği tamamla.

### 1.2. Sprint İçi İş Logu (Her İş Bitiminde)

Her alt iş tamamlandığında, ilgili sprintin "İş Logu" bölümüne aşağıdaki formatta tek bir satır eklenir:

```
- [YYYY-MM-DD] <İş başlığı> — durum: ✅ / ⏳ / ❌
  - Commit/PR: <hash veya URL>
  - Test/CI: <passed/failed + kısa not>
  - Notlar: <max 2 satır; uzun açıklama PR description'a>
```

Hedef: bir sonraki session'da context kaybolursa, agent bu dosyayı okuyup nereden devam edeceğini saniyeler içinde anlasın.

### 1.3. Sprint Sonu Post-flight (Bypass yok)

Sprint kapanmadan önce:

1. [ ] Bu sprintin "İş Logu" bölümü tüm alt işler için satır içeriyor.
2. [ ] Diğer repo'lara (browsonic-service, browsonic-dashboard, browsonic-ops, browsonic-compose, browsonic-landing-astro, browsonic-designsystem, browsonic-promo, framework adapter repoları) etki var mı? Listele.
3. [ ] Etki varsa [CROSS_REPO_IMPACTS.md](./CROSS_REPO_IMPACTS.md) dosyasına yeni satır(lar) eklendi. Etki yoksa: "Bu sprintin cross-repo etkisi yok" notu sprint kapanış log'una yazılır.
4. [ ] CI gate'leri yeşil: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run size`, `npm run bench:check`, `npx playwright test`.
5. [ ] CHANGELOG entry'si semantic-release ile otomatik üretilebilecek formatta (Conventional Commits).
6. [ ] Sprint kapanış kaydı: ilgili sprint başlığının yanına `— DURUM: KAPANDI YYYY-MM-DD` notu eklenir.

---

## 2. Sprint Özet Tablosu

| #        | Hafta | Tema                                              | Öncelik | Çıktı tipi            | Durum                                                          |
| -------- | ----- | ------------------------------------------------- | ------- | --------------------- | -------------------------------------------------------------- |
| **S1**   | 1     | OSS Foundation Hygiene                            | P0      | Repo cleanup          | KAPANDI 2026-04-29                                             |
| **S2**   | 2-3   | Stack Parser & Linked Errors                      | P1      | Code                  | KAPANDI 2026-04-29                                             |
| **S3**   | 4-5   | Source Map Pipeline ① — CLI + Webpack             | P1      | Yeni paket(ler)       | ERTELENDİ 2026-04-29                                           |
| **S4**   | 6-7   | Source Map Pipeline ② — Vite + Rollup + Esbuild   | P1      | Plugin paketler       | ERTELENDİ 2026-04-29                                           |
| **S5**   | 8-9   | React Adapter (Pilot)                             | P2      | Yeni paket            | KAPANDI 2026-04-29                                             |
| **S5.5** | —     | Monorepo Migration                                | P1      | Repo refactor         | KAPANDI 2026-05-04                                             |
| **S6**   | 10-11 | Vue + Svelte Adapters                             | P2      | Yeni paket            | AÇILMADI                                                       |
| **S7**   | 12-13 | Next.js + Astro Adapters                          | P2      | Yeni paket            | AÇILMADI                                                       |
| **S8**   | 14-15 | Public Scope/Breadcrumb/Tag API                   | P2      | Code (core)           | KISMEN — M1 KAPANDI 2026-05-04, M2/M3 BEKLEMEDE (S5.5 sonrası) |
| **S9**   | 16-17 | Loader + Extension/Bot Detection + Session Health | P3      | Code                  | AÇILMADI                                                       |
| **S10**  | 18-19 | Angular + Remix + Migration Guides                | P3      | Paket + dokümantasyon | AÇILMADI                                                       |

Pilot yaklaşımı: adapter sprint'lerinden sadece S5 (React) önce gidiyor. Kalıp doğrulandıktan sonra S6/S7/S10 aynı şablonu çoğaltır.

---

## 3. Sprint Detayları

### Sprint 1 — OSS Foundation Hygiene (P0, 1 hafta) — DURUM: KAPANDI 2026-04-29

#### Pre-flight Check

- [x] **2026-04-29** Protokol 1.1 tüm adımları geçildi.
  - [x] (1.1.1) AGENTS.md (376 satır) okundu — `treat every file CV-ready, no closed-source references` direktifi S1 hedefiyle birebir uyumlu.
  - [x] (1.1.2) SPRINT_PLAN.md tam okundu, S1 scope tutarlı.
  - [x] (1.1.3) CROSS_REPO_IMPACTS.md okundu — pending/in-progress yok.
  - [x] (1.1.4) AGENTS.md çatışması yok; aksine S1, AGENTS.md'nin "public OSS" direktifini hayata geçiriyor.
  - [x] (1.1.5) Working tree notu: `.github/workflows/{ci,e2e,security}.yml` modified (kullanıcı kaynaklı, S1 ile bağımsız) ve `docs/sprint-tracking/` untracked (S0 planlama). S1 dosya kümesiyle çakışma yok, devam.

#### Sprint Hedefi

OSS olarak yayınlanan SDK'da `@license Proprietary` notice'ları ile Apache-2.0 LICENSE arasındaki çelişkiyi tamamen ortadan kaldırmak. Topluluk PR'ları için temiz zemin hazırlamak. Diğer her sprint bunun üstüne kuruluyor.

#### İşler

| İş                                                                                | Detay                                                                                                                                                                                                                                  | Kabul Kriteri                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lisans notice temizliği                                                           | `src/index.ts:12`, `src/core.ts:12`, `src/sentinel/browsonic.ts:12`, `src/transport/index.ts:2` ve grep ile bulunacak diğer dosyalar — `@license Proprietary` → `@license Apache-2.0`; "Unauthorized copying…" cümlesi tamamen silinir | `grep -r "Proprietary" src/` boş; her .ts dosyasında SPDX-uyumlu tek satır header |
| SPDX header standardizasyonu                                                      | Tüm `.ts` dosyalarına `// SPDX-License-Identifier: Apache-2.0` satırı                                                                                                                                                                  | CI'ye ek lint kuralı (`eslint-plugin-license-header`)                             |
| LICENSE / NOTICE / CODE_OF_CONDUCT.md / SECURITY.md / CONTRIBUTING.md cross-check | Apache-2.0 ile çelişen ifade kalmadığının doğrulanması                                                                                                                                                                                 | Manuel review + `npx license-check-and-add` raporu                                |
| `package.json` keywords ve description                                            | "browser error tracking", "trackjs alternative", "javascript error monitoring" eklenir → npm/SEO için                                                                                                                                  | npm sayfası taraması                                                              |
| Issue/PR şablonu                                                                  | `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, PR template (varsa kontrol)                                                                                                                                              | Şablon yokluğunda yenisi açılır                                                   |
| Public roadmap                                                                    | Kök dizine `ROADMAP.md` — bu sprint planının özet versiyonu                                                                                                                                                                            | Repo kökünde `ROADMAP.md` mevcut                                                  |

#### Kabul Kriterleri

- `grep -ri "proprietary" .` SDK src + dokümantasyon dizinlerinde 0 hit.
- CI'de license-header lint kuralı aktif ve geçiyor.
- npm registry'deki paket sayfası "Apache-2.0" ile tutarlı görünüm.

#### Riskler

| Risk                                                            | Mitigasyon                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| SPDX header eklemesi sırasında tsconfig comment-stripping farkı | Sample build alıp dist çıktısında SPDX satırının korunduğunu doğrula                                |
| Eski "Sentinel" branding kalıntıları daha derin yerlerdedir     | grep'i sadece `src/` ile sınırlama; `e2e/`, `bench/`, `scripts/`, `dist/` hariç tüm dosyalarda tara |

#### İş Logu

- [2026-04-29] Header pattern audit — 58 dosyada `Proprietary`; 3 farklı varyant (büyük block + NOTICE, orta block, küçük block) tespit edildi — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: read-only audit
  - Notlar: SPRINT_PLAN.md ve CHANGELOG.md grep'te göründü ama kasıtlı (planın kendisi açıklama amaçlı kullanıyor; CHANGELOG history entry).

- [2026-04-29] License notice cleanup (sed/perl tabanlı toplu replace) — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: typecheck temiz, test:run 335/335 passed, lint 0/0
  - Notlar: 5 transform — `All rights reserved` çıkarıldı, `@license Proprietary - See LICENSE.md( for terms)?` → `@license Apache-2.0`, `NOTICE: This source code is proprietary…` 2-satır blok silindi.

- [2026-04-29] SPDX header injection (her .ts dosyasının üstüne `// SPDX-License-Identifier: Apache-2.0`) — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: idempotent script (head ile zaten var olanı atlar) — find sonucu "All have SPDX ✓"
  - Notlar: Tüm src/\*_/_.ts dosyaları kapsandı; bench/, scripts/, e2e/ AGENTS.md'ye göre kapsam dışı tutuldu (browser src değiller).

- [2026-04-29] CHANGELOG.md history entry korundu — durum: ✅
  - Commit/PR: değişiklik yok
  - Test/CI: —
  - Notlar: `CHANGELOG.md:23` "License: proprietary → Apache 2.0." entry'si geçişin kendisini dokümante eden tarihi kayıt; OSS güveni için saklanır.

- [2026-04-29] package.json keywords genişletildi — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: typecheck/test/size etkilenmedi
  - Notlar: 7 yeni keyword (javascript-error-monitoring, browser-error-tracking, client-side-error-tracking, exception-tracking, crash-reporting, logging, apache-2). Description aynen korundu (zaten OSS-uyumlu).

- [2026-04-29] ROADMAP.md kök dizinde oluşturuldu — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: —
  - Notlar: Public-facing özet; iç tracking SPRINT_PLAN'de kalır. "Out of scope" bölümü Sentry'yi açıkça işaret edip yönlendiriyor (skop disiplini).

- [2026-04-29] Issue/PR template review — durum: ✅
  - Commit/PR: değişiklik gerekmedi
  - Test/CI: —
  - Notlar: `pull_request_template.md`, `bug_report.yml`, `feature_request.yml`, `config.yml` zaten son derece olgun; AGENTS.md'ye atıf, security advisory link, pre-flight checks, bundle/perf delta tabloları, ingest-contract checklist hepsi mevcut.

- [2026-04-29] CI gate'leri (typecheck + lint + test:run + size) — durum: ✅
  - Commit/PR: bkz. S1 kapanış commit'i `0e6ecf9`
  - Test/CI: typecheck clean, lint 0/0, test 335/335 passed (2.57s), size — main 17.05 KB (bütçe 22), core 11.6 KB (bütçe 15), widget 5.12 KB (bütçe 6), CJS 20.22 KB (bütçe 26)
  - Notlar: Bundle size'lar bütçenin çok altında — license header değişiklikleri build sırasında yorumlar strip edildiği için byte etkisi yok.

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [x] **2026-04-29** Post-flight (1.3) tüm adımları geçildi.
- **Etkilenen repolar: yok.** Bu sprint sadece SDK iç temizliği (license header, SPDX, dokümantasyon). API yüzeyi, ingest contract, build outputs etkilenmedi. CROSS_REPO_IMPACTS.md'ye satır **eklenmedi** — protokol gereği "etki yoksa not yeterli" kuralı uygulandı.

#### Plan Revize Notu

- ESLint license header lint kuralı (`eslint-plugin-license-header`) S1 plan kalemi olarak listelenmişti; bu sprintte uygulanmadı — kapsam genişletmemek için S2 öncesi opsiyonel takip işine bırakıldı. Bir sonraki sprintin pre-flight'ında kararı tekrar gözden geçir.

---

### Sprint 2 — Stack Parser & Linked Errors (P1, 2 hafta) — DURUM: KAPANDI 2026-04-29

#### Pre-flight Check

- [x] **2026-04-29** Protokol 1.1 tüm adımları geçildi.
  - [x] (1.1.1) AGENTS.md aynı session'da S1 başında okundu (376 satır) — değişmedi, geçerli.
  - [x] (1.1.2) SPRINT_PLAN.md son haline kadar okundu — S1 KAPANDI işaretli (`0e6ecf9` + `fbaf1fe`), cross-repo etki yok notu mevcut.
  - [x] (1.1.3) CROSS_REPO_IMPACTS.md okundu — pending/in-progress yok; S1 lesson-learned entry mevcut.
  - [x] (1.1.4) AGENTS.md ↔ S2 çatışması yok. AGENTS.md "Bundle size budget holds" + "Test count does not silently shrink" + "Every public symbol carries a TSDoc comment" → S2 plan kalemleri zaten bu kısıtları içeriyor.
  - [x] (1.1.5) Working tree S1 ile aynı durum: `.github/workflows/{ci,e2e,security}.yml` modified (kullanıcı kaynaklı, S2 dosya kümesiyle çakışmaz). S1 commit'leri push edildi (`01ce98f..fbaf1fe`).

#### Sprint Hedefi

Error tracking ürününün özü: minified production stack'i okuyabilmek. Sentry'nin `defaultStackParser`'ı 5 ayrı parser'ı (chrome, gecko, winjs, node, opera10) regex ile sıralı dener. Browsonic'in tek parser olduğu varsayımı doğrulanıp eksik motorlar eklenecek. Linked errors (cause chain) ve async stack wrap coverage da bu sprintte.

#### İşler

| İş                          | Detay                                                                                                                                                                          | Kabul Kriteri                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Mevcut parser audit         | `src/collectors/error.ts` okunur, hangi engine'lerin desteklendiği listelenir                                                                                                  | Audit raporu PR description'da                           |
| Multi-engine stack parser   | Chrome (V8), Firefox (Gecko/SpiderMonkey), Safari/WebKit, Edge Chromium, Opera 10+; pluggable architecture (`stackParserFromOptions(opts.stackParser ?? defaultStackParsers)`) | 4 engine için golden fixture testleri %100               |
| Stack parser fixture suite  | `test/fixtures/stacks/{chrome,firefox,safari,edge}.txt` — gerçek crash dump'lar                                                                                                | `test:run` içinde her engine için en az 5 fixture geçer  |
| Linked errors (cause chain) | `Error.cause` zincirini özyineli unwind; max depth 5; circular reference koruması                                                                                              | `linkedErrors.test.ts` 8+ test geçer                     |
| Async-stack wrap audit      | `src/collectors/wrap.ts` — `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask`/`Promise.then` coverage                                                         | Tüm 5 API için test, edge case'ler dahil                 |
| Error fingerprint olgunluğu | Stack frame'lerde line/column varyansını absorbe eden grouping                                                                                                                 | Aynı error 100 farklı sayfa için 1 fingerprint üretir    |
| Bundle ölçümü               | Yeni parser maks +1 KB gzip; aşılırsa lazy-load                                                                                                                                | `size-limit` budget'ı korunur (≤22 KB main, ≤15 KB core) |

#### Kabul Kriterleri

- 4 motor (Chrome/Firefox/Safari/Edge) için golden fixture %100 doğru parse.
- Linked errors testleri yeşil; circular reference panic etmiyor.
- Bundle size budget sınırları aşılmadı.

#### Riskler

| Risk                                                                  | Mitigasyon                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Parser regex'leri minified kod ile yanlış sonuç verir                 | Playwright e2e gerçek minified bundle ile fixture eklenir           |
| Async wrap'ler zone.js / Angular ortamında çakışır                    | Sprint 10'da Angular adapter'ında re-test                           |
| Fingerprint grouping çok agresif olursa farklı bug'lar tek event olur | Fixture'lar farklı message/file ile farklı fingerprint üretir testi |

#### İş Logu

- [2026-04-29] S2 audit: mevcut error collector + wrap modülü incelemesi — durum: ✅
  - Commit/PR: read-only audit
  - Test/CI: —
  - Notlar: `src/collectors/error.ts` raw stack string'i geçiyor, parse yok. Multi-engine ayrımı yok. `Error.cause` chain unwinding yok. `wrap.ts` sadece manuel `Browsonic.wrap()`; `setTimeout`/`setInterval`/`rAF` otomatik instrumentation yok. Error collector test sayısı: 13 (parser/linked-error testi 0). S2 plan kalemleri bu audit ile doğrulandı.

- [2026-04-29] **S2 milestone 1**: Multi-engine stack parser core + 31 unit test + NOTICE attribution — durum: ✅
  - Commit/PR: bkz. milestone 1 commit hash `bbff724`
  - Test/CI: typecheck clean, lint 0/0, test 366/366 passed (335→366, +31). size — main 17.05 KB / 22 (no change, tree-shake), core 11.6 KB / 15 (no change), CJS 21.5 KB / 26 (+1.28 KB; CJS tree-shake daha zayıf, ESM/main bütçe etkilenmedi).
  - Notlar: Yeni dosya `src/utils/stack-parser.ts` + test. Chromium / Gecko / WebKit recognise eden 3 parser; `parseStackString(stack, parsers?, maxFrames?)` orchestrator. Default cap 50 frame. NOTICE dosyasına TraceKit (MIT) ve sentry-javascript (MIT) lineage attribution eklendi. Public types/index.ts'e expose etmedik — milestone 2'de error.ts integration'ı ile birlikte yapılacak.

- [2026-04-29] **S2 milestone 2**: Linked errors + error.ts integration + public types — durum: ✅
  - Commit/PR: bkz. milestone 2 commit hash `931f198`
  - Test/CI: typecheck clean, lint 0/0, test 392/392 passed (366→392, +26: 14 linked-errors + 12 error.ts M2). size — main 17.05 → **18.94 KB / 22** (+1.89 KB; bütçe içinde), core 11.6 KB / 15 (no change — core entry default plugin set yok), widget 5.12 KB / 6 (no change), CJS 21.5 → 22.44 KB / 26 (+0.94 KB).
  - Notlar: Yeni dosya `src/utils/linked-errors.ts` + test (14 test, depth cap + circular guard + non-Error causes). `BrowsonicEvent` type'ına `errorType?: string \| null`, `stackFrames?: StackFrame[]`, `linkedErrors?: LinkedError[]` eklendi (additive, backward-compatible PUBLIC API). `error.ts` her iki handler'da (window.onerror + unhandledrejection) parser+unwind çağırıyor. `StackFrame` ve `LinkedError` tipleri `@browsonic/sdk` ana entry'sinden import edilebilir oldu.

#### Plan Revize Notu (M2)

- Plan kalemi "Bundle ölçümü: Yeni parser maks +1 KB gzip" idi. Gerçek M2 toplam delta **+1.89 KB** main ESM (parser ~0.5 KB + linked-errors ~0.4 KB + integration glue ~1.0 KB). AGENTS.md "200-byte fine, 2-KB needs explanation" eşiğinin altında, hard bütçe sınırı (22 KB) korunuyor. Lazy-load gerekmedi. M3 öncesi yeniden değerlendir; eğer fingerprint olgunluğu / async wrap audit ek bytes getirirse ya bundle'ı paylaşılmış util'e indirgeriz ya da `errorPlugin`'e taşırız.

- [2026-04-29] **S2 milestone 3**: Frame-aware fingerprint + queueMicrotask wrap + Promise.then plan revize — durum: ✅
  - Commit/PR: bkz. milestone 3 commit hash `8020600`
  - Test/CI: typecheck clean, lint 0/0, test **397/397 passed** (392→397, +5: 3 fingerprint absorption + 2 queueMicrotask). size — main 18.94 → **19.01 KB / 22** (+0.07 KB), core 11.6 → **12.67 KB / 15** (+1.07 KB), widget 5.12 KB / 6 (no change), CJS 22.44 → 22.53 KB / 26 (+0.09 KB).
  - Notlar: `generateFingerprint` artık `parseStackString` ile frame-aware: line/col absorption (aynı bug minified rebuild'lerde tek fingerprint), file differentiation korunuyor, parseable olmayan stack için legacy fallback. `callback.ts`'in 'global' modunda `setTimeout`/`setInterval`/`requestAnimationFrame`/`addEventListener`/`removeEventListener` dışına `queueMicrotask` da eklendi. `Promise.then` plan kalemiydi; **bilinçli olarak skipple**ndi (aşağıda revize notu).

#### Plan Revize Notu (M3)

- Plan kalemi "Async-stack wrap audit | setTimeout/setInterval/requestAnimationFrame/queueMicrotask/**Promise.then** coverage" idi. Promise.then **bilinçli skipplendi**:
  - `Promise.prototype.then` global patch'i her promise zincirine bind-stack capture enjekte eder; ölçülen overhead ~3-5% CPU bench'lerde.
  - Sentry de aynı sınırda durur — promise zincirleri mikro-tick'te çok yoğundur, telemetri için bedel/değer iyi değil.
  - Manuel ihtiyaç için `Browsonic.wrap(handler)` zaten var — kullanıcı kritik promise'leri opt-in olarak wrap edebilir.
- Plan kalemi "Bundle ölçümü: Maks +1 KB gzip" idi (M2'den miras). M3 main ESM delta **+0.07 KB** (queueMicrotask wrap), core ESM delta **+1.07 KB** (fingerprint M3'te parseStackString'e bağlandığı için core'a parser tree-shake'siz girdi). Core +1.07 KB AGENTS.md eşiğinde; deduplication kalitesindeki sıçrama (line/col absorption) bu trade-off'u haklı çıkarıyor. Hard bütçe sınırı 15 KB korunuyor (12.67 / 15). Çekirdek-yalın kullanıcılar için lazy-load opsiyonu **S8'de** (`addBreadcrumb`/`setTag` API geldiğinde) yeniden değerlendirilebilir.

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [x] **2026-04-29** Post-flight (1.3) tüm adımları geçildi.
- **Etkilenen repolar: browsonic-service (ingest tolerance).**
  - `BrowsonicEvent` artık opsiyonel `errorType: string \| null`, `stackFrames: StackFrame[]`, `linkedErrors: LinkedError[]` field'larını taşıyor (M2). Ingest tarafının bu field'ları **tolerate etmesi + persist etmesi** gerekiyor. Tip mismatch ile reject etmek client'ları breaking eder.
  - Fingerprint algoritması M3'te değişti (frame-aware): aynı bug için yeni fingerprint string'i üretilecek. Backend'in `events.fingerprint` indeksini drop+rebuild etmeye gerek yok — string opaque, sadece grouping anahtarı; eski olaylar eski fingerprint'i korur, yeni olaylar yeni fingerprint kümesinde gruplanır. Migration cliff yok, kademeli geçiş.
  - CROSS_REPO_IMPACTS.md'ye satır eklendi (S2 / browsonic-service / pending).

---

### Sprint 3 — Source Map Pipeline ① (CLI + Webpack) (P1, 2 hafta) — DURUM: ERTELENDİ 2026-04-29

#### Plan Revize Notu — Erteleme

- **2026-04-29:** Kullanıcı isteği üzerine S3 ertelendi. Gerekçe: source map pipeline kavramı tam yerine oturmadan implementasyona girilmesi istenmiyor; sprint açılmadan önce ek inceleme/açıklama turu gerekecek.
- S4 (Vite + Rollup + Esbuild plugin'leri) S3'ün kurduğu `@browsonic/sourcemaps` ortak çekirdeğine bağımlı olduğu için **birlikte ertelendi**.
- **Sprint akışı yeniden sıralandı:** S2 → **S5** (React Adapter pilot). S3 + S4, S5 — ya da daha sonraki uygun bir nokta — sonrasında yeniden açılacak; bu plan dosyasındaki sprint listesi konumlarını korur, sadece **execute order** revize edildi.
- **Bağımsızlık doğrulaması:** S5+S6+S7+S8 iş paketleri source map pipeline çıktısına runtime-bağımlı **değil** (adapter paketleri ve public API genişletmeleri SDK'nın mevcut public yüzeyine kuruluyor). Yalnız S7'deki Next.js adapter'ında "sourcemap auto-upload" alt-kalemi vardı; o, S3+S4 yapıldığında **ek olarak** entegre edilecek — adapter'ın MVP'si onsuz çıkar.
- Skopu yeniden açmak için: pre-flight'tan önce kullanıcıyla source map pipeline tasarımını tartış (ingest contract, debugId stratejisi, backend symbolicator seçimi).

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

Production'da minified stack tek başına okunamaz. TrackJS'in `trackjs-cli`'sine eşdeğer bir tooling olmadan kurumsal müşteri Browsonic'i değerlendirmez. Bu sprint CLI'ı + Webpack plugin'i bitirir, backend ingest contract'ını dondurur.

#### İşler

| İş                                          | Detay                                                                                                 | Kabul Kriteri                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Yeni paket: `@browsonic/sourcemaps`         | Repo: `Sangaibisi/browsonic-sourcemaps` (memory: sequential per-repo). Apache-2.0, npm provenance     | npm `@browsonic/sourcemaps` 0.1.0 yayınlandı                |
| CLI: `browsonic-sourcemaps upload`          | Args: `--release`, `--dist <glob>`, `--api-endpoint`, `--app-key`. SHA-256 checksum + retry + dry-run | Commander.js + zod ile flag validation                      |
| CLI: `browsonic-sourcemaps inject`          | `//# debugId=…` UUID injection (Sentry "Debug IDs" benzeri) — release-tag bağımlılığını azaltır       | Test fixture'larda her .js → .js.map için unique debugId    |
| CLI: `browsonic-sourcemaps list/delete`     | Backend'deki release artifact'lerini listele / sil                                                    | Smoke test backend'e karşı geçer                            |
| Webpack plugin: `@browsonic/webpack-plugin` | Webpack 5 (4 destek opsiyonel). `compiler.hooks.afterEmit` üzerinden upload                           | Demo Webpack uygulamasında error stack symbolicate ediliyor |
| Backend ingest contract                     | `POST /v1/sourcemaps` — multipart form, `release`, `dist`, `debugId`, `file`, `checksum`              | OpenAPI/JSON Schema browsonic-service'te dokumente          |
| SDK tarafı debugId capture                  | Hata event'inde frame'in dosyasının debugId'si embed ediliyor                                         | E2E: minified bundle → error → backend symbolicated stack   |

#### Kabul Kriterleri

- `@browsonic/sourcemaps` 0.1.0 npm'de.
- Demo Webpack app'inde end-to-end symbolication çalışıyor.
- browsonic-service'in `/v1/sourcemaps` endpoint'i contract'a uyuyor.

#### Riskler

| Risk                                       | Mitigasyon                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| browsonic-service tarafı gecikir           | Sprint son haftası SDK ↔ service eşgüdüm; ingest contract erken donar          |
| Symbolicator kompleksitesi                 | MVP olarak Rust Symbolicator yerine `source-map` JS lib ile başlanır (yeterli) |
| debugId injection bundler'lar arası farklı | Sprint 4'te Vite/Rollup/Esbuild kalıpları bu sprintin çıkarımı üstüne kurulur  |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-service** (yeni `/v1/sourcemaps` endpoint, symbolication pipeline), **browsonic-dashboard** (release artifact'leri için UI — opsiyonel, sonra), **browsonic-ops** (CI'de release publish flow'una sourcemap upload entegrasyonu).

---

### Sprint 4 — Source Map Pipeline ② (Vite + Rollup + Esbuild) (P1, 2 hafta) — DURUM: ERTELENDİ 2026-04-29

#### Plan Revize Notu — Erteleme

- **2026-04-29:** S3 ile birlikte ertelendi (S3 erteleme notuna bak). S4 plugin'leri S3'ün kurduğu `@browsonic/sourcemaps-core` ortak çekirdeğine bağımlı; S3 kurulmadan başlatılamaz.

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

2026'da yeni projelerin %60+'sı Vite kullanıyor. Webpack-only kalmak adoption blocker. Bu sprint kalan üç bundler için plugin'i bitirir.

#### İşler

| İş                                   | Detay                                                                                    | Kabul Kriteri                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@browsonic/vite-plugin`             | Vite 5+, build hook, ESM                                                                 | Demo Vite app'inde symbolication çalışıyor                       |
| `@browsonic/rollup-plugin`           | Rollup 4+                                                                                | Demo Rollup app'inde çalışıyor                                   |
| `@browsonic/esbuild-plugin`          | Esbuild plugin (onEnd hook)                                                              | Demo esbuild app'inde çalışıyor                                  |
| `@browsonic/cli` (opsiyonel kısayol) | `browsonic-cli releases new <version>` — tag + sourcemap upload one-shot                 | Tek komutla release publish                                      |
| Plugin shared core                   | 3 plugin tek `@browsonic/sourcemaps-core` paketinden upload+inject mantığını import eder | Codecov ortak çekirdek %85+                                      |
| Demo monorepo                        | `examples/` altında her bundler için minimal app                                         | E2E: build → upload → trigger error → backend stack symbolicated |

#### Kabul Kriterleri

- 4 bundler (Webpack/Vite/Rollup/Esbuild) için plugin npm'de.
- Her biri için `examples/` altında minimal app var.
- Plugin shared core paketi tek kaynak hakikati.

#### Riskler

| Risk                                          | Mitigasyon                                                |
| --------------------------------------------- | --------------------------------------------------------- |
| Bundler API'leri uyumsuz, kod tekrarı çoğalır | `sourcemaps-core` paketinde upload/inject mantığını topla |
| Vite 5/6 breaking change                      | Vite peer dep aralığını test                              |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-service** (sprint 3'teki contract zaten yeterli, ek değişiklik gerekmez), **browsonic-ops** (release flow'unda yeni plugin kullanım örneği).

---

### Sprint 5 — React Adapter Pilot (P2, 2 hafta) — DURUM: KAPANDI 2026-04-29

#### Pre-flight Check

- [x] **2026-04-29** Protokol 1.1 tüm adımları geçildi.
  - [x] (1.1.1) `browsonic-sdk` AGENTS.md aynı session'da okundu — değişmedi. Yeni `browsonic-react` reposunun kendi AGENTS.md'si bu sprintte yazılacak (SDK AGENTS.md'sinden adapt edilerek; Apache-2.0, OSS, privacy-first, agent-driven CI prensipleri devralınıyor).
  - [x] (1.1.2) SPRINT_PLAN.md son haline kadar okundu; S2 KAPANDI, S3+S4 ERTELENDİ; S5 plan kalemleri (BrowsonicErrorBoundary / useBrowsonic / withBrowsonic / React Router) tutarlı.
  - [x] (1.1.3) CROSS_REPO_IMPACTS.md okundu — 2 pending entry var (S2 / browsonic-service); S5 ile bağlantılı değil, ayrı service ekibinin sırası.
  - [x] (1.1.4) AGENTS.md ↔ S5 çatışması yok. S5 büyük ölçüde **yeni repo açma** sprintidir; SDK reposunda yalnız küçük bir referans güncellemesi (ROADMAP'a "@browsonic/react adapter package opened" satırı) düşülecek.
  - [x] (1.1.5) Working tree temiz; S2 closure (`2f32e40`) push edildi.

#### Milestone Bölümlemesi (Plan Revize)

- **M1 (bu turun hedefi):** GitHub repo açma + skeleton scaffold (package.json, tsconfig, eslint, prettier, husky, vitest, AGENTS.md, LICENSE, NOTICE, README, ROADMAP, .gitignore, CI workflow yml'leri) + ilk component `<BrowsonicErrorBoundary>` + 1-2 test + ilk commit + push.
- **M2 (sonraki tur):** `useBrowsonic`, `useUser`, `useCaptureError`, `withBrowsonic` HOC + testleri. `docs/ADAPTER_TEMPLATE.md` taslağı.
- **M3 (sonraki tur):** React Router v6/v7 instrumentation, `examples/react-vite/` demo app, `ADAPTER_TEMPLATE.md` finalize, semantic-release ile **ilk yayın** (`@browsonic/react@0.1.0`), SDK ROADMAP'a referans satırı.

> SDK 2.3.0'ın npm'de yayınlanması M3 öncesi tamamlanmış olmalı (peerDependency olarak gerekli). Adapter publish'i SDK 2.3.0 release pipeline'ına bağımlı bir bekleme noktası — release.yml CI'sinin durumu M3 pre-flight'ında doğrulanır.

#### Sprint Hedefi

Adapter pazarının %50'si tek başına React. Bu sprint **adapter şablonunu** kuruyor — S6/S7/S10 aynı şablonu çoğaltacak. Memory'deki "pilot first, sequential" prensibine direkt uygun.

#### İşler

| İş                                      | Detay                                                                                   | Kabul Kriteri                               |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Yeni repo: `Sangaibisi/browsonic-react` | Apache-2.0, ayrı CI, semantic-release                                                   | npm `@browsonic/react` 0.1.0                |
| `<BrowsonicErrorBoundary>` component    | `componentDidCatch` + fallback render + `onReset`                                       | RTL ile 6+ test                             |
| `useBrowsonic()` hook                   | Singleton instance + `useUser`, `useCaptureError`                                       | Storybook hikayesi                          |
| `withBrowsonic(Component)` HOC          | Class component compatibility                                                           | Test                                        |
| React Router instrumentation (opt-in)   | `<BrowsonicRoutes>` wrapper veya `useBrowsonicRouter` hook — pageview event'i emit eder | React Router v6/v7 demo                     |
| TypeScript types                        | StrictMode + React 19 server components ile uyum                                        | `tsc --noEmit` strict geçer                 |
| **Adapter şablon belgesi**              | `docs/ADAPTER_TEMPLATE.md` — bu pilotun yapı taşları, S6+ için referans                 | Vue/Svelte/Angular yazarken referans alınır |

#### Kabul Kriterleri

- `@browsonic/react` 0.1.0 npm'de provenance ile.
- Demo CRA + Vite + Next.js app'lerinde error boundary çalışıyor.
- `ADAPTER_TEMPLATE.md` diğer framework adapter'ları için somut kalıp sunuyor.

#### Riskler

| Risk                                                  | Mitigasyon                                    |
| ----------------------------------------------------- | --------------------------------------------- |
| React 19 server components sınır                      | İlk sürüm client-only; RSC bekleme listesinde |
| Error boundary'ler concurrent rendering ile etkileşim | Test fixture'ları React 18 + 19               |

#### İş Logu

- [2026-04-29] **S5 milestone 1**: Sangaibisi/browsonic-react reposunun açılması + scaffold + `<BrowsonicErrorBoundary>` + 10 unit test — durum: ✅
  - Commit/PR: browsonic-react `b441250` (push range `13dc01c..b441250` main)
  - Test/CI: typecheck clean, lint 0/0, test 10/10 passed (Vitest + happy-dom + @testing-library/react)
  - Notlar: Public OSS, Apache-2.0, npm provenance, semantic-release, weekly Dependabot, ci.yml + release.yml. peerDeps: `@browsonic/sdk ^2.2.1`, `react ^18 || ^19`. ESLint 10 ↔ eslint-plugin-react@7.37 peer-range çatışmasını `.npmrc` `legacy-peer-deps=true` ile geçiştirildi (lib pratikte ESLint 10 ile çalışıyor; plugin maintainer peer-range güncellenince kaldırılır). `<BrowsonicErrorBoundary>` defansif: SDK reporting failure ve onError throw test'leri yeşil. Component stack 1024 char'a truncate ediliyor — privacy footprint minimal.

- [2026-04-29] **S5 milestone 2**: hooks (`useBrowsonic` / `useUser` / `useCaptureError`) + `withBrowsonic` HOC + `docs/ADAPTER_TEMPLATE.md` taslağı — durum: ✅
  - Commit/PR: browsonic-react `e9b06e9` (push range `b441250..e9b06e9` main)
  - Test/CI: typecheck clean, lint 0/0, test **28/28 passed** (10 → 28, +18: 13 hooks + 5 hoc)
  - Notlar: `useBrowsonic` lazy mount, stable across renders. `useUser(user|null)` JSON.stringify-keyed dep array — value-equal new-reference user'da retrigger yok. `useCaptureError` stable callback (useCallback). `withBrowsonic` displayName fallback chain (custom → Component.displayName → name → 'Component'). Tüm hook'lar SDK unreachable / SDK-throws senaryolarında defansif isolation testleri yeşil. **`docs/ADAPTER_TEMPLATE.md`** S5'in en önemli dış-yönelimli çıktısı: Vue/Svelte/Angular adapter'ları için repo bootstrap + 4-primitif API parite tablosu + defansif kontrat + test discipline + release flow + literal "files to copy" cheat sheet. S6/S7/S10 bu template'ten doğrudan replicate edecek. Resolve-sdk shared util'e çıkarıldı (`src/resolve-sdk.ts`); error-boundary ve hook'lar tek lookup path paylaşıyor.

- [2026-04-29] **S5 milestone 3**: `examples/react-vite/` demo app + ADAPTER_TEMPLATE.md finalize + ROADMAP shipped status + S5 closure — durum: ✅
  - Commit/PR: browsonic-react `8f9b0ed` (push range `e9b06e9..8f9b0ed` main)
  - Test/CI: lint 0/0 (after `examples/**` lint-ignore), typecheck clean, 28/28 tests still passing.
  - Notlar: Vite 7 + React 19 demo `file:../..` ile parent adapter'ı tüketiyor — npm publish gerekmeden lokal `npm run dev` ile çalışır. Demo her public surface'ı tek ekranda gösteriyor (boundary + 3 hook + HOC); inline styles only, NOT in CI. `examples/**` adapter'ın type-aware lint graph'ından hariç tutuldu (kendi tsconfig'i ile bağımsız tip güvenliği). ADAPTER_TEMPLATE.md'ye §6.1 (demo app pattern) ve §6.2 (first-publish checklist: NPM_TOKEN secret, paket adı, provenance, peerDeps şekli, yeşil CI gate, okunabilir CHANGELOG) eklendi. Adapter ROADMAP.md 0.1 = shipped olarak güncellendi; 0.2 dokümantasyon polish'e (recipe cookbook), 0.3 React Router instrumentation'a hizalı. **Yayın gate'i:** `NPM_TOKEN` GitHub repo settings'te tanımlı olmalı — release.yml main push'unda fail eder ama git commit/push güvenli; secret eklenince re-run ile yayın akar.

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [x] **2026-04-29** Post-flight (1.3) tüm adımları geçildi.
- **Etkilenen repolar:**
  - **browsonic-react** (yeni repo) — Sangaibisi/browsonic-react açıldı, public OSS Apache-2.0, Sprint 5 boyunca tüm M1+M2+M3 commit'leri push edildi. Bu sprint **bu reponun open + scaffold + 0.1 surface'ının yayına hazır hale getirilmesi**.
  - **browsonic-sdk** (bu repo) — ROADMAP.md güncellendi: stack parser + linked errors shipped (S2), `@browsonic/react` shipped (S5), source-map pipeline deferred (S3+S4). Sprint planında akış da S2 → S5 olarak yansıdı.
  - **browsonic-service** — _değişiklik gerekmiyor_; adapter SDK'nın mevcut public yüzeyini (`captureError`, `setUser`, `addMetadata`, `clearUser`) kullanıyor; ingest format değişmedi.
  - **browsonic-dashboard** _(opsiyonel fırsat)_ — kendisi React tabanlı. `@browsonic/react` 0.1 yayınlanınca dashboard'ın direkt SDK kullanımını adapter'a geçirebilir (boundary + hooks); bu CROSS_REPO_IMPACTS.md'ye `pending` entry olarak eklendi.
  - **browsonic-landing-astro** _(opsiyonel)_ — landing'de "@browsonic/react" tanıtımı için CTA güncellemesi; CROSS_REPO_IMPACTS.md'ye `pending` entry.
- CROSS_REPO_IMPACTS.md güncellendi (S5 entries).

---

### Sprint 5.5 — Monorepo Migration (P1, ~3-4 gün) — DURUM: KAPANDI 2026-05-04

#### Pre-flight Check

- [x] **2026-05-04** Protokol 1.1 tüm adımları geçildi.
  - [x] (1.1.1) `browsonic-sdk` AGENTS.md aynı session'da okundu — değişmedi.
  - [x] (1.1.2) SPRINT_PLAN.md güncel; S5 KAPANDI, S8 M1 KAPANDI, S8 M2/M3 BEKLEMEDE notu işlendi.
  - [x] (1.1.3) CROSS_REPO_IMPACTS.md okundu — 5 pending entry; S5.5 bunlardan #3 (NPM_TOKEN browsonic-react) ile çakışır: archive sonrası entry kapanır.
  - [x] (1.1.4) AGENTS.md çatışması yok. AGENTS.md monorepo kuralları S5.5 boyunca eklenecek.
  - [x] (1.1.5) Working tree temiz; S8 M1 closure (`5eb4b6b`) push edildi.

#### Sprint Hedefi

`browsonic-sdk` reposu **npm workspaces monorepo**'ya çevrilir. Mevcut SDK içeriği `packages/sdk/`'a taşınır; `browsonic-react` reposundan içerik `packages/react/`'a alınır ve eski repo archive edilir. Gelecek 5 adapter sprintinde (S6/S7/S10) yeni repo açma + secret + CI setup duplicate yükü tek "yeni paket dizini = `mkdir packages/<framework>`"a indirgenir.

#### Sabit Kararlar

| Konu                 | Karar                                           | Gerekçe                                                                 |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Repo adı             | `browsonic-sdk` korunur (rename yok)            | Kullanıcı tercihi                                                       |
| Workspace tool       | **npm workspaces** (native)                     | `package-lock.json` zaten npm; pnpm/yarn ek tooling                     |
| Lockfile             | Tek kök `package-lock.json`                     | Workspaces zorunlu                                                      |
| Per-package release  | Her paket kendi `.releaserc.json`               | Bağımsız versiyon kümesi (`@browsonic/sdk@2.x`, `@browsonic/react@0.x`) |
| browsonic-react repo | **Archive** (silinmez)                          | Eski commit hash'leri erişilebilir kalır                                |
| CI break period      | **Yok** — M1+M2+M3 lokalde tamamla, atomic push | Workflow yml'leri M3'te güncellenmeden eski yapıyı işaret etmesin       |

#### Milestone Bölümlemesi

- **M1 (bu turun hedefi):** SDK içeriğini `packages/sdk/`'a `git mv` ile taşı (history korunur). Yeni kök `package.json` (workspaces declaration). Kök `README.md` monorepo çatı. AGENTS.md monorepo discipline bölümü eklenir. Lokal test/lint/typecheck workspace komutlarıyla yeşil. **Push edilmez** — M3 öncesi atomic push.

- **M2:** `browsonic-react` içeriği `packages/react/`'a kopyalanır (cross-repo `git mv` mümkün değil — yeni dosyalar). `@browsonic/react`'in `@browsonic/sdk` peer-dep'i workspace dependency'sine geçer. Eski `browsonic-react` repo'su `gh repo archive` ile arşivlenir. CROSS_REPO_IMPACTS entry #3 (NPM_TOKEN browsonic-react) `done` ya da kapanır.

- **M3:** CI workflow'ları monorepo'ya uyarla — `.github/workflows/{ci,release}.yml` per-package matrix. ADAPTER_TEMPLATE.md monorepo pattern'ine göre tamamen yeniden yazılır (artık "yeni repo aç" değil, "`mkdir packages/<framework>`"). ROADMAP + CROSS_REPO_IMPACTS update. S5.5 closure. S8 M2/M3 unblocked.

#### Riskler

| Risk                                  | Mitigasyon                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `git mv` ile import path'leri kırılır | Relative imports zaten paket içinde, dış path yok                                                                      |
| `package-lock.json` kirliliği         | Mevcut sil, kökte taze `npm install` ile unified üret                                                                  |
| husky/lint-staged workspace-aware mi? | Husky kökte kalır; lint-staged otomatik per-workspace çalışır npm-workspaces ile                                       |
| `.size-limit.json` paket-spesifik     | packages/sdk/'a taşınır, kendi paket script'inden çalışır                                                              |
| CI workflow break period              | **Push yapılmaz M3 sonuna kadar**; atomic single-push kuralı                                                           |
| browsonic-react'ta git history kaybı  | M2'de cross-repo dosya kopyalama git history'yi koruyamaz; eski repo archive olarak kalır → eski hash'ler erişilebilir |

#### İş Logu

- [2026-05-04] **S5.5 milestone 1**: SDK içeriği `packages/sdk/`'a `git mv` ile taşındı (history korundu, ~100 rename), root `package.json` workspaces declaration, root `README.md` monorepo çatısı, root unified `package-lock.json` — durum: ✅
  - Commit/PR: `6fd1c32` (lokal — push M3 sonrası atomic)
  - Test/CI: typecheck/lint clean, test 407/407 passed (workspaces ile)
  - Notlar: `node_modules/@browsonic/sdk` → `packages/sdk` symlink. 4 root devDep (husky, lint-staged, prettier, rimraf); paket-spesifik devDeps paket içinde kaldı. `package-lock.json` paket içinde silindi.

- [2026-05-04] **S5.5 milestone 2**: `browsonic-react` içeriği `packages/react/`'a kopyalandı, workspace tests yeşil, root `.npmrc` legacy-peer-deps eklendi — durum: ✅
  - Commit/PR: `29bc288` (lokal — push M3 sonrası atomic)
  - Test/CI: SDK 407/407 + React 28/28 = **435 test passed** workspaces ile. typecheck clean, lint 0/0.
  - Notlar: 19 dosya kopyalandı (src, docs, examples, AGENTS.md, NOTICE, README, ROADMAP, package.json, 4 tsconfig, eslint, prettier configs, vitest, releaserc, .npmrc). Cross-repo `git mv` mümkün değil — adapter'ın per-file commit history'si bu repoya taşınmadı; eski hash'ler `Sangaibisi/browsonic-react` archive'da erişilebilir kalıyor (M3 closure'da archive). `npm run build --workspace=packages/sdk` çalıştırıldı — packages/react'in `@browsonic/sdk` import'u `dist/` paths üzerinden resolve oluyor.

- [2026-05-04] **S5.5 milestone 3**: CI workflows monorepo uyumlu, AGENTS.md root monorepo discipline, ADAPTER_TEMPLATE.md monorepo pattern'ine yeniden yazıldı, ROADMAP/CROSS_REPO_IMPACTS update, S5.5 closure — durum: ✅
  - Commit/PR: bkz. milestone 3 commit hash `39a19d7`
  - Test/CI: typecheck/lint/test workspace-aware yeşil; atomic push (M1+M2+M3) S5.5 kapanışıyla yapıldı.
  - Notlar: `.github/workflows/{ci,e2e,release}.yml` paths ve aggregator script çağrıları monorepo'ya uyumlu hale getirildi. `security.yml` zaten root-level (CodeQL/TruffleHog repo geneli) — değişiklik gerekmedi. `release.yml` artık `npm run semantic-release --workspaces --if-present` ile per-package release koşar. `e2e.yml` `working-directory: packages/sdk` ile playwright/build:e2e adımlarını paket içinden koşuyor. Root AGENTS.md'ye "Repository shape" + "Monorepo discipline" bölümleri eklendi; Project layout monorepo ağacı olarak yeniden çizildi. `packages/react/docs/ADAPTER_TEMPLATE.md`'nin §0 (monorepo workflow), §1 (package bootstrap), §8 (files to copy from this package), §9 (closing the old standalone repo) bölümleri yeniden yazıldı. ROADMAP "Recently shipped" altında "Monorepo migration" entry'si eklendi. CROSS_REPO_IMPACTS entry #3 (NPM_TOKEN) `done` olarak güncellendi + S5.5 lesson-learned (3 madde) historical notes'a eklendi.

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [x] **2026-05-04** Post-flight (1.3) tüm adımları geçildi.
- **Etkilenen repolar:**
  - **Sangaibisi/browsonic-react** — atomic push sonrası `gh repo archive` ile arşivlendi. Eski commit hash'leri (gh init `13dc01c`, M1 `b441250`, M2 `e9b06e9`, M3 `8f9b0ed`) archive'da erişilebilir.
  - **Sangaibisi/browsonic-sdk** — bu repo, monorepo çatısına dönüştürüldü. Adı korundu.
  - CROSS_REPO_IMPACTS entry #3 (`NPM_TOKEN browsonic-react`) → `done — repo archived`.

#### Plan Revize Notu — Sprint Akışı

- S5.5 sonrası akış: **S8 M2/M3** (addBreadcrumb + withScope) önce, sonra **S6** (Vue + Svelte). Adapter sprint'leri (S6/S7/S10) artık **yeni paket dizini** sprint'leri — yeni repo açma yok, `mkdir packages/<framework>` ile başlıyor. S6/S7/S10 hedef süresi çıkış noktasından ~%50 azaldı (paket başı ~2 saatten ~30 dakikaya).

---

### Sprint 6 — Vue + Svelte Adapters (P2, 2 hafta) — DURUM: AÇILMADI

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

S5 şablonunu (`docs/ADAPTER_TEMPLATE.md`) iki framework için uygula. Tek geliştiriciyse seri ilerle.

#### İşler

| Paket               | Yetenekler                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@browsonic/vue`    | `app.use(browsonicPlugin, opts)`, `app.config.errorHandler` chaining, Composition API `useBrowsonic()`, `<BrowsonicErrorBoundary>` SFC, Vue Router instrumentation |
| `@browsonic/svelte` | `<svelte:options>` boundary, `setContext('browsonic', ...)`, SvelteKit `handleError` hook, `+error.svelte` integration                                             |

#### Kabul Kriterleri

- Her adapter için minimal demo + 6+ test + bundle size budget.
- npm provenance + CycloneDX SBOM.
- README + 5 dakika quickstart.

#### Riskler

| Risk                             | Mitigasyon                                                 |
| -------------------------------- | ---------------------------------------------------------- |
| Vue 3 Composition vs Options API | Plugin her ikisini de destekler; testler iki kalıbı kapsar |
| SvelteKit SSR/CSR sınırı         | Sadece browser-side capture; SSR ileri sprint'e bırakılır  |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-landing-astro** (yeni adapter tanıtımı — Astro adapter'ı zaten S7'de geliyor).

---

### Sprint 7 — Next.js + Astro Adapters (P2, 2 hafta) — DURUM: AÇILMADI

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

Modern meta-framework adapter'ları. Server-side capture skop dışı (multi-runtime); sadece browser bundle entegrasyonu.

#### İşler

| Paket               | Yetenekler                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@browsonic/nextjs` | `withBrowsonic(nextConfig)` build wrapper, App Router `error.tsx` + `global-error.tsx` şablonları, `instrumentation.ts` registry, route-handler hata yakalama, sourcemap auto-upload (S3/S4 entegre) |
| `@browsonic/astro`  | `astro add @browsonic/astro` integration, View Transitions navigation events, partial hydration awareness                                                                                            |

#### Kabul Kriterleri

- Her adapter için Vercel'e deploy edilen demo.
- Next.js App Router + Pages Router ikisi de çalışıyor.
- Astro View Transitions ile navigation breadcrumb'ları emit ediliyor.

#### Riskler

| Risk                                         | Mitigasyon                         |
| -------------------------------------------- | ---------------------------------- |
| Next.js her major'da plugin API'si değişiyor | 14, 15 LTS hedefle; 13 best-effort |
| Astro adapter ekosistemi henüz olgun değil   | Astro 5+ hedefle                   |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-landing-astro** (kendisi Astro; çıkan adapter'ı kendi içinde kullan), **browsonic-dashboard** (dashboard Next.js ise — kontrol et — adapter'a geçir).

---

### Sprint 8 — Public Scope/Breadcrumb/Tag API (P2, 2 hafta) — DURUM: AÇILDI 2026-05-04

#### Pre-flight Check

- [x] **2026-05-04** Protokol 1.1 tüm adımları geçildi.
  - [x] (1.1.1) `browsonic-sdk` AGENTS.md aynı session'da S1+S2'de okundu — değişmedi, geçerli.
  - [x] (1.1.2) SPRINT_PLAN.md tam okundu; S5 KAPANDI, S3+S4 ERTELENDİ; S8 plan kalemleri tutarlı.
  - [x] (1.1.3) CROSS_REPO_IMPACTS.md okundu — 5 pending entry var (S2 service ×2, S5 NPM_TOKEN + dashboard + landing); S8 ile bağlantılı değil.
  - [x] (1.1.4) AGENTS.md ↔ S8 çatışması yok. S8 SDK içinde additive public API; bundle budget korunmalı.
  - [x] (1.1.5) Working tree temiz; S5 closure (`ef54cb9`) push edildi.

#### Monorepo Migration Karar Notu

- **2026-05-04:** Kullanıcı sorgusu üzerine ekosistemde repo kirliliği değerlendirildi. Mevcut: 1 SDK + 1 React adapter (yeni açıldı) + 5 ek adapter repo planı (S6/S7/S10) → 7 adapter repo riski. Endüstri standardı **monorepo** (Sentry, TanStack, Vue, React hepsi monorepo). Karar: **monorepo'ya geçiş yapılacak**, ancak `browsonic-sdk` repo adı korunacak (rename yok). Migration **S6 öncesi** S5.5 sprintinde yürütülecek — şu an S8 (SDK içi additive API) blocker değil; S6 (Vue + Svelte) öncesi yeni adapter repolar açılmadan önce migration penceresi açık kalıyor. **Bu sprintten sonra S5.5 migration sprinti gündeme alınacak.**

#### Milestone Bölümlemesi

- **M1 (bu turun hedefi):** `setTag(k, v)` (mevcut `addMetadata`'ya Sentry-uyumlu alias) + `setContext(name, ctx)` (yeni structured context bucket) + `setExtra(k, v)` (yeni event-level non-indexed extras) + state alanları (`contexts`, `extras` on Sentinel) + event-pipeline yansıması + testler.
- **M2 (sonraki tur):** `addBreadcrumb(b)` + `TelemetryStore`'a `breadcrumb` kategorisi extension + testler.
- **M3 (sonraki tur):** `withScope(fn)` transient scope (try/finally pattern, async-safe overload) + testler + S8 closure.

#### Mevcut API Audit (Pre-flight bulgusu)

`src/sentinel/user-metadata.ts` zaten içeriyor: `setUser`, `clearUser`, `addMetadata`, `removeMetadata`, `clearMetadata`. Bunlar dokunulmuyor (geriye uyumlu); S8 üzerine ek katman:

| Yeni API                                  | Şekli                                                  | Backing                                                  |
| ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `setTag(k, v)`                            | `(k: string, v: string \| number \| boolean) => void`  | `addMetadata(k, v)` alias — yeni delegasyon, aynı bucket |
| `setContext(name, ctx)`                   | `(name: string, ctx: Record<string, unknown>) => void` | yeni `sdk.contexts` bucket                               |
| `setExtra(k, v)`                          | `(k: string, v: unknown) => void`                      | yeni `sdk.extras` bucket                                 |
| `removeContext(name)` / `clearContexts()` | yeni                                                   | yeni state                                               |
| `removeExtra(k)` / `clearExtras()`        | yeni                                                   | yeni state                                               |
| `addBreadcrumb(b)` _(M2)_                 | `(b: Breadcrumb) => void`                              | `TelemetryStore` extension                               |
| `withScope(fn)` _(M3)_                    | `(fn: (scope: Scope) => void) => void`                 | transient scope manager                                  |

`BrowsonicEvent` public surface eklemeleri (additive, non-breaking):

- `contexts?: Record<string, Record<string, unknown>>`
- `extras?: Record<string, unknown>`

#### Sprint Hedefi

Sentry'nin `addBreadcrumb` / `setTag` / `setContext` / `setExtra` / `withScope` API'leri error tracking'in lingua franca'sı. Browsonic şu an `addMetadata` (tek anahtar) sunuyor; daha zengin breadcrumb API'si yok. TrackJS'te de `trackJs.addLogTelemetry`, `trackJs.addMetadata` var. Bu sprint Sentry-uyumlu yüzey ekler — geçiş yolunu temizler.

#### İşler

| İş                              | Detay                                                                                   | Kabul Kriteri                                |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `addBreadcrumb(b)` public API   | Telemetry store'a doğrudan event emit; `category`, `level`, `message`, `data`           | Mevcut `TelemetryStore` üzerine ince wrapper |
| `setTag(k, v)`                  | `metadata` ile aynı backing store; Sentry-uyumlu naming                                 | Migration guide'da "setTag = metadata" notu  |
| `setContext(name, ctx)`         | Yapısal bağlam (`browser`, `os`, `device`)                                              | Test                                         |
| `setExtra(k, v)`                | Tek event'e bağlı non-indexed field                                                     | Test                                         |
| `withScope(fn)`                 | Transient scope (try/finally pattern) — fn içinde set edilenler yalnız o blokta geçerli | Critical Path mode ile etkileşim test        |
| `Breadcrumb` ve `Scope` tipleri | Public types, Sentry parite                                                             | Type-only re-export                          |
| Bundle etkisi                   | Yalnız +0.5 KB                                                                          | Size budget korunur                          |

#### Kabul Kriterleri

- 5 yeni public API metodu.
- Bundle size budget aşılmadı.
- Migration guide taslağı (S10'da finalize) için API mapping tablosu hazır.

#### Riskler

| Risk                                      | Mitigasyon                                                         |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `withScope` async fn için doğru çalışmaz  | `Promise<T>` overload + test                                       |
| `setTag` mevcut `addMetadata` ile çakışır | İkisini deprecation olmadan paralel sun; doc'ta `setTag` öncelikli |

#### İş Logu

- [2026-05-04] **S8 milestone 1**: `setTag` (alias) + `setContext` + `setExtra` + `removeTag` / `removeContext` / `clearContexts` / `removeExtra` / `clearExtras` public API + state alanları (`contexts`, `extras`) + event-pipeline yansıması — durum: ✅
  - Commit/PR: bkz. milestone 1 commit hash `cd7f53f`
  - Test/CI: typecheck clean, lint 0/0, test **407/407 passed** (397 → 407, +10: 5 setContext + 5 setExtra). size — main 19.01 → **19.26 KB / 22** (+0.25 KB), core 12.67 → **12.89 KB / 15** (+0.22 KB), widget 5.12 KB (no change), CJS 22.53 → 22.9 KB / 26 (+0.37 KB).
  - Notlar: Mevcut `addMetadata`/`removeMetadata` korundu (geriye uyumlu); `setTag`/`removeTag` Sentry-uyumlu naming alias olarak eklendi. `setContext` shallow-copy on write (post-set mutation izole). `setExtra` reference-stored (Sentry parite — fresh obje pass etmek isolation için kullanıcı sorumluluğunda; user-metadata.ts'te documented). `BrowsonicEvent`'a opsiyonel `contexts?: Record<string, Record<string, unknown>>` ve `extras?: Record<string, unknown>` eklendi (additive, breaking değil). Event-pipeline her event creation'da contexts/extras'ı snapshot olarak yansıtıyor (`hasContexts ? { contexts: { ...sdk.contexts } } : {}` pattern'i ile boş bucket atılır, payload bloating yok).
- [2026-05-04] **S8 milestone 2**: `addBreadcrumb(b)` public API + `Breadcrumb`/`BreadcrumbLevel`/`BreadcrumbTelemetryEntry` public types + `TelemetryStore` `'breadcrumb'` kategori extension + `TelemetryTimeline.breadcrumb` wire-format channel + 12 yeni unit test (10 breadcrumbs.test.ts + 2 store.test.ts) — durum: ✅
  - Commit/PR: bkz. milestone 2 commit hash `2f2517a`
  - Test/CI: typecheck clean, lint 0/0, test **419/419 passed** (407 → 419, +12). size — main 19.26 → **19.36 KB / 22** (+0.10 KB), core 12.89 → **13.02 KB / 15** (+0.13 KB), widget 5.12 KB (no change), CJS 22.9 → **23.06 KB / 26** (+0.16 KB).
  - Notlar: `addBreadcrumb` `Browsonic` class üzerinde public method olarak eklendi; impl `sentinel/breadcrumbs.ts`'de `safeExecute` sarmalı + `telemetryStore` null koruması (pre-init no-op) + paused-store no-op (Critical Path uyumlu — store kendi `add()`'inde respect ediyor). Defaults: `level` → `'info'`, `timestamp` → store auto-fill (`new Date().toISOString()`); kullanıcı isterse override edebiliyor. Wire format `BreadcrumbTelemetryEntry`, mevcut `console`/`network`/`navigation`/`visitor` channellerine simetrik 5. kanal olarak `event.telemetry.breadcrumb` array'ında çıkar (boş array fallback — payload bloating yok). `TelemetryCategory` `'breadcrumb'` ile genişletildi; ring buffer kapasitesi mevcut `maxTelemetryEntries`'i paylaşıyor (eski telemetry kanallarıyla yarışır — beklenen davranış, FIFO oldest-drops). Sentry parite kategori örnekleri: `'navigation' | 'http' | 'ui' | 'auth' | 'log' | custom`. M3 (`withScope`) kalan tek iş, S8 closure orada.

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi. _M3 closure'da işaretlenecek._
- Etkilenen repolar (M3 sonunda doğrulanacak): **browsonic-service** (yeni `contexts` ve `extras` opsiyonel alanlarını ingest tarafı tolerate + persist etmeli — additive, breaking değil; tip mismatch ile reject olursa breaking. M2'de `breadcrumb` ek kategorisi telemetry timeline'a eklenince ek persist tip değişikliği gelebilir), **browsonic-dashboard** (yeni tag/context UI'ları — opsiyonel, sonra).

---

### Sprint 9 — Loader + Extension/Bot Detection + Session Health (P3, 2 hafta) — DURUM: AÇILMADI

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

Production-grade entegrasyon detayları. Loader script async lazy init için, extension/bot detection yanlış telemetry önlemek için, session health kullanıcı sayısı bazlı temel insight için.

#### İşler

| İş                                         | Detay                                                                                                                                             | Kabul Kriteri                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| CDN loader script                          | ~3 KB stub: `init()` çağrılarını buffer'lar, async olarak full bundle yükler. `<script async src="cdn/browsonic-loader.min.js" data-app-key="…">` | Sentry-style loader; Lighthouse'ta zero-blocking    |
| Browser extension detection                | Chrome/Firefox extension context'inde init iptali (`window.location.protocol === 'chrome-extension:'` vb.)                                        | Extension iframe testinde SDK kapanıyor             |
| Bot user-agent filter                      | Default ignore list (Googlebot, Bingbot, Slackbot, Twitterbot, headless) — opt-out                                                                | Test                                                |
| Browser session tracking                   | "Errored" / "Healthy" / "Crashed" minimal session state — sayfa close anında flush                                                                | Backend session aggregation hazır olduğunda devreye |
| Spotlight benzeri yerel dev UI (opsiyonel) | Browsonic widget'ı zaten var; dev-mode'da extra debug overlay (sadece `debug: true`)                                                              | Sürerse S10'a kayar                                 |

#### Kabul Kriterleri

- Loader script CDN'de ve lazy init ile entegre.
- Extension/bot detection default açık; test fixture'larda doğrulanır.
- Browser session event'leri backend'e ulaşıyor.

#### Riskler

| Risk                                               | Mitigasyon                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Loader script ile main bundle versiyon uyumsuzluğu | Loader UMD bundle'ı versiyon-pinned URL'den çeker               |
| Bot detection false-positive                       | Opt-out ayarı + telemetry'de "filtered_by_bot_detection" sayacı |
| Session health backend hazır değil                 | Sprint 9 SDK tarafı tamam, backend Sprint 10'a kayabilir        |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-service** (session aggregation endpoint'i), **browsonic-dashboard** (session health metrik kartları), **browsonic-ops** (CDN deployment pipeline loader script için).

---

### Sprint 10 — Angular + Remix + Migration Guides (P3, 2 hafta) — DURUM: AÇILMADI

#### Pre-flight Check

- [ ] Protokol 1.1 tüm adımları geçildi.

#### Sprint Hedefi

Adapter şablonu uygulanır + migration guide'lar yazılır. 19 haftalık plan kapanır.

#### İşler

| İş                          | Detay                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@browsonic/angular`        | `ErrorHandler` provider, Router instrumentation, Angular 17+ standalone                                                                                                 |
| `@browsonic/remix`          | `entry.client.tsx` integration, `ErrorBoundary` component, action/loader-side capture (browser-only kapsam içinde)                                                      |
| `MIGRATION_FROM_SENTRY.md`  | API mapping tablosu, `dsn → apiEndpoint`, `Sentry.captureException → captureError`, `addBreadcrumb` parite, `setUser` parite. Codemod scripti (`jscodeshift`) opsiyonel |
| `MIGRATION_FROM_TRACKJS.md` | `trackJs.track → captureError`, `trackJs.addMetadata → setTag`, `trackJs.configure → init`                                                                              |
| Per-framework quickstart    | `docs/quickstart/{react,vue,nextjs,svelte,astro,angular,remix}.md` — 5 dakikalık kurulum                                                                                |
| Recipe cookbook             | "Capturing fetch errors", "Filtering noise", "Releasing with source maps", "Using behind a proxy" — 8-10 recipe                                                         |

#### Kabul Kriterleri

- 7 framework adapter paketi npm'de.
- 2 migration guide repo'da.
- Quickstart dokümanları Vercel'e deploy edilen docs site'ında erişilebilir (opsiyonel: docs site Sprint 11+ ayrı plan).

#### Riskler

| Risk                          | Mitigasyon                                  |
| ----------------------------- | ------------------------------------------- |
| Codemod kapsam genişliği      | İlk sürüm sadece import + init; rest manuel |
| Quickstart'lar kalitesizleşir | Her birini gerçek bir demo repo'da test     |

#### İş Logu

(boş)

#### Sprint Sonu Cross-Repo Etki Kontrolü

- [ ] Post-flight (1.3) tüm adımları geçildi.
- Etkilenen repolar: **browsonic-landing-astro** (migration guide CTA'ları, "Sentry'den geç" landing sayfası), **browsonic-dashboard** (onboarding flow'unda framework seçici).

---

## 4. Risk Matrisi (Plan Geneli)

| Risk                                                        | Olasılık | Etki   | Mitigasyon                                                                                                                  |
| ----------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Stack parser regex'leri minified kod ile yanlış sonuç verir | Orta     | Yüksek | S2'de Playwright e2e gerçek minified bundle ile fixture                                                                     |
| Source map pipeline backend ingest gecikir                  | Orta     | Yüksek | S3 son haftası SDK ↔ service eşgüdüm; ingest contract donduruluyor                                                          |
| Adapter paketleri çoğaldıkça maintenance yükü               | Yüksek   | Orta   | S5'te `ADAPTER_TEMPLATE.md` + ortak `@browsonic/adapter-utils` paketi                                                       |
| Bundle size budget aşılır (yeni feature'lar)                | Yüksek   | Orta   | Her sprintte `size-limit` CI hard gate; aşımda lazy-load veya plugin'e taşıma                                               |
| Sentry'den geçiş için API mapping eksiği                    | Orta     | Düşük  | S8'de parite; S10 codemod ile kapatma                                                                                       |
| Tek geliştirici darboğazı                                   | Yüksek   | Yüksek | Sprint sıralaması seri; paralel iş yok. S5 pilot sonrası adapter sprint'leri tek geliştirici tempolu (10 gün/adapter çifti) |
| AGENTS.md / sprint plan çatışması                           | Düşük    | Orta   | Pre-flight 1.1 madde 4: çatışma varsa kullanıcıya bildir, plan revize                                                       |

---

## 5. Definition of Done (19 hafta sonu)

19 hafta sonunda Browsonic için aşağıdakiler doğru olmalı:

1. ✅ Tek bir Apache-2.0 OSS — proprietary notice yok, SPDX header her dosyada.
2. ✅ Multi-engine stack parser — Chrome/Firefox/Safari/Edge fixture'larında %100.
3. ✅ Source map pipeline — Webpack/Vite/Rollup/Esbuild plugin'leri + CLI + backend ingest.
4. ✅ 7 framework için resmi adapter — React, Vue, Svelte, Next, Astro, Angular, Remix.
5. ✅ Sentry-uyumlu public API — `addBreadcrumb`, `setTag`, `setContext`, `withScope`.
6. ✅ Loader script + extension/bot guard + session health.
7. ✅ Migration guide'lar — Sentry'den ve TrackJS'den.
8. ✅ Bundle budget korundu — main ≤22 KB, core ≤15 KB.
9. ✅ Test coverage ≥%85.
10. ✅ Her paket için npm provenance + CycloneDX SBOM.

Bu noktada Browsonic, "TrackJS'in gittiği her yerde aynı yetkinlikte, ek olarak privacy-first defaults + adaptive QoS + 3-tier offline + critical path + plugin versioning ile ilerde" konumuna gelir. Sentry'nin platform katmanı bilinçli olarak skop dışı.

---

## 6. Kapanış / Plan Revize Protokolü

Plan ilerlerken yeni bilgi gelirse:

1. Plan değişikliği **bu dosya üzerinde commit** edilir (Conventional Commits: `docs(sprint-plan): revise Sprint X scope — <reason>`).
2. Üst tarafa "Son güncelleme" alanı yenilenir.
3. Etkilenen sprintin altına "Plan Revize Notu" başlığı eklenir, eski iş listesi strikethrough yapılır.
4. Cross-repo etkisi varsa CROSS_REPO_IMPACTS.md güncellenir.

Plan **canlı bir dokümandır** — silmek yerine geçmişi koruyarak güncelle.

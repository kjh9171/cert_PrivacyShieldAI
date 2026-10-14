# 🛡️ PrivacyShield AI

> 지능형 문서 민감정보 자동 탐지 · 마스킹 및 AES-256 암호화 서비스
> 개인정보보호법 / 신용정보법 기반 문서 개인정보 처리 증빙 데모

[![Deploy](https://img.shields.io/badge/Vercel-Deploy-000000?style=flat&logo=vercel)](https://vercel.app)

---

## 📌 개요

업로드된 문서에서 **법정 개인정보**와 **기업 고유 보안 규칙(커스텀 RegEx)** 을 실시간으로 탐지하고,
5가지 마스킹 스타일로 문서를 안전하게 변환합니다. 모든 처리는 **브라우저(클라이언트) 안에서** 수행되므로
원본 데이터가 외부 서버로 전송되지 않습니다.

### ✨ 핵심 기능

| 단계 | 기능 | 설명 |
| --- | --- | --- |
| **1. 개인정보 정의** | 법정 PII 8종 | 주민번호, 카드/계좌, 연락처, 여권/면허, 이메일, 성명, 주소, 건강정보 — 조항별 근거 표기 |
| | 커스텀 RegEx 엔진 | 사원번호·대외비 코드 등 기업 규칙을 직접 정의, **실시간 매칭 검증 샌드박스** 제공 |
| **2. 문서 업로드** | 실제 본문 파싱 | **PDF / DOCX / XLSX / TXT / CSV / 이미지** 를 진짜 텍스트 레이어로 변환 |
| | 파일 대기열 | 다중 업로드, 실제 페이지 수·탐지 건수 표시, 개별 제거 |
| **3. AI 마스킹 실행** | 5단계 처리 | 텍스트 레이어 분리 → 규칙 매칭 → 마스킹 레이어 생성 → 암호화/메타데이터 처리 → 완료 |
| **4. 미리보기 & 검토** | 5가지 마스킹 스타일 | Blackout / Blur / Asterisk / Token / 사용자 지정 문구 |
| | **PDF 시각 마스킹** | 실제 페이지를 캔버스에 렌더링하고 **좌표 기반으로 박스를 겹쳐 그림** (항목 클릭 시 개별 해제) |
| | 텍스트 마스킹 | DOCX/XLSX/텍스트는 인라인 하이라이트로 실시간 마스킹 |
| **5. 증빙 보고서** | 감사 로그 | CSV / JSON 다운로드, 브라우저 인쇄 → PDF 저장 |
| | REST API 가이드 | 무료 API 토큰 및 cURL 연동 샘플 |

---

## 📄 문서 파싱 (Document Parsing)

업로드된 파일은 **원본 바이너리를 텍스트로 취급하지 않습니다.** 포맷별 전용 파서로
본문 텍스트와 좌표 레이어를 추출합니다.

| 포맷 | 파서 | 추출 내용 |
| --- | --- | --- |
| **PDF** | `pdfjs-dist` (동적 로드) | 실제 페이지 수, 텍스트 조각 + 좌표(bbox) |
| **DOCX** | 자체 OOXML 파서 (`fflate`) | 문단·표·머리말/바닥글, XML 엔티티 디코딩 |
| **XLSX** | 자체 OOXML 파서 (`fflate`) | 시트별 셀, sharedStrings, 인라인 문자열, 숫자 |
| **TXT/CSV/코드** | 네이티브 | UTF-8 → CP949 자동 판별 |
| **PNG/JPG** | `tesseract.js` (**지연 로드**) | OCR 텍스트 |

### 왜 `xlsx` / `mammoth` 를 쓰지 않았나

처음에는 표준 라이브러리를 사용했으나, **신뢰할 수 없는 사용자 업로드 파일을 파싱하는
런타임 경로**에 다음과 같은 알려진 취약점이 있어 **도입을 포기하고 직접 파싱**했습니다.

| 라이브러리 | 취약점 | 조치 |
| --- | --- | --- |
| `xlsx` (0.18.5) | Prototype Pollution / ReDoS (**High**, npm 레지스트에 수정본 없음) | 제거 → 자체 OOXML 파서 |
| `mammoth` (1.9.0) | Directory Traversal (Moderate) | 제거 → 자체 OOXML 파서 |
| `fflate` (0.8.2) | ZIP64 malformed 무한루프 (Moderate) | **0.8.3 으로 업그레이드** |

현재 런타임 파서 의존성(`pdfjs-dist`, `fflate`, `tesseract.js`)의 알려진 취약점은 **0건**입니다.

### PDF 마스킹 좌표 계산

- 좌표 계산은 `src/lib/parsers/pdfCoords.js` 의 순수 함수로 분리되어 단위 테스트됩니다.
- 오버레이는 **픽셀이 아닌 비율(%)** 로 배치됩니다. 캔버스가 CSS 로 컨테이너 너비에 맞춰
  축소 표시될 때도 박스가 실제 글자 위에 정확히 겹칩니다.
- 비례폰트에서는 문자 폭이 고르지 않아 선형 보간에 오차가 생깁니다. **과소 마스킹은 개인정보
  노출이므로** 박스를 의도적으로 넓혀 덮습니다(과잉 마스킹 = 안전한 실패).

### 안전장치

- **Zip bomb 방지**: 압축 해제 크기 120MB / 엔트리 4000개 상한
- **손상 파일**: 형식별 파서가 예외를 던지고 UI 는 안내 메시지(크래시 아님)로 표시
- **암호 PDF**: 파싱 실패 사유를 그대로 노출하지 않고 "인식 불가"로 처리

### 이미지 OCR

`tesseract.js` + 언어 데이터가 수십 MB이므로 **동적 `import()` 로만 로드**합니다.
이미지 업로드 시에는 안내 배너와 **[OCR 실행]** 버튼만 표시하고, 클릭 시에만 다운로드됩니다.


---

## 🛠️ 기술 스택

- **Vite 5** + **React 18**
- **Tailwind CSS 3.4** (밝은 라이트 테마)
- **pdfjs-dist** (PDF), **fflate** (OOXML), **tesseract.js** (OCR, 지연 로드)
- **lucide-react** (아이콘)
- **Vercel** (정적 호스팅, 무료 티어)

파싱은 전부 브라우저 안에서 수행되므로 **원본 문서가 외부 서버로 전송되지 않습니다.**

---

## 🚀 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

### ✅ 검증 명령어

```bash
npm test     # 단위 테스트 71개 (탐지/파서/좌표)
npm run lint # ESLint 정식 분석
```

---

## ☁️ Vercel 배포 (수동)

1. **소스 푸시**
   ```bash
   git push origin main
   ```

2. **Vercel 대시보드 접속** → [vercel.com/new](https://vercel.com/new)

3. **저장소 연결**
   - `Add New` → `Project` 선택
   - `kjh9171/cert_PrivacyShieldAI` 저장소 검색 후 `Import` 클릭

4. **빌드 설정** (자동 감지되므로 기본값 유지)
   | 항목 | 값 |
   | --- | --- |
   | Framework Preset | **Vite** |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm install` |

   > 저장소에 `vercel.json`이 포함되어 있어 별도 설정 없이 동작합니다.

5. **`Deploy` 클릭** → 완료 후 `https://<프로젝트>.vercel.app` 도메인 발급

6. (선택) 배포 후 **Settings → Domains** 에서 커스텀 도메인 연결

---

## 🔌 REST API 연동

무료 샌드박스 API 토큰이 할당되어 있습니다.

```bash
curl -X POST "https://api.privacyshield.ai/v1/mask" \
  -H "Authorization: Bearer ps_free_live_demo_key_2026" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/document.pdf" \
  -F "mask_style=blackout" \
  -F "encrypt_pdf=true" \
  -F "pdf_password=Privacy2026!"
```

**지원 `mask_style` 값:** `blackout` · `blur` · `asterisk` · `token` · `custom`

---

## 📁 프로젝트 구조

```
cert_PrivacyShieldAI/
├── index.html              # 앱 진입점
├── vercel.json             # Vercel 빌드/리라이트 설정
├── tailwind.config.js
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx             # UI 및 워크플로우 (5단계 탭)
│   ├── index.css           # Tailwind + 인쇄 스타일
│   ├── components/
│   │   └── PdfRedactionCanvas.jsx   # PDF 시각 마스킹 캔버스
│   └── lib/
│       ├── piiEngine.js    # ★ PII 탐지/마스킹 엔진 (순수 함수)
│       ├── ooxml.js        # ZIP 해제 + XML 유틸 (fflate)
│       └── parsers/
│           ├── index.js    # 포맷별 파서 디스패처
│           ├── pdf.js      # PDF 텍스트/좌표 추출 (pdfjs-dist)
│           ├── pdfCoords.js# PDF 좌표 계산 (순수 함수, 단위 테스트 대상)
│           ├── docx.js     # DOCX → 텍스트
│           ├── xlsx.js     # XLSX → 텍스트
│           └── ocr.js      # 이미지 OCR (지연 로드)
├── fixtures/               # 테스트용 실제 문서 파일
└── tests/
    ├── piiEngine.test.mjs  # 탐지/마스킹 단위 테스트 (36)
    ├── parsers.test.mjs    # DOCX/XLSX/XML 파서 테스트 (21)
    └── pdfCoords.test.mjs  # PDF 좌표 계산 테스트 (14)
```

### 탐지 엔진 (`src/lib/piiEngine.js`)

UI와 완전히 분리된 순수 함수 모듈입니다.

| 함수 | 역할 |
| --- | --- |
| `detectPii(text, enabledCodes, customRules, pageNumber)` | 텍스트에서 활성 규칙으로 개인정보 탐지 |
| `resolveOverlaps(found)` | 중복/겹치는 탐지 결과 정리 (긴 문자열 우선) |
| `asteriskMask(value, type)` | 유형별 부분 마스킹 변환 |
| `maskToken(item)` | 토큰식 치환 |
| `buildSegments(page, items, style, customText)` | 마스킹 적용된 렌더링 세그먼트 생성 |
| `segmentsToPlainText(segments)` | 세그먼트 → 평문 |

**탐지 지원 포맷**

- 주민등록번호 / 외국인등록번호 (13자리)
- 신용·체크카드번호 (4-4-4-4), 계좌번호 (3-2~3-4~6-2~3 / 6-2-6 / 4-3-4-4)
- 휴대전화 · 지역번호, 이메일, 상세 주소(시/구 단위까지 유지)
- 운전면허번호 (2-2-6-2), 성명(라벨·호칭 문맥 기반)
- 사용자 정의 정규식 규칙

---

## ⚠️ 보안 고지 및 한계

본 저장소는 **프론트엔드 데모/샌드박스**임을 명시합니다. 실제 개인정보 보호 업무에 사용하기 전 아래 사항을 반드시 확인하세요.

- **탐지 방식**: 브라우저 내 정규식 + 문맥 규칙 기반입니다. AI 모델이나 서버 연동은 포함되어 있지 않습니다.
- **암호화**: `AES-256` / `PDF 열람 암호화` 옵션은 **UI 및 내보낸 파일 헤더에 기록되는 메타데이터 수준**이며, 실제 PDF 암호화나 바이너리 AES-256 암호화는 수행하지 않습니다.
- **PDF 마스킹**: 화면에서 시각적으로 가리는 캔버스 오버레이이며, **원본 PDF 파일의 텍스트 레이어를 실제로 지우거나 다시 기록하지 않습니다.** 마스킹된 PDF 파일을 내려받으려면 별도의 서버/데스크톱 수준의 PDF 재작성 처리가 필요합니다.
- **좌표 정밀도**: PDF 텍스트 위치를 조각 단위로 선형 보간합니다. 라벨과 값이 별도 조각으로 분리된 일반적인 문서에서는 정확하며, 한 줄에 라벨+값이 모두 들어있고 비례폰트를 쓰는 경우 박스가 일부 넓게 덮을 수 있습니다(안전 방향).
- **이미지 OCR**: `tesseract.js` 로 실제 OCR을 수행하지만 정확도는 스캔 품질에 좌우됩니다. 텍스트 레이어가 있는 PDF 는 OCR 없이 더 정확하게 처리됩니다.
- **암호화 파일/패스워드 PDF**: 지원하지 않으며 "인식 불가"로 안내됩니다.
- **법적 증빙**: 생성되는 감사 보고서는 데모 증빙용이며, 실제 ISMS-P · 개인정보보호법 감사에 제출할 수 있는 공식 인증서가 아닙니다.
- **대용량 문서**: PDF 는 최대 300페이지까지만 파싱하며, 초과 시 경고를 표시합니다.

실제 운영 적용 시 서버 측 OCR + 검증된 PDF 재작성 라이브러리와 공식 인증 절차를 거치세요.

---

## 📄 라이선스

교육·데모 목적의 샌드박스입니다. 자유롭게 fork 하여 사용하세요.
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
| **2. 문서 업로드** | 드래그 앤 드롭 | PDF / DOCX / XLSX / TXT / CSV / PNG / JPG |
| | 파일 대기열 | 다중 업로드, 탐지 건수 실시간 표시, 개별 제거 |
| **3. AI 마스킹 실행** | 5단계 처리 | 텍스트 레이어 분리 → 규칙 매칭 → 마스킹 레이어 생성 → 암호화/메타데이터 처리 → 완료 |
| **4. 미리보기 & 검토** | 5가지 마스킹 스타일 | Blackout / Blur / Asterisk / Token / 사용자 지정 문구 |
| | 인터랙티브 캔버스 | 탐지 항목을 **클릭해 개별 마스킹 해제·재적용** |
| | 문서·페이지 탐색 | 확대/축소 (70~150%), 페이지별 탐지 결과 |
| **5. 증빙 보고서** | 감사 로그 | CSV / JSON 다운로드, 브라우저 인쇄 → PDF 저장 |
| | REST API 가이드 | 무료 API 토큰 및 cURL 연동 샘플 |

---

## 🛠️ 기술 스택

- **Vite 5** + **React 18**
- **Tailwind CSS 3.4** (밝은 라이트 테마)
- **lucide-react** (아이콘)
- **Vercel** (정적 호스팅, 무료 티어)

외부 의존성 없이 순수 JS 정규식 기반 탐지 엔진을 사용합니다.

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
npm test     # PII 탐지/마스킹 엔진 단위 테스트 (36개)
npm run lint # ESLint 정적 분석
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
│   └── lib/
│       └── piiEngine.js    # ★ PII 탐지/마스킹 엔진 (순수 함수)
└── tests/
    └── piiEngine.test.mjs  # 엔진 단위 테스트
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
- **OCR**: 이미지 스캔본의 진짜 OCR 엔진이 아닙니다. 텍스트 레이어 기반 텍스트 파일에서만 정확하게 동작하며, 바이너리 포맷은 텍스트 추출에 실패할 수 있습니다.
- **PDF 마스킹**: 실제 PDF 레이어 드로잉/재작성 없이 텍스트 결과를 내보냅니다.
- **법적 증빙**: 생성되는 감사 보고서는 데모 증빙용이며, 실제 ISMS-P · 개인정보보호법 감사에 제출할 수 있는 공식 인증서가 아닙니다.

실제 운영 적용 시 서버 측 OCR + 검증된 마스킹 라이브러리와 공식 인증 절차를 거치세요.

---

## 📄 라이선스

교육·데모 목적의 샌드박스입니다. 자유롭게 fork 하여 사용하세요.
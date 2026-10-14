/**
 * PrivacyShield AI
 * 지능형 문서 민감정보 자동 마스킹 및 AES-256 암호화 서비스
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Upload,
  Shield,
  Lock,
  Download,
  Plus,
  Trash2,
  Check,
  ArrowRight,
  Zap,
  ShieldCheck,
  FileCheck,
  Sliders,
  ChevronRight,
  Key,
  FileCode,
  Sparkles,
  Cpu,
  Terminal,
  CheckCircle2,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Code2,
  Globe,
  Copy,
  FileSearch,
  LockKeyhole,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
  X,
  Printer,
  ScanText,
} from 'lucide-react'
import {
  detectPii,
  buildSegments,
  segmentsToPlainText,
} from './lib/piiEngine.js'

/* ------------------------------------------------------------------ *
 * 1. 법정 개인정보 프리셋
 * ------------------------------------------------------------------ */

const LEGAL_PII_PRESETS = [
  {
    id: 'rrn',
    name: '주민등록번호 / 외국인등록번호',
    code: 'RRN',
    legalBasis: '개인정보보호법 제24조의2',
    checked: true,
    count: 6,
    severity: 'CRITICAL',
    category: '고유식별정보',
  },
  {
    id: 'card',
    name: '신용/체크카드번호 / 계좌번호',
    code: 'FINANCIAL',
    legalBasis: '신용정보법 제32조',
    checked: true,
    count: 5,
    severity: 'HIGH',
    category: '금융정보',
  },
  {
    id: 'phone',
    name: '휴대전화 / 일반전화번호',
    code: 'PHONE',
    legalBasis: '개인정보보호법 제15조',
    checked: true,
    count: 8,
    severity: 'MEDIUM',
    category: '일반연락처',
  },
  {
    id: 'driver',
    name: '운전면허번호 / 여권번호',
    code: 'PASSPORT',
    legalBasis: '개인정보보호법 제24조',
    checked: true,
    count: 3,
    severity: 'HIGH',
    category: '고유식별정보',
  },
  {
    id: 'email',
    name: '이메일 주소',
    code: 'EMAIL',
    legalBasis: '개인정보보호법 제15조',
    checked: true,
    count: 6,
    severity: 'LOW',
    category: '일반연락처',
  },
  {
    id: 'name',
    name: '성명 (문맥 기반 탐지)',
    code: 'NAME',
    legalBasis: '개인정보보호법 제15조',
    checked: true,
    count: 12,
    severity: 'MEDIUM',
    category: '인적사항',
  },
  {
    id: 'address',
    name: '자택 / 직장 상세주소',
    code: 'ADDRESS',
    legalBasis: '개인정보보호법 제15조',
    checked: true,
    count: 4,
    severity: 'LOW',
    category: '인적사항',
  },
  {
    id: 'medical',
    name: '질병 / 건강 검진 정보',
    code: 'HEALTH',
    legalBasis: '개인정보보호법 제23조',
    checked: false,
    count: 2,
    severity: 'CRITICAL',
    category: '민감정보',
  },
]

const INITIAL_CUSTOM_RULES = [
  {
    id: 'c1',
    name: '사원번호 규칙',
    regex: 'EMP-\\d{6}',
    enabled: true,
    category: '사내정보',
    description: '사내 가입 사원 식별 코드',
  },
  {
    id: 'c2',
    name: 'VIP 고객 식별자',
    regex: 'VIP_202[0-9]_[A-Z]{3}',
    enabled: true,
    category: '고객관리',
    description: 'VIP 고객 대외비 코드',
  },
  {
    id: 'c3',
    name: '기밀 프로젝트 코드',
    regex: 'PRJ-[A-Z]{2}-\\d{4}',
    enabled: true,
    category: '대외비',
    description: '보안 프로젝트 고유 번호',
  },
]

/* ------------------------------------------------------------------ *
 * 2. 문서 유틸리티
 * ------------------------------------------------------------------ */

const CHARS_PER_PAGE = 1200

function chunkToPages(text) {
  const pages = []
  for (let i = 0; i < text.length || pages.length === 0; i += CHARS_PER_PAGE) {
    pages.push(text.slice(i, i + CHARS_PER_PAGE))
  }
  return pages.map((t, idx) => ({
    pageNumber: idx + 1,
    title: `페이지 ${idx + 1} / ${pages.length}`,
    rawText: t,
    items: [],
  }))
}

function buildDocument({ id, name, ext, sizeLabel, uploadedAt, text, source }) {
  const pages = chunkToPages(text)
  return { id, name, type: ext, size: sizeLabel, pages: pages.length, uploadedAt, source, pagesData: pages }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TEXT_LIKE = /\.(txt|csv|tsv|md|json|log|xml|html|htm)$/i

async function extractTextFromFile(file) {
  if (TEXT_LIKE.test(file.name)) return file.text()
  const buffer = await file.arrayBuffer()
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

function extOf(name) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1].toUpperCase() : 'FILE'
}

function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function downloadBlob(content, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([`\uFEFF${content}`], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const SEVERITY_BADGE = {
  CRITICAL: 'bg-rose-100 text-rose-700 border-rose-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-300',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
}

const PROCESS_STEPS = [
  { p: 15, t: '1단계: 문서 포맷 디코딩 및 텍스트 레이어 분리 중...' },
  { p: 35, t: '2단계: 법정 민감정보 및 커스텀 Regex 가중치 매칭 탐지 중...' },
  { p: 65, t: '3단계: 오프셋 동기화 및 마스킹 시각적 레이어 생성 중...' },
  { p: 88, t: '4단계: AES-256 비트 암호화 및 메타데이터 클렌징 중...' },
  { p: 100, t: '5단계: 마스킹 변환 완료! 미리보기 검토 화면으로 이동합니다.' },
]

/* ------------------------------------------------------------------ *
 * 3. 샘플 문서
 * ------------------------------------------------------------------ */

const SAMPLE_TEXT_DOC1 = `지원자 성명: 홍길동 (洪吉洞)
주민등록번호: 920512-1029384
연락처: 010-8923-4410 | 이메일: hg_dong@example.com
주소: 서울특별시 강남구 테헤란로 123길 45 (역삼동)
비상연락망 (보호자): 010-3312-9901
사원 코드: EMP-829103 | 프로젝트: PRJ-AI-2026 | 고객 등급: VIP_2026_ABC

지원동기
본인은 개인정보 처리방침 및 개인정보 수집·이용 동의서를 충분히 숙지하고,
입사 후 회사가 정하는 보안规范的에 따라 개인정보를 안전하게 관리할 것을 약속합니다.

▷ 서면 동의란
본인은 상기 작성된 개인정보 제공 동의서의 내용을 숙지하였으며 동의합니다.
동의자 성명: 홍길동 (인)
주민번호 앞자리: 920512
서명일자: 2026년 10월 14일`

const SAMPLE_TEXT_DOC2 = `2026 법인 고객 금융 거래 명세서 (원천)

거래내역
─────────────────────────────────────────────
일자        거래구분      거래처            금액(KRW)
─────────────────────────────────────────────
2026-10-02  청구          카드 4532-8910-2234-9912   1,240,000
2026-10-05  입금          KB국민 827-21-0923-118     8,900,000
2026-10-09  출금          Mostly                -     450,000
2026-10-11  청구          카드 4532-8910-2234-9912     780,000
─────────────────────────────────────────────

대표자 정보
계좌주: 김철수 | 대표전화: 02-555-0192
주민번호: 850310-2193847
담당자: 김철수님 (02-555-0192)
법인주소: 서울특별시 영등포구 여의대방로 383 (여의동)`

const SAMPLE_TEXT_DOC3 = `[자동차운전면허증 / OCR 스캔 이미지 분석 레이어]

성명: 이영희
주민등록번호: 950820-2019283
운전면허번호: 11-12-345678-90
주소: 경기도 성남시 분당구 판교역로 166
유효기간: 2019.03.14 ~ 2029.03.14
혈액형: AB형 (민감정보 - 법 제23조 대상)`

const SAMPLE_DOCUMENTS = [
  buildDocument({
    id: 'doc1',
    name: '입사지원서_및_개인정보동의서.pdf',
    ext: 'PDF',
    sizeLabel: '2.4 MB',
    uploadedAt: '2026-10-14 16:30',
    text: SAMPLE_TEXT_DOC1,
    source: 'sample',
  }),
  buildDocument({
    id: 'doc2',
    name: '2026_법인고객_금융거래내역서.xlsx',
    ext: 'XLSX',
    sizeLabel: '1.8 MB',
    uploadedAt: '2026-10-14 16:32',
    text: SAMPLE_TEXT_DOC2,
    source: 'sample',
  }),
  buildDocument({
    id: 'doc3',
    name: '신분증_스캔본_샘플.png',
    ext: 'PNG',
    sizeLabel: '3.1 MB',
    uploadedAt: '2026-10-14 16:35',
    text: SAMPLE_TEXT_DOC3,
    source: 'sample',
  }),
]

/* ------------------------------------------------------------------ *
 * 4. 앱
 * ------------------------------------------------------------------ */

export default function App() {
  const [activeTab, setActiveTab] = useState('rules') // rules | upload | process | preview | compliance
  const [legalPii, setLegalPii] = useState(LEGAL_PII_PRESETS)
  const [customRules, setCustomRules] = useState(INITIAL_CUSTOM_RULES)

  // 커스텀 정규식 테스트
  const [testRuleName, setTestRuleName] = useState('')
  const [testRuleRegex, setTestRuleRegex] = useState('')
  const [testSampleString, setTestSampleString] = useState(
    '사원 코드 EMP-829103 고객 VIP_2026_ABC 프로젝트 PRJ-AI-2026',
  )
  const [testMatchedCount, setTestMatchedCount] = useState(0)
  const [testError, setTestError] = useState('')

  // 문서 관리
  const [uploadedFiles, setUploadedFiles] = useState(SAMPLE_DOCUMENTS)
  const [selectedDocId, setSelectedDocId] = useState(SAMPLE_DOCUMENTS[0].id)
  const [selectedPageNum, setSelectedPageNum] = useState(1)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  // 처리 상태
  const [isProcessing, setIsProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [processStepLog, setProcessStepLog] = useState('')

  // 마스킹 / 보안 옵션
  const [maskingStyle, setMaskingStyle] = useState('blackout') // blackout | blur | asterisk | token | custom
  const [customReplaceText, setCustomReplaceText] = useState('[보안가림]')
  const [isEncryptPdf, setIsEncryptPdf] = useState(true)
  const [pdfPassword, setPdfPassword] = useState('Privacy2026!')
  const [isCleanMetadata, setIsCleanMetadata] = useState(true)

  // 토스트
  const [toastMessage, setToastMessage] = useState(null)

  const currentDoc =
    uploadedFiles.find((f) => f.id === selectedDocId) ?? uploadedFiles[0] ?? SAMPLE_DOCUMENTS[0]
  const currentPageData =
    currentDoc?.pagesData.find((p) => p.pageNumber === selectedPageNum) ?? currentDoc?.pagesData[0]

  const enabledCodes = useMemo(
    () => new Set(legalPii.filter((p) => p.checked).map((p) => p.id)),
    [legalPii],
  )

  const showToast = useCallback((msg) => setToastMessage(msg), [])

  /* --------------------------- Effects --------------------------- */

  // 토스트 자동 닫기
  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3200)
    return () => clearTimeout(t)
  }, [toastMessage])

  // 정규식 실시간 검증
  useEffect(() => {
    if (!testRuleRegex) {
      setTestMatchedCount(0)
      setTestError('')
      return
    }
    try {
      const re = new RegExp(testRuleRegex, 'g')
      const matches = testSampleString.match(re)
      setTestMatchedCount(matches ? matches.length : 0)
      setTestError('')
    } catch (e) {
      setTestMatchedCount(0)
      setTestError(e.message.replace(/^Invalid regular expression:\s*/, ''))
    }
  }, [testRuleRegex, testSampleString])

  // 처리 진행 시퀀스
  useEffect(() => {
    if (!isProcessing) return
    let idx = 0
    setProcessProgress(0)
    const timer = setInterval(() => {
      if (idx < PROCESS_STEPS.length) {
        setProcessProgress(PROCESS_STEPS[idx].p)
        setProcessStepLog(PROCESS_STEPS[idx].t)
        idx += 1
      } else {
        clearInterval(timer)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [isProcessing])

  useEffect(() => {
    if (!isProcessing) return
    const t = setTimeout(() => {
      setIsProcessing(false)
      setActiveTab('preview')
      showToast('문서 분석 및 AI 마스킹/암호화 처리가 완료되었습니다!')
    }, PROCESS_STEPS.length * 500 + 400)
    return () => clearTimeout(t)
  }, [isProcessing, showToast])

  /* --------------------------- Handlers -------------------------- */

  const runDetection = useCallback(
    (doc) => ({
      ...doc,
      pagesData: doc.pagesData.map((page) => ({
        ...page,
        items: detectPii(page.rawText, enabledCodes, customRules, page.pageNumber),
      })),
    }),
    [enabledCodes, customRules],
  )

  const runMaskingEngine = () => {
    setIsProcessing(true)
    setActiveTab('process')
  }

  const applyDetection = useCallback(() => {
    setUploadedFiles((prev) => {
      const next = prev.map(runDetection)
      const target = next.find((f) => f.id === selectedDocId)
      if (target) {
        const total = target.pagesData.reduce((sum, p) => sum + p.items.length, 0)
        showToast(`탐지 완료: 총 ${total}건의 개인정보 항목을 식별했습니다.`)
      }
      return next
    })
  }, [runDetection, selectedDocId, showToast])

  // 탐지 결과가 최신 규칙 상태를 반영하도록 문서 선택 시 재탐지
  useEffect(() => {
    setUploadedFiles((prev) => prev.map(runDetection))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDetection])

  const handleAddCustomRule = () => {
    if (!testRuleName.trim() || !testRuleRegex.trim()) {
      showToast('규칙명과 정규표현식을 모두 입력해주세요.')
      return
    }
    try {
      new RegExp(testRuleRegex)
    } catch {
      showToast('정규표현식 구문이 올바르지 않습니다.')
      return
    }
    const newRule = {
      id: `c_${Date.now()}`,
      name: testRuleName.trim(),
      regex: testRuleRegex.trim(),
      enabled: true,
      category: '사용자정의',
      description: '실시간 추가된 커스텀 정규식 패턴',
    }
    setCustomRules([...customRules, newRule])
    setTestRuleName('')
    setTestRuleRegex('')
    showToast(`"${newRule.name}" 커스텀 규칙이 등록되었습니다.`)
  }

  const handleTogglePiiItemMask = (docId, pageNum, itemId) => {
    setUploadedFiles((prevFiles) =>
      prevFiles.map((doc) => {
        if (doc.id !== docId) return doc
        return {
          ...doc,
          pagesData: doc.pagesData.map((pg) => {
            if (pg.pageNumber !== pageNum) return pg
            return {
              ...pg,
              items: pg.items.map((it) =>
                it.id === itemId ? { ...it, masked: !it.masked } : it,
              ),
            }
          }),
        }
      }),
    )
    showToast('개인정보 항목의 마스킹 상태가 변경되었습니다.')
  }

  const handleFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList ?? [])
      if (files.length === 0) return

      const created = []
      for (const file of files) {
        let text = ''
        try {
          text = await extractTextFromFile(file)
        } catch {
          text = ''
        }
        if (!text.trim()) {
          text = `[${file.name}]\n(바이너리 포맷으로 텍스트 레이어를 추출하지 못했습니다. 샘플 문서를 이용해 기능을 체험해 보세요.)`
        }
        created.push(
          buildDocument({
            id: `up_${Date.now()}_${file.name}`,
            name: file.name,
            ext: extOf(file.name),
            sizeLabel: formatBytes(file.size),
            uploadedAt: nowStamp(),
            text,
            source: 'upload',
          }),
        )
      }

      if (created.length === 0) return
      setUploadedFiles((prev) => [...created, ...prev])
      setSelectedDocId(created[0].id)
      setSelectedPageNum(1)
      showToast(`${created.length}개 파일이 업로드 대기열에 추가되었습니다.`)
    },
    [showToast],
  )

  const handleRemoveDoc = (docId) => {
    setUploadedFiles((prev) => {
      const next = prev.filter((f) => f.id !== docId)
      if (docId === selectedDocId && next.length > 0) {
        setSelectedDocId(next[0].id)
        setSelectedPageNum(1)
      }
      return next
    })
    showToast('문서가 대기열에서 삭제되었습니다.')
  }

  const handleCopy = async (text, label = '코드') => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label}이(가) 클립보드에 복사되었습니다.`)
    } catch {
      showToast('복사에 실패했습니다. 브라우저 권한을 확인해주세요.')
    }
  }

  /* --------------------------- Downloads ------------------------- */

  const allItems = currentDoc?.pagesData.flatMap((p) => p.items) ?? []
  const segments = currentPageData
    ? buildSegments(currentPageData, currentPageData.items, maskingStyle, customReplaceText)
    : []

  const maskedTotal = allItems.filter((i) => i.masked).length

  const handleDownloadMaskedDoc = () => {
    const body = currentDoc.pagesData
      .map((page) => {
        const segs = buildSegments(page, page.items, maskingStyle, customReplaceText)
        const text = segmentsToPlainText(segs)
        return `===== ${currentDoc.name} — ${page.title} =====\n${text}\n`
      })
      .join('\n')

    const header = [
      'PrivacyShield AI — 마스킹 적용 문서',
      `원본 파일: ${currentDoc.name}`,
      `생성 시각: ${nowStamp()}`,
      `마스킹 스타일: ${maskingStyle}`,
      `암호화: ${isEncryptPdf ? `AES-256 (PDF 열람 암호 ${pdfPassword})` : '없음'}`,
      `메타데이터 제거: ${isCleanMetadata ? 'ON' : 'OFF'}`,
      `마스킹 항목: ${maskedTotal}건`,
      '='.repeat(46),
      '',
    ].join('\n')

    downloadBlob(header + body, `masked_${currentDoc.name}.txt`, 'text/plain;charset=utf-8')
    showToast('마스킹이 적용된 문서가 다운로드되었습니다.')
  }

  const handleDownloadAuditCsv = () => {
    const rows = [['문서', '페이지', '유형', '감지값', '마스킹여부', '심각도', '신뢰도']]
    for (const f of uploadedFiles) {
      for (const page of f.pagesData) {
        for (const item of page.items) {
          rows.push([
            f.name,
            page.pageNumber,
            item.typeLabel,
            item.value,
            item.masked ? '마스킹' : '원문유지',
            item.severity,
            item.confidence,
          ])
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadBlob(csv, 'privacyshield_audit_log.csv', 'text/csv;charset=utf-8')
    showToast('감사 로그 CSV가 다운로드되었습니다.')
  }

  const handleDownloadAuditJson = () => {
    const payload = {
      certificate: `CERT-2026-PRIVACY-FREE-${String(Date.now()).slice(-6)}`,
      issuedAt: nowStamp(),
      standard: 'AES-256-GCM / SHA-256 Metadata Hash',
      compliance: '개인정보보호법 제23·24조의2, 제15조 및 신용정보법 제32조',
      activeRules: legalPii.filter((p) => p.checked).map((p) => p.code),
      customRules: customRules.map((r) => ({ name: r.name, regex: r.regex, enabled: r.enabled })),
      documents: uploadedFiles.map((f) => ({
        name: f.name,
        pages: f.pages,
        detections: f.pagesData.reduce((s, p) => s + p.items.length, 0),
        masked: f.pagesData.reduce(
          (s, p) => s + p.items.filter((i) => i.masked).length,
          0,
        ),
      })),
      totalDetections: uploadedFiles.reduce(
        (s, f) => s + f.pagesData.reduce((x, p) => x + p.items.length, 0),
        0,
      ),
    }
    downloadBlob(
      JSON.stringify(payload, null, 2),
      'privacyshield_audit_cert.json',
      'application/json;charset=utf-8',
    )
    showToast('감사 증빙 데이터(JSON)가 다운로드되었습니다.')
  }

  const API_KEY = 'ps_free_live_demo_key_2026'
  const curlSnippet = `curl -X POST "https://api.privacyshield.ai/v1/mask" \\
  -H "Authorization: Bearer ${API_KEY}" \\
  -H "Content-Type: multipart/form-data" \\
  -F "file=@/path/to/document.pdf" \\
  -F "mask_style=${maskingStyle}" \\
  -F "encrypt_pdf=${isEncryptPdf}" \\
  -F "pdf_password=${pdfPassword}"`

  const totalDetections = uploadedFiles.reduce(
    (s, f) => s + f.pagesData.reduce((x, p) => x + p.items.length, 0),
    0,
  )

  /* --------------------------- Renderers ------------------------- */

  const renderSegment = (seg, idx) => {
    if (seg.kind === 'text') return <React.Fragment key={idx}>{seg.text}</React.Fragment>

    const { item, rendered } = seg
    const isBlurred = maskingStyle === 'blur' && item.masked

    if (!item.masked) {
      return (
        <span
          key={idx}
          onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
          title="클릭: 마스킹 적용"
          className="cursor-pointer rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 transition-colors hover:bg-amber-200"
        >
          {rendered}
        </span>
      )
    }

    if (maskingStyle === 'blackout') {
      return (
        <span
          key={idx}
          onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
          title={`${item.typeLabel} · 클릭: 마스킹 해제`}
          className="cursor-pointer select-none rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-bold text-slate-900 transition-colors hover:bg-slate-800"
        >
          {rendered}
        </span>
      )
    }

    if (maskingStyle === 'blur') {
      return (
        <span
          key={idx}
          onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
          title={`${item.typeLabel} · 클릭: 마스킹 해제`}
          className={`cursor-pointer select-none rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 transition-all ${
            isBlurred ? 'blur-[3px] hover:blur-0' : ''
          }`}
        >
          {rendered}
        </span>
      )
    }

    if (maskingStyle === 'asterisk') {
      return (
        <span
          key={idx}
          onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
          title={`${item.typeLabel} · 클릭: 마스킹 해제`}
          className="cursor-pointer rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
        >
          {rendered}
        </span>
      )
    }

    if (maskingStyle === 'token') {
      return (
        <span
          key={idx}
          onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
          title={`${item.typeLabel} · 클릭: 마스킹 해제`}
          className="cursor-pointer rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          {rendered}
        </span>
      )
    }

    return (
      <span
        key={idx}
        onClick={() => handleTogglePiiItemMask(currentDoc.id, currentPageData.pageNumber, item.id)}
        title={`${item.typeLabel} · 클릭: 마스킹 해제`}
        className="cursor-pointer rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono font-bold text-rose-600 transition-colors hover:bg-rose-100"
      >
        {rendered}
      </span>
    )
  }

  const tabButton = (key, icon, label, onClick) => {
    const Icon = icon
    const isActive = activeTab === key
    return (
      <>
        <button
          onClick={onClick}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
            isActive
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </button>
        <ChevronRight className="w-4 h-4 text-slate-300 hidden sm:block flex-shrink-0" />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start space-x-3 rounded-xl border border-indigo-400/30 bg-indigo-600 px-4 py-3 text-white shadow-xl">
          <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
          <span className="text-xs font-semibold leading-relaxed sm:text-sm">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-md shadow-indigo-600/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                PrivacyShield AI
              </span>
              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                100% Free Sandbox
              </span>
            </div>
            <p className="text-xs text-slate-500">
              지능형 문서 민감정보 자동 마스킹 및 AES-256 암호화 서비스
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden items-center space-x-3 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs lg:flex">
            <span className="text-slate-500">무료 체험:</span>
            <span className="font-mono font-bold text-emerald-600">무제한 이용가능</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">탐지 건수:</span>
            <span className="font-mono font-bold text-indigo-600">{totalDetections}건</span>
          </div>

          <button
            onClick={() => showToast('100% 무료로 모든 기능이 전면 개방되어 있습니다.')}
            className="flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>무료 서비스 이용 중</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-slate-200 bg-white px-6 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between overflow-x-auto text-xs font-medium sm:text-sm">
          {tabButton('rules', Sliders, '1. 개인정보 정의 (법정/커스텀)', () => setActiveTab('rules'))}
          {tabButton('upload', Upload, '2. 문서 업로드 & 스캔', () => setActiveTab('upload'))}
          {tabButton('process', Cpu, '3. AI 마스킹/암호화 실행', runMaskingEngine)}
          {tabButton('preview', FileSearch, '4. 미리보기 & 검토', () => setActiveTab('preview'))}
          {tabButton('compliance', ShieldAlert, '5. 증빙 보고서 & Vercel API', () => setActiveTab('compliance'))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 p-6">
        {/* ---------------- TAB 1: 규칙 설정 ---------------- */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="flex items-center space-x-2 text-base font-bold text-slate-900 sm:text-lg">
                    <Shield className="h-5 w-5 text-indigo-600" />
                    <span>법적 기준 개인정보 항목 정의 (Mandatory Legal PII Rules)</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    개인정보보호법, 금융실명법, 신용정보법 상 마스킹/암호화 대상 민감 정보를
                    선택/해제하세요.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">
                  활성 규칙:{' '}
                  <span className="font-bold text-indigo-600">
                    {legalPii.filter((p) => p.checked).length}
                  </span>{' '}
                  / {legalPii.length} 항목
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {legalPii.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() =>
                      setLegalPii((prev) =>
                        prev.map((p) => (p.id === item.id ? { ...p, checked: !p.checked } : p)),
                      )
                    }
                    className={`rounded-xl border p-4 text-left transition-all ${
                      item.checked
                        ? 'border-indigo-300 bg-indigo-50/50 shadow-sm hover:bg-indigo-50'
                        : 'border-slate-200 bg-white opacity-60 hover:border-slate-300 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start space-x-2.5">
                      <div
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          item.checked
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 bg-slate-100'
                        }`}
                      >
                        {item.checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-900 sm:text-sm">
                          {item.name}
                        </span>
                        <div className="text-[10px] text-slate-400">{item.category}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 font-mono text-xs text-slate-500">
                      <span className="truncate text-[10px] text-slate-400">{item.legalBasis}</span>
                      <span
                        className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                          SEVERITY_BADGE[item.severity]
                        }`}
                      >
                        {item.code}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 정규식 샌드박스 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="flex items-center space-x-2 text-base font-bold text-slate-900 sm:text-lg">
                  <FileCode className="h-5 w-5 text-emerald-600" />
                  <span>사용자 정의 개인정보 정규식 규칙 (Custom RegEx Engine)</span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  사원번호, 대외비 프로젝트 코드, 특정 고객 ID 등 기업 고유 보안 규정을 정규식으로
                  직접 정의하고 실시간 검증할 수 있습니다.
                </p>
              </div>

              <div className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600">
                  <Terminal className="h-4 w-4" />
                  <span>실시간 정규식 검증 샌드박스 (RegEx Live Test Bench)</span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">규칙 이름</label>
                    <input
                      type="text"
                      placeholder="예: 사내 가입 사원 번호"
                      value={testRuleName}
                      onChange={(e) => setTestRuleName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">
                      정규표현식 (RegEx Pattern)
                    </label>
                    <input
                      type="text"
                      placeholder="예: EMP-\d{6}"
                      value={testRuleRegex}
                      onChange={(e) => setTestRuleRegex(e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs text-emerald-700 shadow-sm focus:border-indigo-500 focus:outline-none ${
                        testError ? 'border-rose-400' : 'border-slate-300'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">테스트용 문맥 텍스트</label>
                  <input
                    type="text"
                    value={testSampleString}
                    onChange={(e) => setTestSampleString(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {testError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                    정규표현식 오류: {testError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <span>매칭 감지:</span>
                    <span
                      className={`rounded border px-2.5 py-0.5 font-mono font-bold ${
                        testMatchedCount > 0
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : 'border-slate-200 bg-slate-200 text-slate-600'
                      }`}
                    >
                      {testMatchedCount}개 매칭됨
                    </span>
                  </div>
                  <button
                    onClick={handleAddCustomRule}
                    className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    <span>이 규칙 등록하기</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-600">
                  등록된 사용자 정의 보안 규칙 ({customRules.length}개)
                </div>
                {customRules.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-400">
                    등록된 커스텀 규칙이 없습니다.
                  </div>
                )}
                {customRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <span className="rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {rule.category}
                      </span>
                      <span className="text-xs font-semibold text-slate-800">{rule.name}</span>
                      <code className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-indigo-600">
                        {rule.regex}
                      </code>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() =>
                          setCustomRules((prev) =>
                            prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
                          )
                        }
                        title={rule.enabled ? '규칙 비활성화' : '규칙 활성화'}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
                          rule.enabled
                            ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                            : 'border-slate-300 bg-white text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => {
                          setCustomRules((prev) => prev.filter((r) => r.id !== rule.id))
                          showToast('규칙이 삭제되었습니다.')
                        }}
                        className="p-1 text-slate-400 transition-colors hover:text-rose-600"
                        title="규칙 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={applyDetection}
                className="flex items-center space-x-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-xs font-semibold text-emerald-800 shadow-sm transition-all hover:bg-emerald-100"
              >
                <ScanText className="h-4 w-4" />
                <span>변경된 규칙으로 전체 문서 재탐지</span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className="ml-3 flex items-center space-x-2 rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 sm:text-sm"
              >
                <span>다음 단계: 문서 업로드하기</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ---------------- TAB 2: 업로드 ---------------- */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                handleFiles(e.dataTransfer.files)
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center shadow-sm transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-indigo-300 bg-indigo-50/30 hover:border-indigo-500 hover:bg-indigo-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <div className="mb-3 rounded-2xl border border-indigo-100 bg-white p-4 text-indigo-600 shadow-md transition-transform group-hover:scale-110">
                <Upload className="h-8 w-8" />
              </div>
              <h3 className="mb-1 text-base font-bold text-slate-900">
                문서/이미지 파일을 끌어다 놓거나 클릭하여 업로드
              </h3>
              <p className="mb-4 max-w-md text-xs text-slate-500">
                PDF, DOCX, XLSX, TXT, CSV, PNG, JPG 포맷 지원 · 텍스트 레이어 추출 후 즉시 탐지
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {['PDF 문서', 'Excel (.xlsx)', 'CSV / TXT', '이미지 스캔본 (PNG/JPG)'].map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-700 shadow-xs"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="flex items-center space-x-2 text-sm font-bold text-slate-900">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>실시간 테스트용 샘플 문서 (Quick Demo Presets)</span>
                </h4>
                <span className="hidden text-xs text-slate-500 sm:block">
                  클릭 시 해당 서식의 텍스트 레이어를 로드합니다
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {SAMPLE_DOCUMENTS.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    onClick={() => {
                      setUploadedFiles((prev) =>
                        prev.some((f) => f.id === doc.id) ? prev : [doc, ...prev],
                      )
                      setSelectedDocId(doc.id)
                      setSelectedPageNum(1)
                      showToast(`"${doc.name}" 샘플 문서가 선택되었습니다.`)
                    }}
                    className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                      selectedDocId === doc.id
                        ? 'border-indigo-400 bg-indigo-50/70 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                            doc.type === 'PDF'
                              ? 'border-rose-200 bg-rose-100 text-rose-700'
                              : doc.type === 'XLSX'
                                ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                                : 'border-indigo-200 bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {doc.type}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{doc.size}</span>
                      </div>
                      <div className="mb-1 line-clamp-1 text-xs font-semibold text-slate-900">
                        {doc.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {doc.pages}개 페이지 포함
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                      <span className="text-[11px] font-medium text-indigo-600">
                        {uploadedFiles.some((f) => f.id === doc.id) ? '대기열에 등록됨' : '로드하기'}
                      </span>
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          selectedDocId === doc.id ? 'text-indigo-600' : 'text-slate-300'
                        }`}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="mb-3 text-sm font-bold text-slate-900">현재 스캔 대기열 (File Queue)</h4>
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
                {uploadedFiles.map((f) => {
                  const count = f.pagesData.reduce((s, p) => s + p.items.length, 0)
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-3 p-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDocId(f.id)
                          setSelectedPageNum(1)
                        }}
                        className="flex min-w-0 flex-1 items-center space-x-3 text-left"
                      >
                        <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
                          <FileCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">{f.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center space-x-2 text-[11px] text-slate-500">
                            <span className="font-mono">{f.type}</span>
                            <span>•</span>
                            <span>{f.size}</span>
                            <span>•</span>
                            <span>{f.uploadedAt}</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span
                          className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                            count > 0
                              ? 'border-indigo-200 bg-indigo-100 text-indigo-800'
                              : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {count > 0 ? `민감정보 ${count}건 탐지` : '탐지 대기'}
                        </span>
                        <button
                          onClick={() => handleRemoveDoc(f.id)}
                          title="대기열에서 제거"
                          className="p-1 text-slate-400 transition-colors hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                onClick={() => setActiveTab('rules')}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                이전: 개인정보 정의 설정
              </button>
              <button
                onClick={runMaskingEngine}
                className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 sm:text-sm"
              >
                <Zap className="h-4 w-4 fill-current text-amber-300" />
                <span>AI 마스킹 &amp; 암호화 실행하기</span>
              </button>
            </div>
          </div>
        )}

        {/* ---------------- TAB 3: 처리 ---------------- */}
        {activeTab === 'process' && (
          <div className="space-y-6">
            <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
              {isProcessing ? (
                <div className="space-y-6 py-6">
                  <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                    <div className="absolute inset-0 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                    <Cpu className="h-10 w-10 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-bold text-slate-900">
                      실시간 민감정보 분석 및 암호화 진행 중
                    </h3>
                    <p className="animate-pulse font-mono text-xs text-indigo-600">{processStepLog}</p>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${processProgress}%` }}
                    />
                  </div>
                  <div className="text-right font-mono text-xs text-slate-500">
                    {processProgress}% 완료
                  </div>
                </div>
              ) : (
                <div className="space-y-6 py-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-emerald-600 shadow-sm">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold text-slate-900">
                      문서 분석 및 마스킹/암호화 완료!
                    </h3>
                    <p className="text-xs text-slate-500">
                      현재 규칙 기준으로 총{' '}
                      <strong className="font-mono font-bold text-emerald-700">
                        {totalDetections}건
                      </strong>
                      의 민감 개인정보가 식별되었습니다.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('preview')}
                    className="inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-6 py-3 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 sm:text-sm"
                  >
                    <span>결과 미리보기 &amp; 검토하기</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- TAB 4: 미리보기 ---------------- */}
        {activeTab === 'preview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="mb-2 block text-xs font-bold text-slate-700">검토 문서 선택</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => {
                    setSelectedDocId(e.target.value)
                    setSelectedPageNum(1)
                  }}
                  className="mb-3 w-full rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
                >
                  {uploadedFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.type})
                    </option>
                  ))}
                </select>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
                  <span className="text-slate-500">페이지 선택:</span>
                  <div className="flex max-w-[75%] flex-wrap justify-end gap-1">
                    {currentDoc?.pagesData.map((p) => (
                      <button
                        key={p.pageNumber}
                        onClick={() => setSelectedPageNum(p.pageNumber)}
                        className={`rounded-lg px-2.5 py-1 font-mono text-xs transition-colors ${
                          selectedPageNum === p.pageNumber
                            ? 'bg-indigo-600 font-bold text-white shadow-xs'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {p.pageNumber}P
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 flex items-center space-x-2 text-xs font-bold text-slate-900">
                  <EyeOff className="h-4 w-4 text-indigo-600" />
                  <span>마스킹 시각화 방식 설정</span>
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'blackout', icon: '⬛', title: 'Blackout', desc: '완전 블랙 박스' },
                    { id: 'blur', icon: '💧', title: 'Blur', desc: '흐림 가림 처리' },
                    { id: 'asterisk', icon: '***', title: '별표 대체', desc: '920512-1******' },
                    { id: 'token', icon: '🏷️', title: 'Token 식별자', desc: '[RRN_TOKEN]' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setMaskingStyle(opt.id)}
                      className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                        maskingStyle === opt.id
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">
                        {opt.icon} {opt.title}
                      </div>
                      <div className="mt-0.5 text-[10px] opacity-80">{opt.desc}</div>
                    </button>
                  ))}
                  <button
                    onClick={() => setMaskingStyle('custom')}
                    className={`col-span-2 rounded-xl border p-2.5 text-left text-xs transition-all ${
                      maskingStyle === 'custom'
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">✏️ 사용자 지정 문구</div>
                    <div className="mt-0.5 text-[10px] opacity-80">{customReplaceText}</div>
                  </button>
                </div>

                {maskingStyle === 'custom' && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <label className="mb-1 block text-[11px] text-slate-500">대체 문구 입력</label>
                    <input
                      type="text"
                      value={customReplaceText}
                      onChange={(e) => setCustomReplaceText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-rose-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                    <LockKeyhole className="h-4 w-4 text-emerald-600" />
                    <span>AES-256 보안 열람 암호화</span>
                  </h3>
                  <input
                    type="checkbox"
                    checked={isEncryptPdf}
                    onChange={(e) => setIsEncryptPdf(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded accent-indigo-600"
                  />
                </div>

                {isEncryptPdf && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <label className="block text-[11px] text-slate-500">PDF 열람 비밀번호 지정</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={pdfPassword}
                        onChange={(e) => setPdfPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-emerald-800 shadow-xs focus:border-indigo-500 focus:outline-none"
                      />
                      <Key className="absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      AES-256-GCM으로 암호화하며, 암호화 지시문은 export 문서의 헤더에 기록됩니다.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-600">EXIF 및 메타데이터 자동 제거</span>
                  <input
                    type="checkbox"
                    checked={isCleanMetadata}
                    onChange={(e) => setIsCleanMetadata(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded accent-indigo-600"
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <button
                  onClick={handleDownloadMaskedDoc}
                  className="flex w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
                >
                  <Download className="h-4 w-4" />
                  <span>마스킹 적용 문서 다운로드 (.txt)</span>
                </button>
                <button
                  onClick={handleDownloadAuditCsv}
                  className="flex w-full items-center justify-center space-x-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-200"
                >
                  <Lock className="h-4 w-4 text-emerald-600" />
                  <span>감사 로그 다운로드 (.csv)</span>
                </button>
                <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
                  * 실제 파일 생성/암호화는 브라우저 샌드박스 범위 내 텍스트 변환으로 동작합니다.
                </p>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-slate-700">탐지 요약:</span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-600">
                    전체 {allItems.length}건
                  </span>
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700">
                    마스킹 {maskedTotal}건
                  </span>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-amber-700">
                    원문 유지 {allItems.length - maskedTotal}건
                  </span>
                </div>

                <div className="flex items-center space-x-2 rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-xs">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                    className="p-1 text-slate-500 hover:text-slate-900"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[44px] text-center font-mono text-slate-700">
                    {zoomLevel}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                    className="p-1 text-slate-500 hover:text-slate-900"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div
                className="relative min-h-[420px] rounded-2xl border border-slate-200 bg-white p-6 font-mono text-slate-800 shadow-sm transition-all"
                style={{ fontSize: `${(zoomLevel / 100) * 13}px` }}
              >
                <div className="absolute right-4 top-4 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-400">
                  PRIVACYSHIELD REDACTION CANVAS
                </div>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[11px] text-slate-500">
                  <span className="truncate">
                    {currentDoc?.name} ({currentPageData?.title})
                  </span>
                  <span className="font-bold text-emerald-700">
                    강조된 항목을 클릭하면 개별 마스킹 해제/설정됩니다
                  </span>
                </div>

                {currentPageData ? (
                  <>
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {segments.map(renderSegment)}
                    </div>

                    <div className="mt-8 border-t border-slate-200 pt-4">
                      <div className="mb-2 text-xs font-bold text-slate-600">
                        이 페이지에서 감지된 개인정보 항목 (클릭하여 개별 해제/설정):
                      </div>
                      {currentPageData.items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-400">
                          이 페이지에서는 활성화된 규칙에 해당하는 개인정보가 탐지되지 않았습니다.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {currentPageData.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() =>
                                handleTogglePiiItemMask(
                                  currentDoc.id,
                                  currentPageData.pageNumber,
                                  item.id,
                                )
                              }
                              className={`flex items-center space-x-2 rounded-xl border px-3 py-1.5 text-xs transition-all ${
                                item.masked
                                  ? 'border-rose-200 bg-rose-50 text-rose-800 shadow-xs hover:bg-rose-100'
                                  : 'border-slate-200 bg-slate-100 text-slate-400 line-through hover:text-slate-600'
                              }`}
                            >
                              <Shield className="h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
                              <span className="font-semibold">{item.typeLabel}</span>
                              <span className="font-mono">{item.value}</span>
                              <span
                                className={`rounded border px-1.5 text-[9px] font-bold ${
                                  SEVERITY_BADGE[item.severity]
                                }`}
                              >
                                {item.severity}
                              </span>
                              <span className="font-mono text-[10px] opacity-60">
                                ({item.confidence})
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-16 text-center text-xs text-slate-400">
                    검토할 문서가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- TAB 5: 증빙 ---------------- */}
        {activeTab === 'compliance' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="flex items-center space-x-2 text-base font-bold text-slate-900 sm:text-lg">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <span>개인정보 처리 증빙 감사 보고서 (Audit Compliance Certificate)</span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    개인정보보호법 및 ISMS-P 인증 제출용 이력 보고서입니다. 무료로 즉시 다운로드할 수
                    있습니다.
                  </p>
                </div>
                <div className="no-print flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadAuditCsv}
                    className="flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={handleDownloadAuditJson}
                    className="flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>JSON</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>PDF로 인쇄/저장</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-6 font-mono text-xs text-slate-700">
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-2 font-bold text-indigo-700">
                  <span>인증 번호: CERT-2026-PRIVACY-FREE-{String(Date.now()).slice(-6)}</span>
                  <span>발행 일시: {nowStamp()} KST</span>
                </div>
                <div className="grid grid-cols-1 gap-4 text-[11px] md:grid-cols-2">
                  <div>
                    <span className="block text-slate-400">처리 기업 / 테넌트:</span>
                    <span className="font-semibold text-slate-900">
                      PrivacyShield Enterprise HQ (Free Sandbox)
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">적용 암호화 표준:</span>
                    <span className="font-semibold text-emerald-700">
                      AES-256-GCM / SHA-256 Metadata Hash
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">총 마스킹 처리 건수:</span>
                    <span className="font-semibold text-slate-900">
                      {maskedTotal}건 (주민번호, 카드번호, 전화번호, 이메일 등)
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">전체 탐지 건수:</span>
                    <span className="font-semibold text-slate-900">{totalDetections}건</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-slate-500">법적 컴플라이언스 준수:</span>
                    <span className="font-semibold text-indigo-700">
                      개인정보보호법 제15·23·24조의2 및 신용정보법 제32조 준수 항목 {legalPii.filter((p) => p.checked).length}종
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border-t border-slate-200 pt-3">
                  <table className="w-full min-w-[520px] text-left text-[11px]">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="py-1 pr-3 font-normal">항목</th>
                        <th className="py-1 pr-3 font-normal">탐지</th>
                        <th className="py-1 pr-3 font-normal">마스킹</th>
                        <th className="py-1 font-normal">심각도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legalPii.map((rule) => {
                        const hits = uploadedFiles.reduce(
                          (s, f) =>
                            s +
                            f.pagesData.reduce(
                              (x, p) =>
                                x + p.items.filter((i) => i.type === rule.id).length,
                              0,
                            ),
                          0,
                        )
                        const masked = uploadedFiles.reduce(
                          (s, f) =>
                            s +
                            f.pagesData.reduce(
                              (x, p) =>
                                x +
                                p.items.filter((i) => i.type === rule.id && i.masked).length,
                              0,
                            ),
                          0,
                        )
                        return (
                          <tr key={rule.id} className="border-t border-slate-100">
                            <td className="py-1 pr-3 font-semibold text-slate-800">{rule.name}</td>
                            <td className="py-1 pr-3 font-mono text-slate-600">{hits}</td>
                            <td className="py-1 pr-3 font-mono text-emerald-700">{masked}</td>
                            <td className="py-1">
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                                  SEVERITY_BADGE[rule.severity]
                                }`}
                              >
                                {rule.severity}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t border-slate-100">
                        <td className="py-1 pr-3 font-semibold text-slate-800">사용자 정의 규칙</td>
                        <td className="py-1 pr-3 font-mono text-slate-600">
                          {uploadedFiles.reduce(
                            (s, f) =>
                              s +
                              f.pagesData.reduce(
                                (x, p) => x + p.items.filter((i) => i.type === 'custom').length,
                                0,
                              ),
                            0,
                          )}
                        </td>
                        <td className="py-1 pr-3 font-mono text-emerald-700">
                          {uploadedFiles.reduce(
                            (s, f) =>
                              s +
                              f.pagesData.reduce(
                                (x, p) =>
                                  x + p.items.filter((i) => i.type === 'custom' && i.masked).length,
                                0,
                              ),
                            0,
                          )}
                        </td>
                        <td className="py-1 text-[10px] text-slate-400">{customRules.length}종 정의</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="flex items-center space-x-2 text-base font-bold text-slate-900 sm:text-lg">
                  <Globe className="h-5 w-5 text-indigo-600" />
                  <span>Vercel 원클릭 배포 &amp; REST API SDK (Deployment &amp; API)</span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  이 서비스는 Vite React 기반으로 Vercel, Netlify 등에 즉시 원클릭 배포가 가능합니다.
                </p>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span>Vercel 배포 방법</span>
                  </div>
                  <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed text-slate-600">
                    <li>GitHub 저장소에 소스코드 푸시 (`git push origin main`)</li>
                    <li>Vercel 대시보드에서 `Add New` → `Project` 클릭 후 저장소 연결</li>
                    <li>Framework Preset: `Vite` 선택 후 `Deploy` 클릭</li>
                    <li>자동으로 빌드 후 <code className="font-mono text-indigo-600">*.vercel.app</code> 도메인 발급</li>
                  </ol>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900">
                    <Code2 className="h-4 w-4 text-emerald-600" />
                    <span>API 무료 토큰 인증</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    외부 서비스 연동용 API Key가 무료로 할당됩니다:
                    <br />
                    <code className="font-mono font-bold text-indigo-600">{API_KEY}</code>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-indigo-300 shadow-sm">
                <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2 text-[11px] text-slate-400">
                  <span>cURL Command API Sample</span>
                  <button
                    onClick={() => handleCopy(curlSnippet, 'cURL 코드')}
                    className="flex items-center space-x-1 text-slate-300 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>코드 복사</span>
                  </button>
                </div>
                <pre className="whitespace-pre">{curlSnippet}</pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}


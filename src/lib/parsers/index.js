/**
 * 문서 파서 디스패처
 *
 * 확장자/MIME 별로 적절한 파서를 배정하고, 모든 파서를
 * "동일한 결과 형태"로 정규화합니다.
 *
 *   {
 *     kind: 'pdf'|'docx'|'xlsx'|'text'|'csv'|'image'|'unknown',
 *     pageCount, text, pages: [{pageNumber, title, text, runs?}],
 *     warnings: string[], sheets?, needsOcr?
 *   }
 *
 * 어떤 경우에도 원본 바이너리를 그대로 텍스트로 취급하지 않습니다.
 */
import { parseDocx } from './docx.js'
import { parseXlsx } from './xlsx.js'
import { runOcr } from './ocr.js'

/**
 * pdf.js 는 무거우므로 실제 PDF 를 다룰 때만 동적으로 불러온다.
 * (초기 번들 크기를 줄여 첫 페이지 로딩을 빠르게 유지)
 */
let pdfMod = null
async function loadPdf() {
  if (!pdfMod) pdfMod = await import('./pdf.js')
  return pdfMod
}

export async function renderPdfPage(...args) {
  const m = await loadPdf()
  return m.renderPdfPage(...args)
}

export function warmupPdfWorker() {
  return loadPdf()
}

const EXT = (name) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
const MIME = (file) => (file.type ?? '').toLowerCase()

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff'])
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'log', 'json', 'xml', 'html', 'htm', 'yaml', 'yml', 'ini', 'sql', 'ts', 'js', 'py', 'java', 'go', 'rb', 'php', 'c', 'h', 'cpp', 'rs'])

/** 텍스트 파일은 UTF-8 → CP949 순서로 복원 시도 (한국어 레거시 인코딩 대응) */
async function decodeTextFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf)

  // UTF-8 해석 실패가 없지만 한글이 깨졌다면(EUC-KR/CP949) 재해석
  const hasReplacement = text.includes('\uFFFD')
  if (hasReplacement) {
    try {
      const cp949 = new TextDecoder('euc-kr', { fatal: false })
      const alt = cp949.decode(buf)
      const bad = (s) => (s.match(/\uFFFD/g) ?? []).length
      if (bad(alt) < bad(text)) text = alt
    } catch {
      /* 브라우저가 euc-kr 미지원이면 UTF-8 결과 유지 */
    }
  }
  return text
}

/** 긴 텍스트를 가상 페이지로 나눈다 (실제 페이지 개념이 없는 포맷용) */
function paginate(text, charsPerPage = 3000) {
  const lines = text.split('\n')
  const pages = []
  let buf = []
  let len = 0

  for (const line of lines) {
    buf.push(line)
    len += line.length + 1
    if (len >= charsPerPage) {
      pages.push(buf.join('\n'))
      buf = []
      len = 0
    }
  }
  if (buf.length) pages.push(buf.join('\n'))
  if (pages.length === 0) pages.push('')

  return pages.map((t, i) => ({
    pageNumber: i + 1,
    title: `페이지 ${i + 1} / ${pages.length}`,
    text: t,
  }))
}

function normalize(name, ext, mime, extra) {
  return {
    name,
    ext: (ext || 'FILE').toUpperCase(),
    mime,
    warnings: [],
    needsOcr: false,
    ...extra,
  }
}

/**
 * @param {File} file
 * @param {{ onProgress?: (p:any)=>void, maxPages?: number }} [opts]
 */
export async function parseFile(file, opts = {}) {
  const { onProgress } = opts
  const ext = EXT(file.name)
  const mime = MIME(file)
  const warnings = []

  onProgress?.({ stage: '읽는 중', progress: 0.02, detail: file.name })

  /* ---------------------------- PDF ---------------------------- */
  if (ext === 'pdf' || mime === 'application/pdf') {
    const { parsePdf } = await loadPdf()
    onProgress?.({ stage: 'PDF 텍스트 레이어 추출', progress: 0.15 })

    const { pages, numPages, hasText } = await parsePdf(file, {
      maxPages: opts.maxPages ?? 300,
      onProgress: (done, total) =>
        onProgress?.({
          stage: `PDF 파싱 ${done}/${total} 페이지`,
          progress: 0.15 + (done / total) * 0.75,
        }),
    })

    if (!hasText) {
      warnings.push(
        '이 PDF에는 텍스트 레이어가 없습니다 (스캔 이미지). 마스킹을 위해 OCR 실행이 필요합니다.',
      )
    }
    if (numPages > pages.length) {
      warnings.push(`전체 ${numPages}페이지 중 앞 ${pages.length}페이지만 파싱했습니다.`)
    }

    return normalize(file.name, ext, mime, {
      kind: 'pdf',
      warnings,
      needsOcr: !hasText,
      numPages,
      pageCount: pages.length,
      text: pages.map((p) => p.text).join('\n\n'),
      pages: pages.map((p) => ({
        pageNumber: p.pageNumber,
        title: `페이지 ${p.pageNumber} / ${pages.length}`,
        text: p.text,
        runs: p.runs,
        width: p.width,
        height: p.height,
      })),
    })
  }

  /* --------------------------- DOCX ---------------------------- */
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const buf = new Uint8Array(await file.arrayBuffer())
    onProgress?.({ stage: 'DOCX 본문 파싱', progress: 0.4 })
    const { text } = parseDocx(buf)
    if (!text.trim()) warnings.push('DOCX에서 텍스트를 추출하지 못했습니다 (이미지 삽입 문서일 수 있습니다).')
    const pages = paginate(text)
    return normalize(file.name, ext, mime, {
      kind: 'docx',
      warnings,
      pageCount: pages.length,
      text,
      pages,
    })
  }

  /* --------------------------- XLSX ---------------------------- */
  if (['xlsx', 'xlsm', 'xlsb'].includes(ext) || mime.includes('spreadsheetml') || mime.includes('ms-excel')) {
    const buf = new Uint8Array(await file.arrayBuffer())
    onProgress?.({ stage: 'XLSX 시트 파싱', progress: 0.4 })
    const { sheets, text } = parseXlsx(buf)

    // 시트 1개 = 페이지 1개 로 매핑 (엑셀 구조 그대로 유지)
    const pages = sheets.map((s, i) => ({
      pageNumber: i + 1,
      title: `시트 ${i + 1}: ${s.name}`,
      text: s.text,
    }))

    return normalize(file.name, ext, mime, {
      kind: 'xlsx',
      warnings,
      sheets,
      pageCount: pages.length,
      text,
      pages,
    })
  }

  /* ------------------------ TEXT / CSV ------------------------ */
  if (TEXT_EXT.has(ext) || mime.startsWith('text/') || ext === 'csv' || mime === 'text/csv') {
    const text = await decodeTextFile(file)
    const pages = paginate(text)
    return normalize(file.name, ext, mime, {
      kind: ext === 'csv' || mime === 'text/csv' ? 'csv' : 'text',
      warnings,
      pageCount: pages.length,
      text,
      pages,
    })
  }

  /* --------------------------- IMAGE --------------------------- */
  if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) {
    return normalize(file.name, ext, mime, {
      kind: 'image',
      warnings: ['이미지는 텍스트 레이어가 없어 OCR 실행이 필요합니다.'],
      needsOcr: true,
      pageCount: 1,
      text: '',
      pages: [{ pageNumber: 1, title: `이미지: ${file.name}`, text: '', imageSrc: null }],
    })
  }

  /* -------------------------- UNKNOWN -------------------------- */
  return normalize(file.name, ext, mime, {
    kind: 'unknown',
    warnings: [
      `'${(ext || '알 수 없는').toUpperCase()}' 형식은 본문 텍스트를 추출할 수 없어 자동 파싱을 건너뛰었습니다.`,
      '지원 형식: PDF, DOCX, XLSX, TXT, CSV, MD, JSON, 로그, 소스코드, PNG, JPG 등',
    ],
    pageCount: 0,
    text: '',
    pages: [],
  })
}

/** 이미지에 OCR 을 실행해 문서 객체를 갱신한다 */
export async function attachOcr(doc, imageFile, opts = {}) {
  const { onProgress } = opts
  const { text, confidence, words } = await runOcr(imageFile, {
    lang: opts.lang ?? 'kor+eng',
    onProgress: (p) => onProgress?.({ stage: p.status, progress: p.progress ?? 0 }),
  })

  return {
    ...doc,
    warnings: doc.warnings.filter((w) => !w.includes('OCR 실행이 필요합니다')),
    needsOcr: false,
    ocr: { confidence, wordCount: words.length },
    text,
    pages: [
      {
        pageNumber: 1,
        title: `OCR 결과: ${doc.name} (신뢰도 ${Math.round(confidence)}%)`,
        text,
        ocrWords: words,
        imageSrc: null,
      },
    ],
  }
}

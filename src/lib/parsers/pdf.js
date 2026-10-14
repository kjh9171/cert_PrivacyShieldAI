/**
 * PDF → 텍스트 + 좌표 레이어 파서 (pdf.js / pdfjs-dist)
 *
 * - 바이너리를 UTF-8 로 디코드하지 않고 PDF 구조를 직접 해석하므로
 *   `%PDF-1.5`, `stream`, 깨진 인코딩 같은 가비지가 캔버스에 노출되지 않습니다.
 * - 실제 페이지 수(numPages)를 그대로 사용하므로 "387페이지" 오인식이 발생하지 않습니다.
 * - 각 텍스트 조각의 좌표(bbox)를 함께 추출해 캔버스 위에 정밀한 마스킹 박스를 그립니다.
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { bboxFromTransform } from './pdfCoords.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * File/Blob → Uint8Array 변환 + 캐시.
 * pdf.js 는 File 객체를 받지 않고 바이너리(Uint8Array)를 요구하므로 반드시 변환해야 한다.
 *
 * 주의: pdf.js 는 전달된 ArrayBuffer 를 워커로 transfer 하면서 detach 시킨다.
 *       따라서 캐시된 버퍼를 그대로 재사용하면 두 번째 호출에서
 *       "ArrayBuffer at index 0 is already detached" 오류가 난다.
 *       → 매 호출마다 복사본(slice)을 넘기고 원본은 캐시에 보존한다.
 */
const byteCache = new WeakMap()

async function toBytes(input) {
  if (input instanceof Uint8Array) return input
  if (byteCache.has(input)) return byteCache.get(input)
  const bytes = new Uint8Array(await input.arrayBuffer())
  byteCache.set(input, bytes)
  return bytes
}

/** pdf.js 에 넘길 안전한 복사본 (detach 되어도 캐시 원본은 영향 없음) */
function forPdfjs(bytes) {
  return bytes.slice()
}

/** 텍스트 조각 간 한 줄로 붙여도 되는지 판단 (CJK 는 항상 붙임) */
const CJK = /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/

/**
 * @typedef {Object} TextRun
 * @property {string} str    텍스트 조각
 * @property {number[]} bbox [x0, y0, x1, y1] — PDF 좌표계(상단 기준, 단위 pt)
 *
 * @typedef {Object} ParsedPdfPage
 * @property {number} pageNumber
 * @property {string} text        읽기 순서로 재구성한 텍스트
 * @property {TextRun[]} runs     좌표 포함 텍스트 조각
 * @property {number} width       페이지 너비(pt)
 * @property {number} height      페이지 높이(pt)
 * @property {number} rotation    0/90/180/270
 */

function joinRuns(runs) {
  let text = ''
  let prev = null

  for (const run of runs) {
    if (!run.str) continue
    if (prev) {
      const sameLine = Math.abs(run.bbox[1] - prev.bbox[1]) < Math.max(2, run.bbox[3] - run.bbox[1])
      const gap = run.bbox[0] - prev.bbox[2]
      if (!sameLine) {
        text += '\n'
      } else if (CJK.test(prev.str.slice(-1)) || CJK.test(run.str[0])) {
        // 한글/중문/일본어는 고정폭이므로 간격 없이 이어붙인다
      } else if (gap > run.height * 0.3) {
        text += gap > run.height * 1.6 ? '\t' : ' '
      }
    }
    text += run.str
    prev = run
  }

  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/**
 * @param {ArrayBuffer|Uint8Array} data
 * @param {{ maxPages?: number, onProgress?: (done:number,total:number)=>void }} [opts]
 * @returns {Promise<{ pages: ParsedPdfPage[], numPages: number, hasText: boolean }>}
 */
export async function parsePdf(data, opts = {}) {
  const { maxPages = 300, onProgress } = opts
  const bytes = await toBytes(data)

  const task = pdfjsLib.getDocument({
    data: forPdfjs(bytes),
    // 폰트 CMap은 표준 판독에 필요 (일부 문서 한글 매핑)
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const pdf = await task.promise
  const numPages = pdf.numPages
  const pages = []
  let textRuns = 0

  for (let n = 1; n <= Math.min(numPages, maxPages); n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    const runs = []
    for (const item of content.items) {
      if (typeof item.str !== 'string' || item.str === '') continue

      const m = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const geom = bboxFromTransform(m, item.width, item.height)
      if (!geom) continue // 반전 텍스트(세로쓰기 등)는 마스킹 대상에서 제외

      runs.push({
        str: item.str,
        bbox: geom.bbox,
        height: geom.height,
      })
    }

    textRuns += runs.length
    pages.push({
      pageNumber: n,
      text: joinRuns(runs),
      runs,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation ?? 0,
    })

    onProgress?.(n, numPages)
    page.cleanup()
  }

  await pdf.destroy()
  return { pages, numPages, hasText: textRuns > 0 }
}

/**
 * 특정 페이지를 <canvas> 에 렌더링한다 (마스킹 오버레이의 배경 레이어).
 * @returns {Promise<{ canvas: HTMLCanvasElement, width:number, height:number, scale:number }>}
 */
export async function renderPdfPage(data, pageNumber, targetWidth = 900) {
  const bytes = await toBytes(data)
  const pdf = await pdfjsLib.getDocument({ data: forPdfjs(bytes), isEvalSupported: false }).promise
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(targetWidth / base.width, 3)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  const out = { canvas, width: canvas.width, height: canvas.height, scale, page }
  page.cleanup()
  await pdf.destroy()
  return out
}

/** worker 사전 로딩 (첫 업로드 지연 완화) */
export function warmupPdfWorker() {
  return pdfjsLib.GlobalWorkerOptions.workerSrc
}

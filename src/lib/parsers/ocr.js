/**
 * 이미지 OCR (tesseract.js) — 지연 로드
 *
 * tesseract.js + 언어 데이터가 수십 MB이므로 **동적 import** 로만 불러옵니다.
 * 초기 번들에 포함되지 않으므로 첫 페이지 로딩이 느려지지 않습니다.
 * 사용자가 이미지 업로드 후 [OCR 실행] 을 눌렀을 때만 실제로 다운로드됩니다.
 */

let tesseractPromise = null

/** 모듈과 워커를 실제로 다운로드한다 (최초 1회만 네트워크 비용 발생) */
async function ensureTesseract(onProgress) {
  if (!tesseractPromise) {
    tesseractPromise = (async () => {
      onProgress?.({ status: 'OCR 엔진 다운로드 중', progress: 0 })
      const mod = await import('tesseract.js')
      return mod.default ?? mod
    })()
  }
  return tesseractPromise
}

/**
 * 이미지에서 텍스트를 추출한다.
 * @param {File|Blob|HTMLImageElement|string} image
 * @param {{ lang?: string, onProgress?: (p:{status:string,progress:number})=>void }} [opts]
 * @returns {Promise<{ text: string, confidence: number, words: {text:string,bbox:number,confidence:number}[] }>}
 */
export async function runOcr(image, opts = {}) {
  const { lang = 'kor+eng', onProgress } = opts

  const Tesseract = await ensureTesseract(onProgress)
  let worker = null

  try {
    worker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => onProgress?.({ status: m.status ?? 'OCR 처리 중', progress: m.progress ?? 0 }),
    })

    const { data } = await worker.recognize(image)

    const words = (data.words ?? []).map((w) => ({
      text: w.text,
      bbox: w.bbox, // { x0, y0, x1, y1 }
      confidence: w.confidence,
    }))

    return {
      text: (data.text ?? '').trim(),
      confidence: data.confidence ?? 0,
      words,
    }
  } finally {
    await worker?.terminate()
  }
}

/** OCR 지원 여부 (언어 데이터 CDN 접근 가능 여부는 런타임에 판단) */
export function isOcrSupported() {
  return typeof window !== 'undefined'
}

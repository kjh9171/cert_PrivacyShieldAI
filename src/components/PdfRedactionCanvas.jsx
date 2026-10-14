/**
 * PDF 시각적 마스킹 캔버스
 *
 * pdf.js 로 실제 페이지를 <canvas> 에 렌더링하고,
 * 탐지된 개인정보의 좌표(bbox) 위에 마스킹 박스를 오버레이로 그립니다.
 * - 원본 픽셀 위에 검은 박스를 실제로 덮어 그린다 (텍스트 레이어가 화면에 남지 않음)
 * - 박스를 클릭하면 개별 마스킹 해제/재적용 가능
 */
import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText, Loader2, ScanText, Shield } from 'lucide-react'
import { renderPdfPage } from '../lib/parsers/index.js'
import { buildRedactionBoxes, toPercentBox } from '../lib/parsers/pdfCoords.js'

/**
 * @param {Object} props
 * @param {File} props.file          원본 PDF File
 * @param {number} props.pageNumber  1-based
 * @param {Array} props.runs          텍스트 조각 + 좌표
 * @param {Array} props.items         탐지된 개인정보 (start/end = 원문 문자열 인덱스)
 * @param {string} props.maskStyle    마스킹 스타일
 * @param {Function} props.onToggle   (itemId) => void
 * @param {boolean} props.needsOcr
 * @param {Function} props.onRunOcr
 * @param {boolean} props.ocrRunning
 */
export default function PdfRedactionCanvas({
  file,
  pageNumber,
  runs,
  items,
  maskStyle,
  onToggle,
  needsOcr,
  onRunOcr,
  ocrRunning,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [render, setRender] = useState(null) // { canvas, scale }
  const [error, setError] = useState(null)
  const [hovered, setHovered] = useState(null)

  // 페이지 렌더링
  useEffect(() => {
    if (!file) return
    let cancelled = false
    setError(null)

    renderPdfPage(file, pageNumber, 1000)
      .then((r) => {
        if (cancelled) return
        setRender({ canvas: r.canvas, scale: r.scale })
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })

    return () => {
      cancelled = true
    }
  }, [file, pageNumber])

  // 캔버스를 DOM 에 그린다
  useEffect(() => {
    const target = canvasRef.current
    if (!target || !render?.canvas) return
    const ctx = target.getContext('2d')
    target.width = render.canvas.width
    target.height = render.canvas.height
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(render.canvas, 0, 0)
  }, [render])

  if (error) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="mb-2 h-8 w-8 text-rose-500" />
        <p className="text-xs font-semibold text-rose-700">PDF 페이지를 렌더링할 수 없습니다</p>
        <p className="mt-1 text-[11px] text-rose-600">{error}</p>
      </div>
    )
  }

  // 박스 좌표는 PDF 포인트(pt) 단위다. 캔버스 픽셀은 pt * scale 이므로
  // 비율 계산에서 scale 이 약분되어 pt 기준으로 비교하면 된다.
  const s = render?.scale || 1
  const pageW = (render?.canvas?.width || 1) / s
  const pageH = (render?.canvas?.height || 1) / s
  const boxes = buildRedactionBoxes(runs, items)

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3"
        style={{ maxHeight: '62vh' }}
      >
        {!render ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="relative inline-block w-full">
            <canvas ref={canvasRef} className="block h-auto w-full rounded shadow-sm" />

            {/*
              마스킹 오버레이.
              캔버스는 CSS 로 컨테이너 너비에 맞춰 축소 표시되므로( intrinsic != displayed ),
              좌표를 픽셀이 아니라 **비율(%)** 로 지정해야 실제 글자 위 정확히 겹친다.
              픽셀로 지정하면 축소 비율만큼 오프셋되어 박스가 어긋난다.
            */}
            <div className="pointer-events-none absolute inset-0">
              {boxes.map((b) => (
                <button
                  key={b.item.id}
                  type="button"
                  onClick={() => onToggle(b.item.id)}
                  onMouseEnter={() => setHovered(b.item.id)}
                  onMouseLeave={() => setHovered(null)}
                  title={`${b.item.typeLabel} — 클릭하면 마스킹 해제`}
                  className={`pointer-events-auto absolute cursor-pointer transition-all ${boxStyle(b, maskStyle, hovered === b.item.id)}`}
                  style={toPercentStyle(toPercentBox(b, pageW, pageH))}
                >
                  {b.item.masked && maskStyle === 'token' ? (
                    <span className="flex h-full w-full items-center justify-center overflow-hidden font-mono text-[7px] font-bold text-emerald-900">
                      {b.item.type.toUpperCase()}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {needsOcr && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <ScanText className="h-4 w-4 flex-shrink-0" />
            <span>이 문서에는 텍스트 레이어가 없어 마스킹할 수 없습니다. OCR을 실행해 주세요.</span>
          </div>
          <button
            onClick={onRunOcr}
            disabled={ocrRunning}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {ocrRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
            {ocrRunning ? 'OCR 실행 중...' : 'OCR 실행'}
          </button>
        </div>
      )}

      {items.length === 0 && !needsOcr && render && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
          <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
          이 페이지에서는 활성 규칙에 해당하는 개인정보가 탐지되지 않았습니다.
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all ${
                item.masked
                  ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                  : 'border-slate-200 bg-slate-100 text-slate-400 line-through hover:text-slate-600'
              }`}
            >
              <Shield className="h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
              <span className="font-semibold">{item.typeLabel}</span>
              <span className="font-mono">{item.value}</span>
              <span className="text-[10px] opacity-60 font-mono">({item.confidence})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 비율 객체를 CSS style 로 변환 */
function toPercentStyle(p) {
  return {
    left: `${p.left}%`,
    top: `${p.top}%`,
    width: `${p.width}%`,
    height: `${p.height}%`,
  }
}

/** 스타일별 박스 CSS */
function boxStyle(b, style, hovered) {
  if (!b.item.masked) {
    return 'border-2 border-dashed border-amber-500 bg-amber-200/50'
  }
  const base = 'border-2'
  switch (style) {
    case 'blackout':
      return `${base} border-slate-900 bg-slate-900 opacity-95 hover:bg-slate-800`
    case 'blur':
      return `${base} border-indigo-300 bg-indigo-200/60 backdrop-blur-[2px] ${hovered ? 'opacity-40' : 'opacity-70'}`
    case 'asterisk':
      return `${base} border-indigo-500 bg-indigo-100/80`
    case 'token':
      return `${base} border-emerald-600 bg-emerald-200/90`
    default:
      return `${base} border-rose-500 bg-rose-200/90`
  }
}

/**
 * PDF 텍스트 좌표 계산 (순수 함수 — pdf.js 의존성 없음)
 *
 * pdf.js 의 transform 행렬을 화면 좌표(bbox)로 바꾸는 로직을 분리해
 * 단위 테스트가 가능하도록 한다.
 */

/**
 * 텍스트 조각의 transform 행렬 → bbox [x0, y0, x1, y1]
 *
 * @param {number[]} m      viewport.transform × item.transform 결과 (6개 원소)
 * @param {number} [itemWidth]  pdf.js 가 계산해준 텍스트 폭
 * @param {number} [itemHeight]
 * @returns {{bbox:number[], height:number}|null} 위/아래로 뒤집힌 텍스트면 null
 */
export function bboxFromTransform(m, itemWidth, itemHeight) {
  const [a, , c, d, e, f] = m

  // 위/아래로 뒤집힌 텍스트(긴 세로쓰기 등)는 마스킹 박스 계산에서 제외
  if (a < 0) return null

  // 폰트 크기 = 변환된 세로축 벡터 길이
  const height = Math.hypot(c, d) || itemHeight || 10
  // 폭은 pdf.js 가 계산한 값을 신뢰 (없을 때만 축 스케일로 근사)
  const width = itemWidth || Math.abs(a) || 0

  const x0 = e
  const y0 = f - height
  const x1 = e + width
  const y1 = f

  return { bbox: [x0, y0, x1, y1], height }
}

/**
 * 탐지 항목의 문자열 인덱스 구간을 텍스트 조각 좌표에 매칭해 마스킹 박스를 만든다.
 *
 * runs: [{ str, bbox, height }]
 * items: 탐지된 개인정보 (run.str 을 이어붙인 문자열 기준 start/end 는 사용하지 않고
 *        값 문자열로 직접 매칭한다)
 *
 * 비례폰트에서는 문자 폭이 균일하지 않아 선형 보간에 오차가 생긴다.
 * "덜 가림"은 개인정보 노출이므로 박스를 의도적으로 넓힌다(과잉 마스킹은 안전한 실패).
 *
 * @returns {{item:object, x:number, y:number, w:number, h:number}[]}
 */
export function buildRedactionBoxes(runs, items) {
  if (!runs?.length || !items?.length) return []

  const boxes = []
  for (const item of items) {
    const value = item?.value
    if (!value) continue

    for (const run of runs) {
      const at = run.str.indexOf(value)
      if (at < 0) continue

      const h = run.bbox[3] - run.bbox[1] || 6
      const pad = h * 0.8
      const runW = run.bbox[2] - run.bbox[0]
      const len = run.str.length || 1

      const relX0 = (at / len) * runW
      const relX1 = ((at + value.length) / len) * runW

      const x0 = Math.max(run.bbox[0], run.bbox[0] + relX0 - pad)
      const x1 = Math.min(run.bbox[2], run.bbox[0] + relX1 + pad)

      boxes.push({
        item,
        x: x0,
        y: Math.max(0, run.bbox[1] - h * 0.15),
        w: Math.max(x1 - x0, 2),
        h: h * 1.3,
      })
      break // 항목당 첫 매칭 조각 하나만
    }
  }
  return boxes
}

/**
 * bbox(pt) → 컨테이너 대비 비율(%) 좌표.
 * 캔버스가 CSS 로 축소 표시될 때도 정확히 겹치도록 픽셀 대신 비율을 쓴다.
 */
export function toPercentBox(box, pageWidth, pageHeight) {
  const w = pageWidth || 1
  const h = pageHeight || 1
  return {
    left: (box.x / w) * 100,
    top: (box.y / h) * 100,
    width: (box.w / w) * 100,
    height: (box.h / h) * 100,
  }
}
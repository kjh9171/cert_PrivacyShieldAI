/**
 * PrivacyShield AI - PII Detection & Masking Engine
 *
 * 순수 함수 모듈 (JSX 없음) — 브라우저 UI와 분리되어 단위 테스트가 가능합니다.
 * 모든 탐지기는 정규식 + 문맥 규칙으로 동작하며 서버 호출 없이 로컬에서 처리됩니다.
 */


/**
 * detector.codes 는 LEGAL_PII_PRESETS 의 id 와 매칭된다.
 * groups 는 실제 개인정보가 들어있는 캡처 그룹 인덱스.
 */
export const DETECTORS = [
  {
    code: 'rrn',
    typeLabel: '주민등록번호',
    severity: 'CRITICAL',
    confidence: '99.9%',
    re: /(\d{6})\s*-\s*([1-8])\s*(\d{6})/g,
  },
  {
    code: 'card',
    typeLabel: '신용/체크카드번호',
    severity: 'HIGH',
    confidence: '99.8%',
    re: /(?<!\d)(\d{4})[\s-](\d{4})[\s-](\d{4})[\s-](\d{4})(?!\d)/g,
  },
  {
    // 국내 은행 통장 형식: 3-2~3-4~6-2~3 / 6-2-6 / 4-3-4-4
    code: 'card',
    typeLabel: '계좌번호',
    severity: 'HIGH',
    confidence: '98.3%',
    re: /(?<!\d)(\d{3}-\d{2,3}-\d{4,6}-\d{2,3}|\d{6}-\d{2}-\d{6}|\d{4}-\d{3}-\d{4}-\d{4})(?!\d)/g,
    groups: [1],
  },
  {
    // 운전면허번호는 2-2-6-2 고정 포맷 (계좌번호 규칙과 첫 그룹 자릿수로 구분)
    code: 'driver',
    typeLabel: '운전면허번호',
    severity: 'HIGH',
    confidence: '98.5%',
    re: /(?<!\d)(\d{2}-\d{2}-\d{6}-\d{2})(?!\d)/g,
    groups: [1],
  },
  {
    code: 'phone',
    typeLabel: '전화번호',
    severity: 'MEDIUM',
    confidence: '98.7%',
    re: /(?<!\d)(0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4})(?!\d)/g,
    groups: [1],
  },
  {
    code: 'email',
    typeLabel: '이메일 주소',
    severity: 'LOW',
    confidence: '97.5%',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    code: 'address',
    typeLabel: '주소',
    severity: 'LOW',
    confidence: '95.1%',
    re: /[가-힣]{2,}(?:특별시|광역시|특별자치도|특별자치시)[^\n,;()]{0,40}/g,
  },
  {
    code: 'name',
    typeLabel: '성명',
    severity: 'MEDIUM',
    confidence: '98.9%',
    re: /(?:성명|예금주|계좌주|명의자|投保者|동의자)\s*[:：]\s*([가-힣]{2,4})/g,
    groups: [1],
  },
  {
    code: 'name',
    typeLabel: '성명(호칭)',
    severity: 'MEDIUM',
    confidence: '96.4%',
    re: /([가-힣]{2,4})님(?=\s|$|,|\.)/g,
    groups: [1],
  },
]

/** 탐지 결과끼리 겹칠 경우 긴 쪽을 우선 선택한다. */
export function resolveOverlaps(found) {
  const sorted = [...found].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.end - a.end
  })
  const result = []
  for (const item of sorted) {
    const last = result[result.length - 1]
    if (last && item.start < last.end) continue
    result.push(item)
  }
  return result.sort((a, b) => a.start - b.start)
}

/**
 * 텍스트 한 덩어리에서 활성 규칙으로 개인정보를 탐지한다.
 * @returns 탐지된 엔티티 배열 (start/end 인덱스 포함)
 */
export function detectPii(text, enabledCodes, customRules, pageNumber) {
  const found = []

  for (const det of DETECTORS) {
    if (!enabledCodes.has(det.code)) continue
    const groups = det.groups ?? [0]
    const re = new RegExp(det.re.source, det.re.flags)
    let m
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      for (const g of groups) {
        const raw = m[g]
        if (raw === undefined) continue
        const offset = m[0].indexOf(raw)
        if (offset < 0) continue
        found.push({
          id: `${det.code}-${pageNumber}-${m.index + offset}`,
          type: det.code,
          typeLabel: det.typeLabel,
          value: raw,
          confidence: det.confidence,
          severity: det.severity,
          page: pageNumber,
          start: m.index + offset,
          end: m.index + offset + raw.length,
          masked: true,
        })
      }
    }
  }

  for (const rule of customRules) {
    if (!rule.enabled || !rule.regex) continue
    let re
    try {
      re = new RegExp(rule.regex, 'g')
    } catch {
      continue // 잘못된 정규식은 안전하게 건너뛴다
    }
    let m
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      found.push({
        id: `custom-${pageNumber}-${m.index}`,
        type: 'custom',
        typeLabel: rule.name,
        value: m[0],
        confidence: '규칙 100%',
        severity: 'MEDIUM',
        page: pageNumber,
        start: m.index,
        end: m.index + m[0].length,
        masked: true,
        category: rule.category,
      })
    }
  }

  return resolveOverlaps(found)
}

export function asteriskMask(value, type) {
  const stars = (n) => '*'.repeat(Math.max(n, 0))

  switch (type) {
    case 'rrn': {
      const digits = value.replace(/\D/g, '')
      return `${digits.slice(0, 6)}-${digits.slice(6, 7)}${stars(6)}`
    }
    case 'card': {
      if (value.includes('-')) {
        const parts = value.split('-')
        return parts
          .map((p, i) =>
            /^\d+$/.test(p)
              ? i === 0 || i === parts.length - 1
                ? p
                : stars(p.length)
              : p,
          )
          .join('-')
      }
      if (/^\d{16}$/.test(value)) {
        return `${value.slice(0, 4)} ${stars(4)} ${stars(4)} ${value.slice(12)}`
      }
      return `${value.slice(0, 3)}${stars(value.length - 5)}${value.slice(-2)}`
    }
    case 'phone': {
      // 구분자 구조를 유지한 채 앞쪽(지역번호/접두)과 뒤 4자리만 남긴다.
      const head = value.match(/^\d{2,3}/)?.[0].length ?? 3
      const keep = new Set()
      for (let i = 0; i < value.length; i++) {
        if (!/\d/.test(value[i])) continue
        const order = [...value.slice(0, i)].filter((c) => /\d/.test(c)).length
        const total = value.replace(/\D/g, '').length
        if (order < head || order >= total - 4) keep.add(i)
      }
      return value
        .split('')
        .map((c, i) => (/\d/.test(c) ? (keep.has(i) ? c : '*') : c))
        .join('')
    }
    case 'email': {
      const [local = '', domain = ''] = value.split('@')
      return `${local.slice(0, 2)}${stars(Math.max(local.length - 2, 0))}@${domain}`
    }
    case 'name': {
      return `${value.slice(0, 1)}${stars(value.length - 1)}`
    }
    case 'address': {
      // 시/군/구 단위까지는 유지하고 상세주소(도로명·건물번호)만 가린다.
      const m = value.match(/^(.*(?:시|군|구))/)
      return m ? `${m[1]} [상세주소 마스킹]` : `${value.slice(0, 4)} [마스킹]`
    }
    default:
      return `${value.slice(0, 2)}${stars(Math.max(value.length - 2, 0))}`
  }
}

export function maskToken(item) {
  if (item.type === 'custom') return `[${item.typeLabel.toUpperCase()}_TOKEN]`
  return `[${item.type.toUpperCase()}_TOKEN]`
}

/**
 * 페이지 텍스트 + 탐지 결과를 마스킹 스타일 적용된 세그먼트 배열로 변환.
 * @returns [{kind:'text',text}|{kind:'pii',item,rendered}]
 */
export function buildSegments(page, items, style, customText) {
  const segments = []
  let cursor = 0

  for (const item of items) {
    if (item.start > cursor) {
      segments.push({ kind: 'text', text: page.rawText.slice(cursor, item.start) })
    }

    let rendered
    if (!item.masked) {
      rendered = item.value
    } else if (style === 'blackout') {
      rendered = '█'.repeat(Math.max(Math.min(item.value.length, 14), 6))
    } else if (style === 'blur') {
      rendered = item.value
    } else if (style === 'asterisk') {
      rendered = asteriskMask(item.value, item.type)
    } else if (style === 'token') {
      rendered = maskToken(item)
    } else {
      rendered = customText || '[보안가림]'
    }

    segments.push({ kind: 'pii', item, rendered })
    cursor = item.end
  }

  if (cursor < page.rawText.length) {
    segments.push({ kind: 'text', text: page.rawText.slice(cursor) })
  }
  return segments
}

export function segmentsToPlainText(segments) {
  return segments.map((s) => (s.kind === 'text' ? s.text : s.rendered)).join('')
}

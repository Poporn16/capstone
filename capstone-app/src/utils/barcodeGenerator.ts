// Pure TypeScript Code-128B Barcode Generator (Zero Dependencies)
// Generates standard scannable Code 128 SVG barcodes for handheld & 2D scanners

// Code 128 pattern table (107 patterns for characters 0-106)
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (106 is STOP pattern)
]

const START_CODE_B = 104
const STOP_CODE = 106

/**
 * Encodes a string into Code 128B bar pattern sequence
 */
export function encodeCode128(text: string): string {
  if (!text) return ""

  // Start with Code B
  const codes: number[] = [START_CODE_B]
  let checkSum = START_CODE_B

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    // Code 128B supports ASCII 32 to 127
    const codeVal = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0
    codes.push(codeVal)
    checkSum += codeVal * (i + 1)
  }

  // Calculate Check Digit
  const checkDigit = checkSum % 103
  codes.push(checkDigit)
  codes.push(STOP_CODE)

  // Map to pattern string
  let pattern = ""
  for (const c of codes) {
    pattern += CODE128_PATTERNS[c] || ""
  }

  return pattern
}

export interface BarcodeSVGOptions {
  height?: number
  moduleWidth?: number
  includeText?: boolean
  label?: string
  price?: number | string
  manufacturer?: string
}

/**
 * Generates an SVG string of a scannable Code 128 barcode
 */
export function generateBarcodeSVG(text: string, options: BarcodeSVGOptions = {}): string {
  const {
    height = 55,
    moduleWidth = 2,
    includeText = true,
    label,
    price,
    manufacturer
  } = options

  const pattern = encodeCode128(text)
  if (!pattern) return ""

  let totalModules = 0
  for (let i = 0; i < pattern.length; i++) {
    totalModules += parseInt(pattern[i], 10)
  }

  const quietZone = moduleWidth * 10
  const svgWidth = totalModules * moduleWidth + quietZone * 2
  const textHeight = includeText ? 18 : 0
  const headerHeight = label ? 16 : 0
  const svgHeight = height + textHeight + headerHeight + 8

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background:#fff;">`

  let currentY = 4
  if (label) {
    const cleanLabel = label.length > 28 ? label.slice(0, 26) + "…" : label
    svg += `<text x="${svgWidth / 2}" y="${currentY + 10}" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#111827" text-anchor="middle">${cleanLabel}</text>`
    currentY += headerHeight
  }

  // Draw Bars
  let currentX = quietZone
  let isBar = true

  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10) * moduleWidth
    if (isBar) {
      svg += `<rect x="${currentX}" y="${currentY}" width="${width}" height="${height}" fill="#000000" />`
    }
    currentX += width
    isBar = !isBar
  }

  if (includeText) {
    const displayCode = text
    const extraInfo = [
      manufacturer ? `[${manufacturer}]` : "",
      price !== undefined && price !== "" ? `₱${Number(price).toFixed(2)}` : ""
    ].filter(Boolean).join(" • ")

    const footerText = extraInfo ? `${displayCode}  ${extraInfo}` : displayCode
    svg += `<text x="${svgWidth / 2}" y="${currentY + height + 13}" font-family="monospace" font-size="10" font-weight="bold" fill="#374151" text-anchor="middle" letter-spacing="1.5">${footerText}</text>`
  }

  svg += `</svg>`
  return svg
}

/**
 * Returns a Data URL for direct <img> rendering
 */
export function generateBarcodeDataUrl(text: string, options: BarcodeSVGOptions = {}): string {
  const svg = generateBarcodeSVG(text, options)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Formats a barcode string for Excel Barcode font columns (Code 39 / Libre Barcode 39)
 */
export function formatExcelBarcodeFontCode(barcode: string): string {
  if (!barcode) return ""
  const clean = barcode.trim().toUpperCase()
  return `*${clean}*`
}

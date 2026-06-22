import * as XLSX from 'xlsx'

/**
 * Parser Excel generik untuk format "sederhana": satu sheet, satu baris
 * header yang cocok dengan kolom yang diharapkan, diikuti baris data.
 *
 * Berbeda dari parser khusus mahasiswa (yang memindai banyak sheet tanpa
 * header eksplisit, untuk file absensi/nilai resmi kampus yang berantakan)
 * — fungsi ini mengasumsikan file sudah rapi seperti template CSV, hanya
 * disimpan dalam format .xlsx.
 *
 * Baris header dicari di antara 10 baris pertama (toleransi kalau ada
 * baris judul/merge cell di atasnya) — dianggap baris header kalau
 * minimal setengah dari expectedHeaders ditemukan di baris itu.
 */
export function parseExcelGeneric(
  workbook: XLSX.WorkBook,
  expectedHeaders: string[]
): Record<string, string>[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  let headerRowIdx = -1
  const headerMap: Record<string, number> = {}

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map((c: any) => String(c ?? '').toLowerCase().trim())
    const matched = expectedHeaders.filter(h => row.includes(h.toLowerCase()))
    if (matched.length >= Math.ceil(expectedHeaders.length / 2)) {
      headerRowIdx = i
      row.forEach((cell: string, idx: number) => { headerMap[cell] = idx })
      break
    }
  }

  if (headerRowIdx === -1) return []

  const result: Record<string, string>[] = []
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c: any) => !String(c ?? '').trim())) continue
    const obj: Record<string, string> = {}
    expectedHeaders.forEach(h => {
      const idx = headerMap[h.toLowerCase()]
      obj[h] = idx !== undefined ? String(row[idx] ?? '').trim() : ''
    })
    result.push(obj)
  }
  return result
}
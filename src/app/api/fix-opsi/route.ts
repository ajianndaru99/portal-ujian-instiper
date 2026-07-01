import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    const { data: soalList, error } = await supabase.from('soal').select('*')
    
    if (error) throw error

    let updatedCount = 0

    for (const soal of soalList) {
      let needsUpdate = false
      let newOpsi = soal.opsi_jawaban
      let newKunci = soal.kunci_jawaban

      // Fix opsi_jawaban
      if (Array.isArray(newOpsi)) {
        for (let i = 0; i < newOpsi.length; i++) {
          const opt = newOpsi[i]
          if (typeof opt === 'string') {
            // Check if it has broken format like "11. K. Jawaban" or "7. G. Jawaban" or "1. J. Jawaban"
            // We want to rewrite it to "K. Jawaban"
            const matchRusak = opt.match(/^(\d+)\.\s*([A-Z])\.\s*(.*)/i)
            if (matchRusak) {
              needsUpdate = true
              const correctLetter = matchRusak[2].toUpperCase()
              const text = matchRusak[3]
              newOpsi[i] = `${correctLetter}. ${text}`
            } else {
              // Check if it's just "7. Jawaban" without the letter
              const matchAngkaSaja = opt.match(/^(\d+)\.\s*(.*)/i)
              if (matchAngkaSaja && !opt.match(/^[A-Z]\.\s*/i)) {
                needsUpdate = true
                const text = matchAngkaSaja[2]
                const correctLetter = String.fromCharCode(65 + i)
                newOpsi[i] = `${correctLetter}. ${text}`
              }
            }
          }
        }
      }

      // Fix kunci_jawaban
      if (newKunci && typeof newKunci === 'string') {
        const num = parseInt(newKunci)
        if (!isNaN(num) && num >= 1 && num <= 26 && newKunci === String(num)) {
          // It's a number string like "7", "11", "1"
          needsUpdate = true
          newKunci = String.fromCharCode(65 + (num - 1))
        }
      }

      if (needsUpdate) {
        await supabase
          .from('soal')
          .update({ 
            opsi_jawaban: newOpsi,
            kunci_jawaban: newKunci
          })
          .eq('id', soal.id)
        
        updatedCount++
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Berhasil memperbaiki format opsi dan kunci jawaban pada ${updatedCount} soal yang rusak di database.` 
    })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

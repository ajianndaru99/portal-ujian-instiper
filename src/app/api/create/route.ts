import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ⚠️ Gunakan Service Role Key (bukan anon key!)
// Tambahkan SUPABASE_SERVICE_ROLE_KEY di file .env.local
// Ambil dari: Supabase Dashboard → Settings → API → service_role key
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-for-build'
  )
}

export async function POST(req: NextRequest) {
  try {
    const { nama, email } = await req.json()

    if (!nama?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nama dan email wajib diisi' }, { status: 400 })
    }

    // 1. Kirim email undangan via Supabase Auth
    //    Admin baru akan menerima link untuk mengatur password sendiri
    const supabaseAdmin = getSupabaseAdmin()
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim(), {
        data: { nama: nama.trim() },
      })

    if (authError) {
      if (authError.message.toLowerCase().includes('already been registered')) {
        return NextResponse.json({ error: 'Email ini sudah terdaftar' }, { status: 400 })
      }
      throw authError
    }

    if (!authData.user) {
      throw new Error('Gagal membuat akun Auth')
    }

    // 2. Insert ke tabel admins dengan UUID yang sama dengan auth.users
    const { error: dbError } = await supabaseAdmin.from('admins').insert({
      id: authData.user.id,
      email: email.trim(),
      nama: nama.trim(),
      role: 'admin',
      is_active: true,
    })

    if (dbError) {
      // Rollback: hapus user Auth jika insert tabel admins gagal
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (err: any) {
    console.error('[/api/admin/create]', err)
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan server' },
      { status: 500 }
    )
  }
}
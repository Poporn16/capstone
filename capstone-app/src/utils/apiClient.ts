import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qnihbfrulewagwamcwdp.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaWhiZnJ1bGV3YWd3YW1jd2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjY1MjksImV4cCI6MjA5OTk0MjUyOX0.ys5qnhncCJmvRj6YN2YZO9dTGiMJupZrLplAigtZrDI'

export const supabase = createClient(supabaseUrl, supabaseKey)

export const broadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('pharmacy_inventory_sync')
  : null

export function triggerGlobalSync() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refresh_sales_data'))
    try {
      localStorage.setItem('pinv_last_sync_signal', String(Date.now()))
    } catch (e) {}
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage('REFRESH_DATA')
      } catch (e) {}
    }
  }
}

export function triggerForceLogout(targetUsername: string, initiatedBy?: string) {
  if (typeof window !== 'undefined') {
    const payload = JSON.stringify({
      type: 'FORCE_LOGOUT',
      username: targetUsername.toLowerCase().trim(),
      initiatedBy: (initiatedBy || '').toLowerCase().trim(),
      time: Date.now()
    })
    window.dispatchEvent(new CustomEvent('force_user_logout', { detail: { username: targetUsername, initiatedBy } }))
    try {
      localStorage.setItem('pinv_logout_signal', payload)
    } catch (e) {}
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload)
      } catch (e) {}
    }
  }
}

export function triggerForceLogoutBelowSuperAdmin(initiatedBy?: string) {
  if (typeof window !== 'undefined') {
    const payload = JSON.stringify({
      type: 'FORCE_LOGOUT_BELOW_SUPER_ADMIN',
      initiatedBy: (initiatedBy || '').toLowerCase().trim(),
      time: Date.now()
    })
    window.dispatchEvent(new CustomEvent('force_logout_below_superadmin', { detail: { initiatedBy } }))
    try {
      localStorage.setItem('pinv_logout_below_superadmin_signal', payload)
    } catch (e) {}
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload)
      } catch (e) {}
    }
  }
}

export async function fetchAllSupabaseRows<T = any>(
  tableName: string,
  selectStr: string = '*',
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  const PAGE_SIZE = 1000
  let allRows: T[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const start = page * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    let query = supabase.from(tableName).select(selectStr).range(start, end)
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) {
      hasMore = false
    } else {
      allRows = allRows.concat(data as T[])
      if (data.length < PAGE_SIZE) {
        hasMore = false
      } else {
        page++
      }
    }
  }

  return allRows
}

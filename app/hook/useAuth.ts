"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabaseClient"
import type { Role, Profile } from "../types"

export function useAuth() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>("seller")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function init() {
      setLoading(true)
      setErrorMsg(null)

      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setErrorMsg(error.message)
        setLoading(false)
        return
      }

      const user = data.session?.user
      if (!user) {
        router.replace("/login")
        return
      }

      setUserId(user.id)

      const profRes = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", user.id)
        .maybeSingle()

      if (!mounted) return

      const r = ((profRes.data as any)?.role as Role) ?? "seller"
      setRole(r)
      setProfile({
        id: user.id,
        role: r,
        name: (profRes.data as any)?.name ?? null,
      })

      setLoading(false)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login")
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  return { loading, userId, role, profile, errorMsg, setErrorMsg, signOut }
}

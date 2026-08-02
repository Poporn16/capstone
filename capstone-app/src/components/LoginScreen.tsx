import { useState } from "react"
import { supabase } from "../utils/apiClient"
import { verifyAndMigratePassword, hashPassword } from "../utils/passwordUtils"
import { Lock, User, KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react"

interface LoginScreenProps {
  onAuthSuccess: (operator: { username: string; displayName: string; systemRole: string }) => void
  theme?: "light" | "dark"
}

export function LoginScreen({ onAuthSuccess, theme }: LoginScreenProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const isDark = theme === "dark"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg("")

    const cleanUsername = username.trim().toLowerCase()
    const cleanPassword = password.trim()

    // Check if account is currently active on another tab/device
    const HEARTBEAT_TIMEOUT = 10000
    const now = Date.now()
    let isAlreadyLoggedInElsewhere = false

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`pinv_active_heartbeat_${cleanUsername}`)) {
          const val = Number(localStorage.getItem(key))
          if (val && (now - val < HEARTBEAT_TIMEOUT)) {
            isAlreadyLoggedInElsewhere = true
            break
          }
        }
      }
    } catch (err) {}

    if (isAlreadyLoggedInElsewhere) {
      setIsLoading(false)
      setErrorMsg(`⚠️ Access Denied: Account "@${cleanUsername}" is currently logged in on another active session. Please log out from that session first.`)
      return
    }

    const { data: userProfile, error } = await supabase
      .from("operator_profiles")
      .select("*")
      .eq("username", cleanUsername)
      .single()

    setIsLoading(false)

    if (error || !userProfile) {
      setErrorMsg("Invalid username or password access code.")
      return
    }

    const storedPassword = userProfile.password_hash || userProfile.password_text || ""
    const isValidPassword = await verifyAndMigratePassword(cleanPassword, storedPassword, userProfile.id)

    if (!isValidPassword) {
      setErrorMsg("Invalid username or password access code.")
      return
    }

    // Save actual operator object to sessionStorage
    const sessionData = {
      username: String(userProfile.username).toLowerCase().trim(),
      displayName: userProfile.display_name || userProfile.username,
      systemRole: userProfile.system_role || "staff"
    }

    sessionStorage.setItem("current_terminal_operator", JSON.stringify(sessionData))
    onAuthSuccess(sessionData)
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 font-sans antialiased transition-colors duration-200 ${
      isDark ? "bg-slate-900 text-slate-100" : "bg-[#ECE6DD] text-[#1f2937]"
    }`}>
      {/* Background ambient decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#89A1A0]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#89A1A0]/20 rounded-full blur-3xl" />
      </div>

      <div className={`relative max-w-md w-full rounded-3xl p-8 shadow-2xl border transition-all ${
        isDark 
          ? "bg-slate-800/90 border-slate-700 backdrop-blur-md" 
          : "bg-white/95 border-[#799190]/30 backdrop-blur-md"
      }`}>
        
        {/* Header Branding */}
        <div className="text-center space-y-3 mb-6">
          <div className="w-20 h-20 bg-[#89A1A0] rounded-2xl mx-auto p-1 shadow-md border-2 border-white/60 flex items-center justify-center overflow-hidden transform hover:scale-105 transition-transform duration-200">
            <img 
              src="https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/401504104_122095038878121591_4438502913040853748_n.jpg?stp=dst-jpg_tt6&cstp=mx411x390&ctp=s411x390&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=Ft95k5nEUhgQ7kNvwEdA8VD&_nc_oc=AdqjX8JO54H9u5fUgSwQABVjJrejNbGOQXYz6IeG81-a88_I02lrMRRwNEFxJTxpHQG4mOYKT7nZvrBkQ8vzMfdQ&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=upjDGk5QBMqMv2fhQRvKFA&_nc_ss=7b289&oh=00_AQCfN0WpxXHhMh2frLHZKz7eRSuVSEaGu9-fKhjBG1tzkw&oe=6A6B53F5" 
              alt="Malabon Pharmacy Logo" 
              className="w-full h-full rounded-xl object-cover"
            />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-[#1c2d2c]"}`}>
              Malabon Pharmacy & Clinic
            </h1>
            <p className={`text-xs font-medium mt-1 ${isDark ? "text-slate-400" : "text-[#586b6a]"}`}>
              Pharmacy Inventory & POS Station
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-600 dark:text-rose-400 text-xs text-center font-medium flex items-center justify-center gap-2">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${
              isDark ? "text-slate-400" : "text-[#1c2d2c]/70"
            }`}>
              Operator Username
            </label>
            <div className="relative">
              <User className={`w-4 h-4 absolute left-3.5 top-3.5 ${
                isDark ? "text-slate-400" : "text-[#799190]"
              }`} />
              <input
                type="text"
                required
                placeholder="Enter username (e.g. staff1)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-2xl text-xs font-medium transition-all focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-slate-700/60 border border-slate-600 text-white placeholder-slate-400 focus:ring-[#89A1A0]"
                    : "bg-[#f5f1eb] border border-[#799190]/30 text-[#1c2d2c] placeholder-gray-400 focus:bg-white focus:ring-[#89A1A0]"
                }`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={`block text-[11px] font-bold uppercase tracking-wider ${
              isDark ? "text-slate-400" : "text-[#1c2d2c]/70"
            }`}>
              Password PIN
            </label>
            <div className="relative">
              <KeyRound className={`w-4 h-4 absolute left-3.5 top-3.5 ${
                isDark ? "text-slate-400" : "text-[#799190]"
              }`} />
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter password..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`w-full pl-10 pr-10 py-3 rounded-2xl text-xs font-mono font-medium transition-all focus:outline-none focus:ring-2 ${
                  isDark
                    ? "bg-slate-700/60 border border-slate-600 text-white placeholder-slate-400 focus:ring-[#89A1A0]"
                    : "bg-[#f5f1eb] border border-[#799190]/30 text-[#1c2d2c] placeholder-gray-400 focus:bg-white focus:ring-[#89A1A0]"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3.5 top-3.5 hover:opacity-80 transition-opacity ${
                  isDark ? "text-slate-400" : "text-[#799190]"
                }`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 bg-[#89A1A0] hover:bg-[#799190] text-[#1c2d2c] active:scale-[0.99] rounded-2xl font-bold text-xs tracking-wider uppercase shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-[#799190]/40"
          >
            <Lock className="w-4 h-4 text-[#1c2d2c]" />
            {isLoading ? "Authenticating Terminal..." : "Sign In To Terminal"}
          </button>
        </form>

        {/* Footer Security Badge */}
        <div className={`mt-6 pt-4 border-t text-center flex items-center justify-center gap-1.5 text-[11px] font-medium ${
          isDark ? "border-slate-700 text-slate-400" : "border-[#799190]/20 text-[#586b6a]"
        }`}>
          <ShieldCheck className="w-3.5 h-3.5 text-[#89A1A0]" />
          <span>Authorized Station Access Only</span>
        </div>

      </div>
    </div>
  )
}
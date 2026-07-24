import { useState } from "react"
import { supabase } from "./apiClient"
import { Lock, User, KeyRound } from "lucide-react"

interface LoginScreenProps {
  onAuthSuccess: (operator: { username: string; displayName: string; systemRole: string }) => void
}

export function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg("")

    const cleanUsername = username.trim().toLowerCase()
    const cleanPassword = password.trim()

    const { data, error } = await supabase
      .from("operator_profiles")
      .select("*")
      .eq("username", cleanUsername)
      .eq("password_text", cleanPassword)
      .single()

    setIsLoading(false)

    if (error || !data) {
      setErrorMsg("Invalid username or password access code.")
      return
    }

    // Save actual operator object to sessionStorage
    const sessionData = {
      username: String(data.username).toLowerCase().trim(),
      displayName: data.display_name || data.username,
      systemRole: data.system_role || "staff"
    }

    sessionStorage.setItem("current_terminal_operator", JSON.stringify(sessionData))
    onAuthSuccess(sessionData)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-8 space-y-6">
        
        <div className="text-center space-y-2">
          <img src="https://scontent.fmnl33-4.fna.fbcdn.net/v/t39.30808-6/401504104_122095038878121591_4438502913040853748_n.jpg?stp=dst-jpg_tt6&cstp=mx411x390&ctp=s411x390&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=OAvw0FXl_VoQ7kNvwHstYTv&_nc_oc=Adqj1kOXBM2s7duawflc5sv4jZBMQ9sRcfFj48udvMHTKk442l_Jef-L4C0e0TsKRbsOTRWx3X0nP8jYscL_RV0t&_nc_zt=23&_nc_ht=scontent.fmnl33-4.fna&_nc_gid=FUUM0mCkdj0gg6kxt7ZDsw&_nc_ss=7b289&oh=00_AQDViRkSBwjzENhANdCtluESuiSTujHdKczu-fqk41CJHA&oe=6A64F4B5" alt="Malabon Pharmacy Logo" className="w-16 h-16 rounded-2xl mx-auto shadow-md object-cover border border-gray-100"/>
          <h1 className="text-xl font-bold text-gray-900">Malabon Pharmacy and Clinic</h1>
          <p className="text-xs text-gray-500">Sign in to access your terminal session</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Operator Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                placeholder="e.g. staff1"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Password PIN
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                placeholder="Enter password..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs tracking-wide shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {isLoading ? "Authenticating Terminal..." : "Sign In To Terminal"}
          </button>
        </form>

      </div>
    </div>
  )
}
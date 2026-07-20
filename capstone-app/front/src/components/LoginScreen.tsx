import { useState } from "react"
import { supabase } from "./apiClient"
import { Lock, User, AlertCircle } from "lucide-react"

interface LoginScreenProps {
  onAuthSuccess: (operator: { username: string; displayName: string; systemRole: string }) => void
}

export function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setIsProcessing(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from("operator_profiles")
      .select("username, display_name, password_text, system_role")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle()

    if (error || !data) {
      setErrorMessage("The profile username parameter does not exist.")
      setIsProcessing(false)
      return
    }

    if (data.password_text !== password) {
      setErrorMessage("Invalid passcode credential confirmation provided.")
      setIsProcessing(false)
      return
    }

    onAuthSuccess({
      username: data.username,
      displayName: data.display_name,
      systemRole: data.system_role || "staff"
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4 text-xs font-medium">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 shadow-xl p-6 space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-2xl mx-auto shadow-md">
            💊
          </div>
          <div>
            <h2 className="text-gray-900 font-bold text-base tracking-wide">Malabon Pharmacy and Clinic</h2>
            <p className="text-gray-400 text-[10px] uppercase tracking-wider mt-0.5">Terminal Authentication Portal</p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Operator Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                required
                disabled={isProcessing}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter operator username..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-xs disabled:opacity-60"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-gray-500 font-bold uppercase text-[9px] tracking-wider">Security Access Code</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="password" 
                required
                disabled={isProcessing}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-xs disabled:opacity-60"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isProcessing || !username.trim() || !password.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow shadow-blue-500/10 transition-all hover:opacity-95 text-xs tracking-wide disabled:opacity-50"
          >
            {isProcessing ? "Verifying Credentials..." : "Authenticate Session"}
          </button>
        </form>
      </div>
    </div>
  )
}
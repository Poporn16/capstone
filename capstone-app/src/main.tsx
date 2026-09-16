import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter';
import './styles/index.css';
import App from './App.tsx'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleResetAndLogin = () => {
    try {
      sessionStorage.clear()
      localStorage.removeItem("pinv_session")
      localStorage.removeItem("current_terminal_operator")
    } catch (e) {}
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#ECE6DD] dark:bg-slate-900 font-sans text-slate-900 dark:text-white">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-2xl border border-gray-200 dark:border-slate-700 text-center space-y-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold">Terminal Interface Reconnected</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              An interface state change occurred. Please reload to resume your active session cleanly.
            </p>
            {this.state.error && (
              <pre className="text-[10px] text-left bg-gray-100 dark:bg-slate-900 p-2.5 rounded-xl overflow-x-auto text-rose-600 dark:text-rose-400 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetAndLogin}
                className="flex-1 py-2.5 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Return to Login
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)


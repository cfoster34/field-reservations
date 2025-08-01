import toast, { Toast } from 'react-hot-toast'

interface ToastOptions {
  title?: string
  description?: string
  duration?: number
}

export function useToast() {
  const showToast = (message: string, type: 'success' | 'error' | 'loading' = 'success', options?: ToastOptions) => {
    const toastOptions = {
      duration: options?.duration || 4000,
    }

    switch (type) {
      case 'success':
        return toast.success(message, toastOptions)
      case 'error':
        return toast.error(message, toastOptions)
      case 'loading':
        return toast.loading(message)
      default:
        return toast(message, toastOptions)
    }
  }

  const success = (message: string, options?: ToastOptions) => showToast(message, 'success', options)
  const error = (message: string, options?: ToastOptions) => showToast(message, 'error', options)
  const loading = (message: string) => showToast(message, 'loading')
  const dismiss = (toastId?: string) => toast.dismiss(toastId)

  return {
    toast: showToast,
    success,
    error,
    loading,
    dismiss,
  }
}
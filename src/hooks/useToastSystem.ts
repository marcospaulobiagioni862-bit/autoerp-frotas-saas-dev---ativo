import { useState } from 'react';

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
}

export default function useToastSystem() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const triggerToast = (
    message: string,
    type: ToastType = 'success'
  ) => {
    setToast({ message, type });
  };

  return {
    toast,
    setToast,
    triggerToast,
  };
}

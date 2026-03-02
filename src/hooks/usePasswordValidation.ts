import { useMemo } from "react";

export interface PasswordValidation {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isValid: boolean;
}

export function usePasswordValidation(password: string): PasswordValidation {
  return useMemo(() => {
    const minLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*_\-+=]/.test(password);
    return {
      minLength,
      hasUppercase,
      hasNumber,
      hasSpecial,
      isValid: minLength && hasUppercase && hasNumber && hasSpecial,
    };
  }, [password]);
}

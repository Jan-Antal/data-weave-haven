import { useMemo } from "react";

export interface PasswordValidation {
  minLength: boolean;
  hasNumberOrSpecial: boolean;
  isValid: boolean;
}

export function usePasswordValidation(password: string): PasswordValidation {
  return useMemo(() => {
    const minLength = password.length >= 8;
    const hasNumberOrSpecial = /[0-9!@#$%^&*_\-+=]/.test(password);
    return {
      minLength,
      hasNumberOrSpecial,
      isValid: minLength && hasNumberOrSpecial,
    };
  }, [password]);
}

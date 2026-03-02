import { usePasswordValidation } from "@/hooks/usePasswordValidation";
import { Check } from "lucide-react";

interface PasswordChecklistProps {
  password: string;
}

export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const { minLength, hasNumberOrSpecial } = usePasswordValidation(password);
  const started = password.length > 0;

  const items = [
    { met: minLength, label: "Alespoň 8 znaků" },
    { met: hasNumberOrSpecial, label: "Obsahuje číslo nebo speciální znak" },
  ];

  return (
    <ul className="mt-1.5 space-y-0.5">
      {items.map((item) => (
        <li
          key={item.label}
          className={`flex items-center gap-1.5 text-[11px] transition-colors ${
            started && item.met
              ? "text-green-600"
              : "text-muted-foreground"
          }`}
        >
          <Check className="h-3 w-3 flex-shrink-0" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

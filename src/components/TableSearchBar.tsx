import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TableSearchBar({ value, onChange, placeholder = "Hledat..." }: TableSearchBarProps) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 h-8 text-sm"
      />
    </div>
  );
}

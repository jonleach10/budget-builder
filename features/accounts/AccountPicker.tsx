"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { lastAccountCookie } from "./accountParams";
import type { AccountPicker as PickerData } from "./accountScreenData";

/**
 * A native select, as on Transactions. Choosing an account opens its page for the
 * same period. The shown account is remembered, by its ID only, for the next visit.
 */
export function AccountPicker({ picker }: { picker: PickerData }) {
  const router = useRouter();

  useEffect(() => {
    document.cookie = lastAccountCookie(picker.selected);
  }, [picker.selected]);

  const open = (id: string) => {
    const option = picker.options.find((o) => o.id === id);
    if (option) router.push(option.href);
  };

  return (
    <label className="flex w-full flex-col gap-1.5 md:w-[300px]">
      <span className="text-caption font-medium text-moon-mist">Account</span>
      {/* Uncontrolled, so the choice stays shown while its page loads. */}
      <NativeSelect
        key={picker.selected}
        aria-label="Account"
        defaultValue={picker.selected}
        onChange={(event) => open(event.target.value)}>
        {picker.options.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

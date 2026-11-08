"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { accountHref } from "./accountParams";
import type { AccountPicker as PickerData } from "./accountScreenData";

/** A native select, as on Transactions. Choosing an account opens its page. */
export function AccountPicker({ picker }: { picker: PickerData }) {
  const router = useRouter();

  return (
    <label className="flex w-full flex-col gap-1.5 md:w-[300px]">
      <span className="text-caption font-medium text-moon-mist">Account</span>
      {/* Uncontrolled, so the choice stays shown while its page loads. */}
      <NativeSelect
        key={picker.selected}
        aria-label="Account"
        defaultValue={picker.selected}
        onChange={(event) => router.push(accountHref(event.target.value))}>
        {picker.options.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

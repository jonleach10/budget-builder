export function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2 text-body-sm whitespace-nowrap text-moon-mist md:min-h-9">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[18px] accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {label}
    </label>
  );
}

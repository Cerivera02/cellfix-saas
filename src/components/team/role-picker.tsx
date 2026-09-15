import type { RoleOption, RoleOptions } from "@/lib/team/view";

function RoleCheckbox({ name, option, checked }: { name: string; option: RoleOption; checked: boolean }) {
  return (
    <label
      className={`flex gap-3 rounded-md px-2.5 py-2 ${
        option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-zinc-50"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={option.value}
        defaultChecked={checked}
        disabled={option.disabled}
        className="mt-0.5 size-4 shrink-0 accent-zinc-900"
      />
      {/* Un rol ya asignado que quien edita no puede otorgar se conserva tal cual. */}
      {option.disabled && checked && <input type="hidden" name={name} value={option.value} />}
      <span className="min-w-0">
        <span className="block text-sm text-zinc-900">{option.label}</span>
        <span className="block text-xs text-zinc-500">{option.description}</span>
      </span>
    </label>
  );
}

export function RolePicker({
  options,
  systemRoles = [],
  customRoles = [],
  error,
}: {
  options: RoleOptions;
  systemRoles?: readonly string[];
  customRoles?: readonly string[];
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-700">Roles</legend>
      <p className="mt-0.5 text-xs text-zinc-500">Puede tener varios; sus permisos se suman.</p>

      <div className="mt-2 flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-1">
        {options.system.map((option) => (
          <RoleCheckbox
            key={option.value}
            name="systemRoles"
            option={option}
            checked={systemRoles.includes(option.value)}
          />
        ))}

        {options.custom.length > 0 && (
          <>
            <p className="px-2.5 pt-3 pb-1 text-xs font-medium tracking-wide text-zinc-400 uppercase">Custom</p>
            {options.custom.map((option) => (
              <RoleCheckbox
                key={option.value}
                name="customRoles"
                option={option}
                checked={customRoles.includes(option.value)}
              />
            ))}
          </>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

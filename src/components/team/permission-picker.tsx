import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "@/lib/permissions";

export function PermissionPicker({
  selected,
  disabled = [],
  hidden = [],
  error,
}: {
  selected: readonly string[];
  disabled?: readonly Permission[];
  // Permisos de módulos apagados en el taller: no se muestran, pero si el rol ya los tenía se conservan.
  hidden?: readonly Permission[];
  error?: string;
}) {
  const groups = PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    permissions: group.permissions.filter((permission) => !hidden.includes(permission)),
  })).filter((group) => group.permissions.length > 0);
  const keptHidden = [...new Set(hidden)].filter((permission) => selected.includes(permission));
  const showDisabledNote = disabled.some((permission) => !hidden.includes(permission));

  return (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-700">Permisos</legend>

      <div className="mt-2 flex flex-col gap-4 rounded-lg border border-zinc-200 p-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{group.label}</p>
            <div className="mt-1.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {group.permissions.map((permission) => {
                const isDisabled = disabled.includes(permission);
                const isChecked = selected.includes(permission);
                return (
                  <label
                    key={permission}
                    className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm ${
                      isDisabled ? "cursor-not-allowed text-zinc-400" : "cursor-pointer text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="permissions"
                      value={permission}
                      defaultChecked={isChecked}
                      disabled={isDisabled}
                      className="size-4 shrink-0 accent-zinc-900"
                    />
                    {/* Un permiso ya incluido que quien edita no puede otorgar se conserva. */}
                    {isDisabled && isChecked && <input type="hidden" name="permissions" value={permission} />}
                    {PERMISSION_LABELS[permission]}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {keptHidden.map((permission) => (
        <input key={permission} type="hidden" name="permissions" value={permission} />
      ))}

      {showDisabledNote && (
        <p className="mt-1.5 text-xs text-zinc-500">Los permisos en gris no los tienes, así que no puedes otorgarlos.</p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

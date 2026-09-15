"use client";

import { CustomerQuickDialog } from "@/components/customers/customer-quick-dialog";
import { AsyncSelect, type SelectOption } from "@/components/ui/select";
import { searchCustomersAction } from "@/lib/customers/actions";

// Selector de cliente para la caja: busca en el servidor y permite dar de alta uno nuevo.
export function CustomerPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: SelectOption | null;
  onChange: (customer: SelectOption | null) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-700">
          Cliente <span className="text-red-600">*</span>
        </label>
        <CustomerQuickDialog onCreated={onChange} />
      </div>
      <div className="mt-1.5">
        <AsyncSelect
          id={id}
          value={value}
          onChange={onChange}
          loadOptions={searchCustomersAction}
          placeholder="Busca por nombre, teléfono o RFC"
        />
      </div>
      {value?.detail && <p className="mt-1 text-xs text-zinc-500">{value.detail}</p>}
    </div>
  );
}

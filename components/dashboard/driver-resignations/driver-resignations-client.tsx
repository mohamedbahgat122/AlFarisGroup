"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AddResignationDialog } from "./add-resignation-dialog";
import { ResignationRowActions } from "./resignation-row-actions";
import type { DriverResignationListResponse, SimpleDriver } from "@/features/driver-resignations/types";
import type { Dictionary } from "@/i18n/dictionaries";

function SearchIcon({ className, size = 24 }: { className?: string, size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
      <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function TableHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 font-semibold ${className}`}>
      {children}
    </th>
  );
}

function getDriverInitials(name: string) {
  return name.substring(0, 2).toUpperCase();
}

type Props = {
  dictionary: Dictionary["dashboard"]["drivers"];
  organizationCode: string;
  organizationId: string;
  resignations: DriverResignationListResponse;
  drivers: SimpleDriver[];
  page: number;
  searchTerm: string;
};

export function DriverResignationsClient({
  dictionary,
  organizationCode,
  organizationId,
  resignations,
  drivers,
  page,
  searchTerm,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSearch = (term: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) {
        params.set("search", term);
      } else {
        params.delete("search");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", newPage.toString());
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-normal text-navy">
            {dictionary.resignationsTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.resignationsDescription}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <AddResignationDialog
              dictionary={dictionary}
              organizationCode={organizationCode}
              organizationId={organizationId}
              drivers={drivers}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3 sm:px-7">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="search"
            placeholder={dictionary.searchResignations || "بحث..."}
            className="h-10 w-full rounded-xl border border-border bg-background pe-10 ps-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            defaultValue={searchTerm}
            onChange={(e) => {
              const handler = setTimeout(() => handleSearch(e.target.value), 300);
              return () => clearTimeout(handler);
            }}
          />
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7">
        <div className="overflow-hidden border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)] rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <TableHeader className="min-w-48">{dictionary.tableDriver}</TableHeader>
                  <TableHeader className="whitespace-nowrap">{dictionary.keetaIdAtResignation || "رقم كيتا"}</TableHeader>
                  <TableHeader className="whitespace-nowrap">{dictionary.resignationDate || "تاريخ الاستقالة"}</TableHeader>
                  <TableHeader className="whitespace-nowrap text-center">{dictionary.ordersCount || "عدد الطلبات"}</TableHeader>
                  <TableHeader className="whitespace-nowrap text-center">{dictionary.rating || "التقييم"}</TableHeader>
                  <TableHeader className="min-w-48 whitespace-nowrap">{dictionary.notes || "ملاحظات"}</TableHeader>
                  <TableHeader className="whitespace-nowrap text-center">حالة المحاسبة</TableHeader>
                  <TableHeader className="whitespace-nowrap text-center">{dictionary.createdBy || "بواسطة"}</TableHeader>
                  <TableHeader className="whitespace-nowrap w-24">{""}</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resignations.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">
                      لا يوجد استقالات مسجلة.
                    </td>
                  </tr>
                ) : (
                  resignations.items.map((resignation) => (
                    <tr key={resignation.id} className="align-middle transition hover:bg-primary-soft/35">
                      <td className="max-w-[260px] px-4 py-4">
                        <span className="me-3 inline-flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary-soft align-middle text-xs font-bold text-primary">
                          {getDriverInitials(resignation.driver.fullName)}
                        </span>
                        <div className="inline-block align-middle">
                          <p className="truncate text-sm font-bold text-navy">
                            {resignation.driver.fullName}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {resignation.driver.iqamaNumber} · {resignation.driver.mobileNumber}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-navy" title="معرف كيتا عند الاستقالة">
                            {resignation.keetaDriverId || "-"}
                          </span>
                          {resignation.newKeetaDriverId && (
                            <span className="text-xs font-bold text-primary mt-0.5" title="معرف كيتا الجديد">
                              {resignation.newKeetaDriverId}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted">
                        {resignation.resignationDate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted text-center">
                        {resignation.ordersCount.toLocaleString("ar-SA")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted text-center">
                        <div className="flex justify-center">
                          <span className={`inline-flex min-w-[32px] items-center justify-center rounded bg-gray-100 px-2 py-1 text-sm font-bold ${
                            resignation.rating === "A" ? "text-green-600 bg-green-50" :
                            resignation.rating === "B" ? "text-blue-600 bg-blue-50" :
                            resignation.rating === "C" ? "text-amber-600 bg-amber-50" :
                            "text-red-600 bg-red-50"
                          }`}>
                            {resignation.rating}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-4 text-sm font-medium text-muted" title={resignation.notes || ""}>
                        {resignation.notes || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center">
                        {resignation.isSettled ? (
                          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                            تمّت المحاسبة
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                            غير محاسب
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-muted text-center">
                        {resignation.createdBy?.fullName || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <ResignationRowActions 
                          resignation={resignation} 
                          organizationId={organizationId} 
                          dictionary={dictionary} 
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {resignations.total > 0 && (
          <div className={`mt-4 flex flex-col gap-3 text-sm font-semibold text-muted transition-opacity sm:flex-row sm:items-center sm:justify-between ${isPending ? "opacity-70" : ""}`}>
            <div className="space-y-1">
              <p>إجمالي {resignations.total.toLocaleString("ar-SA")} استقالة</p>
              <p>
                عرض {(((page - 1) * 20) + 1).toLocaleString("ar-SA")} إلى {Math.min(page * 20, resignations.total).toLocaleString("ar-SA")} من أصل {resignations.total.toLocaleString("ar-SA")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handlePageChange(page - 1)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
                >
                  السابق
                </button>
              ) : (
                <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
                  السابق
                </span>
              )}
              <span className="whitespace-nowrap px-2">
                الصفحة {page.toLocaleString("ar-SA")} من {Math.ceil(resignations.total / 20).toLocaleString("ar-SA")}
              </span>
              {resignations.hasMore ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handlePageChange(page + 1)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
                >
                  التالي
                </button>
              ) : (
                <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
                  التالي
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}


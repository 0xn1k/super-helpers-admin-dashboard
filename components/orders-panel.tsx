"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import {
  calculateOrderAmounts,
  orderPageSizeOptions,
  type AdminOrder,
  type OrderEmployerOption,
  type OrderPackageOption,
  type OrdersListResponseData,
} from "@/lib/orders";

type OrdersResponse = {
  status: number;
  message: string;
  data: OrdersListResponseData;
};

type OrderMutationResponse = {
  status: number;
  message: string;
  data: AdminOrder;
};

type OrderForm = {
  employerId: string;
  packageId: string;
  orderPackageName: string;
  orderPackagePrice: string;
  orderPackageGst: string;
  originalPaymentPrice: string;
  paymentType: string;
  paymentStatus: string;
  paymentGst: string;
  paymentTotalAmount: string;
  paymentAmountWithoutGst: string;
  paymentAmountWithOffer: string;
  paymentAmount: string;
  couponUsed: string;
  referralPoint: string;
  discountAmount: string;
  isReplacementActivate: boolean;
  contactTake: string;
  paymentInitiatedDate: string;
  paymentExpiryDate: string;
  metadataNotes: string;
};

const emptyForm: OrderForm = {
  employerId: "",
  packageId: "",
  orderPackageName: "",
  orderPackagePrice: "",
  orderPackageGst: "",
  originalPaymentPrice: "",
  paymentType: "ADMIN",
  paymentStatus: "PENDING",
  paymentGst: "",
  paymentTotalAmount: "",
  paymentAmountWithoutGst: "",
  paymentAmountWithOffer: "",
  paymentAmount: "",
  couponUsed: "",
  referralPoint: "0",
  discountAmount: "0",
  isReplacementActivate: false,
  contactTake: "0",
  paymentInitiatedDate: toDateTimeInput(new Date().toISOString()),
  paymentExpiryDate: "",
  metadataNotes: "",
};

const fallbackStatuses = ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"];

export function OrdersPanel() {
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [packages, setPackages] = useState<OrderPackageOption[]>([]);
  const [employers, setEmployers] = useState<OrderEmployerOption[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>(fallbackStatuses);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, totalPages: 1, totalItems: 0 });
  const [query, setQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [editForm, setEditForm] = useState<OrderForm>(emptyForm);
  const [editingOrder, setEditingOrder] = useState<AdminOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (paymentStatusFilter) {
      params.set("paymentStatus", paymentStatusFilter);
    }

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    params.set("page", String(pagination.page));
    params.set("pageSize", String(pagination.pageSize));

    return params.toString();
  }, [from, pagination.page, pagination.pageSize, paymentStatusFilter, query, to]);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const response = await fetch(`/api/admin/orders?${queryString}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as OrdersResponse | null;

    setIsLoading(false);

    if (!response.ok) {
      setMessage(result?.message ?? "Unable to load orders");
      return;
    }

    setOrders(result?.data.orders ?? []);
    setPackages(result?.data.packages ?? []);
    setEmployers(result?.data.employers ?? []);
    setPaymentStatuses(Array.from(new Set([...fallbackStatuses, ...(result?.data.paymentStatuses ?? [])])));
    setPagination(result?.data.pagination ?? { page: 1, pageSize: 25, totalPages: 1, totalItems: 0 });
  }, [queryString]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const response = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = (await response.json().catch(() => null)) as OrderMutationResponse | null;

    setIsSaving(false);

    if (!response.ok) {
      setMessage(result?.message ?? "Unable to create order");
      return;
    }

    setMessage("Order created");
    setForm({ ...emptyForm, paymentInitiatedDate: toDateTimeInput(new Date().toISOString()) });
    setActiveTab("list");
    await loadOrders();
  }

  async function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingOrder) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const response = await fetch(`/api/admin/orders/${encodeURIComponent(editingOrder.orderKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const result = (await response.json().catch(() => null)) as OrderMutationResponse | null;

    setIsSaving(false);

    if (!response.ok) {
      setMessage(result?.message ?? "Unable to update order");
      return;
    }

    setEditingOrder(null);
    setMessage("Order updated");
    await loadOrders();
  }

  function resetToFirstPage() {
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function openEditModal(order: AdminOrder) {
    setEditingOrder(order);
    setEditForm(formFromOrder(order));
  }

  const visibleStatuses = Array.from(new Set([form.paymentStatus, editForm.paymentStatus, ...paymentStatuses])).filter(Boolean);

  return (
    <div className="page-stack orders-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Order management</p>
          <h1>Orders</h1>
        </div>
        <button className="secondary-button inline-button" type="button" onClick={loadOrders}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </header>

      <section className="orders-tabs" aria-label="Order tabs">
        <button className={activeTab === "list" ? "active" : ""} type="button" onClick={() => setActiveTab("list")}>
          Orders
        </button>
        <button className={activeTab === "create" ? "active" : ""} type="button" onClick={() => setActiveTab("create")}>
          Create Order
        </button>
      </section>

      {message ? <p className="form-message">{message}</p> : null}

      {activeTab === "list" ? (
        <>
          <section className="lead-toolbar orders-toolbar" aria-label="Order filters">
            <label className="search-field">
              <Search size={17} />
              <input
                placeholder="Search order, employer, mobile, package"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetToFirstPage();
                }}
              />
            </label>
            <select
              value={paymentStatusFilter}
              onChange={(event) => {
                setPaymentStatusFilter(event.target.value);
                resetToFirstPage();
              }}
            >
              <option value="">All payment statuses</option>
              {paymentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <label className="date-field">
              <CalendarDays size={17} />
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  resetToFirstPage();
                }}
              />
            </label>
            <label className="date-field">
              <CalendarDays size={17} />
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  resetToFirstPage();
                }}
              />
            </label>
          </section>

          <section className="lead-table-wrap">
            <table className="lead-table orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Employer</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Dates</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>Loading orders...</td>
                  </tr>
                ) : null}
                {!isLoading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No orders found.</td>
                  </tr>
                ) : null}
                {orders.map((order) => (
                  <tr key={order.orderKey}>
                    <td>
                      <div className="lead-primary">
                        <strong>{order.order_id || order.payment_order_id || order.orderKey}</strong>
                        <span>Payment: {order.payment_order_id || "--"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="lead-secondary">
                        <span>{order.employer_name || "Unnamed employer"}</span>
                        <small>{order.employer_mobile || order.employer_email || "--"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="lead-secondary">
                        <span>{order.order_package_name || "--"}</span>
                        <small>ID {order.order_package_id ?? order.package_id ?? "--"}</small>
                      </div>
                    </td>
                    <td>
                      <span className="status-badge">{order.payment_status || "--"}</span>
                    </td>
                    <td>
                      <div className="lead-secondary">
                        <span>{formatCurrency(order.payment_ammount || order.payment_ammount_with_offer)}</span>
                        <small>Total {formatCurrency(order.payment_total_ammount)}</small>
                      </div>
                    </td>
                    <td>
                      <div className="lead-secondary">
                        <span>{formatDate(order.created_at)}</span>
                        <small>Expiry {formatDate(order.payment_expiry_date)}</small>
                      </div>
                    </td>
                    <td>
                      <button className="secondary-button inline-button" type="button" onClick={() => openEditModal(order)}>
                        <Edit3 size={15} />
                        View/Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <PaginationBar
            isLoading={isLoading}
            pagination={pagination}
            onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => setPagination((current) => ({ ...current, page: 1, pageSize }))}
          />
        </>
      ) : (
        <OrderFormView
          employers={employers}
          form={form}
          isSaving={isSaving}
          packages={packages}
          paymentStatuses={visibleStatuses}
          submitLabel="Create order"
          title="Create Order"
          onChange={setForm}
          onPackageChange={(packageId) => setForm((current) => applyPackageToForm(current, packages, packageId))}
          onSubmit={createOrder}
        />
      )}

      {editingOrder ? (
        <div className="modal-backdrop" role="presentation">
          <section className="order-modal" aria-label="Edit order" role="dialog">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Order detail</p>
                <h2>{editingOrder.order_id || editingOrder.payment_order_id || editingOrder.orderKey}</h2>
              </div>
              <button className="secondary-button icon-button" type="button" onClick={() => setEditingOrder(null)}>
                <X size={17} />
              </button>
            </header>

            <OrderFormView
              employers={employers}
              form={editForm}
              isSaving={isSaving}
              packages={packages}
              paymentStatuses={visibleStatuses}
              provider={editingOrder.provider}
              requireExpiry
              statusOptions={["PENDING", "DONE"]}
              submitLabel="Generate Payment"
              title="Editable Details"
              onChange={setEditForm}
              onPackageChange={(packageId) => {
                if (!window.confirm("Changing package will overwrite pricing fields from the selected package.")) {
                  return;
                }

                setEditForm((current) => applyPackageToForm(current, packages, packageId));
              }}
              onSubmit={updateOrder}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function OrderFormView({
  employers,
  form,
  isSaving,
  packages,
  paymentStatuses,
  provider,
  requireExpiry,
  statusOptions,
  submitLabel,
  title,
  onChange,
  onPackageChange,
  onSubmit,
}: {
  employers: OrderEmployerOption[];
  form: OrderForm;
  isSaving: boolean;
  packages: OrderPackageOption[];
  paymentStatuses: string[];
  provider?: AdminOrder["provider"];
  requireExpiry?: boolean;
  statusOptions?: string[];
  submitLabel: string;
  title: string;
  onChange: (form: OrderForm) => void;
  onPackageChange: (packageId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateField(field: keyof OrderForm, value: string | boolean) {
    const next = { ...form, [field]: value };

    if (field === "orderPackagePrice") {
      onChange(recalculateFromBase(next));
      return;
    }

    if (field === "orderPackageGst") {
      onChange(recalculateFromBase(next));
      return;
    }

    if (field === "discountAmount") {
      onChange(recalculateFromBase(next));
      return;
    }

    if (field === "paymentGst") {
      onChange(recalculateFromGstAmount(next));
      return;
    }

    if (field === "paymentTotalAmount") {
      onChange(recalculateFromTotal(next));
      return;
    }

    if (field === "paymentAmountWithOffer") {
      onChange({ ...next, paymentAmount: String(value) });
      return;
    }

    onChange(next);
  }

  return (
    <form className="order-form" onSubmit={onSubmit}>
      <div className="order-form-title">
        <PackageCheck size={18} />
        <h2>{title}</h2>
      </div>

      <section className="order-form-grid">
        <label className="field">
          Employer
          <select required value={form.employerId} onChange={(event) => updateField("employerId", event.target.value)}>
            <option value="">Select employer</option>
            {employers.map((employer) => (
              <option key={employer.id} value={employer.id}>
                {employer.name || employer.mobile || employer.email || `Employer ${employer.id}`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Package
          <select required value={form.packageId} onChange={(event) => onPackageChange(event.target.value)}>
            <option value="">Select package</option>
            {packages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.package_name} · {formatCurrency(Number(item.package_price))}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Package name
          <input value={form.orderPackageName} onChange={(event) => updateField("orderPackageName", event.target.value)} />
        </label>

        <label className="field">
          Payment status
          {statusOptions ? (
            <select
              required
              value={form.paymentStatus}
              onChange={(event) => updateField("paymentStatus", event.target.value)}
            >
              <option value="">Select status</option>
              {Array.from(new Set([...statusOptions, form.paymentStatus].filter(Boolean))).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                list="payment-statuses"
                required
                value={form.paymentStatus}
                onChange={(event) => updateField("paymentStatus", event.target.value)}
              />
              <datalist id="payment-statuses">
                {paymentStatuses.map((status) => (
                  <option key={status} value={status} />
                ))}
              </datalist>
            </>
          )}
        </label>

        <label className="field">
          Payment type
          <input value={form.paymentType} onChange={(event) => updateField("paymentType", event.target.value)} />
        </label>

        <label className="field">
          Base price
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.orderPackagePrice}
            onChange={(event) => updateField("orderPackagePrice", event.target.value)}
          />
        </label>

        <label className="field">
          GST %
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.orderPackageGst}
            onChange={(event) => updateField("orderPackageGst", event.target.value)}
          />
        </label>

        <label className="field">
          GST amount
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.paymentGst}
            onChange={(event) => updateField("paymentGst", event.target.value)}
          />
        </label>

        <label className="field">
          Total before discount
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.paymentTotalAmount}
            onChange={(event) => updateField("paymentTotalAmount", event.target.value)}
          />
        </label>

        <label className="field">
          Discount amount
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.discountAmount}
            onChange={(event) => updateField("discountAmount", event.target.value)}
          />
        </label>

        <label className="field">
          Final payable amount
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.paymentAmountWithOffer}
            onChange={(event) => updateField("paymentAmountWithOffer", event.target.value)}
          />
        </label>

        <label className="field">
          Paid amount
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.paymentAmount}
            onChange={(event) => updateField("paymentAmount", event.target.value)}
          />
        </label>

        <label className="field">
          Coupon code/name
          <input value={form.couponUsed} onChange={(event) => updateField("couponUsed", event.target.value)} />
        </label>

        <label className="field">
          Referral points
          <input
            min="0"
            step="1"
            type="number"
            value={form.referralPoint}
            onChange={(event) => updateField("referralPoint", event.target.value)}
          />
        </label>

        <label className="field">
          Contact usage
          <input
            min="0"
            step="1"
            type="number"
            value={form.contactTake}
            onChange={(event) => updateField("contactTake", event.target.value)}
          />
        </label>

        <label className="field">
          Payment initiated
          <input
            type="datetime-local"
            value={form.paymentInitiatedDate}
            onChange={(event) => updateField("paymentInitiatedDate", event.target.value)}
          />
        </label>

        <label className="field">
          Payment expiry
          <input
            required={requireExpiry}
            type="datetime-local"
            value={form.paymentExpiryDate}
            onChange={(event) => updateField("paymentExpiryDate", event.target.value)}
          />
        </label>

        <label className="field checkbox-field">
          <input
            checked={form.isReplacementActivate}
            type="checkbox"
            onChange={(event) => updateField("isReplacementActivate", event.target.checked)}
          />
          Replacement active
        </label>

        <label className="field order-notes">
          Admin notes / metadata
          <textarea value={form.metadataNotes} onChange={(event) => updateField("metadataNotes", event.target.value)} />
        </label>
      </section>

      <section className="amount-summary" aria-label="Amount summary">
        <span>Base {formatCurrency(toNumber(form.orderPackagePrice))}</span>
        <span>GST {formatCurrency(toNumber(form.paymentGst))}</span>
        <span>Total {formatCurrency(toNumber(form.paymentTotalAmount))}</span>
        <strong>Payable {formatCurrency(toNumber(form.paymentAmountWithOffer))}</strong>
      </section>

      {provider ? (
        <section className="provider-grid" aria-label="Read-only provider fields">
          <p className="section-kicker">Provider fields</p>
          <span>Razorpay payment: {provider.rzp_payment_id || "--"}</span>
          <span>Razorpay order: {provider.rzp_order_id || "--"}</span>
          <span>Status: {provider.rzp_status || "--"}</span>
          <span>Method: {provider.rzp_method || "--"}</span>
        </section>
      ) : null}

      <button className="primary-button inline-button" disabled={isSaving} type="submit">
        <Plus size={17} />
        {isSaving ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function PaginationBar({
  isLoading,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  isLoading: boolean;
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const firstItem = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);

  return (
    <section className="pagination-bar" aria-label="Orders pagination">
      <span>
        {firstItem}-{lastItem} of {pagination.totalItems}
      </span>
      <label>
        Rows
        <select value={pagination.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {orderPageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="pagination-actions">
        <button
          className="secondary-button icon-button"
          disabled={isLoading || pagination.page <= 1}
          type="button"
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          className="secondary-button icon-button"
          disabled={isLoading || pagination.page >= pagination.totalPages}
          type="button"
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}

function applyPackageToForm(form: OrderForm, packages: OrderPackageOption[], packageId: string) {
  const selectedPackage = packages.find((item) => String(item.id) === packageId);

  if (!selectedPackage) {
    return { ...form, packageId };
  }

  const basePrice = Number(selectedPackage.package_price);
  const gstPercentage = Number(selectedPackage.package_gst_percentage);
  const discountAmount = toNumber(form.discountAmount);
  const amounts = calculateOrderAmounts(basePrice, gstPercentage, discountAmount);

  return {
    ...form,
    packageId,
    orderPackageName: selectedPackage.package_name,
    orderPackagePrice: String(basePrice),
    orderPackageGst: String(gstPercentage),
    originalPaymentPrice: String(basePrice),
    paymentAmountWithoutGst: String(basePrice),
    paymentGst: String(amounts.payment_gst),
    paymentTotalAmount: String(amounts.payment_total_ammount),
    paymentAmountWithOffer: String(amounts.payment_ammount_with_offer),
    paymentAmount: String(amounts.payment_ammount_with_offer),
  };
}

function formFromOrder(order: AdminOrder): OrderForm {
  return {
    employerId: String(order.employer_id ?? ""),
    packageId: String(order.package_id ?? order.order_package_id ?? ""),
    orderPackageName: order.order_package_name ?? "",
    orderPackagePrice: String(order.order_package_price || order.original_payment_price || ""),
    orderPackageGst: String(order.order_package_gst || ""),
    originalPaymentPrice: String(order.original_payment_price || order.order_package_price || ""),
    paymentType: order.payment_type ?? "ADMIN",
    paymentStatus: order.payment_status ?? "PENDING",
    paymentGst: String(order.payment_gst || ""),
    paymentTotalAmount: String(order.payment_total_ammount || ""),
    paymentAmountWithoutGst: String(order.payment_ammount_without_gst || order.order_package_price || ""),
    paymentAmountWithOffer: String(order.payment_ammount_with_offer || ""),
    paymentAmount: String(order.payment_ammount || ""),
    couponUsed: order.coupon_used ?? "",
    referralPoint: String(order.refferal_point || 0),
    discountAmount: String(order.offer_taken || order.value_of_id || 0),
    isReplacementActivate: Boolean(order.is_replacement_activate),
    contactTake: String(order.contact_take || 0),
    paymentInitiatedDate: toDateTimeInput(order.payment_initated_date),
    paymentExpiryDate: toDateTimeInput(order.payment_expiry_date),
    metadataNotes: metadataNotes(order.metadata),
  };
}

function recalculateFromBase(form: OrderForm) {
  const basePrice = toNumber(form.orderPackagePrice);
  const gstPercentage = toNumber(form.orderPackageGst);
  const discountAmount = toNumber(form.discountAmount);
  const amounts = calculateOrderAmounts(basePrice, gstPercentage, discountAmount);

  return {
    ...form,
    originalPaymentPrice: String(basePrice),
    paymentAmountWithoutGst: String(basePrice),
    paymentGst: String(amounts.payment_gst),
    paymentTotalAmount: String(amounts.payment_total_ammount),
    paymentAmountWithOffer: String(amounts.payment_ammount_with_offer),
    paymentAmount: String(amounts.payment_ammount_with_offer),
  };
}

function recalculateFromGstAmount(form: OrderForm) {
  const basePrice = toNumber(form.orderPackagePrice);
  const paymentGst = toNumber(form.paymentGst);
  const discountAmount = toNumber(form.discountAmount);
  const total = roundMoney(basePrice + paymentGst);
  const payable = roundMoney(Math.max(total - discountAmount, 0));

  return {
    ...form,
    paymentAmountWithoutGst: String(basePrice),
    paymentTotalAmount: String(total),
    paymentAmountWithOffer: String(payable),
    paymentAmount: String(payable),
  };
}

function recalculateFromTotal(form: OrderForm) {
  const total = toNumber(form.paymentTotalAmount);
  const discountAmount = toNumber(form.discountAmount);
  const payable = roundMoney(Math.max(total - discountAmount, 0));

  return {
    ...form,
    paymentAmountWithOffer: String(payable),
    paymentAmount: String(payable),
  };
}

function metadataNotes(metadata: unknown) {
  if (metadata && typeof metadata === "object" && "admin_notes" in metadata) {
    const value = (metadata as { admin_notes?: unknown }).admin_notes;
    return typeof value === "string" ? value : "";
  }

  return "";
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(Number.isFinite(value) ? value : 0);
}

function toDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

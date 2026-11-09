import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import {
  calculateOrderAmounts,
  combineOrderRecords,
  orderPageSizeOptions,
  parseDate,
  toNonNegativeNumber,
  toOptionalString,
  type AdminOrder,
  type OrderEmployerOption,
  type OrderGeneratedRecord,
  type OrderPackageOption,
  type PaymentDetailsRecord,
} from "@/lib/orders";
import { getPrisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ status: 0, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const paymentStatus = url.searchParams.get("paymentStatus")?.trim() || null;
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const pageSize = parsePageSize(url.searchParams.get("pageSize"));
  const requestedPage = parsePage(url.searchParams.get("page"));

  try {
    const prisma = getPrisma();
    const [orders, payments, packages, employers] = await Promise.all([
      prisma.orderGenerated.findMany({
        orderBy: [{ order_package_created_at: "desc" }, { id: "desc" }],
      }),
      prisma.paymentDetails.findMany({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
      prisma.servicePackage.findMany({
        orderBy: [{ package_active: "desc" }, { package_created_at: "desc" }],
        take: 200,
      }),
      prisma.employee.findMany({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 300,
      }),
    ]);

    const combinedOrders = combineOrders({
      employers: employers as OrderEmployerOption[],
      orders: orders as OrderGeneratedRecord[],
      payments: payments as PaymentDetailsRecord[],
    }).filter((order) => matchesOrderFilters(order, { search, paymentStatus, from, to }));
    const totalItems = combinedOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const paginatedOrders = combinedOrders.slice(offset, offset + pageSize);
    const paymentStatuses = Array.from(
      new Set(payments.map((payment) => payment.payment_status).filter((status): status is string => Boolean(status))),
    ).sort();

    return NextResponse.json({
      status: 1,
      message: "Orders fetched",
      data: {
        orders: paginatedOrders,
        packages: (packages as unknown as OrderPackageOption[]).map(mapPackageOption),
        employers,
        paymentStatuses,
        pagination: {
          page,
          pageSize,
          totalPages,
          totalItems,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        message: "Unable to fetch orders",
        error: error instanceof Error ? error.message : "Unknown Prisma error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ status: 0, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const employerId = Number(body?.employerId);
  const packageId = Number(body?.packageId);

  if (!Number.isInteger(employerId) || employerId <= 0) {
    return NextResponse.json({ status: 0, message: "Valid employer is required" }, { status: 400 });
  }

  if (!Number.isInteger(packageId) || packageId <= 0) {
    return NextResponse.json({ status: 0, message: "Valid package is required" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const [packageItem, employer] = await Promise.all([
      prisma.servicePackage.findUnique({ where: { id: packageId } }),
      prisma.employee.findUnique({ where: { id: employerId } }),
    ]);

    if (!packageItem) {
      return NextResponse.json({ status: 0, message: "Package not found" }, { status: 404 });
    }

    if (!employer) {
      return NextResponse.json({ status: 0, message: "Employer not found" }, { status: 404 });
    }

    const payload = buildOrderPayload(body, packageItem as unknown as OrderPackageOption);

    if (!payload) {
      return NextResponse.json({ status: 0, message: "Amounts must be non-negative numbers" }, { status: 400 });
    }

    if (!payload.paymentExpiryDate) {
      return NextResponse.json({ status: 0, message: "Payment expiry date is required" }, { status: 400 });
    }

    const orderId = generateOrderId();
    const metadata = JSON.stringify({
      admin_notes: payload.metadataNotes,
      manual_discount: payload.discountAmount,
      created_by_admin: admin.email,
    });
    const [order, payment] = await prisma.$transaction([
      prisma.orderGenerated.create({
        data: {
          order_id: orderId,
          employee_id: employerId,
          order_package_id: packageId,
          order_package_name: payload.packageName,
          order_package_price: payload.basePrice,
          order_package_gst: payload.gstPercentage,
          order_package_created_at: new Date(),
          coupon_used: payload.couponUsed,
          refferal_point: Math.round(payload.referralPoint),
          value_of_id: Math.round(payload.discountAmount),
        },
      }),
      prisma.paymentDetails.create({
        data: {
          payment_order_id: orderId,
          employer_id: employerId,
          payment_status: payload.paymentStatus,
          original_payment_price: payload.originalPaymentPrice,
          package_id: packageId,
          payment_type: payload.paymentType,
          payment_gst: payload.paymentGst,
          payment_total_ammount: payload.paymentTotalAmount,
          payment_ammount_without_gst: payload.paymentAmountWithoutGst,
          payment_ammount_with_offer: payload.paymentAmountWithOffer,
          offer_taken: Math.round(payload.discountAmount),
          payment_ammount: payload.paymentAmount,
          is_replacement_activate: payload.isReplacementActivate,
          contact_take: Math.round(payload.contactTake),
          payment_initated_date: payload.paymentInitiatedDate,
          payment_expiry_date: payload.paymentExpiryDate,
          metadata,
          employer_mobile: employer.mobile,
        },
      }),
    ]);

    return NextResponse.json(
      {
        status: 1,
        message: "Order created",
        data: combineOrderRecords({
          employer: employer as OrderEmployerOption,
          order: order as OrderGeneratedRecord,
          payment: payment as PaymentDetailsRecord,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        message: "Unable to create order",
        error: error instanceof Error ? error.message : "Unknown Prisma error",
      },
      { status: 500 },
    );
  }
}

function combineOrders({
  employers,
  orders,
  payments,
}: {
  employers: OrderEmployerOption[];
  orders: OrderGeneratedRecord[];
  payments: PaymentDetailsRecord[];
}) {
  const employersById = new Map(employers.map((employer) => [employer.id, employer]));
  const paymentsByOrderId = new Map(payments.map((payment) => [payment.payment_order_id, payment]));
  const usedPaymentIds = new Set<number>();
  const combined = orders.map((order) => {
    const payment = paymentsByOrderId.get(order.order_id) ?? null;

    if (payment) {
      usedPaymentIds.add(payment.id);
    }

    return combineOrderRecords({
      employer: employersById.get(order.employee_id ?? payment?.employer_id ?? 0),
      order,
      payment,
    });
  });

  payments.forEach((payment) => {
    if (usedPaymentIds.has(payment.id)) {
      return;
    }

    combined.push(
      combineOrderRecords({
        employer: employersById.get(payment.employer_id ?? 0),
        payment,
      }),
    );
  });

  return combined.sort((first, second) => {
    const firstTime = first.created_at ? new Date(first.created_at).getTime() : 0;
    const secondTime = second.created_at ? new Date(second.created_at).getTime() : 0;

    if (secondTime !== firstTime) {
      return secondTime - firstTime;
    }

    return second.orderKey.localeCompare(first.orderKey);
  });
}

function matchesOrderFilters(
  order: AdminOrder,
  {
    search,
    paymentStatus,
    from,
    to,
  }: {
    search: string;
    paymentStatus: string | null;
    from: Date | null;
    to: Date | null;
  },
) {
  if (paymentStatus && order.payment_status !== paymentStatus) {
    return false;
  }

  const createdAt = order.created_at ? new Date(order.created_at) : null;

  if (from && (!createdAt || createdAt < from)) {
    return false;
  }

  if (to && (!createdAt || createdAt > to)) {
    return false;
  }

  if (!search) {
    return true;
  }

  const needle = search.toLowerCase();

  return [
    order.orderKey,
    order.order_id,
    order.payment_order_id,
    order.employer_name,
    order.employer_mobile,
    order.employer_email,
    order.order_package_name,
  ].some((value) => value?.toLowerCase().includes(needle));
}

function buildOrderPayload(body: Record<string, unknown>, packageItem: OrderPackageOption) {
  const basePrice = toNonNegativeNumber(body.orderPackagePrice, Number(packageItem.package_price));
  const gstPercentage = toNonNegativeNumber(body.orderPackageGst, Number(packageItem.package_gst_percentage));
  const discountAmount = toNonNegativeNumber(body.discountAmount, 0);
  const originalPaymentPrice = toNonNegativeNumber(body.originalPaymentPrice, basePrice ?? 0);
  const paymentAmountWithoutGst = toNonNegativeNumber(body.paymentAmountWithoutGst, basePrice ?? 0);

  if (
    basePrice === null ||
    gstPercentage === null ||
    discountAmount === null ||
    originalPaymentPrice === null ||
    paymentAmountWithoutGst === null
  ) {
    return null;
  }

  const calculated = calculateOrderAmounts(paymentAmountWithoutGst, gstPercentage, discountAmount);
  const paymentGst = toNonNegativeNumber(body.paymentGst, calculated.payment_gst);
  const paymentTotalAmount = toNonNegativeNumber(body.paymentTotalAmount, calculated.payment_total_ammount);
  const paymentAmountWithOffer = toNonNegativeNumber(body.paymentAmountWithOffer, calculated.payment_ammount_with_offer);
  const paymentAmount = toNonNegativeNumber(body.paymentAmount, paymentAmountWithOffer ?? 0);
  const referralPoint = toNonNegativeNumber(body.referralPoint, 0);
  const contactTake = toNonNegativeNumber(body.contactTake, 0);

  if (
    paymentGst === null ||
    paymentTotalAmount === null ||
    paymentAmountWithOffer === null ||
    paymentAmount === null ||
    referralPoint === null ||
    contactTake === null
  ) {
    return null;
  }

  return {
    packageName: toOptionalString(body.orderPackageName) ?? packageItem.package_name,
    basePrice,
    gstPercentage,
    couponUsed: toOptionalString(body.couponUsed),
    referralPoint,
    discountAmount,
    paymentStatus: toOptionalString(body.paymentStatus) ?? "PENDING",
    originalPaymentPrice,
    paymentType: toOptionalString(body.paymentType) ?? "ADMIN",
    paymentGst,
    paymentTotalAmount,
    paymentAmountWithoutGst,
    paymentAmountWithOffer,
    paymentAmount,
    isReplacementActivate: Boolean(body.isReplacementActivate),
    contactTake,
    paymentInitiatedDate: parseDate(body.paymentInitiatedDate) ?? new Date(),
    paymentExpiryDate: parseDate(body.paymentExpiryDate),
    metadataNotes: toOptionalString(body.metadataNotes),
  };
}

function parsePage(value: string | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  if (!orderPageSizeOptions.includes(parsed as (typeof orderPageSizeOptions)[number])) {
    return Math.min(parsed, MAX_PAGE_SIZE);
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function generateOrderId() {
  const date = new Date();
  const dateText = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `SH-ADM-${dateText}-${suffix}`;
}

function mapPackageOption(row: OrderPackageOption): OrderPackageOption {
  return {
    ...row,
    package_price: Number(row.package_price),
    package_gst_percentage: Number(row.package_gst_percentage),
  };
}

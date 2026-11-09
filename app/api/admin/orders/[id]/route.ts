import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import {
  calculateOrderAmounts,
  combineOrderRecords,
  parseDate,
  toNonNegativeNumber,
  toOptionalString,
  type OrderEmployerOption,
  type OrderGeneratedRecord,
  type OrderPackageOption,
  type PaymentDetailsRecord,
} from "@/lib/orders";
import { getPrisma } from "@/lib/prisma";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ status: 0, message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderKey = decodeURIComponent(id);

  try {
    const prisma = getPrisma();
    const [order, payment] = await Promise.all([
      prisma.orderGenerated.findUnique({ where: { order_id: orderKey } }),
      prisma.paymentDetails.findUnique({ where: { payment_order_id: orderKey } }),
    ]);

    if (!order && !payment) {
      return NextResponse.json({ status: 0, message: "Order not found" }, { status: 404 });
    }

    const employerId = order?.employee_id ?? payment?.employer_id ?? null;
    const employer = employerId ? await prisma.employee.findUnique({ where: { id: employerId } }) : null;

    return NextResponse.json({
      status: 1,
      message: "Order fetched",
      data: combineOrderRecords({
        employer: employer as OrderEmployerOption | null,
        order: order as OrderGeneratedRecord | null,
        payment: payment as PaymentDetailsRecord | null,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        message: "Unable to fetch order",
        error: error instanceof Error ? error.message : "Unknown Prisma error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ status: 0, message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderKey = decodeURIComponent(id);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json({ status: 0, message: "Order update payload is required" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const [order, payment] = await Promise.all([
      prisma.orderGenerated.findUnique({ where: { order_id: orderKey } }),
      prisma.paymentDetails.findUnique({ where: { payment_order_id: orderKey } }),
    ]);

    if (!order && !payment) {
      return NextResponse.json({ status: 0, message: "Order not found" }, { status: 404 });
    }

    const requestedPackageId = Number(body.packageId ?? payment?.package_id ?? order?.order_package_id);

    if (!Number.isInteger(requestedPackageId) || requestedPackageId <= 0) {
      return NextResponse.json({ status: 0, message: "Valid package is required" }, { status: 400 });
    }

    const packageItem = await prisma.servicePackage.findUnique({ where: { id: requestedPackageId } });

    if (!packageItem) {
      return NextResponse.json({ status: 0, message: "Package not found" }, { status: 404 });
    }

    const payload = buildOrderPayload(body, packageItem as unknown as OrderPackageOption);

    if (!payload) {
      return NextResponse.json({ status: 0, message: "Amounts must be non-negative numbers" }, { status: 400 });
    }

    const employerId = order?.employee_id ?? payment?.employer_id ?? null;

    if (!employerId) {
      return NextResponse.json({ status: 0, message: "Order has no employer to bill" }, { status: 400 });
    }

    const employer = await prisma.employee.findUnique({ where: { id: employerId } });

    if (!employer) {
      return NextResponse.json({ status: 0, message: "Employer not found" }, { status: 404 });
    }

    const metadata = JSON.stringify({
      admin_notes: payload.metadataNotes,
      manual_discount: payload.discountAmount,
      updated_by_admin: admin.email,
    });
    const paymentExpiryDate = payload.paymentExpiryDate ?? payment?.payment_expiry_date ?? null;

    if (!paymentExpiryDate) {
      return NextResponse.json(
        { status: 0, message: "Payment expiry date is required to generate payment" },
        { status: 400 },
      );
    }

    const [updatedOrder, updatedPayment] = await prisma.$transaction([
      order
        ? prisma.orderGenerated.update({
            where: { id: order.id },
            data: {
              order_package_id: requestedPackageId,
              order_package_name: payload.packageName,
              order_package_price: payload.basePrice,
              order_package_gst: payload.gstPercentage,
              coupon_used: payload.couponUsed,
              refferal_point: Math.round(payload.referralPoint),
              value_of_id: Math.round(payload.discountAmount),
            },
          })
        : prisma.orderGenerated.findUnique({ where: { order_id: orderKey } }),
      payment
        ? prisma.paymentDetails.update({
            where: { id: payment.id },
            data: {
              payment_status: payload.paymentStatus,
              original_payment_price: payload.originalPaymentPrice,
              package_id: requestedPackageId,
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
              payment_expiry_date: paymentExpiryDate,
              metadata,
              updated_at: new Date(),
            },
          })
        : prisma.paymentDetails.create({
            data: {
              payment_order_id: orderKey,
              employer_id: employerId,
              payment_status: payload.paymentStatus,
              original_payment_price: payload.originalPaymentPrice,
              package_id: requestedPackageId,
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
              payment_expiry_date: paymentExpiryDate,
              metadata,
              employer_mobile: employer.mobile,
              created_at: new Date(),
              updated_at: new Date(),
            },
          }),
    ]);

    return NextResponse.json({
      status: 1,
      message: "Order updated",
      data: combineOrderRecords({
        employer: employer as OrderEmployerOption | null,
        order: updatedOrder as OrderGeneratedRecord | null,
        payment: updatedPayment as PaymentDetailsRecord | null,
      }),
    });
  } catch (error) {
    console.error("Unable to update order", orderKey, error);

    return NextResponse.json(
      {
        status: 0,
        message: "Unable to update order",
        error: error instanceof Error ? error.message : "Unknown Prisma error",
      },
      { status: 500 },
    );
  }
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

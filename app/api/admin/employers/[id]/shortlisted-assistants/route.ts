import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type ShortlistedAssistantRow = {
  id: number;
  name: string | null;
  mobile: string;
  email: string | null;
  city: string | null;
  area: string | null;
  pincode: number | null;
  gender: string | null;
  age: number | null;
  status: string;
  profile_picture_url: string | null;
  shortlisted_at: Date;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ status: 0, message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const employerId = Number(id);

  if (!Number.isInteger(employerId) || employerId < 1) {
    return NextResponse.json({ status: 0, message: "Invalid employer id" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<ShortlistedAssistantRow[]>`
      SELECT
        a.id,
        a.name,
        a.mobile,
        a.email,
        a.city,
        a.area,
        a.pincode,
        a.gender,
        a.age,
        a.status::text AS status,
        a.profile_picture_url,
        sl.created_at AS shortlisted_at
      FROM "assistantShortList" sl
      JOIN assistant a ON a.id = sl.assitant_id
      WHERE sl.employee_id = ${employerId}
      ORDER BY sl.created_at DESC
    `;

    return NextResponse.json({
      status: 1,
      message: "Shortlisted assistants fetched",
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        city: row.city,
        area: row.area,
        pincode: row.pincode,
        gender: row.gender,
        age: row.age,
        status: row.status,
        profilePictureUrl: row.profile_picture_url,
        shortlistedAt: row.shortlisted_at.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        message: "Unable to fetch shortlisted assistants",
        error: error instanceof Error ? error.message : "Unknown Prisma error",
      },
      { status: 500 },
    );
  }
}

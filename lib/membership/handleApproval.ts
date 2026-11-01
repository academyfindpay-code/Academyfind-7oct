import { addMemberToInstituteChannels } from "@/lib/chat/ensureInstituteChannels";
import { notifyUser } from "@/lib/notifications/notify";
import { prisma } from "@/lib/prisma";
import { creditWallet } from "@/lib/wallet/credit";
import { revalidatePath } from "next/cache";

export async function handleMembershipApproval(
  membershipId: string,
  approverId: string,
) {
  const membership = await prisma.instituteMembership.findUnique({
    where: { id: membershipId },
    include: {
      institute: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, username: true } },
    },
  });

  if (!membership) throw new Error("Membership not found");

  const approver = await prisma.user.findUnique({
    where: { id: approverId },
    select: {
      role: true,
      managedInstitutes: {
        where: { instituteId: membership.instituteId },
        select: { instituteId: true },
      },
    },
  });

  const canApprove =
    approver?.role === "ADMIN" ||
    Boolean(approver?.managedInstitutes.length);
  if (!canApprove) throw new Error("Not authorized to approve this membership");

  const approved = await prisma.$transaction(async (tx) => {
    const updated = await tx.instituteMembership.update({
      where: { id: membershipId },
      data: { status: "ACTIVE", joinedAt: new Date(), isActive: true },
    });

    if (updated.role === "STUDENT") {
      await tx.studentInstituteRecord.updateMany({
        where: { membershipId },
        data: { isVerified: true, isVisible: true },
      });
    }
    if (updated.role === "TEACHER") {
      await tx.teacherInstituteRecord.updateMany({
        where: { membershipId },
        data: { isVerified: true, isVisible: true },
      });
    }
    if (updated.role === "MANAGER") {
      await tx.user.update({
        where: { id: updated.userId },
        data: { role: "INSTITUTE_MANAGER" },
      });
      await tx.instituteManager.upsert({
        where: {
          userId_instituteId: {
            userId: updated.userId,
            instituteId: updated.instituteId,
          },
        },
        create: {
          userId: updated.userId,
          instituteId: updated.instituteId,
        },
        update: {},
      });
    }

    return updated;
  });

  await Promise.all([
    creditWallet(
      approved.userId,
      20,
      "INSTITUTE_MEMBERSHIP",
      "Membership verified",
      membershipId,
    ),
    notifyUser(
      approved.userId,
      "SYSTEM",
      "Your request was approved!",
      `You are now a verified member of ${membership.institute.name}.`,
      membershipId,
    ),
    addMemberToInstituteChannels(
      approved.userId,
      approved.instituteId,
      approved.role,
    ),
  ]);

  // Revalidate profiles and pages so status updates immediately
  revalidatePath(`/manager/${approved.instituteId}/members`);
  revalidatePath(`/institute/${approved.instituteId}`);
  if (membership.institute.slug) {
    revalidatePath(`/institute/${membership.institute.slug}`);
    revalidatePath(`/institute/${approved.instituteId}-${membership.institute.slug}`);
  }
  if (membership.user?.username) {
    revalidatePath(`/u/${membership.user.username}`);
  }

  return approved;
}

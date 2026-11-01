import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Check, X, UserMinus, Clock, BadgeCheck, GraduationCap, BookOpen, Lock, UserPlus } from "lucide-react";
import { InviteMemberModal } from "@/components/manager/InviteMemberModal";
import { PremiumLock } from "@/components/manager/PremiumLock";
import EditFacultyMembers from "../profile/edit/EditFacultyMembers";

import { approveMembership, rejectMembership, removeMember } from "./actions";

type Props = { params: Promise<{ instituteId: string }> };

export default async function ManagerMembersPage({ params }: Props) {
  const { instituteId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    select: { id: true, name: true, slug: true, subscriptionPlan: true },
  });
  if (!institute) notFound();

  const isBasic = institute.subscriptionPlan === "BASIC";

  const [pending, students, teachers, customFaculty] = await Promise.all([
    prisma.instituteMembership.findMany({
      where: { instituteId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, username: true, image: true, email: true } },
        studentRecord: { select: { id: true, courseName: true, batchYear: true, bio: true } },
        teacherRecord: { select: { id: true, designation: true, teachingSubjects: true, bio: true } },
      },
    }),
    prisma.instituteMembership.findMany({
      where: { instituteId, role: "STUDENT", status: { in: ["ACTIVE", "ALUMNI"] } },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, name: true, username: true, image: true } },
        studentRecord: {
          select: {
            id: true,
            courseName: true,
            batchYear: true,
            passoutYear: true,
            isVerified: true,
            bio: true,
          },
        },
      },
    }),
    prisma.instituteMembership.findMany({
      where: { instituteId, role: "TEACHER", status: { in: ["ACTIVE"] } },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, name: true, username: true, image: true } },
        teacherRecord: {
          select: {
            id: true,
            designation: true,
            department: true,
            teachingSubjects: true,
            isVerified: true,
            isFeatured: true,
            bio: true,
          },
        },
      },
    }),
    prisma.instituteFacultyMember.findMany({
      where: { instituteId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Members</h1>
          <p className="mt-1 text-sm text-stone-500">
            Manage student and teacher memberships for {institute.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/institute/${institute.id}-${institute.slug}/members`}
            className="text-sm font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
          >
            View public directory →
          </Link>
          <a
            href="#custom-faculty-showcase"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-sm"
          >
            <UserPlus className="size-3.5 text-amber-700" /> Add Teacher (No Account)
          </a>
          {isBasic ? (
            <PremiumLock
              title="Invites Locked"
              description="Upgrade your plan to invite members."
              isSmall={true}
              instituteId={institute.id}
            />
          ) : (
            <InviteMemberModal instituteId={instituteId} />
          )}
        </div>
      </div>

      {/* ── PENDING REQUESTS ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-stone-800">
          <Clock className="size-5 text-amber-500" /> Pending Requests
          {pending.length > 0 && (
            <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <EmptyCard text="No pending requests." />
        ) : (
          <div className="space-y-3">
            {pending.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar user={m.user} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-900">
                        {m.user.name ?? m.user.username}
                      </span>
                      <RoleBadge role={m.role} />
                    </div>
                    <p className="text-xs text-stone-400">@{m.user.username} · {m.user.email}</p>
                    {m.studentRecord && (
                      <p className="mt-1 text-sm text-stone-600">
                        {[m.studentRecord.courseName, m.studentRecord.batchYear ? `${m.studentRecord.batchYear} Batch` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {m.teacherRecord && (
                      <p className="mt-1 text-sm text-stone-600">
                        {m.teacherRecord.designation} · {m.teacherRecord.teachingSubjects.join(", ")}
                      </p>
                    )}
                    {(m.studentRecord?.bio || m.teacherRecord?.bio) && (
                      <p className="mt-2 text-xs text-stone-500 italic line-clamp-2">
                        {m.studentRecord?.bio ?? m.teacherRecord?.bio}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-stone-400">
                      Requested {m.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <form
                    action={async () => {
                      "use server";
                      await approveMembership(m.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"
                    >
                      <Check className="size-4" /> Approve
                    </button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await rejectMembership(m.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <X className="size-4" /> Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── STUDENTS ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-stone-800">
          <GraduationCap className="size-5 text-blue-500" /> Students
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
            {students.length}
          </span>
        </h2>
        {students.length === 0 ? (
          <EmptyCard text="No students yet." />
        ) : (
          <div className="space-y-3">
            {students.map((m) => (
              <div
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={m.user} size="sm" />
                  <div>
                    <span className="font-semibold text-stone-900">
                      {m.user.name ?? m.user.username}
                    </span>
                    <p className="text-xs text-stone-500">
                      {[
                        m.studentRecord?.courseName,
                        m.studentRecord?.batchYear ? `${m.studentRecord.batchYear} Batch` : null,
                        m.status,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.studentRecord?.isVerified && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <BadgeCheck className="size-3" /> Verified
                    </span>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await removeMember(m.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <UserMinus className="size-3" /> Remove
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── FACULTY & TEACHERS SECTION ── */}
      <section className="space-y-6 pt-6 border-t border-stone-200">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
            <BookOpen className="size-5 text-amber-600" /> Faculty & Teachers
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Manage your educators. You can directly showcase teachers without accounts, or link registered AcademyFind teachers.
          </p>
        </div>

        {/* 1. DIRECT FACULTY SHOWCASE (NO ACCOUNT REQUIRED) */}
        <div id="custom-faculty-showcase" className="scroll-mt-10">
          <EditFacultyMembers
            instituteId={instituteId}
            currentFaculty={customFaculty}
            maxLimit={25}
          />
        </div>

        {/* 2. REGISTERED FACULTY (ACADEMYFIND USER ACCOUNTS) */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">
                  Registered Faculty Accounts
                </h3>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
                  {teachers.length} Active
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1 max-w-xl leading-relaxed">
                Teachers with an individual AcademyFind account who can log in, edit their profile, and receive 1-on-1 direct messages from students.
              </p>
            </div>
            {isBasic ? null : (
              <InviteMemberModal instituteId={instituteId} />
            )}
          </div>

          {teachers.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/50">
              <p className="text-sm font-semibold text-stone-700">No registered faculty accounts joined yet</p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                Teachers who need student chat and personal profiles can be invited using the &quot;Invite Member&quot; button.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {teachers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-4"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar user={m.user} size="sm" />
                    <div>
                      <span className="font-semibold text-stone-900">
                        {m.user.name ?? m.user.username}
                      </span>
                      <p className="text-xs text-stone-500">
                        {m.teacherRecord?.designation ?? "Faculty"}
                        {m.teacherRecord?.department ? ` · ${m.teacherRecord.department}` : ""}
                      </p>
                      {m.teacherRecord?.teachingSubjects.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.teacherRecord.teachingSubjects.slice(0, 3).map((s: string) => (
                            <span key={s} className="rounded-md bg-white border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600">
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.teacherRecord?.isVerified && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="size-3" /> Verified
                      </span>
                    )}
                    {m.teacherRecord?.isFeatured && (
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ⭐ Featured
                      </span>
                    )}
                    <form
                      action={async () => {
                        "use server";
                        await removeMember(m.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <UserMinus className="size-3" /> Remove
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function UserAvatar({
  user,
  size = "md",
}: {
  user: { name: string | null; image: string | null; username: string | null };
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-9" : "size-11";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-stone-100 ${dim}`}
    >
      {user.image ? (
        <Image src={user.image} alt="" fill className="object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center text-sm font-bold text-stone-400">
          {(user.name ?? "U").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    STUDENT: "bg-[#ebdbb7]/20 text-stone-900 border-blue-200",
    TEACHER: "bg-amber-50 text-amber-700 border-amber-200",
    MANAGER: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[role] ?? "bg-stone-100 text-stone-600"}`}
    >
      {role}
    </span>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
      {text}
    </div>
  );
}

import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";
import { Bell } from "lucide-react";
import { markAllRead, markRead } from "./actions";
import { InviteActions } from "./components/InviteActions";
import Link from "next/link"; // Imported to handle actionUrl routing
import { formatNotificationTime, formatNotificationRelativeTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notifications | AcademyFind",
  robots: { index: false, follow: false },
};

const TYPE_EMOJI: Record<string, string> = {
  SYSTEM: "🔔",
  MEMBERSHIP: "🏫",
  MESSAGE: "💬",
  REVIEW: "⭐",
  REWARD: "🎁",
  ALERT: "⚠️",
};

export default async function NotificationsPage() {
  const session = await requireAuth();
  const isAdmin = session.user.role === "ADMIN";

  // We'll normalize the shapes of admin/user notifications so we only write the JSX once.
  let notifications = [];

  if (isAdmin) {
    const adminNotifications = await prisma.adminNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        isRead: true,
        referenceId: true,
        actionUrl: true,
        createdAt: true,
      },
    });

    notifications = adminNotifications.map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      referenceId: n.referenceId,
      actionUrl: n.actionUrl,
      createdAt: n.createdAt,
    }));
  } else {
    const userNotifications = await prisma.userNotification.findMany({
      where: {
        userId: session.user.id,
        type: { not: "MESSAGE" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        entityId: true,
      },
    });

    notifications = userNotifications.map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.body, // Mapping body to standard message field
      isRead: n.isRead,
      referenceId: n.entityId, // Maps membershipId/entityId so InviteActions can render
      actionUrl:
        n.type === "MESSAGE" && n.entityId
          ? `/chat/${n.entityId}`
          : (n.title?.includes("Sales Manager") || n.body?.includes("Sales Manager")) && n.entityId
          ? `/ism-invite/${n.entityId}`
          : null,
      createdAt: n.createdAt,
    }));
  }

  // Calculate unread safely for both admins and normal users
  const unread = notifications.filter((n: any) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Notifications</h1>
          {unread > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              {unread} unread notification{unread !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button
              type="submit"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Mark all read
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-16 text-center">
          <Bell className="mx-auto size-10 text-slate-300" />
          <p className="mt-4 font-semibold text-slate-500">
            No notifications yet
          </p>
          <p className="mt-1 text-sm text-slate-400">
            When something happens, it'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 rounded-2xl border p-5 transition-colors ${!n.isRead
                ? "border-amber-200 bg-amber-50/50"
                : "border-slate-200 bg-white"
                }`}
            >
              <span className="mt-0.5 shrink-0 text-xl">
                {TYPE_EMOJI[n.type] ?? "🔔"}
              </span>
              <div className="min-w-0 flex-1">
                {/* Dynamically handle Admin links if actionUrl exists */}
                {n.actionUrl ? (
                  <Link href={n.actionUrl} className="hover:underline hover:text-slate-900">
                    <p
                      className={`text-sm leading-5 ${!n.isRead
                        ? "font-semibold text-slate-900"
                        : "text-slate-700"
                        }`}
                    >
                      {n.title}
                    </p>
                  </Link>
                ) : (
                  <p
                    className={`text-sm leading-5 ${!n.isRead
                      ? "font-semibold text-slate-900"
                      : "text-slate-700"
                      }`}
                  >
                    {n.title}
                  </p>
                )}

                {(() => {
                  let message = n.message;
                  let isInvite = false;
                  try {
                    const parsed = JSON.parse(n.message || "{}");
                    if (parsed.message) {
                      message = parsed.message;
                      isInvite = parsed.invite === true;
                    }
                  } catch (e) {
                    // Falls back to string format if not valid JSON
                  }

                  if (!isInvite && (n.title?.toLowerCase().includes("invitation") || n.message?.toLowerCase().includes("invited you"))) {
                    isInvite = true;
                  }

                  return (
                    <>
                      {message && (
                        <p className="mt-1 text-sm leading-5 text-slate-500">
                          {message}
                        </p>
                      )}
                      {isInvite && n.referenceId && (
                        <div className="mt-3">
                          <InviteActions
                            notificationId={n.id}
                            membershipId={n.referenceId}
                          />
                        </div>
                      )}
                    </>
                  );
                })()}

                <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                  <span>{formatNotificationRelativeTime(n.createdAt)}</span>
                  <span>•</span>
                  <span>{formatNotificationTime(n.createdAt)}</span>
                </p>
              </div>

              {!n.isRead && (
                <form action={markRead.bind(null, n.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    Mark read
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
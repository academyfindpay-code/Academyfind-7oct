"use client";

import { useState } from "react";
import { Search, UserPlus, Check, Loader2, User, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

export function InviteMemberModal({ instituteId }: { instituteId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [invitingId, setInvitingId] = useState<string | null>(null);
    const [role, setRole] = useState<"STUDENT" | "TEACHER">("TEACHER");
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!search.trim()) return;
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await fetch(`/api/v2/users/search?q=${encodeURIComponent(search)}&instituteId=${instituteId}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.users || []);
            }
        } catch {
            toast.error("Failed to search users");
        } finally {
            setLoading(false);
        }
    };

    const handleInviteOrAdd = async (userId: string, directAdd: boolean) => {
        setInvitingId(userId);
        try {
            const res = await fetch(`/api/v2/memberships/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, instituteId, role, directAdd })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || (directAdd ? `${role === "TEACHER" ? "Teacher" : "Student"} added!` : "Invitation sent!"));
                setResults(results.map(r => r.id === userId ? { ...r, isMember: directAdd, isInvited: !directAdd } : r));
                router.refresh();
            } else {
                toast.error(data.error || "Failed to process member request");
            }
        } catch {
            toast.error("Network error while adding member");
        } finally {
            setInvitingId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-bold rounded-xl shadow-sm">
                    <UserPlus className="w-4 h-4" /> Add / Invite Faculty
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-white">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-800">Add Registered Member</DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-4 mt-2">
                    <span className="text-sm font-medium text-slate-700">Role:</span>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        <button 
                            type="button"
                            onClick={() => setRole("TEACHER")} 
                            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${role === "TEACHER" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Teacher / Faculty
                        </button>
                        <button 
                            type="button"
                            onClick={() => setRole("STUDENT")} 
                            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${role === "STUDENT" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Student
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSearch} className="flex gap-2 mt-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input 
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setHasSearched(false);
                            }}
                            placeholder="Search by name, @username or email..."
                            className="pl-9 bg-slate-50 border-slate-200 rounded-xl"
                        />
                    </div>
                    <Button type="submit" disabled={loading} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl px-5">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                    </Button>
                </form>

                <div className="mt-4 max-h-[340px] overflow-y-auto space-y-3 pr-1">
                    {results.length > 0 ? results.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
                                    {user.image ? (
                                        <Image src={user.image} alt={user.name || "User"} width={40} height={40} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-5 h-5 text-slate-400" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-slate-900 text-sm truncate">{user.name || user.username || "Unknown User"}</h4>
                                    <p className="text-xs text-slate-500 truncate">@{user.username || "user"} • {user.email}</p>
                                </div>
                            </div>
                            {user.isMember ? (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
                                    <Check className="w-3.5 h-3.5" /> Active Member
                                </span>
                            ) : user.isInvited ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" /> Pending
                                    </span>
                                    <Button 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold px-2.5 h-8"
                                        onClick={() => handleInviteOrAdd(user.id, true)}
                                        disabled={invitingId === user.id}
                                    >
                                        Activate Now
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Button 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold px-3 h-8"
                                        onClick={() => handleInviteOrAdd(user.id, true)}
                                        disabled={invitingId === user.id}
                                    >
                                        {invitingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Directly"}
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="outline"
                                        className="text-slate-600 hover:text-slate-900 rounded-xl text-xs px-2.5 h-8 border-slate-300"
                                        onClick={() => handleInviteOrAdd(user.id, false)}
                                        disabled={invitingId === user.id}
                                    >
                                        Invite
                                    </Button>
                                </div>
                            )}
                        </div>
                    )) : hasSearched && !loading ? (
                        <div className="text-center p-6 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 space-y-1.5">
                            <p className="font-semibold text-slate-700">No AcademyFind account found for &quot;{search}&quot;</p>
                            <p className="text-slate-500 max-w-sm mx-auto">
                                If this teacher does not have an account yet, you can showcase them immediately using the <strong>Direct Faculty Showcase</strong> below (no login required).
                            </p>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}

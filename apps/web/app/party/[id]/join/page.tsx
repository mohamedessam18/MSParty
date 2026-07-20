"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function JoinParty({ params }: { params: { id: string } }) { const router = useRouter(); const [message, setMessage] = useState("جارٍ الانضمام..."); useEffect(() => { fetch(`/api/parties/${params.id}/join`, { method: "POST" }).then(response => { if (!response.ok) throw new Error(); router.replace(`/party/${params.id}`); }).catch(() => setMessage("سجّل دخولك أولًا للانضمام إلى البارتي.")); }, [params.id, router]); return <main className="p-8">{message}</main>; }

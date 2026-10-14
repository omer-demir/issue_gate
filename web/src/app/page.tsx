"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/store/SessionProvider";

export default function HomePage() {
  const { isAuthenticated } = useSession();
  const router = useRouter();

  useEffect(() => {
    router.replace(isAuthenticated ? "/vault" : "/login");
  }, [isAuthenticated, router]);

  return <p>Loading…</p>;
}

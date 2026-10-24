import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "@/data";

/** 분실자(회원·체험) 화면. 로그인 안 했으면 L-01로 */
export function RequireMember() {
  const s = useSession();
  const loc = useLocation();
  if (!s.user || s.isAdmin) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

/** 관리자 화면. 관리자 로그인 안 했으면 A-01로 */
export function RequireAdmin() {
  const s = useSession();
  const loc = useLocation();
  if (!s.user || !s.isAdmin) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

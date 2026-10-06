import { redirect } from "next/navigation";
import { selectAuthorizationPage } from "../../domain/access/scopes";

export const dynamic = "force-dynamic";

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; uid?: string }>;
}): Promise<never> {
  const params = await searchParams;
  const page = selectAuthorizationPage((params.scope ?? "").split(" "));
  const uid = params.uid === undefined ? "" : `&uid=${encodeURIComponent(params.uid)}`;
  redirect(
    page === "merchant"
      ? `/authorize/merchant?scope=${encodeURIComponent(params.scope ?? "")}${uid}`
      : `/authorize/buyer?scope=${encodeURIComponent(params.scope ?? "")}${uid}`,
  );
}

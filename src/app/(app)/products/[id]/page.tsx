import { redirect } from "next/navigation";

// Product detail is now a slide-in preview drawer on the list. Keep this route as
// a shareable deep link that opens that drawer.
export default async function ProductDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/products?preview=${id}`);
}

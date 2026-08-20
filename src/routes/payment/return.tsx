import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XunhuPayStatus } from "@/components/payment/XunhuPayStatus";

export const Route = createFileRoute("/payment/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" && /^[0-9A-Za-z_*-]{1,32}$/.test(search.order) ? search.order : "",
  }),
  head: () => ({ meta: [{ title: "微信支付结果 - ShunTu AI" }] }),
  component: PaymentReturnPage,
});

function PaymentReturnPage() {
  const { order } = Route.useSearch();
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 返回 ShunTu
        </Link>
        <section className="rounded-lg border border-border/70 bg-card/90 p-5 shadow-xl sm:p-8">
          {order ? (
            <XunhuPayStatus order={{ outTradeNo: order }} />
          ) : (
            <div className="py-10 text-center">
              <h1 className="text-lg font-semibold">无法识别支付订单</h1>
              <p className="mt-2 text-sm text-muted-foreground">请返回 ShunTu 充值中心重新查看。</p>
            </div>
          )}
          <div className="mt-8 border-t border-border/60 pt-5 text-center">
            <Button asChild variant="outline"><Link to="/">返回 ShunTu</Link></Button>
          </div>
        </section>
      </div>
    </main>
  );
}
